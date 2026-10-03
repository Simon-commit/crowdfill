/**
 * Generates random strings that match a regular expression, so text answers
 * can satisfy a form's "Regular expression: Matches" response validation.
 *
 * Supports the subset that shows up in real forms: literals, escapes
 * (\d \w \s and negations, \t \n \xHH \uHHHH), `.`, character classes with
 * ranges and negation, groups (capturing, non-capturing, named), alternation,
 * all quantifiers (greedy/lazy/possessive), back-references and anchors.
 * Lookarounds are ignored. Output is verified against the real RegExp.
 */
import type { Rng } from './rng';

type Range = [number, number];

type Node =
  | { t: 'empty' }
  | { t: 'lit'; c: string }
  | { t: 'set'; ranges: Range[]; negate: boolean }
  | { t: 'seq'; items: Node[] }
  | { t: 'alt'; options: Node[] }
  | { t: 'group'; node: Node; index: number | null }
  | { t: 'rep'; node: Node; min: number; max: number }
  | { t: 'backref'; index: number };

const DIGIT: Range[] = [[48, 57]];
const WORD: Range[] = [[48, 57], [65, 90], [97, 122], [95, 95]];
const SPACE: Range[] = [[32, 32]];
const DOT: Range[] = [[48, 57], [65, 90], [97, 122]];
const PRINTABLE: Range = [32, 126];
const UNBOUNDED_EXTRA = 4;

class Parser {
  private i = 0;
  private groups = 0;
  constructor(private readonly src: string) {}

  parse(): Node {
    const node = this.alternation();
    if (this.i < this.src.length) throw new SyntaxError(`Unexpected "${this.src[this.i]}" at ${this.i}`);
    return node;
  }

  private peek(): string | undefined {
    return this.src[this.i];
  }

  private alternation(): Node {
    const options = [this.sequence()];
    while (this.peek() === '|') {
      this.i++;
      options.push(this.sequence());
    }
    return options.length === 1 ? options[0]! : { t: 'alt', options };
  }

  private sequence(): Node {
    const items: Node[] = [];
    while (this.i < this.src.length && this.peek() !== '|' && this.peek() !== ')') {
      const atom = this.atom();
      items.push(this.quantified(atom));
    }
    return items.length === 1 ? items[0]! : { t: 'seq', items };
  }

  private quantified(node: Node): Node {
    const c = this.peek();
    let min: number;
    let max: number;
    if (c === '*') [min, max] = [0, Infinity];
    else if (c === '+') [min, max] = [1, Infinity];
    else if (c === '?') [min, max] = [0, 1];
    else if (c === '{') {
      const m = /^\{(\d*)(,?)(\d*)\}/.exec(this.src.slice(this.i));
      if (!m || (m[1] === '' && m[3] === '')) return node; // literal "{"
      min = m[1] === '' ? 0 : Number(m[1]);
      max = m[2] ? (m[3] === '' ? Infinity : Number(m[3])) : min;
      this.i += m[0].length - 1;
    } else return node;
    this.i++;
    if (this.peek() === '?' || this.peek() === '+') this.i++; // lazy / possessive
    return this.quantified({ t: 'rep', node, min, max });
  }

  private atom(): Node {
    const c = this.src[this.i++]!;
    switch (c) {
      case '^':
      case '$':
        return { t: 'empty' };
      case '.':
        return { t: 'set', ranges: DOT, negate: false };
      case '[':
        return this.charClass();
      case '\\':
        return this.escape(false);
      case '(': {
        let index: number | null = null;
        let lookaround = false;
        if (this.src.startsWith('?:', this.i)) this.i += 2;
        else if (/^\?<?[=!]/.test(this.src.slice(this.i))) {
          lookaround = true;
          this.i += this.src[this.i + 1] === '<' ? 3 : 2;
        } else if (this.src.startsWith('?<', this.i) || this.src.startsWith('?P<', this.i)) {
          this.i = this.src.indexOf('>', this.i) + 1;
          index = ++this.groups;
        } else index = ++this.groups;
        const node = this.alternation();
        if (this.src[this.i++] !== ')') throw new SyntaxError('Unterminated group');
        return lookaround ? { t: 'empty' } : { t: 'group', node, index };
      }
      default:
        return { t: 'lit', c };
    }
  }

