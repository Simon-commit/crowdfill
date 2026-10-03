// Run tab: how many, how fast, and the live progress of a run.
import { useEffect, useState } from 'preact/hooks';
import type { RunSettings, RunState } from '../../core/types';
import { send } from '../api';
import { Icon } from '../icons';
import { config, form, history, isRunning, run, saveSettings, settings, toast, updateConfig } from '../store';
import { Callout, CardHead, Disclosure, Field, NumberInput, Segmented, Slider, Toggle } from './controls';
import { AnimatedNumber, Collapse } from './motion';

/* -------------------------------------------------------------- speed -- */

/** Speed presets: seconds of delay between responses, per worker. */
export const SPEEDS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: 'Gentle', min: 20, max: 45 },
  { label: 'Relaxed', min: 10, max: 25 },
  { label: 'Calm', min: 6, max: 14 },
  { label: 'Steady', min: 4, max: 8 },
  { label: 'Brisk', min: 2.5, max: 5 },
  { label: 'Quick', min: 1.5, max: 3 },
  { label: 'Fast', min: 0.8, max: 1.8 },
  { label: 'Faster', min: 0.4, max: 1 },
  { label: 'Rapid', min: 0.15, max: 0.5 },
  { label: 'Max', min: 0, max: 0.1 },
];

/** Rough time Google takes to accept one response. */
const REQUEST_SECONDS = 0.8;

