/**
 * Parses a Google Form's public page into a `FormModel`.
 *
 * Google embeds the full form definition in the page as
 * `var FB_PUBLIC_LOAD_DATA_ = [...]`. Layout (positional arrays):
 *
 *   data[1][0]   description          data[1][8]  title
 *   data[1][1]   items                data[1][10] settings ([6]: e-mail mode)
 *   data[3]      file name            data[14]    "e/<public id>"
 *
 *   item = [itemId, title, description, typeId, entries, navAfterPrevSection, ...]
 *   entry = [entryId, options, required, rowLabel|scaleLabels, validation,
 *            _, timeFlags, dateFlags, _, _, _, gridFlags]
 *   option = [label, _, goToSectionId, _, isOther]
 *
 * Navigation codes: a section-item id, -2 = next section, -3 = submit.
 */
import type {
  ChoiceOption,
  EmailMode,
  FormModel,
  GridRow,
  NavTarget,
  Question,
  QuestionKind,
  Section,
  ValidationRule,
} from './types';

export type FormErrorCode = 'invalid-url' | 'login-required' | 'closed' | 'not-a-form' | 'network' | 'parse';

export class FormError extends Error {
  constructor(
    readonly code: FormErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FormError';
  }
}

/* --------------------------------------------------------------- urls -- */

export function isGoogleFormUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      (u.hostname === 'docs.google.com' && /^\/forms\/(u\/\d+\/)?d\//.test(u.pathname)) ||
      u.hostname === 'forms.gle'
    );
  } catch {
    return false;
  }
}

/** Public form id (the `1FAIpQL...` token) if the URL contains one. */
export function publicIdFromUrl(url: string): string | null {
  const m = /\/forms\/(?:u\/\d+\/)?d\/e\/([A-Za-z0-9_-]{20,})/.exec(url);
  return m ? m[1]! : null;
}

/** Normalizes any form link (viewform, formResponse, prefill, edit) into a fetchable viewform URL. */
export function toViewUrl(url: string): string {
  const u = new URL(url.trim());
  if (u.hostname === 'forms.gle') return u.toString();
  const pub = publicIdFromUrl(u.pathname);
  if (pub) return `https://docs.google.com/forms/d/e/${pub}/viewform`;
  const m = /\/forms\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})/.exec(u.pathname);
  if (m) return `https://docs.google.com/forms/d/${m[1]}/viewform`;
  throw new FormError('invalid-url', 'That does not look like a Google Forms link.');
}

/* --------------------------------------------------------------- html -- */

