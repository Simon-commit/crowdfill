/**
 * Turns a form + config into synthetic respondents.
 *
 * Each submission index gets its own seeded RNG, a latent sentiment drawn
 * from the crowd persona, and a consistent identity. The generator walks the
 * form section by section, honouring "go to section based on answer" logic,
 * so the produced `path` is exactly what a real respondent could take.
 */
import { OTHER_VALUE } from './constants';
import { metaFor, type QuestionMeta } from './defaults';
import { choiceWeights, sampleSentiment } from './distributions';
import { clamp, createRng, type Rng } from './rng';
import { createRespondent, generateText, smartValue, type TextContext } from './text';
import { countBounds, satisfyText } from './validation';
import type {
  AnswerValue,
  ChoiceConfig,
  CheckboxConfig,
  FormConfig,
  FormModel,
  GeneratedResponse,
  NavTarget,
  Question,
  QuestionConfig,
  Respondent,
} from './types';

export { OTHER_VALUE };

export interface GeneratorOptions {
  runSeed: string;
  followBranching?: boolean;
}

interface Ctx {
  rng: Rng;
  index: number;
  respondent: Respondent;
  config: FormConfig;
  runSeed: string;
  datasetRow: string[] | null;
}

export class ResponseGenerator {
  private readonly meta: Map<string, QuestionMeta>;
  private readonly bySection: Question[][];

  constructor(
    readonly form: FormModel,
    readonly config: FormConfig,
    readonly options: GeneratorOptions,
  ) {
    this.meta = metaFor(form);
    this.bySection = form.sections.map(() => []);
    for (const q of form.questions) this.bySection[q.section]?.push(q);
  }

  /** Dataset row for this submission, if a dataset is attached. */
  private datasetRow(index: number): string[] | null {
    const ds = this.config.dataset;
    if (!ds || ds.rows.length === 0) return null;
    if (ds.order === 'random') {
      return ds.rows[createRng(`${this.options.runSeed}:dataset:${index}`).int(0, ds.rows.length - 1)]!;
    }
    return ds.rows[index % ds.rows.length]!;
  }

  generate(index: number): GeneratedResponse {
    const rng = createRng(`${this.options.runSeed}:${index}`);
    const sentiment = sampleSentiment(this.config.persona, rng);
    const respondent = createRespondent(rng, sentiment);
    const ctx: Ctx = {
      rng,
      index,
      respondent,
      config: this.config,
      runSeed: this.options.runSeed,
      datasetRow: this.datasetRow(index),
    };

    const answers: Record<string, AnswerValue> = {};
    const path: number[] = [];
    const follow = this.options.followBranching !== false;
    let current: number | null = 0;
    const seen = new Set<number>();

    while (current !== null && current < this.form.sections.length && !seen.has(current)) {
      seen.add(current);
      path.push(current);
      let nav: NavTarget = this.form.sections[current]!.next;
      for (const q of this.bySection[current]!) {
        const ans = this.answer(q, ctx);
        if (!ans) continue;
        answers[q.itemId] = ans;
        if (ans.t === 'choice' && (q.kind === 'choice' || q.kind === 'dropdown')) {
          const opt = ans.v === OTHER_VALUE ? q.options.find((o) => o.isOther) : q.options.find((o) => o.label === ans.v);
          if (opt?.nav) nav = opt.nav;
        }
      }
      if (!follow) current = current + 1;
      else if (nav.kind === 'submit') current = null;
      else if (nav.kind === 'section') current = nav.index;
      else current = current + 1;
    }

    const res: GeneratedResponse = { index, respondent, path, answers };
    if (this.form.emailMode === 'input') {
      const ds = this.fromDataset('emailAddress', ctx);
      res.email = ds || generateText(this.config.email, this.textCtx(ctx, 'emailAddress'), 'email');
      if (!/@/.test(res.email)) res.email = respondent.email;
    }
    return res;
  }

  private textCtx(ctx: Ctx, key: string, q?: Question): TextContext {
    return { rng: ctx.rng, respondent: ctx.respondent, index: ctx.index, runSeed: ctx.runSeed, key, question: q };
  }

