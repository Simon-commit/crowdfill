// Original music bed and interface sounds, synthesized from scratch (no samples,
// nothing to license). Writes 48 kHz stereo WAV files.
import { writeFileSync } from 'node:fs';

const SR = 48000;
const TAU = Math.PI * 2;

/* --------------------------------------------------------------- helpers -- */

const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

function writeWav(path, left, right) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  let peak = 1e-9;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const gain = Math.min(1, 0.89 / peak); // keep headroom, never clip
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i] * gain)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i] * gain)) * 32767), 46 + i * 4);
  }
  writeFileSync(path, buf);
}

/** Freeverb-style stereo reverb. */
function reverb(inL, inR, { room = 0.86, damp = 0.25, wet = 0.32 } = {}) {
  const k = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => Math.round(d * k));
  const alls = [556, 441, 341, 225].map((d) => Math.round(d * k));
  const make = (spread) => ({
    combs: combs.map((d) => ({ buf: new Float32Array(d + spread), i: 0, store: 0 })),
    alls: alls.map((d) => ({ buf: new Float32Array(d + spread), i: 0 })),
  });
  const L = make(0);
  const R = make(Math.round(23 * k));
  const outL = new Float32Array(inL.length);
  const outR = new Float32Array(inL.length);
  const run = (ch, x) => {
    let acc = 0;
    for (const c of ch.combs) {
      const y = c.buf[c.i];
      c.store = y * (1 - damp) + c.store * damp;
      c.buf[c.i] = x + c.store * room;
      c.i = (c.i + 1) % c.buf.length;
      acc += y;
    }
    for (const a of ch.alls) {
      const b = a.buf[a.i];
      a.buf[a.i] = acc + b * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      acc = b - acc;
    }
    return acc;
  };
  for (let i = 0; i < inL.length; i++) {
    const x = (inL[i] + inR[i]) * 0.015;
    outL[i] = inL[i] + run(L, x) * wet * 2;
    outR[i] = inR[i] + run(R, x) * wet * 2;
  }
  return [outL, outR];
}

/* ----------------------------------------------------------------- music -- */

// D major, four warm chords, 4 seconds each.
const CHORDS = [
  [50, 57, 61, 64, 66], // Dmaj9
  [47, 54, 57, 62, 64], // Bm11
  [43, 50, 54, 57, 59], // Gmaj9
  [45, 52, 59, 61, 66], // A6/9
];
const BAR = 4;

/**
 * @param duration seconds
 * @param marks { titleAt, mainAt, runAt, runEnd, outroAt }
 */
export function renderMusic(path, duration, marks) {
  const n = Math.ceil(duration * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const sendL = new Float32Array(n);
  const sendR = new Float32Array(n);

  // Overall energy curve: sparse intro, swell at the title, steady middle, lift during the run, resolve.
  const energy = (t) => {
    if (t < marks.titleAt) return 0.45;
    if (t < marks.mainAt) return 0.45 + 0.55 * smooth((t - marks.titleAt) / 1.2);
    if (t < marks.runAt) return 1;
    if (t < marks.runEnd) return 1.12;
    return 1;
  };
  const fadeOut = (t) => 1 - smooth((t - (duration - 2.6)) / 2.6);
  const fadeIn = (t) => smooth(t / 1.5);

  // Pad: detuned voices with a few soft harmonics, crossfading between chords.
  const detune = [-0.07, 0, 0.07].map((c) => 2 ** (c / 12));
  for (let bar = 0; bar * BAR < duration + BAR; bar++) {
    const chord = t0Chord(bar);
    const t0 = bar * BAR;
    const start = Math.max(0, Math.floor((t0 - 1.2) * SR));
    const end = Math.min(n, Math.ceil((t0 + BAR + 2.2) * SR));
    for (let i = start; i < end; i++) {
      const t = i / SR;
      const env = smooth((t - (t0 - 1.2)) / 1.6) * (1 - smooth((t - (t0 + BAR - 0.4)) / 2.4));
      if (env <= 0) continue;
      const bright = 0.18 + 0.1 * Math.sin(TAU * 0.07 * t);
      let s = 0;
      for (let v = 0; v < chord.length; v++) {
        const f = midi(chord[v] + 12);
        for (const d of detune) {
          const ph = TAU * f * d * t + v * 1.7;
          s += Math.sin(ph) + bright * Math.sin(2 * ph) + 0.05 * Math.sin(3 * ph);
        }
      }
      const g = env * 0.012 * energy(t) * fadeIn(t) * fadeOut(t);
      const pan = 0.5 + 0.12 * Math.sin(TAU * 0.05 * t);
      L[i] += s * g * (1 - pan) * 2;
      R[i] += s * g * pan * 2;
      sendL[i] += s * g * 0.5;
      sendR[i] += s * g * 0.5;
    }
  }

  // Bass: chord roots, soft sine, from the title onwards.
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (t < marks.titleAt) continue;
    const bar = Math.floor(t / BAR);
    const local = t - bar * BAR;
    const f = midi(t0Chord(bar)[0] - 12);
    const env = smooth(local / 0.08) * (0.65 + 0.35 * Math.exp(-local * 0.9)) * (1 - smooth((local - BAR + 0.15) / 0.15));
    const s = Math.sin(TAU * f * t) * env * 0.11 * smooth((t - marks.titleAt) / 1.5) * fadeOut(t);
    L[i] += s;
    R[i] += s;
  }

  // Plucked arpeggio in eighth notes, a little busier during the run.
  const eighth = BAR / 8;
  const pattern = [0, 2, 4, 3, 1, 4, 2, 3];
  for (let step = 0; step * eighth < duration; step++) {
    const t0 = step * eighth;
    if (t0 < marks.mainAt - 0.2 || t0 > duration - 2.5) continue;
    const bar = Math.floor(t0 / BAR);
    const chord = t0Chord(bar);
    const note = chord[pattern[step % 8]] + 24;
    const f = midi(note);
    const vel = (step % 2 ? 0.6 : 1) * (t0 >= marks.runAt && t0 < marks.runEnd ? 1.15 : 0.85);
    const pan = step % 2 ? 0.32 : 0.68;
    const start = Math.floor(t0 * SR);
    const len = Math.floor(1.6 * SR);
    for (let k = 0; k < len && start + k < n; k++) {
      const t = k / SR;
      const env = smooth(t / 0.004) * Math.exp(-t / 0.38);
      const s = (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t) * Math.exp(-t / 0.12)) * env * 0.035 * vel;
      L[start + k] += s * (1 - pan) * 2;
      R[start + k] += s * pan * 2;
      sendL[start + k] += s * 1.4;
      sendR[start + k] += s * 1.4;
    }
  }

  const [wl, wr] = reverb(sendL, sendR, { wet: 0.4 });
  for (let i = 0; i < n; i++) {
    L[i] += wl[i] - sendL[i];
    R[i] += wr[i] - sendR[i];
  }
  writeWav(path, L, R);
}

