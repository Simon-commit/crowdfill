/**
 * Probability models behind every choice strategy.
 *
 * - tendency: lean towards a target option with a given strength. On ordered
 *   scales the mass spreads smoothly to neighbours (a discretized Gaussian), on
 *   unordered options the target simply gets the extra share.
 * - persona: each synthetic respondent has a latent sentiment between 0 and 1. Ordered
 *   questions centre on that sentiment, so one respondent's answers correlate
 *   across the whole form the way real people's do.
 */
import { clamp, createRng, type Rng } from './rng';
import type { ChoiceConfig, PersonaConfig } from './types';

export function normalize(weights: readonly number[]): number[] {
  const clean = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  if (total <= 0) return clean.map(() => (clean.length ? 1 / clean.length : 0));
  return clean.map((w) => w / total);
}

export function uniformWeights(n: number): number[] {
  return Array.from({ length: n }, () => 1 / Math.max(1, n));
}

function gaussian(n: number, centre: number, sigma: number): number[] {
  const w = Array.from({ length: n }, (_, i) => Math.exp(-((i - centre) ** 2) / (2 * sigma * sigma)));
  return normalize(w);
}

/** "Random answering with a tendency towards X". `strength` goes from 0 to 100. */
export function tendencyWeights(n: number, target: number, strength: number, ordinal: boolean): number[] {
  if (n <= 0) return [];
  const s = clamp(strength, 0, 100) / 100;
  if (s === 0) return uniformWeights(n);
  const t = clamp(target, 0, n - 1);
  if (ordinal) {
    const sigma = 0.25 + n * 0.9 * (1 - s) ** 1.6;
    return gaussian(n, t, sigma);
  }
  const ti = Math.round(t);
  const pt = 1 / n + s * (1 - 1 / n);
  const rest = n > 1 ? (1 - pt) / (n - 1) : 0;
  return Array.from({ length: n }, (_, i) => (i === ti ? pt : rest));
}

/** Distribution for one respondent with latent `sentiment` (0 to 1) on an ordered scale. */
export function personaWeights(n: number, sentiment: number, consistency: number, reverse: boolean): number[] {
  if (n <= 0) return [];
  const c = clamp(consistency, 0, 100) / 100;
  const z = reverse ? 1 - sentiment : sentiment;
  const sigma = 0.25 + n * 0.6 * (1 - c) ** 1.5;
  return gaussian(n, z * (n - 1), sigma);
}

/** Folds values back into [0, 1] (reflection avoids piling mass up at the extremes). */
function reflect(z: number): number {
  let v = Math.abs(z) % 2;
  if (v > 1) v = 2 - v;
  return v;
}

/** Draws one respondent's latent sentiment from the crowd model. */
export function sampleSentiment(p: PersonaConfig, rng: Rng): number {
  const mean = clamp(p.mean, 0, 100) / 100;
  const spread = clamp(p.spread, 0, 100) / 100;
  switch (p.shape) {
    case 'uniform':
      return rng.next();
    case 'polarized': {
      const sd = 0.03 + spread * 0.12;
      return rng.chance(mean) ? reflect(rng.normal(0.92, sd)) : reflect(rng.normal(0.08, sd));
    }
    case 'bell':
    default:
      return reflect(rng.normal(mean, 0.03 + spread * 0.32));
  }
}

export interface ChoiceContext {
  ordinal: boolean;
  /** True when the options run from positive to negative. */
  reversed: boolean;
  sentiment: number;
  persona: PersonaConfig;
  index: number;
}

/**
 * Weights over `n` options for the given strategy. `cycle` returns a one-hot
 * vector for the submission index (round-robin coverage).
 */
export function choiceWeights(cfg: ChoiceConfig, n: number, ctx: ChoiceContext): number[] {
  if (n <= 0) return [];
  switch (cfg.mode) {
    case 'uniform':
      return uniformWeights(n);
    case 'weighted':
      return normalize(Array.from({ length: n }, (_, i) => cfg.weights[i] ?? 0));
    case 'tendency':
      return tendencyWeights(n, cfg.target, cfg.strength, ctx.ordinal);
    case 'fixed':
      return Array.from({ length: n }, (_, i) => (i === clamp(cfg.fixed, 0, n - 1) ? 1 : 0));
    case 'cycle':
      return Array.from({ length: n }, (_, i) => (i === ctx.index % n ? 1 : 0));
    case 'persona':
      if (!ctx.ordinal) return uniformWeights(n);
      return personaWeights(n, ctx.sentiment, ctx.persona.consistency, cfg.reverse !== ctx.reversed);
  }
}

/**
 * Expected answer distribution across the whole crowd, for the live preview
 * bars. Persona mode is estimated by Monte Carlo over sampled sentiments.
 */
export function expectedDistribution(cfg: ChoiceConfig, n: number, ctx: Omit<ChoiceContext, 'sentiment' | 'index'>): number[] {
  if (cfg.mode === 'cycle') return uniformWeights(n);
  if (cfg.mode !== 'persona' || !ctx.ordinal) {
    return choiceWeights(cfg, n, { ...ctx, sentiment: 0.5, index: 0 });
  }
  const rng = createRng('preview');
  const acc = new Array<number>(n).fill(0);
  const samples = 600;
  for (let s = 0; s < samples; s++) {
    const w = personaWeights(n, sampleSentiment(ctx.persona, rng), ctx.persona.consistency, cfg.reverse !== ctx.reversed);
    for (let i = 0; i < n; i++) acc[i]! += w[i]!;
  }
  return normalize(acc);
}

/** Histogram of the crowd's sentiment, for the persona card preview. */
export function sentimentHistogram(p: PersonaConfig, bins = 21, samples = 3000): number[] {
  const rng = createRng('persona-preview');
  const h = new Array<number>(bins).fill(0);
  for (let i = 0; i < samples; i++) {
    const z = sampleSentiment(p, rng);
    h[Math.min(bins - 1, Math.floor(z * bins))]! += 1;
  }
  return normalize(h);
}