  private fromDataset(key: string, ctx: Ctx): string | null {
    const ds = this.config.dataset;
    if (!ds || !ctx.datasetRow) return null;
    const col = ds.mapping[key];
    if (col === undefined || col < 0) return null;
    const v = ctx.datasetRow[col];
    return v === undefined || v.trim() === '' ? null : v.trim();
  }

  answer(q: Question, ctx: Ctx): AnswerValue | null {
    const qc = this.config.questions[q.itemId];
    if (!qc || q.kind === 'file' || q.kind === 'unsupported') return null;

    const dsValue = this.fromDataset(q.itemId, ctx);
    if (dsValue !== null) {
      const fromData = this.answerFromData(q, dsValue);
      if (fromData?.t === 'text' && q.validation) {
        // Imported or AI-written text still has to pass the form's own rules.
        const meta = this.meta.get(q.itemId)!;
        const regen = () => generateText(qc.text, this.textCtx(ctx, q.itemId, q), meta.smartKind);
        return { t: 'text', v: satisfyText(q.validation, fromData.v, ctx.rng, regen) };
      }
      if (fromData) return fromData;
    }
    if (q.kind === 'grid' || q.kind === 'checkGrid') {
      // Grid rows can be mapped individually.
      const rows: Record<string, string[]> = {};
      let any = false;
      for (const r of q.rows) {
        const v = this.fromDataset(r.entryId, ctx);
        if (v === null) continue;
        const cols = splitMulti(v).map((s) => matchOption(q, s)).filter((s): s is string => s !== null);
        if (cols.length) {
          rows[r.entryId] = q.kind === 'grid' ? cols.slice(0, 1) : cols;
          any = true;
        }
      }
      if (any) {
        const generated = this.generateAnswer(q, qc, ctx);
        if (generated?.t === 'grid') return { t: 'grid', rows: { ...generated.rows, ...rows } };
        return { t: 'grid', rows };
      }
    }

    if (!q.required && !ctx.rng.chance(clamp(qc.answerRate, 0, 100) / 100)) return null;
    return this.generateAnswer(q, qc, ctx);
  }

  private generateAnswer(q: Question, qc: QuestionConfig, ctx: Ctx): AnswerValue | null {
    const meta = this.meta.get(q.itemId)!;
    const { rng } = ctx;
    switch (q.kind) {
      case 'short':
      case 'paragraph': {
        const tctx = this.textCtx(ctx, q.itemId, q);
        const gen = () => generateText(qc.text, tctx, meta.smartKind);
        let v = gen();
        if (q.kind === 'short') v = v.replace(/\s*\n\s*/g, ' ');
        v = satisfyText(q.validation, v, rng, gen);
        if (v.trim() === '' && q.required) v = satisfyText(q.validation, smartValue(meta.smartKind, tctx) || 'N/A', rng, gen);
        return v.trim() === '' ? null : { t: 'text', v };
      }
      case 'choice':
      case 'dropdown':
      case 'scale':
      case 'rating': {
        const i = this.pickChoice(q, qc.choice, qc.otherRate, ctx, meta);
        if (i < 0) return null;
        const opt = q.options[i]!;
        if (opt.isOther) {
          const other = generateText(qc.otherText, this.textCtx(ctx, `${q.itemId}:other`, q), 'short');
          return { t: 'choice', v: OTHER_VALUE, other: other || 'Other' };
        }
        return { t: 'choice', v: opt.label };
      }
      case 'checkbox': {
        const picked = this.pickCheckboxes(q, qc.checkbox, ctx, q.required ? 1 : 0);
        if (picked.length === 0) return null;
        const labels = picked.map((i) => q.options[i]!);
        const res: AnswerValue = { t: 'multi', v: labels.map((o) => (o.isOther ? OTHER_VALUE : o.label)) };
        if (labels.some((o) => o.isOther)) {
          res.other = generateText(qc.otherText, this.textCtx(ctx, `${q.itemId}:other`, q), 'short') || 'Other';
        }
        return res;
      }
      case 'grid': {
        const rows: Record<string, string[]> = {};
        for (const r of q.rows) {
          const cfg = qc.rowChoice?.[r.entryId] ?? qc.choice;
          const i = this.pickChoice(q, cfg, 0, ctx, meta);
          if (i >= 0) rows[r.entryId] = [q.options[i]!.label];
        }
        return { t: 'grid', rows };
      }
      case 'checkGrid': {
        const rows: Record<string, string[]> = {};
        for (const r of q.rows) {
          const picked = this.pickCheckboxes(q, qc.checkbox, ctx, q.required || r.required ? 1 : 0);
          if (picked.length) rows[r.entryId] = picked.map((i) => q.options[i]!.label);
        }
        return Object.keys(rows).length ? { t: 'grid', rows } : null;
      }
      case 'date':
        return this.pickDate(q, qc, rng);
      case 'time':
        return this.pickTime(q, qc, rng);
      default:
        return null;
    }
  }

