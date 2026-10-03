/**
 * Default configuration, config migration (keeping saved settings valid when a
 * form is edited) and one-click crowd presets.
 */
import { detectOrdering, type Ordering } from './likert';
import { detectSmartKind } from './text';
import type {
  ChoiceConfig,
  CheckboxConfig,
  DateConfig,
  FormConfig,
  FormModel,
  PersonaConfig,
  Question,
  QuestionConfig,
  RunSettings,
  SmartKind,
  TextConfig,
  TimeConfig,
} from './types';

export interface QuestionMeta {
  ordering: Ordering;
  smartKind: SmartKind;
}

export function questionMeta(q: Question): QuestionMeta {
  let ordering: Ordering;
  if (q.kind === 'scale' || q.kind === 'rating') ordering = { ordinal: true, reversed: false };
  else if (q.kind === 'grid' || q.kind === 'checkGrid' || q.kind === 'choice' || q.kind === 'dropdown')
    ordering = detectOrdering(q.options.filter((o) => !o.isOther).map((o) => o.label));
  else ordering = { ordinal: false, reversed: false };
  return { ordering, smartKind: detectSmartKind(q) };
}

export function metaFor(form: FormModel): Map<string, QuestionMeta> {
  return new Map(form.questions.map((q) => [q.itemId, questionMeta(q)]));
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function defaultText(partial: Partial<TextConfig> = {}): TextConfig {
  return {
    source: 'smart',
    smartKind: 'auto',
    template: '{fullName}',
    list: [],
    listOrder: 'random',
    numMin: 1,
    numMax: 100,
    decimals: 0,
    fixed: '',
    loremMin: 3,
    loremMax: 12,
    ...partial,
  };
}

export function defaultChoice(n: number, ordinal: boolean): ChoiceConfig {
  return {
    mode: ordinal ? 'persona' : 'uniform',
    weights: Array.from({ length: n }, () => 50),
    target: ordinal ? n - 1 : 0,
    strength: 60,
    fixed: 0,
    reverse: false,
  };
}

export function defaultCheckbox(n: number): CheckboxConfig {
  return { mode: 'random', probs: Array.from({ length: n }, () => 35), fixed: [], min: 0, max: 0 };
}

export function defaultDate(): DateConfig {
  const today = new Date();
  const past = new Date(today);
  past.setFullYear(today.getFullYear() - 1);
  return { mode: 'range', from: isoDay(past), to: isoDay(today), fixed: isoDay(today), timeFrom: '08:00', timeTo: '20:00' };
}

export function defaultTime(duration = false): TimeConfig {
  return duration ? { from: '00:05:00', to: '02:00:00' } : { from: '08:00', to: '20:00' };
}

export function defaultQuestionConfig(q: Question, meta: QuestionMeta = questionMeta(q)): QuestionConfig {
  const n = q.options.length;
  return {
    answerRate: q.required ? 100 : 85,
    choice: defaultChoice(n, meta.ordering.ordinal),
    checkbox: defaultCheckbox(n),
    text: defaultText(),
    otherText: defaultText({ smartKind: 'short' }),
    otherRate: q.hasOther ? 8 : 0,
    date: defaultDate(),
    time: defaultTime(q.duration),
  };
}

export const DEFAULT_PERSONA: PersonaConfig = { shape: 'bell', mean: 62, spread: 45, consistency: 65 };

export const DEFAULT_RUN: RunSettings = {
  count: 10,
  pacing: 'delay',
  delayMin: 1,
  delayMax: 3,
  spreadMinutes: 60,
  concurrency: 1,
  retries: 2,
  seed: '',
  useSession: false,
  followBranching: true,
  stopAfterFailures: 5,
};

export function createConfig(form: FormModel): FormConfig {
  const meta = metaFor(form);
  return {
    version: 1,
    formId: form.id,
    questions: Object.fromEntries(form.questions.map((q) => [q.itemId, defaultQuestionConfig(q, meta.get(q.itemId))])),
    persona: { ...DEFAULT_PERSONA },
    run: { ...DEFAULT_RUN },
    email: defaultText({ smartKind: 'email' }),
    dataset: null,
    updatedAt: Date.now(),
  };
}

function resize<T>(list: readonly T[] | undefined, n: number, fill: T): T[] {
  const out = (list ?? []).slice(0, n);
  while (out.length < n) out.push(fill);
  return out;
}

/**
 * Reconciles a saved config with the current form: adds new questions,
 * drops removed ones, resizes option arrays, and fills any missing fields
 * (older versions of the extension) with defaults.
 */
export function reconcileConfig(form: FormModel, saved: Partial<FormConfig> | null | undefined): FormConfig {
  const base = createConfig(form);
  if (!saved || saved.formId !== form.id) return base;
  const meta = metaFor(form);
  const questions: Record<string, QuestionConfig> = {};
  for (const q of form.questions) {
    const def = base.questions[q.itemId]!;
    const s = saved.questions?.[q.itemId];
    if (!s) {
      questions[q.itemId] = def;
      continue;
    }
    const n = q.options.length;
    const ord = meta.get(q.itemId)?.ordering.ordinal ?? false;
    const choice = { ...defaultChoice(n, ord), ...s.choice };
    choice.weights = resize(choice.weights, n, 50);
    choice.fixed = Math.min(choice.fixed, Math.max(0, n - 1));
    choice.target = Math.min(choice.target, Math.max(0, n - 1));
    const checkbox = { ...defaultCheckbox(n), ...s.checkbox };
    checkbox.probs = resize(checkbox.probs, n, 35);
    checkbox.fixed = (checkbox.fixed ?? []).filter((i) => i < n);
    const rowChoice = s.rowChoice
      ? Object.fromEntries(
          q.rows
            .filter((r) => s.rowChoice![r.entryId])
            .map((r) => {
              const rc = { ...defaultChoice(n, ord), ...s.rowChoice![r.entryId] };
              rc.weights = resize(rc.weights, n, 50);
              return [r.entryId, rc];
            }),
        )
      : undefined;
    questions[q.itemId] = {
      ...def,
      ...s,
      choice,
      checkbox,
      text: { ...def.text, ...s.text },
      otherText: { ...def.otherText, ...s.otherText },
      date: { ...def.date, ...s.date },
      time: { ...def.time, ...s.time },
      ...(rowChoice && Object.keys(rowChoice).length ? { rowChoice } : { rowChoice: undefined }),
    };
  }
  return {
    version: 1,
    formId: form.id,
    questions,
    persona: { ...base.persona, ...saved.persona },
    run: { ...base.run, ...saved.run },
    email: { ...base.email, ...saved.email },
    dataset: saved.dataset ?? null,
    updatedAt: saved.updatedAt ?? Date.now(),
  };
}

/* --------------------------------------------------------------- presets -- */

export type CrowdPreset = 'realistic' | 'random' | 'positive' | 'negative' | 'polarized' | 'neutral';

export const PRESETS: ReadonlyArray<{ id: CrowdPreset; label: string; hint: string }> = [
  { id: 'realistic', label: 'Realistic', hint: 'Mildly positive crowd, answers correlate per respondent' },
  { id: 'positive', label: 'Positive', hint: 'Most respondents are happy' },
  { id: 'negative', label: 'Negative', hint: 'Most respondents are unhappy' },
  { id: 'polarized', label: 'Polarized', hint: 'Two camps: lovers and haters' },
  { id: 'neutral', label: 'Neutral', hint: 'Answers cluster around the middle' },
  { id: 'random', label: 'Pure random', hint: 'Every option equally likely, no persona' },
];

const PERSONAS: Record<Exclude<CrowdPreset, 'random'>, PersonaConfig> = {
  realistic: { ...DEFAULT_PERSONA },
  positive: { shape: 'bell', mean: 82, spread: 30, consistency: 70 },
  negative: { shape: 'bell', mean: 22, spread: 30, consistency: 70 },
  polarized: { shape: 'polarized', mean: 55, spread: 30, consistency: 80 },
  neutral: { shape: 'bell', mean: 50, spread: 20, consistency: 70 },
};

/** Applies a crowd preset to every question (keeps text settings untouched). */
export function applyPreset(form: FormModel, config: FormConfig, preset: CrowdPreset): FormConfig {
  const meta = metaFor(form);
  const questions = { ...config.questions };
  for (const q of form.questions) {
    const qc = questions[q.itemId];
    if (!qc) continue;
    const ordinal = meta.get(q.itemId)?.ordering.ordinal ?? false;
    const mode = preset === 'random' || !ordinal ? 'uniform' : 'persona';
    questions[q.itemId] = { ...qc, choice: { ...qc.choice, mode }, rowChoice: undefined };
    if (q.kind === 'checkbox' || q.kind === 'checkGrid') {
      questions[q.itemId]!.checkbox = { ...qc.checkbox, mode: 'random' };
    }
  }
  return {
    ...config,
    questions,
    persona: preset === 'random' ? { ...config.persona, shape: 'uniform' } : { ...PERSONAS[preset] },
    updatedAt: Date.now(),
  };
}
