import { describe, expect, it } from 'vitest';
import { defaultChoice, DEFAULT_PERSONA } from '../src/core/defaults';
import { expectedDistribution } from '../src/core/distributions';
import type { PersonaConfig } from '../src/core/types';

const scale = (persona: PersonaConfig) => expectedDistribution(defaultChoice(5, true), 5, { ordinal: true, reversed: false, persona });

describe('crowd presets produce recognizable shapes', () => {
  it('polarized crowds favour both ends over the middle', () => {
    const d = scale({ shape: 'polarized', mean: 55, spread: 30, consistency: 80 });
    expect(d[0]! + d[4]!).toBeGreaterThan(0.5);
    expect(d[2]!).toBeLessThan(Math.min(d[0]!, d[4]!));
  });

  it('neutral crowds peak in the middle', () => {
    const d = scale({ shape: 'bell', mean: 50, spread: 20, consistency: 70 });
    expect(d.indexOf(Math.max(...d))).toBe(2);
  });

  it('the default crowd leans mildly positive', () => {
    const d = scale(DEFAULT_PERSONA);
    expect(d[3]! + d[4]!).toBeGreaterThan(d[0]! + d[1]!);
    expect(d[4]!).toBeLessThan(0.6);
  });

  it('zero consistency is close to uniform', () => {
    const d = scale({ shape: 'bell', mean: 90, spread: 10, consistency: 0 });
    for (const v of d) expect(v).toBeGreaterThan(0.1);
  });
});