  /** Index into `q.options` (which may include the "Other" option), or -1. */
  private pickChoice(q: Question, cfg: ChoiceConfig, otherRate: number, ctx: Ctx, meta: QuestionMeta): number {
    const n = q.options.length;
    if (n === 0) return -1;
    const otherIdx = q.options.findIndex((o) => o.isOther);
    const base = { ordinal: meta.ordering.ordinal, reversed: meta.ordering.reversed, sentiment: ctx.respondent.sentiment, persona: ctx.config.persona, index: ctx.index };

    // Explicit per-option strategies already account for "Other" in their weights.
    if (cfg.mode === 'weighted' || cfg.mode === 'fixed' || (cfg.mode === 'tendency' && !meta.ordering.ordinal)) {
      return ctx.rng.weighted(choiceWeights(cfg, n, base));
    }
    if (otherIdx >= 0 && otherRate > 0 && ctx.rng.chance(otherRate / 100)) return otherIdx;
    const regular = q.options.map((_, i) => i).filter((i) => i !== otherIdx);
    if (regular.length === 0) return otherIdx;
    const w = choiceWeights(cfg, regular.length, base);
    return regular[ctx.rng.weighted(w)]!;
  }

  private pickCheckboxes(q: Question, cfg: CheckboxConfig, ctx: Ctx, minRequired: number): number[] {
    const n = q.options.length;
    if (n === 0) return [];
    const { rng } = ctx;
    const [vMin, vMax] = countBounds(q.validation, n);
    const lo = Math.max(minRequired, vMin, cfg.min > 0 ? Math.min(cfg.min, n) : 0);
    const hi = Math.max(lo, Math.min(vMax, cfg.max > 0 ? cfg.max : n));

    let picked: number[];
    if (cfg.mode === 'fixed') picked = cfg.fixed.filter((i) => i < n);
    else {
      const probs = q.options.map((o, i) => {
        if (cfg.mode === 'weighted') return clamp(cfg.probs[i] ?? 0, 0, 100) / 100;
        return o.isOther ? 0.06 : 0.35;
      });
      picked = probs.flatMap((p, i) => (rng.chance(p) ? [i] : []));
      const weights = probs.map((p) => p + 0.02);
      while (picked.length < lo) {
        const pool = weights.map((w, i) => (picked.includes(i) ? 0 : w));
        if (pool.every((w) => w === 0)) break;
        picked.push(rng.weighted(pool));
      }
      while (picked.length > hi) picked.splice(rng.int(0, picked.length - 1), 1);
    }
    return picked.sort((a, b) => a - b);
  }

  private pickDate(q: Question, qc: QuestionConfig, rng: Rng): AnswerValue {
    const c = qc.date;
    let d: Date;
    if (c.mode === 'today') d = new Date();
    else if (c.mode === 'fixed') d = parseDay(c.fixed) ?? new Date();
    else {
      const a = parseDay(c.from) ?? new Date();
      const b = parseDay(c.to) ?? new Date();
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const days = Math.round((hi.getTime() - lo.getTime()) / 86_400_000);
      d = new Date(lo.getTime() + rng.int(0, days) * 86_400_000);
    }
    const res: AnswerValue = { t: 'date', m: d.getUTCMonth() + 1, d: d.getUTCDate() };
    if (q.includeYear !== false) res.y = d.getUTCFullYear();
    if (q.includeTime) {
      const mins = randomBetween(parseClock(c.timeFrom) ?? 480, parseClock(c.timeTo) ?? 1200, rng);
      res.hh = Math.floor(mins / 60) % 24;
      res.mm = mins % 60;
    }
    return res;
  }