function t0Chord(bar) {
  return CHORDS[((bar % CHORDS.length) + CHORDS.length) % CHORDS.length];
}

/* ------------------------------------------------------------- effects -- */

function noise(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

const FX = {
  click(L, R, at) {
    const rnd = noise(at * 1000);
    const len = Math.floor(0.03 * SR);
    let lp = 0;
    for (let k = 0; k < len; k++) {
      const t = k / SR;
      const x = rnd();
      lp += (x - lp) * 0.35;
      const s = (x - lp) * Math.exp(-t / 0.0018) * 0.5 + Math.sin(TAU * 2300 * t) * Math.exp(-t / 0.006) * 0.22;
      L[at + k] += s;
      R[at + k] += s;
    }
  },
  tick(L, R, at) {
    const len = Math.floor(0.05 * SR);
    for (let k = 0; k < len; k++) {
      const t = k / SR;
      const s = Math.sin(TAU * 3100 * t) * Math.exp(-t / 0.01) * 0.06;
      L[at + k] += s;
      R[at + k] += s;
    }
  },
  pop(L, R, at) {
    const len = Math.floor(0.25 * SR);
    let ph = 0;
    for (let k = 0; k < len; k++) {
      const t = k / SR;
      ph += (TAU * (240 + 260 * smooth(t / 0.09))) / SR;
      const s = Math.sin(ph) * smooth(t / 0.004) * Math.exp(-t / 0.07) * 0.35;
      L[at + k] += s;
      R[at + k] += s;
    }
  },
  whoosh(L, R, at) {
    const rnd = noise(at + 7);
    const dur = 0.9;
    const len = Math.floor(dur * SR);
    let a = 0;
    let b = 0;
    for (let k = 0; k < len; k++) {
      const t = k / SR;
      const p = t / dur;
      const cutoff = 0.02 + 0.25 * Math.sin(Math.PI * p);
      const x = rnd();
      a += (x - a) * cutoff;
      b += (a - b) * cutoff;
      const env = Math.sin(Math.PI * p) ** 2 * 0.5;
      L[at + k] += (a - b) * env * (1.2 - p * 0.8);
      R[at + k] += (a - b) * env * (0.4 + p * 0.8);
    }
  },
  chime(L, R, at) {
    const len = Math.floor(3.5 * SR);
    const notes = [
      [midi(81), 0.12],
      [midi(88), 0.08],
      [midi(93), 0.05],
    ];
    for (let k = 0; k < len; k++) {
      const t = k / SR;
      let s = 0;
      for (const [f, g] of notes) {
        s += g * (Math.sin(TAU * f * t) * Math.exp(-t / 1.4) + 0.3 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t / 0.4));
      }
      s *= smooth(t / 0.003);
      L[at + k] += s;
      R[at + k] += s * 0.9;
    }
  },
};

/** events: [{ t: seconds, type: 'click' | 'tick' | 'pop' | 'whoosh' | 'chime' }] */
export function renderFx(path, duration, events) {
  const n = Math.ceil((duration + 4) * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (const e of events) {
    const at = Math.floor(e.t * SR);
    if (at >= 0 && at < n && FX[e.type]) FX[e.type](L, R, at);
  }
  const [wl, wr] = reverb(L, R, { wet: 0.18, room: 0.7 });
  writeWav(path, wl.subarray(0, Math.ceil(duration * SR)), wr.subarray(0, Math.ceil(duration * SR)));
}