  private escape(inClass: boolean): Node {
    const c = this.src[this.i++];
    if (c === undefined) throw new SyntaxError('Trailing backslash');
    switch (c) {
      case 'd':
        return { t: 'set', ranges: DIGIT, negate: false };
      case 'D':
        return { t: 'set', ranges: DIGIT, negate: true };
      case 'w':
        return { t: 'set', ranges: WORD, negate: false };
      case 'W':
        return { t: 'set', ranges: WORD, negate: true };
      case 's':
        return { t: 'set', ranges: SPACE, negate: false };
      case 'S':
        return { t: 'set', ranges: SPACE, negate: true };
      case 'b':
      case 'B':
        return inClass ? { t: 'lit', c: '\b' } : { t: 'empty' };
      case 'n':
        return { t: 'lit', c: '\n' };
      case 't':
        return { t: 'lit', c: '\t' };
      case 'r':
        return { t: 'lit', c: '\r' };
      case 'x': {
        const hex = this.src.slice(this.i, this.i + 2);
        this.i += 2;
        return { t: 'lit', c: String.fromCharCode(parseInt(hex, 16)) };
      }
      case 'u': {
        const hex = this.src.slice(this.i, this.i + 4);
        this.i += 4;
        return { t: 'lit', c: String.fromCharCode(parseInt(hex, 16)) };
      }
      default:
        if (!inClass && /[1-9]/.test(c)) return { t: 'backref', index: Number(c) };
        return { t: 'lit', c };
    }
  }

  private charClass(): Node {
    let negate = false;
    if (this.peek() === '^') {
      negate = true;
      this.i++;
    }
    const ranges: Range[] = [];
    let first = true;
    while (this.i < this.src.length && (this.peek() !== ']' || first)) {
      first = false;
      let lo: number;
      const c = this.src[this.i++]!;
      if (c === '\\') {
        const node = this.escape(true);
        if (node.t === 'set') {
          ranges.push(...(node.negate ? complement(node.ranges) : node.ranges));
          continue;
        }
        lo = node.t === 'lit' ? node.c.charCodeAt(0) : 0;
      } else lo = c.charCodeAt(0);
      if (this.peek() === '-' && this.src[this.i + 1] !== ']' && this.i + 1 < this.src.length) {
        this.i++;
        let hiChar = this.src[this.i++]!;
        if (hiChar === '\\') {
          const node = this.escape(true);
          hiChar = node.t === 'lit' ? node.c : hiChar;
        }
        ranges.push([lo, hiChar.charCodeAt(0)]);
      } else ranges.push([lo, lo]);
    }
    if (this.src[this.i++] !== ']') throw new SyntaxError('Unterminated character class');
    return { t: 'set', ranges, negate };
  }
}

function complement(ranges: Range[]): Range[] {
  const out: Range[] = [];
  for (let c = PRINTABLE[0]; c <= PRINTABLE[1]; c++) {
    if (!ranges.some(([lo, hi]) => c >= lo && c <= hi)) out.push([c, c]);
  }
  return out;
}

function pickFromSet(ranges: Range[], negate: boolean, rng: Rng): string {
  const pool = negate ? complement(ranges) : ranges;
  if (pool.length === 0) return '';
  const sizes = pool.map(([lo, hi]) => Math.max(0, hi - lo + 1));
  const [lo, hi] = pool[rng.weighted(sizes)]!;
  return String.fromCharCode(rng.int(lo, hi));
}

function render(node: Node, rng: Rng, groups: Map<number, string>): string {
  switch (node.t) {
    case 'empty':
      return '';
    case 'lit':
      return node.c;
    case 'set':
      return pickFromSet(node.ranges, node.negate, rng);
    case 'seq':
      return node.items.map((n) => render(n, rng, groups)).join('');
    case 'alt':
      return render(rng.pick(node.options), rng, groups);
    case 'group': {
      const s = render(node.node, rng, groups);
      if (node.index !== null) groups.set(node.index, s);
      return s;
    }
    case 'rep': {
      const max = Number.isFinite(node.max) ? node.max : node.min + UNBOUNDED_EXTRA;
      const n = rng.int(node.min, Math.max(node.min, max));
      let s = '';
      for (let k = 0; k < n; k++) s += render(node.node, rng, groups);
      return s;
    }
    case 'backref':
      return groups.get(node.index) ?? '';
  }
}

export function parseRegex(pattern: string): Node {
  return new Parser(pattern).parse();
}

/**
 * Returns a random string that fully matches `pattern`, or `null` if none
 * could be produced (unsupported syntax or unsatisfiable pattern).
 */
export function generateMatching(pattern: string, rng: Rng, attempts = 25): string | null {
  let ast: Node;
  let re: RegExp;
  try {
    ast = parseRegex(pattern);
    re = new RegExp(`^(?:${pattern})$`, 'u');
  } catch {
    try {
      ast = parseRegex(pattern);
      re = new RegExp(`^(?:${pattern})$`);
    } catch {
      return null;
    }
  }
  for (let i = 0; i < attempts; i++) {
    const s = render(ast, rng, new Map());
    if (re.test(s)) return s;
  }
  return null;
}

/** Safe `RegExp` construction (Google uses RE2 semantics; we approximate with JS). */
export function tryRegExp(pattern: string, flags = ''): RegExp | null {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}
