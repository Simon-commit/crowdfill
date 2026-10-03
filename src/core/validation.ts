/**
 * Response-validation awareness: makes generated text satisfy the form's
 * own validation rules (numbers, lengths, e-mail/URL, contains, regex), and
 * checks values so the preview can flag answers Google would reject.
 */
import { generateMatching, tryRegExp } from './regexgen';
import { clamp, type Rng } from './rng';
import type { ValidationRule } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i;

export function checkText(rule: ValidationRule | undefined, value: string): boolean {
  if (!rule || value === '') return true;
  switch (rule.kind) {
    case 'number': {
      const n = Number(value.replace(',', '.'));
      if (value.trim() === '' || !Number.isFinite(n)) return false;
      const a = rule.a ?? 0;
      const b = rule.b ?? 0;
      switch (rule.op) {
        case 'gt': return n > a;
        case 'gte': return n >= a;
        case 'lt': return n < a;
        case 'lte': return n <= a;
        case 'eq': return n === a;
        case 'neq': return n !== a;
        case 'between': return n >= Math.min(a, b) && n <= Math.max(a, b);
        case 'notBetween': return n < Math.min(a, b) || n > Math.max(a, b);
        case 'isNumber': return true;
        case 'isInteger': return Number.isInteger(n);
      }
      return true;
    }
    case 'text':
      switch (rule.op) {
        case 'contains': return value.includes(rule.value ?? '');
        case 'notContains': return !value.includes(rule.value ?? '');
        case 'email': return EMAIL_RE.test(value);
        case 'url': return URL_RE.test(value);
      }
      return true;
    case 'length':
      return rule.op === 'max' ? [...value].length <= rule.value : [...value].length >= rule.value;
    case 'regex': {
      const re = tryRegExp(rule.pattern);
      if (!re) return true;
      const full = tryRegExp(`^(?:${rule.pattern})$`);
      switch (rule.op) {
        case 'contains': return re.test(value);
        case 'notContains': return !re.test(value);
        case 'matches': return full ? full.test(value) : re.test(value);
        case 'notMatches': return full ? !full.test(value) : !re.test(value);
      }
      return true;
    }
    case 'count':
      return true;
  }
}

function decimalsOf(n: number | undefined): number {
  if (n === undefined || Number.isInteger(n)) return 0;
  return Math.min(4, (String(n).split('.')[1] ?? '').length);
}

/** Random number satisfying a numeric rule, formatted like a person would type it. */
export function numberFor(rule: Extract<ValidationRule, { kind: 'number' }>, rng: Rng, fallback: [number, number]): string {
  const a = rule.a ?? 0;
  const b = rule.b ?? 0;
  const dec = rule.op === 'isInteger' ? 0 : Math.max(decimalsOf(rule.a), decimalsOf(rule.b));
  const span = Math.max(10, Math.abs(a) * 0.5);
  const pick = (lo: number, hi: number) => {
    if (hi < lo) [lo, hi] = [hi, lo];
    if (dec === 0) {
      const ilo = Math.ceil(lo);
      const ihi = Math.floor(hi);
      return String(ihi >= ilo ? rng.int(ilo, ihi) : ilo);
    }
    return rng.float(lo, hi).toFixed(dec);
  };
  const step = dec === 0 ? 1 : 10 ** -dec;
  switch (rule.op) {
    case 'gt': return pick(a + step, a + span);
    case 'gte': return pick(a, a + span);
    case 'lt': return pick(a - span, a - step);
    case 'lte': return pick(a - span, a);
    case 'eq': return String(a);
    case 'neq': {
      let v = pick(fallback[0], fallback[1]);
      if (Number(v) === a) v = String(a + step);
      return v;
    }
    case 'between': return pick(Math.min(a, b), Math.max(a, b));
    case 'notBetween':
      return rng.chance(0.5) ? pick(Math.min(a, b) - span, Math.min(a, b) - step) : pick(Math.max(a, b) + step, Math.max(a, b) + span);
    case 'isNumber':
    case 'isInteger':
      return pick(fallback[0], fallback[1]);
  }
}

