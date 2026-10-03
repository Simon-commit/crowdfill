/**
 * The submission engine. Runs inside the service worker so a run keeps going
 * when the side panel is closed.
 *
 * - N workers pull submission indices from a shared counter (concurrency).
 * - Pacing: random delay per worker, or arrival times spread over a window.
 * - Retries with exponential backoff for throttling / transient errors.
 * - Fatal errors (sign-in wall, closed form) and consecutive-failure limits
 *   stop the run. Pause/resume/stop are honoured between submissions.
 * - Progress is mirrored to chrome.storage.session for the UI to observe.
 */
import { ResponseGenerator } from '../core/generator';
import { classifyResponse, type SubmitOutcome } from '../core/outcome';
import { answerText, buildPayload } from '../core/payload';
import { createRng, randomSeed } from '../core/rng';
import type { FormConfig, FormModel, GeneratedResponse, RunHistoryEntry, RunLogEntry, RunState } from '../core/types';
import { STORAGE } from '../shared/messages';

const LOG_LIMIT = 300;
const HISTORY_LIMIT = 50;
const REQUEST_TIMEOUT_MS = 30_000;
const KEEPALIVE_MS = 20_000;

type Listener = (state: RunState) => void;

/** Sleeps in slices, touching an extension API in between so the worker isn't suspended. */
async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  const end = Date.now() + ms;
  while (!signal.aborted) {
    const left = end - Date.now();
    if (left <= 0) return;
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, Math.min(left, KEEPALIVE_MS));
      signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
    });
    await chrome.runtime.getPlatformInfo().catch(() => undefined);
  }
}

function summarize(form: FormModel, res: GeneratedResponse): string {
  const parts: string[] = [];
  for (const q of form.questions) {
    const a = res.answers[q.itemId];
    if (!a) continue;
    const s = answerText(q, a);
    if (s) parts.push(s.length > 40 ? `${s.slice(0, 37)}...` : s);
    if (parts.length >= 4) break;
  }
  return parts.join(', ');
}

export interface SubmitResult {
  outcome: SubmitOutcome;
  status: number;
  ms: number;
}

