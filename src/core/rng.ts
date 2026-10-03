/**
 * Seedable PRNG (sfc32 seeded through cyrb128) with the sampling helpers the
 * generators need. Every submission gets its own stream derived from
 * `${seed}:${index}`, so a run is fully reproducible from its seed.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  float(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Index drawn proportionally to `weights`. Falls back to uniform when all weights are 0. */
  weighted(weights: readonly number[]): number;
  /** Gaussian sample (Box-Muller). */
  normal(mean?: number, sd?: number): number;
  shuffle<T>(items: readonly T[]): T[];
  /** `k` distinct items, order randomized. */
  sample<T>(items: readonly T[], k: number): T[];
}

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function randomSeed(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 8);
}

export function createRng(seed: string | number): Rng {
  const [a, b, c, d] = cyrb128(String(seed));
  const next = sfc32(a, b, c, d);
  // Warm up: the first few outputs of sfc32 are weakly mixed.
  for (let i = 0; i < 12; i++) next();
  let spare: number | null = null;

  const rng: Rng = {
    next,
    int(min, max) {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    float(min, max) {
      return min + next() * (max - min);
    },
    chance(p) {
      return next() < p;
    },
    pick(items) {
      if (items.length === 0) throw new Error('pick() from empty list');
      return items[Math.floor(next() * items.length)]!;
    },
    weighted(weights) {
      let total = 0;
      for (const w of weights) total += w > 0 && Number.isFinite(w) ? w : 0;
      if (total <= 0) return Math.floor(next() * weights.length);
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        const w = weights[i]!;
        if (!(w > 0) || !Number.isFinite(w)) continue;
        r -= w;
        if (r < 0) return i;
      }
      // Floating point slack: return the last positive weight.
      for (let i = weights.length - 1; i >= 0; i--) if (weights[i]! > 0) return i;
      return 0;
    },
    normal(mean = 0, sd = 1) {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return mean + sd * s;
      }
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      const mag = Math.sqrt(-2 * Math.log(u));
      spare = mag * Math.sin(2 * Math.PI * v);
      return mean + sd * mag * Math.cos(2 * Math.PI * v);
    },
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    sample(items, k) {
      return rng.shuffle(items).slice(0, Math.max(0, Math.min(k, items.length)));
    },
  };
  return rng;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