/**
 * Coerces a generated text answer into one that passes the rule. Returns the
 * input unchanged if it already passes. `regen` produces a fresh candidate.
 */
export function satisfyText(
  rule: ValidationRule | undefined,
  value: string,
  rng: Rng,
  regen: () => string,
): string {
  if (!rule || checkText(rule, value)) return value;
  switch (rule.kind) {
    case 'number':
      return numberFor(rule, rng, [1, 100]);
    case 'text':
      switch (rule.op) {
        case 'contains': {
          const needle = rule.value ?? '';
          return value ? `${value} ${needle}`.trim() : needle;
        }
        case 'notContains': {
          for (let i = 0; i < 10; i++) {
            const v = regen();
            if (checkText(rule, v)) return v;
          }
          return value.split(rule.value ?? '').join('');
        }
        case 'email':
          return EMAIL_RE.test(value) ? value : `${value.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'user'}${rng.int(1, 999)}@example.com`;
        case 'url':
          return `https://www.example.com/${value.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20)}`;
      }
      return value;
    case 'length': {
      if (rule.op === 'max') {
        const chars = [...value];
        if (chars.length <= rule.value) return value;
        const cut = chars.slice(0, rule.value).join('');
        const lastSpace = cut.lastIndexOf(' ');
        return (lastSpace > rule.value * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
      }
      let out = value;
      for (let i = 0; i < 40 && [...out].length < rule.value; i++) out = `${out} ${regen()}`.trim();
      while ([...out].length < rule.value) out += '.';
      return out;
    }
    case 'regex': {
      if (rule.op === 'matches') return generateMatching(rule.pattern, rng) ?? value;
      if (rule.op === 'contains') {
        const m = generateMatching(rule.pattern, rng);
        return m === null ? value : rng.chance(0.5) ? m : `${value} ${m}`.trim();
      }
      for (let i = 0; i < 15; i++) {
        const v = regen();
        if (checkText(rule, v)) return v;
      }
      return value;
    }
    case 'count':
      return value;
  }
}

/** Checkbox selection bounds implied by a "Select at least/at most/exactly" rule. */
export function countBounds(rule: ValidationRule | undefined, optionCount: number): [number, number] {
  if (rule?.kind !== 'count') return [0, optionCount];
  const v = clamp(rule.value, 0, optionCount);
  switch (rule.op) {
    case 'atLeast': return [v, optionCount];
    case 'atMost': return [0, v];
    case 'exactly': return [v, v];
  }
}

export function describeRule(rule: ValidationRule): string {
  switch (rule.kind) {
    case 'number': {
      const labels: Record<string, string> = {
        gt: `over ${rule.a}`, gte: `at least ${rule.a}`, lt: `under ${rule.a}`, lte: `at most ${rule.a}`, eq: `equal to ${rule.a}`, neq: `not ${rule.a}`,
        between: `between ${rule.a} and ${rule.b}`, notBetween: `not between ${rule.a} and ${rule.b}`,
        isNumber: 'is a number', isInteger: 'whole number',
      };
      return `Number ${labels[rule.op]}`;
    }
    case 'text':
      return rule.op === 'email' ? 'Must be an e-mail' : rule.op === 'url' ? 'Must be a URL'
        : rule.op === 'contains' ? `Must contain "${rule.value}"` : `Must not contain "${rule.value}"`;
    case 'length':
      return rule.op === 'max' ? `Max ${rule.value} characters` : `Min ${rule.value} characters`;
    case 'regex':
      return `Regex ${rule.op === 'matches' ? 'matches' : rule.op === 'notMatches' ? "doesn't match" : rule.op === 'contains' ? 'contains' : "doesn't contain"} /${rule.pattern}/`;
    case 'count':
      return `Select ${rule.op === 'atLeast' ? 'at least' : rule.op === 'atMost' ? 'at most' : 'exactly'} ${rule.value}`;
  }
}
