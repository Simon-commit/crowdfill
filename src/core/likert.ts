/**
 * Detects whether a set of options forms an ordered (Likert-like) scale and in
 * which direction sentiment runs, so persona-driven answers can lean "positive"
 * or "negative" on questions that are not literally linear scales.
 */

/** Rough valence of common scale words, from -2 to +2. Multilingual, lowercase. */
const LEXICON: ReadonlyArray<[RegExp, number]> = [
  [/strongly disagree|completely disagree|helt uenig|stimme gar nicht zu|totalmente en desacuerdo|pas du tout d'accord/, -2],
  [/strongly agree|completely agree|helt enig|stimme voll zu|totalmente de acuerdo|tout à fait d'accord/, 2],
  [/very (dis|un)satisfied|very unhappy|very poor|terrible|awful|horrible|meget utilfreds|sehr unzufrieden|muy insatisfecho/, -2],
  [/very satisfied|very happy|excellent|outstanding|amazing|meget tilfreds|sehr zufrieden|muy satisfecho|excelente|exzellent|fremragende/, 2],
  [/very unlikely|extremely unlikely|definitely not|never|aldrig|nie|nunca|jamais/, -2],
  [/very likely|extremely likely|definitely|always|altid|immer|siempre|toujours/, 2],
  [/not at all|slet ikke|überhaupt nicht|nada/, -2],
  [/extremely|completely|absolutely|enormously/, 2],
  [/disagree|uenig|nicht zu|desacuerdo|pas d'accord/, -1],
  [/dissatisfied|unsatisfied|unhappy|utilfreds|unzufrieden|insatisfecho/, -1],
  [/unlikely|usandsynlig|unwahrscheinlich|improbable/, -1],
  [/\bpoor\b|\bbad\b|\bweak\b|dårlig|schlecht|malo|mauvais/, -1],
  [/rarely|seldom|sjældent|selten|rara vez|rarement/, -1],
  [/slightly|a little|lidt|etwas|un poco/, -0.5],
  [/neutral|neither|undecided|neutral|hverken|weder|ni de acuerdo|ni d'accord|average|okay|\bok\b|fair|moderately|sometimes|somewhat|nogle gange|manchmal|a veces|parfois/, 0],
  [/\bagree\b|\benig\b|stimme zu|de acuerdo|d'accord/, 1],
  [/satisfied|happy|tilfreds|zufrieden|satisfecho/, 1],
  [/\blikely\b|sandsynlig|wahrscheinlich|probable/, 1],
  [/\bgood\b|\bgreat\b|god|gut|bueno|bon/, 1],
  [/often|usually|frequently|ofte|oft|a menudo|souvent/, 1],
  [/very|meget|sehr|muy|très/, 1.5],
];

function valence(label: string): number | null {
  const s = label.toLowerCase();
  for (const [re, v] of LEXICON) if (re.test(s)) return v;
  return null;
}

export interface Ordering {
  ordinal: boolean;
  /** True when the first option is the most positive (descending scale). */
  reversed: boolean;
}

export function detectOrdering(labels: readonly string[]): Ordering {
  const clean = labels.filter((l) => l.trim() !== '');
  if (clean.length < 3) return { ordinal: false, reversed: false };

  // Rating-style numbers (1 to 5, 0 to 10, optionally "4 - Good") are ordinal. Hours ("0h" to "23h"),
  // years or brackets ("18-24") are numeric but say nothing about sentiment, so they don't count.
  const nums = clean.map((l) => {
    const m = /^\s*(-?\d+)\s*(?:[-\u2013\u2014:.)]\s+\D.*)?$/.exec(l);
    return m ? Number(m[1]) : NaN;
  });
  if (nums.every(Number.isFinite) && clean.length <= 11 && nums.every((n) => Math.abs(n) <= 10)) {
    const asc = nums.every((n, i) => i === 0 || n === nums[i - 1]! + 1);
    const desc = nums.every((n, i) => i === 0 || n === nums[i - 1]! - 1);
    if (asc || desc) return { ordinal: true, reversed: desc };
    return { ordinal: false, reversed: false };
  }

  const vals = clean.map(valence);
  const known = vals.filter((v): v is number => v !== null);
  if (known.length < Math.max(3, Math.ceil(clean.length * 0.6))) return { ordinal: false, reversed: false };

  // Spearman-ish: correlation between position and valence.
  const pairs = vals.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  const n = pairs.length;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (const [x, y] of pairs) {
    cov += (x - mx) * (y - my);
    vx += (x - mx) ** 2;
    vy += (y - my) ** 2;
  }
  if (vx === 0 || vy === 0) return { ordinal: false, reversed: false };
  const r = cov / Math.sqrt(vx * vy);
  if (Math.abs(r) < 0.7) return { ordinal: false, reversed: false };
  return { ordinal: true, reversed: r < 0 };
}
