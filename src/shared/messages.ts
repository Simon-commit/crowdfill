/** Message protocol between the UI, the service worker and the content script. */
import type { FormConfig, FormModel, GeneratedResponse, Question, RunHistoryEntry, RunState } from '../core/types';

export interface AiRequest {
  formTitle: string;
  formDescription: string;
  question: Pick<Question, 'title' | 'description' | 'kind'> & { validation?: string };
  count: number;
  /** Share of positive / neutral / negative answers (0 to 100 each). */
  mix: { positive: number; neutral: number; negative: number };
  language?: string;
  extraInstructions?: string;
}

/** One question as described to Claude for AI crowd generation. */
export interface CrowdQuestion {
  key: string;
  title: string;
  description: string;
  kind: Question['kind'];
  required: boolean;
  options?: string[];
  hasOther?: boolean;
  rows?: Array<{ key: string; label: string }>;
  validation?: string;
  includeYear?: boolean;
  includeTime?: boolean;
  duration?: boolean;
}

export interface CrowdRequest {
  formTitle: string;
  formDescription: string;
  collectsEmail: boolean;
  questions: CrowdQuestion[];
  /** How many respondents to write in this batch. */
  count: number;
  /** The user's description of the crowd (types, moods, biases). */
  brief: string;
  mix: { positive: number; neutral: number; negative: number };
  /** Short summaries of respondents already written, so new ones differ. */
  avoid: string[];
}

export interface CrowdRespondent {
  persona: string;
  email?: string;
  answers: Record<string, unknown>;
}

export type Request =
  | { type: 'form:load'; url: string; useSession?: boolean }
  | { type: 'run:start'; form: FormModel; config: FormConfig; scheduleAt?: number }
  | { type: 'run:pause' }
  | { type: 'run:resume' }
  | { type: 'run:stop' }
  | { type: 'run:dismiss' }
  | { type: 'run:get' }
  | { type: 'history:get' }
  | { type: 'history:clear' }
  | { type: 'ai:generate'; request: AiRequest }
  | { type: 'ai:test' }
  | { type: 'ai:crowd'; request: CrowdRequest }
  | { type: 'page:autofill'; tabId: number; form: FormModel; response: GeneratedResponse };

export type Reply<T = unknown> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export interface ReplyMap {
  'form:load': FormModel;
  'run:start': RunState;
  'run:pause': RunState | null;
  'run:resume': RunState | null;
  'run:stop': RunState | null;
  'run:dismiss': null;
  'run:get': RunState | null;
  'history:get': RunHistoryEntry[];
  'history:clear': null;
  'ai:generate': string[];
  'ai:test': string;
  'ai:crowd': CrowdRespondent[];
  'page:autofill': AutofillReport;
}

/** Content-script protocol. */
export type ContentRequest =
  | { type: 'cf:ping' }
  | { type: 'cf:autofill'; form: FormModel; response: GeneratedResponse };

export interface AutofillReport {
  filled: number;
  skipped: number;
  notOnPage: number;
  details: string[];
}

/** Keys in chrome.storage. */
export const STORAGE = {
  run: 'run', // session
  history: 'history', // local
  settings: 'settings', // local
  recent: 'recentForms', // local
  schedule: 'schedule', // local
  form: (id: string) => `form:${id}`,
  config: (id: string) => `config:${id}`,
} as const;

export interface Settings {
  apiKey: string;
  aiModel: string;
  notify: boolean;
  theme: 'system' | 'light' | 'dark';
  acknowledged: boolean;
  /** The rating prompt was shown and answered (rated or dismissed). */
  reviewAsked: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  aiModel: 'claude-opus-5-5',
  notify: true,
  theme: 'system',
  acknowledged: false,
  reviewAsked: false,
};

export interface RecentForm {
  id: string;
  title: string;
  url: string;
  at: number;
}

export interface ScheduledRun {
  form: FormModel;
  config: FormConfig;
  at: number;
}
