/**
 * Service worker: message router, form loading, scheduling, notifications.
 */
import { FormError, parseFormHtml, toViewUrl } from '../core/parser';
import type { FormModel, RunHistoryEntry, RunState } from '../core/types';
import {
  DEFAULT_SETTINGS,
  STORAGE,
  type AutofillReport,
  type ContentRequest,
  type RecentForm,
  type Reply,
  type Request,
  type ScheduledRun,
  type Settings,
} from '../shared/messages';
import { AiError, generateAnswers, generateCrowd, testKey } from './ai';
import { Runner } from './runner';

const SCHEDULE_ALARM = 'crowdfill-scheduled-run';
const runner = new Runner();
let lastPhase: RunState['phase'] | null = null;

/* ------------------------------------------------------------ lifecycle -- */

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});
chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});

const ready = runner.restore().catch(() => undefined);

runner.onChange((state) => {
  if (state.phase === lastPhase) return;
  const prev = lastPhase;
  lastPhase = state.phase;
  if ((state.phase === 'done' || state.phase === 'error') && (prev === 'running' || prev === 'stopping' || prev === 'paused')) {
    void notifyFinished(state);
  }
});

async function getSettings(): Promise<Settings> {
  const s = (await chrome.storage.local.get(STORAGE.settings))[STORAGE.settings] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...s };
}

async function notifyFinished(state: RunState): Promise<void> {
  const settings = await getSettings();
  if (!settings.notify) return;
  const title = state.phase === 'error' ? 'Crowdfill run stopped' : 'Crowdfill run complete';
  const message =
    state.phase === 'error'
      ? `${state.ok} submitted, ${state.failed} failed. ${state.lastError ?? ''}`.trim()
      : `${state.ok} of ${state.total} responses submitted to "${state.formTitle}".${state.failed ? ` ${state.failed} failed.` : ''}`;
  chrome.notifications.create(`crowdfill-${state.runId}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title,
    message,
    priority: 0,
  });
}

/* ---------------------------------------------------------------- forms -- */

async function loadForm(url: string, useSession = false): Promise<FormModel> {
  const viewUrl = toViewUrl(url);
  let res: Response;
  try {
    res = await fetch(viewUrl, { credentials: useSession ? 'include' : 'omit', redirect: 'follow', cache: 'no-store' });
  } catch {
    throw new FormError('network', 'Could not reach Google Forms. Check your connection.');
  }
  const html = await res.text();
  let form: FormModel;
  try {
    form = parseFormHtml(html, res.url);
  } catch (e) {
    // Sign-in-only forms: retry with the browser's Google session if the user didn't ask for it yet.
    if (e instanceof FormError && e.code === 'login-required' && !useSession) {
      const withSession = await loadForm(url, true).catch(() => null);
      if (withSession) return { ...withSession, requiresLogin: true };
    }
    throw e;
  }
  if (useSession) form.requiresLogin = true;
  await chrome.storage.local.set({ [STORAGE.form(form.id)]: form });
  await rememberRecent(form);
  return form;
}

async function rememberRecent(form: FormModel): Promise<void> {
  const prev = ((await chrome.storage.local.get(STORAGE.recent))[STORAGE.recent] as RecentForm[] | undefined) ?? [];
  const next = [{ id: form.id, title: form.title, url: form.url, at: Date.now() }, ...prev.filter((f) => f.id !== form.id)].slice(0, 12);
  await chrome.storage.local.set({ [STORAGE.recent]: next });
}

/* ------------------------------------------------------------- schedule -- */

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== SCHEDULE_ALARM) return;
  await ready;
  const sched = (await chrome.storage.local.get(STORAGE.schedule))[STORAGE.schedule] as ScheduledRun | undefined;
  await chrome.storage.local.remove(STORAGE.schedule);
  if (!sched || runner.state?.phase !== 'scheduled') return;
  await runner.start(sched.form, sched.config, runner.state.runId).catch(() => undefined);
});

async function cancelSchedule(): Promise<void> {
  await chrome.alarms.clear(SCHEDULE_ALARM);
  await chrome.storage.local.remove(STORAGE.schedule);
}

/* ------------------------------------------------------------- autofill -- */

async function autofill(tabId: number, req: Extract<Request, { type: 'page:autofill' }>): Promise<AutofillReport> {
  const msg: ContentRequest = { type: 'cf:autofill', form: req.form, response: req.response };
  try {
    return (await chrome.tabs.sendMessage(tabId, msg)) as AutofillReport;
  } catch {
    // Tab was open before the extension loaded: inject the content script and retry.
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return (await chrome.tabs.sendMessage(tabId, msg)) as AutofillReport;
  }
}

/* --------------------------------------------------------------- router -- */

async function handle(msg: Request): Promise<unknown> {
  await ready;
  switch (msg.type) {
    case 'form:load':
      return loadForm(msg.url, msg.useSession);
    case 'run:start': {
      if (msg.scheduleAt && msg.scheduleAt > Date.now() + 5000) {
        if (runner.active) throw new Error('A run is already in progress.');
        const sched: ScheduledRun = { form: msg.form, config: msg.config, at: msg.scheduleAt };
        await chrome.storage.local.set({ [STORAGE.schedule]: sched });
        await chrome.alarms.create(SCHEDULE_ALARM, { when: msg.scheduleAt });
        return runner.markScheduled(msg.form, msg.config, msg.scheduleAt);
      }
      await cancelSchedule();
      return runner.start(msg.form, msg.config);
    }
    case 'run:pause':
      runner.pause();
      return runner.state;
    case 'run:resume':
      runner.resume();
      return runner.state;
    case 'run:stop':
      if (runner.state?.phase === 'scheduled') await cancelSchedule();
      runner.stop();
      return runner.state;
    case 'run:dismiss':
      runner.dismiss();
      return null;
    case 'run:get':
      return runner.state;
    case 'history:get':
      return ((await chrome.storage.local.get(STORAGE.history))[STORAGE.history] as RunHistoryEntry[] | undefined) ?? [];
    case 'history:clear':
      await chrome.storage.local.remove(STORAGE.history);
      return null;
    case 'ai:generate': {
      const s = await getSettings();
      return generateAnswers(s.apiKey, s.aiModel, msg.request);
    }
    case 'ai:crowd': {
      const s = await getSettings();
      return generateCrowd(s.apiKey, s.aiModel, msg.request);
    }
    case 'ai:test': {
      const s = await getSettings();
      return testKey(s.apiKey, s.aiModel);
    }
    case 'page:autofill':
      return autofill(msg.tabId, msg);
  }
}

chrome.runtime.onMessage.addListener((msg: Request, sender, sendResponse: (r: Reply) => void) => {
  // Only accept requests from our own extension pages (side panel or full tab), never content scripts.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  handle(msg).then(
    (data) => sendResponse({ ok: true, data }),
    (e: unknown) =>
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        code: e instanceof FormError || e instanceof AiError ? e.code : undefined,
      }),
  );
  return true;
});
