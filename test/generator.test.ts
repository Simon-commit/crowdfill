import { describe, expect, it } from 'vitest';
import { applyPreset, createConfig, reconcileConfig } from '../src/core/defaults';
import { OTHER_VALUE, ResponseGenerator, splitMulti } from '../src/core/generator';
import { parseLoadData } from '../src/core/parser';
import type { FormConfig } from '../src/core/types';
import { checkText } from '../src/core/validation';
import { KITCHEN_SINK } from './fixtures';

const form = parseLoadData(KITCHEN_SINK, { fbzx: '42' });
const q = (itemId: string) => form.questions.find((x) => x.itemId === itemId)!;

function generate(config: FormConfig, n: number, seed = 'test') {
  const gen = new ResponseGenerator(form, config, { runSeed: seed });
  return Array.from({ length: n }, (_, i) => gen.generate(i));
}

describe('ResponseGenerator', () => {
  it('is deterministic for a given seed', () => {
    const cfg = createConfig(form);
    expect(generate(cfg, 5, 'a')).toEqual(generate(cfg, 5, 'a'));
    expect(generate(cfg, 5, 'a')).not.toEqual(generate(cfg, 5, 'b'));
  });

  it('always answers required questions and satisfies validation', () => {
    const cfg = createConfig(form);
    for (const r of generate(cfg, 300)) {
      for (const qq of form.questions) {
        if (!r.path.includes(qq.section) || !qq.required || qq.kind === 'file') continue;
        expect(r.answers[qq.itemId], `${qq.title} #${r.index}`).toBeDefined();
      }
      for (const id of ['101', '102', '103', '104']) {
        const a = r.answers[id];
        if (a?.t === 'text') expect(checkText(q(id).validation, a.v), `${id}: ${a.v}`).toBe(true);
      }
      const toppings = r.answers['107'];
      expect(toppings?.t === 'multi' && toppings.v.length).toBeGreaterThanOrEqual(2);
      expect(r.email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/);
    }
  });

  it('keeps one identity per respondent', () => {
    const cfg = createConfig(form);
    const [r] = generate(cfg, 1);
    expect(r!.answers['100']).toEqual({ t: 'text', v: `${r!.respondent.firstName} ${r!.respondent.lastName}` });
  });

  it('follows section branching', () => {
    const cfg = createConfig(form);
    cfg.questions['116']!.choice = { ...cfg.questions['116']!.choice, mode: 'fixed', fixed: 1 };
    for (const r of generate(cfg, 20)) expect(r.path).toEqual([0]);
    cfg.questions['116']!.choice.fixed = 0;
    for (const r of generate(cfg, 20)) expect(r.path).toEqual([0, 1, 2]);
    const gen = new ResponseGenerator(form, cfg, { runSeed: 'x', followBranching: false });
    cfg.questions['116']!.choice.fixed = 1;
    expect(gen.generate(0).path).toEqual([0, 1, 2]);
  });

  it('honours weighted choices', () => {
    const cfg = createConfig(form);
    cfg.questions['106']!.choice = { ...cfg.questions['106']!.choice, mode: 'weighted', weights: [80, 20, 0] };
    const counts = { Denmark: 0, Norway: 0, Sweden: 0 } as Record<string, number>;
    for (const r of generate(cfg, 2000)) {
      const a = r.answers['106'];
      if (a?.t === 'choice') counts[a.v]!++;
    }
    expect(counts.Sweden).toBe(0);
    expect(counts.Denmark! / 2000).toBeGreaterThan(0.75);
    expect(counts.Denmark! / 2000).toBeLessThan(0.85);
  });

  it('leans towards the tendency target', () => {
    const cfg = createConfig(form);
    cfg.questions['108']!.choice = { ...cfg.questions['108']!.choice, mode: 'tendency', target: 3, strength: 70 };
    const hist = [0, 0, 0, 0, 0];
    for (const r of generate(cfg, 2000)) {
      const a = r.answers['108'];
      if (a?.t === 'choice') hist[Number(a.v) - 1]!++;
    }
    const top = hist.indexOf(Math.max(...hist));
    expect(top).toBe(3);
    expect(hist[2]! + hist[4]!).toBeGreaterThan(hist[0]!); // neighbours beat the far end
  });

  it('cycles through options', () => {
    const cfg = createConfig(form);
    cfg.questions['106']!.choice = { ...cfg.questions['106']!.choice, mode: 'cycle' };
    const seq = generate(cfg, 6).map((r) => (r.answers['106'] as { v: string }).v);
    expect(seq).toEqual(['Denmark', 'Norway', 'Sweden', 'Denmark', 'Norway', 'Sweden']);
  });

  it('correlates answers with the persona', () => {
    const mean = (preset: 'positive' | 'negative') => {
      const cfg = applyPreset(form, createConfig(form), preset);
      const vals = generate(cfg, 800).map((r) => Number((r.answers['108'] as { v: string }).v));
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    expect(mean('positive')).toBeGreaterThan(3.8);
    expect(mean('negative')).toBeLessThan(2.2);
  });

  it('applies the persona to detected Likert questions and grids', () => {
    const cfg = applyPreset(form, createConfig(form), 'positive');
    cfg.questions['109']!.answerRate = 100;
    const agree = generate(cfg, 500).filter((r) => {
      const a = r.answers['109'];
      return a?.t === 'choice' && /agree/i.test(a.v) && !/disagree/i.test(a.v);
    }).length;
    expect(agree / 500).toBeGreaterThan(0.6);
    const excellent = generate(cfg, 300).filter((r) => {
      const a = r.answers['110'];
      return a?.t === 'grid' && ['Good', 'Excellent'].includes(a.rows['1101']![0]!);
    }).length;
    expect(excellent / 300).toBeGreaterThan(0.6);
  });

  it('respects answer rate for optional questions', () => {
    const cfg = createConfig(form);
    cfg.questions['120']!.answerRate = 0;
    cfg.questions['104']!.answerRate = 100;
    for (const r of generate(cfg, 50)) {
      expect(r.answers['120']).toBeUndefined();
      expect(r.answers['104']).toBeDefined();
    }
  });

  it('uses the Other option with custom text', () => {
    const cfg = createConfig(form);
    cfg.questions['105']!.choice = { ...cfg.questions['105']!.choice, mode: 'fixed', fixed: 3 };
    cfg.questions['105']!.otherText = { ...cfg.questions['105']!.otherText, source: 'fixed', fixed: 'Purple' };
    expect(generate(cfg, 1)[0]!.answers['105']).toEqual({ t: 'choice', v: OTHER_VALUE, other: 'Purple' });
  });

  it('produces dates and times inside the configured ranges', () => {
    const cfg = createConfig(form);
    cfg.questions['112']!.date = { ...cfg.questions['112']!.date, mode: 'range', from: '2020-01-01', to: '2020-01-31' };
    cfg.questions['114']!.time = { from: '09:00', to: '09:30' };
    for (const r of generate(cfg, 100)) {
      const d = r.answers['112'];
      expect(d).toMatchObject({ t: 'date', y: 2020, m: 1 });
      const t = r.answers['114'];
      expect(t?.t === 'time' && t.hh === 9 && t.mm <= 30).toBe(true);
    }
  });

  it('replays a dataset row by row', () => {
    const cfg = createConfig(form);
    cfg.dataset = {
      name: 'test.csv',
      headers: ['Your name', 'Country', 'Toppings'],
      rows: [
        ['Ada Lovelace', 'norway', 'Cheese, Olives'],
        ['Alan Turing', 'Sweden', 'Ham, Pineapple, Anchovies'],
      ],
      mapping: { '100': 0, '106': 1, '107': 2 },
      order: 'sequential',
    };
    const [a, b] = generate(cfg, 2);
    expect(a!.answers['100']).toEqual({ t: 'text', v: 'Ada Lovelace' });
    expect(a!.answers['106']).toEqual({ t: 'choice', v: 'Norway' });
    expect(a!.answers['107']).toEqual({ t: 'multi', v: ['Cheese', 'Olives'] });
    expect(b!.answers['107']).toEqual({ t: 'multi', v: ['Ham', 'Pineapple', OTHER_VALUE], other: 'Anchovies' });
  });
});

describe('config', () => {
  it('reconciles saved configs with an edited form', () => {
    const cfg = createConfig(form);
    cfg.questions['106']!.choice.weights = [1, 2];
    delete cfg.questions['105'];
    const fixed = reconcileConfig(form, cfg);
    expect(fixed.questions['106']!.choice.weights).toHaveLength(3);
    expect(fixed.questions['105']).toBeDefined();
  });

  it('splits multi-select cells using known labels', () => {
    expect(splitMulti('Salt, pepper, Cheese', ['Salt, pepper', 'Cheese'])).toEqual(['Salt, pepper', 'Cheese']);
    expect(splitMulti('a;b | c')).toEqual(['a', 'b', 'c']);
  });
});

describe('dataset answers', () => {
  it('still satisfy the form validation', () => {
    const cfg = createConfig(form);
    cfg.dataset = { name: 'AI crowd', headers: ['Age'], rows: [['twenty-five']], mapping: { '102': 0 }, order: 'sequential' };
    const r = generate(cfg, 1)[0]!;
    const a = r.answers['102'];
    expect(a?.t === 'text' && checkText(q('102').validation, a.v)).toBe(true);
  });
});
