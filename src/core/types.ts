/**
 * Shared domain model.
 *
 * `FormModel` is a normalized view of a Google Form (parsed from the page's
 * `FB_PUBLIC_LOAD_DATA_` blob). `FormConfig` is the user's answer strategy for
 * that form. `GeneratedResponse` is one synthetic respondent's answers.
 */

/* ------------------------------------------------------------------ form -- */

export type QuestionKind =
  | 'short'
  | 'paragraph'
  | 'choice'
  | 'dropdown'
  | 'checkbox'
  | 'scale'
  | 'rating'
  | 'grid'
  | 'checkGrid'
  | 'date'
  | 'time'
  | 'file'
  | 'unsupported';

/** Where a respondent goes after a section (or after picking an option). */
export type NavTarget = { kind: 'next' } | { kind: 'submit' } | { kind: 'section'; index: number };

export interface ChoiceOption {
  /** The value Google expects on submission. Empty for the "Other" option. */
  label: string;
  isOther: boolean;
  /** "Go to section based on answer" target, when set. */
  nav?: NavTarget;
}

export type NumberOp =
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'eq'
  | 'neq'
  | 'between'
  | 'notBetween'
  | 'isNumber'
  | 'isInteger';

export type ValidationRule =
  | { kind: 'number'; op: NumberOp; a?: number; b?: number; message?: string }
  | { kind: 'text'; op: 'contains' | 'notContains' | 'email' | 'url'; value?: string; message?: string }
  | { kind: 'length'; op: 'max' | 'min'; value: number; message?: string }
  | { kind: 'regex'; op: 'contains' | 'notContains' | 'matches' | 'notMatches'; pattern: string; message?: string }
  | { kind: 'count'; op: 'atLeast' | 'atMost' | 'exactly'; value: number; message?: string };

export interface GridRow {
  entryId: string;
  label: string;
  required: boolean;
}

export interface Question {
  itemId: string;
  /** Primary entry id (first sub-entry). Grids use `rows[].entryId` instead. */
  entryId: string;
  kind: QuestionKind;
  typeId: number;
  title: string;
  description: string;
  required: boolean;
  /** Index into `FormModel.sections`. */
  section: number;
  /** Choices; for grids these are the columns. */
  options: ChoiceOption[];
  rows: GridRow[];
  scaleLabels?: [string, string];
  includeYear?: boolean;
  includeTime?: boolean;
  /** Time questions: "duration" mode (h:m:s) rather than time-of-day. */
  duration?: boolean;
  validation?: ValidationRule;
  hasOther: boolean;
}

export interface Section {
  itemId: string | null;
  title: string;
  description: string;
  /** What happens after this section when no answer-based branch applies. */
  next: NavTarget;
}

export type EmailMode = 'none' | 'input' | 'verified';

export interface FormModel {
  /** Public form id (the `1FAIpQL...` token). */
  id: string;
  url: string;
  actionUrl: string;
  title: string;
  description: string;
  sections: Section[];
  questions: Question[];
  emailMode: EmailMode;
  fbzx: string | null;
  /** The form could only be loaded with a signed-in Google session. */
  requiresLogin: boolean;
  fetchedAt: number;
}

/* ---------------------------------------------------------------- config -- */

export type ChoiceMode = 'uniform' | 'weighted' | 'tendency' | 'fixed' | 'cycle' | 'persona';

export interface ChoiceConfig {
  mode: ChoiceMode;
  /** Relative weight per option (0 to 100). */
  weights: number[];
  /** Tendency: option index the answers lean towards (fractional allowed for ordinal scales). */
  target: number;
  /** Tendency strength 0 to 100. 0 = uniform, 100 = always the target. */
  strength: number;
  /** Fixed: option index. */
  fixed: number;
  /** Persona: the scale runs from positive to negative (reverse-scored). */
  reverse: boolean;
}

export type CheckboxMode = 'random' | 'weighted' | 'fixed';

export interface CheckboxConfig {
  mode: CheckboxMode;
  /** Probability (0 to 100) each option is ticked. */
  probs: number[];
  fixed: number[];
  /** Selection count bounds. 0 = automatic. */
  min: number;
  max: number;
}

export type TextSource = 'smart' | 'template' | 'list' | 'number' | 'fixed' | 'lorem';

export type SmartKind =
  | 'auto'
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'age'
  | 'number'
  | 'city'
  | 'country'
  | 'address'
  | 'zip'
  | 'company'
  | 'jobTitle'
  | 'url'
  | 'username'
  | 'school'
  | 'studentId'
  | 'feedback'
  | 'suggestion'
  | 'short';