export async function submitOnce(form: FormModel, body: URLSearchParams, useSession: boolean, signal: AbortSignal): Promise<SubmitResult> {
  const t0 = performance.now();
  try {
    const res = await fetch(form.actionUrl, {
      method: 'POST',
      body,
      credentials: useSession ? 'include' : 'omit',
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
    const html = await res.text();
    return { outcome: classifyResponse(res.status, res.url, html), status: res.status, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    const aborted = signal.aborted;
    return {
      outcome: {
        ok: false,
        reason: 'network',
        retryable: !aborted,
        message: aborted ? 'Stopped.' : e instanceof Error && e.name === 'TimeoutError' ? 'Request timed out.' : 'Network error.',
      },
      status: 0,
      ms: Math.round(performance.now() - t0),
    };
  }
}

export class Runner {
  state: RunState | null = null;
  private abort = new AbortController();
  private paused = false;
  private resumeWaiters: Array<() => void> = [];
  private listeners = new Set<Listener>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get active(): boolean {
    return !!this.state && ['running', 'paused', 'stopping', 'scheduled'].includes(this.state.phase);
  }

  private emit(immediate = false): void {
    if (!this.state) return;
    const snapshot = { ...this.state, log: this.state.log.slice(0, LOG_LIMIT) };
    for (const fn of this.listeners) fn(snapshot);
    const write = () => {
      this.persistTimer = null;
      void chrome.storage.session.set({ [STORAGE.run]: this.state });
    };
    if (immediate) {
      if (this.persistTimer) clearTimeout(this.persistTimer);
      write();
    } else if (!this.persistTimer) this.persistTimer = setTimeout(write, 250);
  }

  async restore(): Promise<void> {
    const saved = (await chrome.storage.session.get(STORAGE.run))[STORAGE.run] as RunState | undefined;
    if (!saved) return;
    // A worker restart kills in-flight runs; surface that instead of pretending.
    if (['running', 'paused', 'stopping'].includes(saved.phase)) {
      saved.phase = 'error';
      saved.lastError = 'The run was interrupted (the browser suspended the extension). Start it again to continue.';
      saved.finishedAt = Date.now();
    }
    this.state = saved;
    this.emit(true);
  }

  markScheduled(form: FormModel, config: FormConfig, at: number): RunState {
    this.state = {
      runId: `${Date.now().toString(36)}-scheduled`,
      formId: form.id,
      formTitle: form.title,
      phase: 'scheduled',
      total: config.run.count,
      sent: 0,
      ok: 0,
      failed: 0,
      startedAt: Date.now(),
      scheduledAt: at,
      log: [],
    };
    this.emit(true);
    return this.state;
  }

  pause(): void {
    if (this.state?.phase !== 'running') return;
    this.paused = true;
    this.state.phase = 'paused';
    this.emit(true);
  }

  resume(): void {
    if (this.state?.phase !== 'paused') return;
    this.paused = false;
    this.state.phase = 'running';
    this.resumeWaiters.splice(0).forEach((r) => r());
    this.emit(true);
  }

  stop(): void {
    if (!this.state) return;
    if (this.state.phase === 'scheduled') {
      this.state.phase = 'done';
      this.state.finishedAt = Date.now();
      this.state.lastError = 'Scheduled run cancelled.';
      this.emit(true);
      return;
    }
    if (!this.active) return;
    this.state.phase = 'stopping';
    this.paused = false;
    this.abort.abort();
    this.resumeWaiters.splice(0).forEach((r) => r());
    this.emit(true);
  }

  dismiss(): void {
    if (this.active) return;
    this.state = null;
    void chrome.storage.session.remove(STORAGE.run);
  }

  private waitIfPaused(): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise((resolve) => this.resumeWaiters.push(resolve));
  }

  /** Starts a run. `runId` keeps the id of a scheduled run when it fires. */
  async start(form: FormModel, config: FormConfig, runId?: string): Promise<RunState> {
    if (this.active && this.state?.phase !== 'scheduled') throw new Error('A run is already in progress.');
    const run = config.run;
    const total = Math.max(1, Math.floor(run.count));
    const runSeed = run.seed.trim() || randomSeed();
    const generator = new ResponseGenerator(form, config, { runSeed, followBranching: run.followBranching });

    this.abort = new AbortController();
    this.paused = false;
    this.state = {
      runId: runId ?? `${Date.now().toString(36)}-${runSeed}`,
      formId: form.id,
      formTitle: form.title,
      phase: 'running',
      total,
      sent: 0,
      ok: 0,
      failed: 0,
      startedAt: Date.now(),
      log: [],
    };
    this.emit(true);
    void this.execute(form, config, generator, runSeed);
    return this.state;
  }

  private async execute(form: FormModel, config: FormConfig, generator: ResponseGenerator, runSeed: string): Promise<void> {
    const state = this.state!;
    const run = config.run;
    const signal = this.abort.signal;
    const pacingRng = createRng(`${runSeed}:pacing`);
    const startedAt = Date.now();

    // Spread mode: random (Poisson-like) arrival times across the window.
    const arrivals =
      run.pacing === 'spread'
        ? Array.from({ length: state.total }, () => pacingRng.next() * Math.max(0.1, run.spreadMinutes) * 60_000).sort((a, b) => a - b)
        : null;

    let nextIndex = 0;
    let consecutiveFailures = 0;
    let fatal: string | null = null;

    const worker = async (): Promise<void> => {
      while (!signal.aborted && !fatal) {
        await this.waitIfPaused();
        if (signal.aborted || fatal) return;
        const i = nextIndex++;
        if (i >= state.total) return;

        if (arrivals) {
          const due = startedAt + arrivals[i]!;
          state.nextAt = due;
          this.emit();
          await sleep(due - Date.now(), signal);
          await this.waitIfPaused();
          if (signal.aborted || fatal) return;
        }

        const response = generator.generate(i);
        const body = buildPayload(form, response);
        let result: SubmitResult | null = null;
        let attempt = 0;
        for (; attempt <= Math.max(0, run.retries); attempt++) {
          result = await submitOnce(form, body, run.useSession, signal);
          if (result.outcome.ok || !result.outcome.retryable || signal.aborted) break;
          if (attempt < run.retries) {
            const backoff = Math.min(60_000, 2000 * 2 ** attempt) * (0.75 + pacingRng.next() * 0.5);
            await sleep(result.outcome.reason === 'rate-limited' ? backoff * 2 : backoff, signal);
          }
        }
        if (signal.aborted && !result?.outcome.ok) return;

        const outcome = result!.outcome;
        const entry: RunLogEntry = {
          index: i,
          ok: outcome.ok,
          status: result!.status,
          ms: result!.ms,
          at: Date.now(),
          attempt: Math.min(attempt, run.retries) + 1,
          summary: summarize(form, response),
          ...(outcome.ok ? (outcome.confirmed ? {} : { message: 'Accepted (no confirmation page detected).' }) : { message: outcome.message }),
        };
        state.sent++;
        if (outcome.ok) {
          state.ok++;
          consecutiveFailures = 0;
        } else {
          state.failed++;
          consecutiveFailures++;
          state.lastError = outcome.message;
          if (outcome.reason === 'login' || outcome.reason === 'closed') fatal = outcome.message;
          else if (run.stopAfterFailures > 0 && consecutiveFailures >= run.stopAfterFailures) {
            fatal = `Stopped after ${consecutiveFailures} consecutive failures. Last error: ${outcome.message}`;
          }
        }
        state.log.unshift(entry);
        if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
        void chrome.action.setBadgeText({ text: badge(state.sent, state.total) }).catch(() => undefined);
        this.emit();

        if (!arrivals && nextIndex < state.total && !fatal) {
          const lo = Math.max(0, Math.min(run.delayMin, run.delayMax));
          const hi = Math.max(run.delayMin, run.delayMax, 0);
          const wait = (lo + pacingRng.next() * (hi - lo)) * 1000;
          state.nextAt = Date.now() + wait;
          await sleep(wait, signal);
        }
      }
    };

    void chrome.action.setBadgeBackgroundColor({ color: '#4f46e5' }).catch(() => undefined);
    const workers = Math.max(1, Math.min(10, Math.floor(run.concurrency), state.total));
    await Promise.all(Array.from({ length: workers }, (_, w) => sleep(w * 350, signal).then(worker)));

    state.finishedAt = Date.now();
    state.nextAt = undefined;
    if (fatal) {
      state.phase = 'error';
      state.lastError = fatal;
    } else state.phase = 'done';
    this.emit(true);
    void chrome.action.setBadgeText({ text: '' }).catch(() => undefined);
    await this.record(state, signal.aborted || !!fatal);
  }

  private async record(state: RunState, stoppedEarly: boolean): Promise<void> {
    const entry: RunHistoryEntry = {
      runId: state.runId,
      formId: state.formId,
      formTitle: state.formTitle,
      total: state.total,
      ok: state.ok,
      failed: state.failed,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt ?? Date.now(),
      stoppedEarly,
    };
    const prev = ((await chrome.storage.local.get(STORAGE.history))[STORAGE.history] as RunHistoryEntry[] | undefined) ?? [];
    await chrome.storage.local.set({ [STORAGE.history]: [entry, ...prev].slice(0, HISTORY_LIMIT) });
  }
}

function badge(sent: number, total: number): string {
  if (total <= 0) return '';
  const pct = Math.floor((sent / total) * 100);
  return sent >= total ? '' : `${pct}%`;
}