export function extractLoadData(html: string): unknown[] | null {
  const m = /FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/.exec(html);
  if (!m) return null;
  try {
    const data: unknown = JSON.parse(m[1]!);
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export function extractFbzx(html: string): string | null {
  const m = /name="fbzx"\s+value="(-?\d+)"/.exec(html) ?? /data-shuffle-seed="(-?\d+)"/.exec(html);
  return m ? m[1]! : null;
}

export function looksLikeLoginPage(url: string, html: string): boolean {
  return /accounts\.google\.com|ServiceLogin|\/signin\//.test(url) || /<form[^>]+action="[^"]*accounts\.google\.com/.test(html);
}

export function looksClosed(url: string, html: string): boolean {
  return /\/closedform/.test(url) || (!html.includes('FB_PUBLIC_LOAD_DATA_') && /closedform|no longer accepting responses/i.test(html));
}

/** Parses a viewform HTML document. Throws `FormError` with a helpful code. */
export function parseFormHtml(html: string, finalUrl: string): FormModel {
  if (looksLikeLoginPage(finalUrl, html)) {
    throw new FormError('login-required', 'This form requires signing in to Google.');
  }
  if (looksClosed(finalUrl, html)) {
    throw new FormError('closed', 'This form is no longer accepting responses.');
  }
  const data = extractLoadData(html);
  if (!data) throw new FormError('not-a-form', 'Could not find form data on that page.');
  return parseLoadData(data, { url: finalUrl, fbzx: extractFbzx(html) });
}

/* -------------------------------------------------------------- model -- */

type Raw = unknown;
const arr = (v: Raw): Raw[] => (Array.isArray(v) ? v : []);
const str = (v: Raw): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: Raw): number | undefined => (typeof v === 'number' ? v : undefined);

const KIND_BY_TYPE: Record<number, QuestionKind> = {
  0: 'short',
  1: 'paragraph',
  2: 'choice',
  3: 'dropdown',
  4: 'checkbox',
  5: 'scale',
  7: 'grid',
  9: 'date',
  10: 'time',
  13: 'file',
  18: 'rating',
};
const NON_QUESTION_TYPES = new Set([6, 8, 11, 12]); // text block, section, image, video

const NUMBER_OPS: Record<number, Extract<ValidationRule, { kind: 'number' }>['op']> = {
  1: 'gt', 2: 'gte', 3: 'lt', 4: 'lte', 5: 'eq', 6: 'neq', 7: 'between', 8: 'notBetween', 9: 'isNumber', 10: 'isInteger',
};
const TEXT_OPS: Record<number, Extract<ValidationRule, { kind: 'text' }>['op']> = {
  100: 'contains', 101: 'notContains', 102: 'email', 103: 'url',
};
const REGEX_OPS: Record<number, Extract<ValidationRule, { kind: 'regex' }>['op']> = {
  299: 'contains', 300: 'notContains', 301: 'matches', 302: 'notMatches',
};
const LENGTH_OPS: Record<number, Extract<ValidationRule, { kind: 'length' }>['op']> = { 202: 'max', 203: 'min' };
const COUNT_OPS: Record<number, Extract<ValidationRule, { kind: 'count' }>['op']> = { 200: 'atLeast', 201: 'atMost', 204: 'exactly' };

export function parseValidation(raw: Raw): ValidationRule | undefined {
  const list = arr(raw);
  const rule = Array.isArray(list[0]) ? arr(list[0]) : list;
  const type = num(rule[0]);
  const op = num(rule[1]);
  if (type === undefined || op === undefined) return undefined;
  const args = arr(rule[2]).map(str);
  const message = str(rule[3]) || undefined;
  const n = (s: string | undefined) => (s === undefined || s.trim() === '' ? undefined : Number(s));
  if (type === 1 && NUMBER_OPS[op]) return { kind: 'number', op: NUMBER_OPS[op], a: n(args[0]), b: n(args[1]), message };
  if (type === 2 && TEXT_OPS[op]) return { kind: 'text', op: TEXT_OPS[op], value: args[0], message };
  if (type === 4 && REGEX_OPS[op] && args[0]) return { kind: 'regex', op: REGEX_OPS[op], pattern: args[0], message };
  if (type === 6 && LENGTH_OPS[op] && n(args[0]) !== undefined) return { kind: 'length', op: LENGTH_OPS[op], value: n(args[0])!, message };
  if (type === 7 && COUNT_OPS[op] && n(args[0]) !== undefined) return { kind: 'count', op: COUNT_OPS[op], value: n(args[0])!, message };
  return undefined;
}

function navFrom(raw: Raw, sectionIndexById: Map<string, number>): NavTarget | undefined {
  if (raw === null || raw === undefined) return undefined;
  const v = num(raw);
  if (v === undefined) return undefined;
  if (v === -2) return { kind: 'next' };
  if (v === -3 || v === -1) return { kind: 'submit' };
  const idx = sectionIndexById.get(String(v));
  return idx === undefined ? { kind: 'next' } : { kind: 'section', index: idx };
}

function emailModeFrom(settings: Raw[]): EmailMode {
  const mode = num(settings[6]);
  if (mode === 2) return 'verified';
  if (mode === 3) return 'input';
  if (mode === 1) return 'none';
  return num(settings[4]) === 1 ? 'input' : 'none';
}

export function parseLoadData(data: Raw[], meta: { url?: string; fbzx?: string | null } = {}): FormModel {
  const info = arr(data[1]);
  const items = arr(info[1]).map(arr);
  const settings = arr(info[10]);

  const pathId = str(data[14]);
  const id = /^e\/(.+)$/.exec(pathId)?.[1] ?? (meta.url ? publicIdFromUrl(meta.url) : null) ?? '';
  if (!id) throw new FormError('parse', 'Could not determine the form id.');

  // Pass 1: map section ids to indices, so forward "go to section" references resolve.
  const sectionIndexById = new Map<string, number>();
  let sectionCount = 1;
  for (const item of items) if (num(item[3]) === 8) sectionIndexById.set(str(item[0]), sectionCount++);

  const sections: Section[] = [
    { itemId: null, title: str(info[8]) || str(data[3]), description: str(info[0]), next: { kind: 'next' } },
  ];
  const questions: Question[] = [];

  for (const item of items) {
    const typeId = num(item[3]) ?? -1;
    if (typeId === 8) {
      // A section break's nav field means "after the *previous* section, go to X".
      sections[sections.length - 1]!.next = navFrom(item[5], sectionIndexById) ?? { kind: 'next' };
      sections.push({ itemId: str(item[0]), title: str(item[1]), description: str(item[2]), next: { kind: 'next' } });
      continue;
    }
    if (NON_QUESTION_TYPES.has(typeId)) continue;

    const entries = arr(item[4]).map(arr);
    const first = entries[0] ?? [];
    let kind: QuestionKind = KIND_BY_TYPE[typeId] ?? (arr(first[1]).length ? 'choice' : 'unsupported');
    if (kind === 'grid' && num(arr(first[11])[0]) === 1) kind = 'checkGrid';

    const options: ChoiceOption[] = arr(first[1]).map((o) => {
      const opt = arr(o);
      const nav = navFrom(opt[2], sectionIndexById);
      const isOther = opt[4] === 1 || opt[4] === true;
      return { label: isOther ? '' : str(opt[0]), isOther, ...(nav ? { nav } : {}) };
    });
    if (kind === 'rating' && options.length === 0) {
      for (let i = 1; i <= 5; i++) options.push({ label: String(i), isOther: false });
    }

    const rows: GridRow[] =
      kind === 'grid' || kind === 'checkGrid'
        ? entries.map((e) => ({ entryId: str(e[0]), label: str(arr(e[3])[0]), required: !!e[2] }))
        : [];

    const q: Question = {
      itemId: str(item[0]),
      entryId: str(first[0]),
      kind,
      typeId,
      title: str(item[1]),
      description: str(item[2]),
      required: rows.length ? rows.some((r) => r.required) : !!first[2],
      section: sections.length - 1,
      options,
      rows,
      hasOther: options.some((o) => o.isOther),
    };
    if (kind === 'scale') {
      const labels = arr(first[3]).map(str);
      if (labels.length === 2) q.scaleLabels = [labels[0]!, labels[1]!];
    }
    if (kind === 'date') {
      const flags = arr(first[7]);
      q.includeTime = num(flags[0]) === 1;
      q.includeYear = flags.length < 2 ? true : num(flags[1]) === 1;
    }
    if (kind === 'time') q.duration = num(arr(first[6])[0]) === 1;
    if (kind === 'short' || kind === 'paragraph' || kind === 'checkbox') {
      const v = parseValidation(first[4]);
      if (v) q.validation = v;
    }
    if (!q.entryId) q.kind = 'unsupported';
    questions.push(q);
  }

  return {
    id,
    url: `https://docs.google.com/forms/d/e/${id}/viewform`,
    actionUrl: `https://docs.google.com/forms/d/e/${id}/formResponse`,
    title: str(info[8]) || str(data[3]) || 'Untitled form',
    description: str(info[0]),
    sections,
    questions,
    emailMode: emailModeFrom(settings),
    fbzx: meta.fbzx ?? null,
    requiresLogin: emailModeFrom(settings) === 'verified',
    fetchedAt: Date.now(),
  };
}

export const KIND_LABELS: Record<QuestionKind, string> = {
  short: 'Short answer',
  paragraph: 'Paragraph',
  choice: 'Multiple choice',
  dropdown: 'Dropdown',
  checkbox: 'Checkboxes',
  scale: 'Linear scale',
  rating: 'Rating',
  grid: 'Choice grid',
  checkGrid: 'Checkbox grid',
  date: 'Date',
  time: 'Time',
  file: 'File upload',
  unsupported: 'Unsupported',
};