export interface TextConfig {
  source: TextSource;
  smartKind: SmartKind;
  template: string;
  list: string[];
  listOrder: 'random' | 'sequential' | 'shuffle';
  numMin: number;
  numMax: number;
  decimals: number;
  fixed: string;
  loremMin: number;
  loremMax: number;
}

export interface DateConfig {
  mode: 'range' | 'fixed' | 'today';
  from: string; // YYYY-MM-DD
  to: string;
  fixed: string;
  timeFrom: string; // HH:MM
  timeTo: string;
}

export interface TimeConfig {
  from: string; // HH:MM or HH:MM:SS
  to: string;
}

export interface QuestionConfig {
  /** For optional questions: chance (0 to 100) the respondent answers at all. */
  answerRate: number;
  choice: ChoiceConfig;
  checkbox: CheckboxConfig;
  text: TextConfig;
  /** Text used when the "Other" option is picked. */
  otherText: TextConfig;
  /** Chance (0 to 100) the "Other" option is used when it exists (uniform/persona modes). */
  otherRate: number;
  date: DateConfig;
  time: TimeConfig;
  /** Grids: per-row overrides keyed by row entry id. Absent rows use `choice` / `checkbox`. */
  rowChoice?: Record<string, ChoiceConfig>;
}

export type PersonaShape = 'bell' | 'polarized' | 'uniform';

export interface PersonaConfig {
  shape: PersonaShape;
  /** Average sentiment of the crowd 0 (negative) to 100 (positive). For "polarized": share of positive camp. */
  mean: number;
  /** How much respondents differ from each other (0 to 100). */
  spread: number;
  /** How strongly each answer follows the respondent's sentiment (0 to 100). */
  consistency: number;
}

export interface RunSettings {
  count: number;
  pacing: 'delay' | 'spread';
  /** Seconds between submissions per worker. */
  delayMin: number;
  delayMax: number;
  /** Spread mode: total minutes over which submissions are spread randomly. */
  spreadMinutes: number;
  concurrency: number;
  retries: number;
  /** Empty = random seed every run. */
  seed: string;
  /** Send the browser's Google cookies (needed for sign-in-only forms). */
  useSession: boolean;
  /** Follow the form's section branching (otherwise visit every section). */
  followBranching: boolean;
  /** Stop the run after this many consecutive failures (0 = never). */
  stopAfterFailures: number;
}

export interface Dataset {
  name: string;
  headers: string[];
  rows: string[][];
  /** Maps question item id (or grid row entry id) to a column index. */
  mapping: Record<string, number>;
  order: 'sequential' | 'random';
}

export interface FormConfig {
  version: 1;
  formId: string;
  questions: Record<string, QuestionConfig>;
  persona: PersonaConfig;
  run: RunSettings;
  email: TextConfig;
  dataset: Dataset | null;
  updatedAt: number;
}

/* ------------------------------------------------------------- responses -- */

export type AnswerValue =
  | { t: 'text'; v: string }
  | { t: 'choice'; v: string; other?: string }
  | { t: 'multi'; v: string[]; other?: string }
  | { t: 'grid'; rows: Record<string, string[]> }
  | { t: 'date'; y?: number; m: number; d: number; hh?: number; mm?: number }
  | { t: 'time'; hh: number; mm: number; ss?: number };

export interface Respondent {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  phone: string;
  age: number;
  city: string;
  country: string;
  company: string;
  jobTitle: string;
  /** Latent sentiment 0 (very negative) to 1 (very positive). */
  sentiment: number;
}

export interface GeneratedResponse {
  index: number;
  respondent: Respondent;
  /** Section indices visited, in order. */
  path: number[];
  answers: Record<string, AnswerValue>;
  email?: string;
}

/* ------------------------------------------------------------------- run -- */

export type RunPhase = 'idle' | 'scheduled' | 'running' | 'paused' | 'stopping' | 'done' | 'error';

export interface RunLogEntry {
  index: number;
  ok: boolean;
  status: number;
  ms: number;
  at: number;
  message?: string;
  attempt: number;
  summary?: string;
}

export interface RunState {
  runId: string;
  formId: string;
  formTitle: string;
  phase: RunPhase;
  total: number;
  sent: number;
  ok: number;
  failed: number;
  startedAt: number;
  finishedAt?: number;
  scheduledAt?: number;
  nextAt?: number;
  lastError?: string;
  log: RunLogEntry[];
}

export interface RunHistoryEntry {
  runId: string;
  formId: string;
  formTitle: string;
  total: number;
  ok: number;
  failed: number;
  startedAt: number;
  finishedAt: number;
  stoppedEarly: boolean;
}