export function speedLevel(r: Pick<RunSettings, 'delayMin' | 'delayMax'>): number {
  const mid = (r.delayMin + r.delayMax) / 2;
  let best = 0;
  let bestDist = Infinity;
  SPEEDS.forEach((s, i) => {
    const d = Math.abs(Math.log1p((s.min + s.max) / 2) - Math.log1p(mid));
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

export function throughput(r: RunSettings) {
  const avgDelay = (r.delayMin + r.delayMax) / 2;
  const perMinute = r.pacing === 'spread' ? r.count / Math.max(0.1, r.spreadMinutes) : (Math.max(1, r.concurrency) * 60) / (avgDelay + REQUEST_SECONDS);
  const totalMs = r.pacing === 'spread' ? r.spreadMinutes * 60_000 : (r.count / perMinute) * 60_000;
  return { perMinute, totalMs };
}

/* ------------------------------------------------------------ helpers -- */

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtSeconds(s: number): string {
  return s < 10 ? s.toFixed(1) : String(Math.round(s));
}

function fmtTime(t: number): string {
  return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function localInputValue(t: number): string {
  const d = new Date(t - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

/* ------------------------------------------------------------ settings -- */

function SpeedPanel() {
  const r = config.value!.run;
  const level = speedLevel(r);
  const { perMinute, totalMs } = throughput(r);
  const avg = (r.delayMin + r.delayMax) / 2;
  return (
    <div class="stack" style={{ gap: '10px' }}>
      <Field label="Speed" help="How long to wait between responses. Slower looks more natural and is kinder to Google.">
        <Slider
          label="Speed"
          min={0}
          max={SPEEDS.length - 1}
          value={level}
          format={(v) => SPEEDS[v]!.label}
          onInput={(v) =>
            updateConfig((c) => {
              c.run.delayMin = SPEEDS[v]!.min;
              c.run.delayMax = SPEEDS[v]!.max;
            })
          }
        />
      </Field>
      <div class="speed-readout">
        <div>
          <span class="k">Wait between</span>
          <span class="v">
            <AnimatedNumber value={r.delayMin} format={fmtSeconds} />
            <span class="faint"> to </span>
            <AnimatedNumber value={r.delayMax} format={fmtSeconds} />
            <span class="unit">s</span>
          </span>
        </div>
        <div>
          <span class="k">Per minute</span>
          <span class="v">
            <AnimatedNumber value={perMinute} format={(n) => (n < 10 ? n.toFixed(1) : String(Math.round(n)))} />
          </span>
        </div>
        <div>
          <span class="k">{r.count} responses</span>
          <span class="v">
            <AnimatedNumber value={totalMs} format={fmtDuration} />
          </span>
        </div>
      </div>
      <Collapse open={avg < 0.5}>
        <Callout kind="warning">At this speed Google may start rate-limiting. Crowdfill backs off and retries, but slower runs finish more reliably.</Callout>
      </Collapse>
    </div>
  );
}

export function RunSettingsCard() {
  const r = config.value!.run;
  const f = form.value!;
  const set = (fn: (x: RunSettings) => void) => updateConfig((c) => fn(c.run));
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState(() => localInputValue(Date.now() + 3600_000));
  const busy = isRunning.value;
  const ds = config.value!.dataset;

  const start = async () => {
    const scheduleAt = when === 'later' ? new Date(at).getTime() : undefined;
    if (scheduleAt !== undefined && (!Number.isFinite(scheduleAt) || scheduleAt < Date.now() + 10_000)) {
      toast('Pick a start time in the future', 'error');
      return;
    }
    try {
      await send({ type: 'run:start', form: f, config: config.value!, scheduleAt });
      toast(scheduleAt ? `Scheduled for ${fmtTime(scheduleAt)}` : `Sending ${r.count} responses`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <section class="card card-pad">
      <CardHead icon="rocket" title="Send responses" sub={`Real responses to "${f.title}"`} />
      <div class="stack">
        <Field label="How many">
          <div class="row wrap">
            <NumberInput label="Number of responses" value={r.count} min={1} max={100000} onChange={(v) => set((x) => (x.count = Math.round(v)))} />
            {[10, 50, 100, 500].map((n) => (
              <button type="button" class="chip" key={n} aria-pressed={r.count === n} onClick={() => set((x) => (x.count = n))}>
                {n}
              </button>
            ))}
            {ds && (
              <button type="button" class="chip" aria-pressed={r.count === ds.rows.length} onClick={() => set((x) => (x.count = ds.rows.length))}>
                {ds.rows.length} from {ds.name === 'AI crowd' ? 'AI crowd' : 'dataset'}
              </button>
            )}
          </div>
        </Field>

        <Field label="Pacing">
          <Segmented
            label="Pacing"
            value={r.pacing}
            options={[
              { value: 'delay', label: 'Steady speed', title: 'A random pause between each response' },
              { value: 'spread', label: 'Spread over time', title: 'Responses arrive at random moments in a time window' },
            ]}
            onChange={(v) => set((x) => (x.pacing = v))}
          />
        </Field>

        {r.pacing === 'delay' ? (
          <SpeedPanel />
        ) : (
          <Field label="Spread over" hint="Responses trickle in at random moments across this window, like real traffic.">
            <div class="row">
              <NumberInput label="Spread window in minutes" value={r.spreadMinutes} min={1} max={10080} onChange={(v) => set((x) => (x.spreadMinutes = v))} />
              <span class="faint small">minutes, about {(r.count / Math.max(1, r.spreadMinutes)).toFixed(1)} per minute</span>
            </div>
          </Field>
        )}

        <Disclosure title="Fine-tune">
          <div class="stack" style={{ paddingBottom: '4px' }}>
            {r.pacing === 'delay' && (
              <div class="row wrap">
                <Field label="Min wait (s)">
                  <NumberInput label="Minimum wait in seconds" value={r.delayMin} min={0} max={3600} step={0.1} onChange={(v) => set((x) => (x.delayMin = v))} />
                </Field>
                <Field label="Max wait (s)">
                  <NumberInput label="Maximum wait in seconds" value={r.delayMax} min={0} max={3600} step={0.1} onChange={(v) => set((x) => (x.delayMax = v))} />
                </Field>
                <Field label="At once" help="How many responses are sent in parallel.">
                  <NumberInput label="Parallel submissions" value={r.concurrency} min={1} max={5} onChange={(v) => set((x) => (x.concurrency = Math.round(v)))} />
                </Field>
              </div>
            )}
            <div class="row wrap">
              <Field label="Retries" help="Retries for rate limits and network hiccups, waiting a little longer each time.">
                <NumberInput label="Retries" value={r.retries} min={0} max={6} onChange={(v) => set((x) => (x.retries = Math.round(v)))} />
              </Field>
              <Field label="Stop after" help="Stop after this many failures in a row. 0 means never.">
                <NumberInput label="Stop after consecutive failures" value={r.stopAfterFailures} min={0} max={1000} onChange={(v) => set((x) => (x.stopAfterFailures = Math.round(v)))} />
              </Field>
              <Field label="Seed" help="The same seed and settings give exactly the same responses. Leave it empty for a fresh run.">
                <input class="input" style={{ width: '120px' }} placeholder="random" value={r.seed} onInput={(e) => set((x) => (x.seed = (e.target as HTMLInputElement).value))} />
              </Field>
            </div>
            <Toggle checked={r.followBranching} onChange={(v) => set((x) => (x.followBranching = v))} label="Follow section branching" hint="Off means everyone visits every section." />
            <Toggle
              checked={r.useSession}
              onChange={(v) => set((x) => (x.useSession = v))}
              label="Submit as signed-in user"
              hint="Sends your Google cookies. Needed for forms limited to signed-in users. Responses are tied to your account."
            />
          </div>
        </Disclosure>

        <Field label="Start">
          <Segmented
            label="Start time"
            value={when}
            options={[
              { value: 'now', label: 'Right now' },
              { value: 'later', label: 'Schedule' },
            ]}
            onChange={setWhen}
          />
        </Field>
        <Collapse open={when === 'later'}>
          <Field label="Start at" hint="Your browser needs to be open at that time.">
            <input class="input" type="datetime-local" value={at} onInput={(e) => setAt((e.target as HTMLInputElement).value)} />
          </Field>
        </Collapse>

        {f.requiresLogin && !r.useSession && <Callout kind="warning">This form needs a signed-in account. Turn on "Submit as signed-in user" under Fine-tune.</Callout>}

        <button class="btn primary lg block" disabled={busy || r.count < 1} onClick={start}>
          <Icon name={when === 'later' ? 'clock' : 'play'} size={15} />
          {when === 'later' ? 'Schedule' : 'Send'} {r.count} response{r.count === 1 ? '' : 's'}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- monitor -- */

export function RunMonitor({ state }: { state: RunState }) {
  const live = ['running', 'paused', 'stopping', 'scheduled'].includes(state.phase);
  const now = useNow(live);
  const elapsed = (state.finishedAt ?? now) - state.startedAt;
  // Early on the rate is noise, so only show it once there's something to measure.
  const rate = state.sent >= 2 && elapsed >= 5000 ? state.sent / (elapsed / 60_000) : 0;
  const remaining = state.total - state.sent;
  const eta = state.sent > 0 ? (elapsed / state.sent) * remaining : NaN;
  const okPct = (state.ok / Math.max(1, state.total)) * 100;
  const failPct = (state.failed / Math.max(1, state.total)) * 100;

  const act = async (type: 'run:pause' | 'run:resume' | 'run:stop' | 'run:dismiss') => {
    try {
      await send({ type });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const title: Record<RunState['phase'], string> = {
    idle: 'Idle',
    scheduled: 'Scheduled',
    running: 'Sending',
    paused: 'Paused',
    stopping: 'Stopping',
    done: state.sent < state.total ? 'Stopped' : 'All done',
    error: 'Stopped with an error',
  };
  const icon = state.phase === 'error' ? 'alert' : state.phase === 'done' ? 'check' : state.phase === 'scheduled' ? 'clock' : 'rocket';

  return (
    <section class="card card-pad">
      <CardHead icon={icon} title={title[state.phase]} sub={state.formTitle}>
        {state.phase === 'running' && (
          <button class="btn sm" onClick={() => act('run:pause')}>
            <Icon name="pause" size={13} /> Pause
          </button>
        )}
        {state.phase === 'paused' && (
          <button class="btn sm" onClick={() => act('run:resume')}>
            <Icon name="play" size={13} /> Resume
          </button>
        )}
        {live && state.phase !== 'stopping' && (
          <button class="btn sm danger" onClick={() => act('run:stop')}>
            <Icon name="stop" size={13} /> {state.phase === 'scheduled' ? 'Cancel' : 'Stop'}
          </button>
        )}
        {!live && (
          <button class="btn sm ghost icon" onClick={() => act('run:dismiss')} title="Clear" aria-label="Clear">
            <Icon name="x" size={13} />
          </button>
        )}
      </CardHead>

      {state.phase === 'scheduled' ? (
        <Callout>
          Starts {fmtTime(state.scheduledAt!)}, in {fmtDuration(state.scheduledAt! - now)}. Keep your browser open.
        </Callout>
      ) : (
        <div class="stack">
          <div
            class={`progress ${state.phase === 'stopping' ? 'indeterminate' : ''} ${state.phase === 'running' ? 'live' : ''}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={state.total}
            aria-valuenow={state.sent}
          >
            <span class="ok" style={{ width: `${okPct}%` }} />
            <span class="fail" style={{ left: `${okPct}%`, width: `${failPct}%` }} />
          </div>
          <div class="stats">
            <div class="stat">
              <div class="k">Sent</div>
              <div class="v">
                <AnimatedNumber value={state.sent} />
                <span class="faint small">/{state.total}</span>
              </div>
            </div>
            <div class="stat">
              <div class="k">Accepted</div>
              <div class="v ok">
                <AnimatedNumber value={state.ok} />
              </div>
            </div>
            <div class="stat">
              <div class="k">Failed</div>
              <div class={`v ${state.failed ? 'bad' : ''}`}>
                <AnimatedNumber value={state.failed} />
              </div>
            </div>
            <div class="stat">
              <div class="k">{live ? 'Left' : 'Took'}</div>
              <div class="v" style={{ fontSize: '15px' }}>
                {live ? fmtDuration(eta) : fmtDuration(elapsed)}
              </div>
            </div>
          </div>
          <div class="row faint small">
            <span>{rate ? `${rate < 10 ? rate.toFixed(1) : Math.round(rate)} per minute` : ''}</span>
            <span class="spacer" />
            {state.phase === 'running' && state.nextAt && state.nextAt > now && <span>next in {fmtDuration(state.nextAt - now)}</span>}
          </div>
          {state.lastError && <Callout kind={state.phase === 'error' ? 'danger' : 'warning'}>{state.lastError}</Callout>}
          {state.log.length > 0 && (
            <div class="log" aria-live="polite">
              {state.log.slice(0, 120).map((e) => (
                <div class="log-row" key={`${e.index}-${e.at}`}>
                  <span class="i">#{e.index + 1}</span>
                  <span class="ellipsis" title={e.message ?? e.summary}>
                    {e.ok ? e.summary || 'Submitted' : e.message}
                    {e.attempt > 1 && <span class="faint">, attempt {e.attempt}</span>}
                  </span>
                  <span class={`badge ${e.ok ? 'success' : 'danger'}`}>{e.ok ? `${e.ms} ms` : e.status || 'ERR'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Asks once, after a good run, for a store rating. Ratings are how people find Crowdfill. */
function RatePrompt() {
  const r = run.value;
  if (settings.value.reviewAsked || !r || r.phase !== 'done' || r.ok < 10 || r.failed > r.ok / 5) return null;
  const done = () => void saveSettings({ reviewAsked: true });
  return (
    <section class="card card-pad" style={{ background: 'linear-gradient(135deg, var(--accent-soft), var(--surface))' }}>
      <CardHead icon="heart" title={`${r.ok} responses, nicely done`} sub="If Crowdfill saved you some time, a quick rating helps other people find it." />
      <div class="row">
        <a class="btn primary" href={`https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`} target="_blank" rel="noreferrer" onClick={done}>
          Rate Crowdfill
        </a>
        <button class="btn ghost" onClick={done}>
          Not now
        </button>
      </div>
    </section>
  );
}

function HistoryCard() {
  const items = history.value;
  if (items.length === 0) return null;
  return (
    <section class="card card-pad">
      <CardHead icon="clock" title="History">
        <button class="btn ghost sm" onClick={() => void send({ type: 'history:clear' })}>
          Clear
        </button>
      </CardHead>
      <div class="log" style={{ maxHeight: '240px' }}>
        {items.map((h) => (
          <div class="log-row" key={h.runId} style={{ gridTemplateColumns: '1fr auto' }}>
            <span style={{ minWidth: 0 }}>
              <div class="ellipsis" style={{ fontWeight: 560 }}>
                {h.formTitle}
              </div>
              <div class="faint small">
                {fmtTime(h.startedAt)}
                <span class="dot-sep">{fmtDuration(h.finishedAt - h.startedAt)}</span>
              </div>
            </span>
            <span class={`badge ${h.failed ? 'warning' : 'success'}`}>
              {h.ok}/{h.total}
              {h.stoppedEarly ? ', stopped' : ''}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function RunView() {
  const state = run.value;
  const mine = state && state.formId === form.value?.id;
  return (
    <div class="split">
      <div class="sticky stack">
        <RunSettingsCard />
      </div>
      <div class="stack">
        {state && !mine && isRunning.value && <Callout kind="warning">Another form ("{state.formTitle}") is running right now. One run at a time.</Callout>}
        {state ? (
          <RunMonitor state={state} />
        ) : (
          <section class="card empty">
            <span class="empty-icon">
              <Icon name="rocket" size={22} />
            </span>
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>Nothing sent yet</div>
            <div class="small">Check a few responses in Preview first. Runs keep going in the background, even if you close this panel.</div>
          </section>
        )}
        <RatePrompt />
        <HistoryCard />
      </div>
    </div>
  );
}
