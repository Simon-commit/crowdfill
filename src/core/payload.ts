/**
 * Serializes generated responses into exactly what Google's own form posts
 * (`entry.N`, `entry.N_year`, `entry.N.other_option_response`, sentinels,
 * `pageHistory`, `fbzx` and friends), plus pre-filled links and human-readable views.
 */
import { OTHER_VALUE } from './constants';
import type { AnswerValue, FormModel, GeneratedResponse, Question } from './types';

const SENTINEL_KINDS = new Set(['choice', 'checkbox', 'scale', 'rating']);

export function buildPayload(form: FormModel, res: GeneratedResponse): URLSearchParams {
  const p = new URLSearchParams();
  const visited = new Set(res.path);
  for (const q of form.questions) {
    if (!visited.has(q.section)) continue;
    const a = res.answers[q.itemId];
    if (a) appendAnswer(p, q, a);
    if (SENTINEL_KINDS.has(q.kind)) p.append(`entry.${q.entryId}_sentinel`, '');
    if (q.kind === 'grid' || q.kind === 'checkGrid') for (const r of q.rows) p.append(`entry.${r.entryId}_sentinel`, '');
  }
  if (res.email !== undefined) p.append('emailAddress', res.email);
  const fbzx = form.fbzx ?? '';
  p.append('fvv', '1');
  p.append('partialResponse', JSON.stringify([null, null, fbzx]));
  p.append('pageHistory', (res.path.length ? res.path : [0]).join(','));
  p.append('fbzx', fbzx);
  p.append('submissionTimestamp', '-1');
  return p;
}

function appendAnswer(p: URLSearchParams, q: Question, a: AnswerValue): void {
  const key = `entry.${q.entryId}`;
  switch (a.t) {
    case 'text':
      p.append(key, a.v);
      break;
    case 'choice':
      p.append(key, a.v);
      if (a.v === OTHER_VALUE) p.append(`${key}.other_option_response`, a.other ?? '');
      break;
    case 'multi':
      for (const v of a.v) p.append(key, v);
      if (a.v.includes(OTHER_VALUE)) p.append(`${key}.other_option_response`, a.other ?? '');
      break;
    case 'grid':
      for (const r of q.rows) for (const v of a.rows[r.entryId] ?? []) p.append(`entry.${r.entryId}`, v);
      break;
    case 'date':
      if (a.y !== undefined) p.append(`${key}_year`, String(a.y));
      p.append(`${key}_month`, String(a.m));
      p.append(`${key}_day`, String(a.d));
      if (a.hh !== undefined) {
        p.append(`${key}_hour`, pad(a.hh));
        p.append(`${key}_minute`, pad(a.mm ?? 0));
      }
      break;
    case 'time':
      // Google's own form zero-pads time fields (dates are left unpadded).
      p.append(`${key}_hour`, pad(a.hh));
      p.append(`${key}_minute`, pad(a.mm));
      if (a.ss !== undefined) p.append(`${key}_second`, pad(a.ss));
      break;
  }
}

/** A pre-filled `viewform` link for one response (open it to review in the real form). */
export function buildPrefillUrl(form: FormModel, res: GeneratedResponse): string {
  const p = new URLSearchParams({ usp: 'pp_url' });
  for (const q of form.questions) {
    const a = res.answers[q.itemId];
    if (!a) continue;
    const key = `entry.${q.entryId}`;
    switch (a.t) {
      case 'date': {
        const y = a.y ?? new Date().getFullYear();
        const day = `${y}-${pad(a.m)}-${pad(a.d)}`;
        p.append(key, a.hh !== undefined ? `${day} ${pad(a.hh)}:${pad(a.mm ?? 0)}` : day);
        break;
      }
      case 'time':
        p.append(key, a.ss !== undefined ? `${pad(a.hh)}:${pad(a.mm)}:${pad(a.ss)}` : `${pad(a.hh)}:${pad(a.mm)}`);
        break;
      default:
        appendAnswer(p, q, a);
    }
  }
  if (res.email) p.append('emailAddress', res.email);
  return `${form.url}?${p.toString()}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Human-readable answer, matching Google's response spreadsheet formatting. */
export function answerText(q: Question, a: AnswerValue | undefined, rowEntryId?: string): string {
  if (!a) return '';
  switch (a.t) {
    case 'text':
      return a.v;
    case 'choice':
      return a.v === OTHER_VALUE ? a.other ?? '' : a.v;
    case 'multi':
      return a.v.map((v) => (v === OTHER_VALUE ? a.other ?? '' : v)).join(', ');
    case 'grid':
      if (rowEntryId) return (a.rows[rowEntryId] ?? []).join(', ');
      return q.rows
        .filter((r) => a.rows[r.entryId]?.length)
        .map((r) => `${r.label}: ${a.rows[r.entryId]!.join(', ')}`)
        .join(', ');
    case 'date': {
      const day = a.y !== undefined ? `${a.y}-${pad(a.m)}-${pad(a.d)}` : `${pad(a.m)}-${pad(a.d)}`;
      return a.hh !== undefined ? `${day} ${pad(a.hh)}:${pad(a.mm ?? 0)}` : day;
    }
    case 'time':
      return a.ss !== undefined ? `${pad(a.hh)}:${pad(a.mm)}:${pad(a.ss)}` : `${pad(a.hh)}:${pad(a.mm)}`;
  }
}

/** Column layout used for CSV export and dataset import (Google Sheets compatible). */
export interface Column {
  key: string;
  header: string;
  question?: Question;
  rowEntryId?: string;
}

export function columnsFor(form: FormModel): Column[] {
  const cols: Column[] = [];
  if (form.emailMode !== 'none') cols.push({ key: 'emailAddress', header: 'Email Address' });
  for (const q of form.questions) {
    if (q.kind === 'file' || q.kind === 'unsupported') continue;
    if (q.kind === 'grid' || q.kind === 'checkGrid') {
      for (const r of q.rows) cols.push({ key: r.entryId, header: `${q.title} [${r.label}]`, question: q, rowEntryId: r.entryId });
    } else cols.push({ key: q.itemId, header: q.title || `Question ${q.itemId}`, question: q });
  }
  return cols;
}

export function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(form: FormModel, responses: readonly GeneratedResponse[]): string {
  const cols = columnsFor(form);
  const lines = [['#', ...cols.map((c) => c.header)].map(csvEscape).join(',')];
  for (const r of responses) {
    const cells = cols.map((c) => {
      if (c.key === 'emailAddress') return r.email ?? '';
      return answerText(c.question!, r.answers[c.question!.itemId], c.rowEntryId);
    });
    lines.push([String(r.index + 1), ...cells].map(csvEscape).join(','));
  }
  return lines.join('\r\n');
}

/** RFC 4180 CSV parser (handles quotes, escaped quotes, CRLF and embedded newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(src);
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function detectDelimiter(src: string): string {
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 1 ? counts[0]![0] : ',';
}

/** Auto-maps CSV headers to form columns by normalized title. */
export function autoMapColumns(form: FormModel, headers: readonly string[]): Record<string, number> {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const index = new Map(headers.map((h, i) => [norm(h), i]));
  const mapping: Record<string, number> = {};
  for (const c of columnsFor(form)) {
    const hit = index.get(norm(c.header)) ?? (c.question && !c.rowEntryId ? index.get(norm(c.question.title)) : undefined);
    if (hit !== undefined) mapping[c.key] = hit;
  }
  return mapping;
}
