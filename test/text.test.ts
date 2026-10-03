import { describe, expect, it } from 'vitest';
import { expectedDistribution, normalize, sampleSentiment, tendencyWeights } from '../src/core/distributions';
import { detectOrdering } from '../src/core/likert';
import { generateMatching } from '../src/core/regexgen';
import { createRng } from '../src/core/rng';
import { createRespondent, detectSmartKind, renderTemplate } from '../src/core/text';
import { checkText, numberFor, satisfyText } from '../src/core/validation';

describe('rng', () => {
  it('is reproducible and well distributed', () => {
    const a = createRng('seed');
    const b = createRng('seed');
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
    const r = createRng(1);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) buckets[Math.floor(r.next() * 10)]++;
    for (const c of buckets) expect(Math.abs(c - 2000)).toBeLessThan(200);
  });
});

describe('regexgen', () => {
  const rng = createRng('re');
  it.each([
    '[A-Z]{2}\\d{4}',
    '(foo|bar)-\\d+',
    '\\w+@\\w+\\.com',
    '[^aeiou\\s]{3,5}',
    '(ab)\\1',
    '^\\+45 ?\\d{8}$',
    '(?:[01]\\d|2[0-3]):[0-5]\\d',
    'colou?r',
    '[a-c-]{4}',
  ])('generates matches for /%s/', (pattern) => {
    for (let i = 0; i < 20; i++) {
      const s = generateMatching(pattern, rng);
      expect(s).not.toBeNull();
      expect(new RegExp(`^(?:${pattern})$`).test(s!)).toBe(true);
    }
  });
});

describe('validation', () => {
  const rng = createRng('v');
  it('produces numbers satisfying every operator', () => {
    const ops = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between', 'notBetween', 'isNumber', 'isInteger'] as const;
    for (const op of ops) {
      for (let i = 0; i < 30; i++) {
        const rule = { kind: 'number' as const, op, a: 10, b: 20 };
        expect(checkText(rule, numberFor(rule, rng, [1, 100])), op).toBe(true);
      }
    }
    const dec = { kind: 'number' as const, op: 'between' as const, a: 0.5, b: 1.25 };
    expect(numberFor(dec, rng, [0, 1])).toMatch(/^\d\.\d{2}$/);
  });

  it('fixes text that breaks length, contains and e-mail rules', () => {
    const regen = () => 'lorem ipsum dolor sit amet';
    expect(satisfyText({ kind: 'length', op: 'max', value: 10 }, 'a very long sentence indeed', rng, regen).length).toBeLessThanOrEqual(10);
    expect(satisfyText({ kind: 'length', op: 'min', value: 50 }, 'short', rng, regen).length).toBeGreaterThanOrEqual(50);
    expect(satisfyText({ kind: 'text', op: 'contains', value: '#ok' }, 'hello', rng, regen)).toContain('#ok');
    expect(checkText({ kind: 'text', op: 'email' }, satisfyText({ kind: 'text', op: 'email' }, 'John Doe', rng, regen))).toBe(true);
  });
});

describe('text', () => {
  const rng = createRng('t');
  const p = createRespondent(rng, 0.9);

  it('renders templates with a consistent identity', () => {
    const out = renderTemplate('{firstName}|{email}|{number:5-5}|{pick:x}|{index}|{unknown}', { rng, respondent: p, index: 4 });
    const [first, email, n, pick, idx, unknown] = out.split('|');
    expect(first).toBe(p.firstName);
    expect(email).toBe(p.email);
    expect([n, pick, idx, unknown]).toEqual(['5', 'x', '5', '{unknown}']);
  });

  it('detects what a question asks for', () => {
    const d = (title: string, kind: 'short' | 'paragraph' = 'short') => detectSmartKind({ title, description: '', kind });
    expect(d('Full name')).toBe('fullName');
    expect(d('Hvad er dit navn?')).toBe('fullName');
    expect(d('E-mail address')).toBe('email');
    expect(d('Phone number')).toBe('phone');
    expect(d('How old are you?')).toBe('age');
    expect(d('Which city do you live in?')).toBe('city');
    expect(d('Any suggestions for improvement?', 'paragraph')).toBe('suggestion');
    expect(d('What could we improve?', 'paragraph')).toBe('suggestion');
    expect(d('Any other comments?', 'paragraph')).toBe('feedback');
    expect(d('Why did you choose us?', 'paragraph')).toBe('feedback');
    expect(d('Favourite snack')).toBe('short');
  });
});

describe('distributions', () => {
  it('tendency at 0% is uniform and at 100% is (nearly) fixed', () => {
    expect(tendencyWeights(4, 2, 0, true)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(tendencyWeights(5, 4, 100, true)[4]).toBeGreaterThan(0.99);
    expect(tendencyWeights(3, 1, 100, false)).toEqual([0, 1, 0]);
  });

  it('expected persona distribution leans with the crowd', () => {
    const persona = { shape: 'bell' as const, mean: 85, spread: 20, consistency: 80 };
    const dist = expectedDistribution({ mode: 'persona', weights: [], target: 0, strength: 0, fixed: 0, reverse: false }, 5, { ordinal: true, reversed: false, persona });
    expect(dist[4]! + dist[3]!).toBeGreaterThan(0.7);
    expect(normalize([0, 0])).toEqual([0.5, 0.5]);
  });

  it('polarized crowds have two camps', () => {
    const rng = createRng('p');
    const s = Array.from({ length: 2000 }, () => sampleSentiment({ shape: 'polarized', mean: 50, spread: 20, consistency: 50 }, rng));
    const middle = s.filter((x) => x > 0.35 && x < 0.65).length;
    expect(middle / s.length).toBeLessThan(0.1);
  });
});

describe('likert detection', () => {
  it('detects ordered scales and their direction', () => {
    expect(detectOrdering(['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'])).toEqual({ ordinal: true, reversed: false });
    expect(detectOrdering(['Excellent', 'Good', 'Fair', 'Poor'])).toEqual({ ordinal: true, reversed: true });
    expect(detectOrdering(['1', '2', '3', '4', '5'])).toEqual({ ordinal: true, reversed: false });
    expect(detectOrdering(['Never', 'Rarely', 'Sometimes', 'Often', 'Always'])).toEqual({ ordinal: true, reversed: false });
    expect(detectOrdering(['Red', 'Green', 'Blue'])).toEqual({ ordinal: false, reversed: false });
    expect(detectOrdering(['1 - Poor', '2', '3', '4', '5 - Excellent'])).toEqual({ ordinal: true, reversed: false });
    expect(detectOrdering(['10', '9', '8', '7'])).toEqual({ ordinal: true, reversed: true });
    // Numbers that aren't ratings must not be driven by sentiment.
    expect(detectOrdering(Array.from({ length: 24 }, (_, i) => `${i}h`)).ordinal).toBe(false);
    expect(detectOrdering(['18-24', '25-34', '35-44', '45+']).ordinal).toBe(false);
    expect(detectOrdering(['2019', '2020', '2021']).ordinal).toBe(false);
  });
});
