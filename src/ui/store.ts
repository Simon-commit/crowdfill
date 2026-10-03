/**
 * App state (Preact signals) and the actions that change it. Configs are
 * persisted per form (debounced) so every form remembers its strategy.
 */
import { computed, effect, signal } from '@preact/signals';
import { metaFor, reconcileConfig, type QuestionMeta } from '../core/defaults';
import { isGoogleFormUrl } from '../core/parser';
import type { FormConfig, FormModel, QuestionConfig, RunHistoryEntry, RunState } from '../core/types';
import { DEFAULT_SETTINGS, STORAGE, type RecentForm, type Settings } from '../shared/messages';
import { ApiError, getLocal, send, setLocal } from './api';

export type View = 'design' | 'run' | 'preview' | 'data';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
  ms: number;
  leaving: boolean;
}

export interface ActiveTab {
  id: number;
  url: string;
  isForm: boolean;
}

export const settings = signal<Settings>(DEFAULT_SETTINGS);
export const form = signal<FormModel | null>(null);
export const config = signal<FormConfig | null>(null);
export const run = signal<RunState | null>(null);
export const history = signal<RunHistoryEntry[]>([]);
export const recent = signal<RecentForm[]>([]);
export const activeTab = signal<ActiveTab | null>(null);
export const view = signal<View>('design');
export const showSettings = signal(false);
export const loading = signal(false);
export const loadError = signal<{ message: string; code?: string } | null>(null);
export const currentToast = signal<Toast | null>(null);
export const openCards = signal<ReadonlySet<string>>(new Set());
export const ready = signal(false);

export const meta = computed<Map<string, QuestionMeta>>(() => (form.value ? metaFor(form.value) : new Map()));
export const isRunning = computed(() => !!run.value && ['running', 'paused', 'stopping', 'scheduled'].includes(run.value.phase));

/* ---------------------------------------------------------------- toasts -- */

// Only one toast is ever on screen. A new message replaces the current one
// instead of stacking, and each toast animates out before it is removed.
let toastId = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(text: string, kind: Toast['kind'] = 'info', ms = 3200): void {
  const id = ++toastId;
  if (toastTimer) clearTimeout(toastTimer);
  currentToast.value = { id, kind, text, ms, leaving: false };
  toastTimer = setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id = currentToast.value?.id): void {
  const t = currentToast.value;
  if (!t || t.id !== id || t.leaving) return;
  currentToast.value = { ...t, leaving: true };
  setTimeout(() => {
    if (currentToast.value?.id === id) currentToast.value = null;
  }, 220);
}

/* ---------------------------------------------------------------- config -- */

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: FormConfig | null = null;
function flushConfig(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (pendingSave) void setLocal(STORAGE.config(pendingSave.formId), pendingSave);
  pendingSave = null;
}
function persistConfig(c: FormConfig): void {
  pendingSave = c;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushConfig, 350);
}
// Don't lose the last edit when the side panel is closed mid-debounce.
addEventListener('pagehide', flushConfig);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushConfig());

export function updateConfig(mutate: (draft: FormConfig) => void): void {
  const current = config.value;
  if (!current) return;
  const draft = structuredClone(current);
  mutate(draft);
  draft.updatedAt = Date.now();
  config.value = draft;
  persistConfig(draft);
}

export function replaceConfig(next: FormConfig): void {
  config.value = next;
  persistConfig(next);
}

export function updateQuestion(itemId: string, mutate: (qc: QuestionConfig) => void): void {
  updateConfig((c) => {
    const qc = c.questions[itemId];
    if (qc) mutate(qc);
  });
}

export function toggleCard(itemId: string, open?: boolean): void {
  const next = new Set(openCards.value);
  const want = open ?? !next.has(itemId);
  if (want) next.add(itemId);
  else next.delete(itemId);
  openCards.value = next;
}

/* ----------------------------------------------------------------- forms -- */

export async function loadForm(url: string, opts: { quiet?: boolean } = {}): Promise<boolean> {
  loading.value = true;
  loadError.value = null;
  try {
    const f = await send({ type: 'form:load', url });
    const saved = await getLocal<FormConfig>(STORAGE.config(f.id));
    const cfg = reconcileConfig(f, saved);
    if (f.requiresLogin) cfg.run.useSession = true;
    form.value = f;
    config.value = cfg;
    openCards.value = new Set();
    if (!saved) persistConfig(cfg);
    if (!opts.quiet) toast(`Loaded "${f.title}" with ${f.questions.length} questions`, 'success');
    return true;
  } catch (e) {
    const err = e instanceof ApiError ? { message: e.message, code: e.code } : { message: String(e) };
    loadError.value = err;
    return false;
  } finally {
    loading.value = false;
  }
}

export function closeForm(): void {
  form.value = null;
  config.value = null;
  loadError.value = null;
}

/* --------------------------------------------------------------- settings -- */

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  settings.value = { ...settings.value, ...patch };
  await setLocal(STORAGE.settings, settings.value);
}

effect(() => {
  const t = settings.value.theme;
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
});

/* ------------------------------------------------------------------- tabs -- */

async function refreshActiveTab(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !tab.url) {
      activeTab.value = null;
      return;
    }
    activeTab.value = { id: tab.id, url: tab.url, isForm: isGoogleFormUrl(tab.url) && !/\/edit(\b|$)/.test(tab.url) };
  } catch {
    activeTab.value = null;
  }
}

/* ------------------------------------------------------------------- init -- */

export async function init(): Promise<void> {
  const [s, r, runState, hist] = await Promise.all([
    getLocal<Partial<Settings>>(STORAGE.settings),
    getLocal<RecentForm[]>(STORAGE.recent),
    chrome.storage.session.get(STORAGE.run).then((x) => x[STORAGE.run] as RunState | undefined),
    getLocal<RunHistoryEntry[]>(STORAGE.history),
  ]);
  settings.value = { ...DEFAULT_SETTINGS, ...s };
  recent.value = r ?? [];
  run.value = runState ?? null;
  history.value = hist ?? [];

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[STORAGE.run]) run.value = (changes[STORAGE.run].newValue as RunState | undefined) ?? null;
    if (area === 'local' && changes[STORAGE.history]) history.value = (changes[STORAGE.history].newValue as RunHistoryEntry[] | undefined) ?? [];
    if (area === 'local' && changes[STORAGE.recent]) recent.value = (changes[STORAGE.recent].newValue as RecentForm[] | undefined) ?? [];
    if (area === 'local' && changes[STORAGE.settings]) settings.value = { ...DEFAULT_SETTINGS, ...(changes[STORAGE.settings].newValue as Partial<Settings>) };
  });

  await refreshActiveTab();
  chrome.tabs.onActivated.addListener(() => void refreshActiveTab());
  chrome.tabs.onUpdated.addListener((_id, info) => {
    if (info.url || info.status === 'complete') void refreshActiveTab();
  });
  chrome.windows?.onFocusChanged.addListener(() => void refreshActiveTab());

  // Open straight into the running form, or the form in the current tab.
  const params = new URLSearchParams(location.search);
  const target = params.get('form');
  if (run.value && ['running', 'paused', 'scheduled'].includes(run.value.phase)) {
    const cached = await getLocal<FormModel>(STORAGE.form(run.value.formId));
    if (cached) await loadForm(cached.url, { quiet: true });
    view.value = 'run';
  } else if (target) await loadForm(target, { quiet: true });
  else if (activeTab.value?.isForm) await loadForm(activeTab.value.url, { quiet: true });
  ready.value = true;
}