  private pickTime(q: Question, qc: QuestionConfig, rng: Rng): AnswerValue {
    if (q.duration) {
      const secs = randomBetween(parseDuration(qc.time.from) ?? 300, parseDuration(qc.time.to) ?? 7200, rng);
      return { t: 'time', hh: Math.floor(secs / 3600), mm: Math.floor(secs / 60) % 60, ss: secs % 60 };
    }
    const mins = randomBetween(parseClock(qc.time.from) ?? 480, parseClock(qc.time.to) ?? 1200, rng);
    return { t: 'time', hh: Math.floor(mins / 60) % 24, mm: mins % 60 };
  }

  /** Converts a dataset cell into an answer for `q`, or null if it doesn't fit. */
  answerFromData(q: Question, raw: string): AnswerValue | null {
    switch (q.kind) {
      case 'short':
      case 'paragraph':
        return { t: 'text', v: raw };
      case 'choice':
      case 'dropdown':
      case 'scale':
      case 'rating': {
        const m = matchOption(q, raw);
        if (m !== null) return { t: 'choice', v: m };
        return q.hasOther ? { t: 'choice', v: OTHER_VALUE, other: raw } : null;
      }
      case 'checkbox': {
        const parts = splitMulti(raw, q.options.map((o) => o.label));
        const v: string[] = [];
        const extra: string[] = [];
        for (const p of parts) {
          const m = matchOption(q, p);
          if (m !== null) v.push(m);
          else extra.push(p);
        }
        const res: AnswerValue = { t: 'multi', v };
        if (extra.length && q.hasOther) {
          v.push(OTHER_VALUE);
          res.other = extra.join(', ');
        }
        return v.length ? res : null;
      }
      case 'date': {
        const d = parseDay(raw) ?? (Number.isNaN(Date.parse(raw)) ? null : new Date(Date.parse(raw)));
        if (!d) return null;
        return { t: 'date', y: q.includeYear === false ? undefined : d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
      }
      case 'time': {
        const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(raw.trim());
        if (!m) return null;
        return { t: 'time', hh: Number(m[1]), mm: Number(m[2]), ...(q.duration ? { ss: Number(m[3] ?? 0) } : {}) };
      }
      default:
        return null;
    }
  }
}

/* --------------------------------------------------------------- helpers -- */

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Finds the option whose label matches `value` (case/whitespace-insensitive). */
export function matchOption(q: Question, value: string): string | null {
  const v = norm(value);
  const hit = q.options.find((o) => !o.isOther && norm(o.label) === v);
  return hit ? hit.label : null;
}

/**
 * Splits a multi-select cell. Google's own CSV export joins with ", ", which
 * collides with commas inside labels, so known labels are matched greedily first.
 */
export function splitMulti(raw: string, labels: readonly string[] = []): string[] {
  let rest = raw.trim();
  const out: string[] = [];
  const sorted = labels.filter(Boolean).slice().sort((a, b) => b.length - a.length);
  outer: while (rest) {
    for (const l of sorted) {
      if (norm(rest).startsWith(norm(l))) {
        const after = rest.slice(l.length);
        if (after === '' || /^\s*[,;|]/.test(after)) {
          out.push(l);
          rest = after.replace(/^\s*[,;|]\s*/, '');
          continue outer;
        }
      }
    }
    const m = /^([^,;|]*)[,;|]?\s*/.exec(rest)!;
    if (m[1]!.trim()) out.push(m[1]!.trim());
    rest = rest.slice(m[0].length);
    if (m[0].length === 0) break;
  }
  return out;
}

export function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s?.trim() ?? '');
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "HH:MM" to minutes since midnight. */
export function parseClock(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(s?.trim() ?? '');
  return m ? clamp(Number(m[1]), 0, 23) * 60 + clamp(Number(m[2]), 0, 59) : null;
}

/** "HH:MM[:SS]" to seconds. */
export function parseDuration(s: string): number | null {
  const m = /^(\d{1,3}):(\d{2})(?::(\d{2}))?/.exec(s?.trim() ?? '');
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0) : null;
}

function randomBetween(a: number, b: number, rng: Rng): number {
  return a <= b ? rng.int(a, b) : rng.int(b, a);
}
