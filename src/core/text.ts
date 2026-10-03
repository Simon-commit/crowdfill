/**
 * Text generation: respondent identities, question-aware "smart" answers,
 * a small template language and lorem ipsum.
 *
 * Every synthetic respondent gets one consistent identity, so the name,
 * e-mail and username fields of a single response agree with each other.
 */
import {
  CITIES,
  COMPANIES,
  EMAIL_DOMAINS,
  FEEDBACK,
  FIRST_NAMES,
  JOB_TITLES,
  LAST_NAMES,
  LOREM,
  SCHOOLS,
  SHORT_PHRASES,
  STREETS,
  WORDS,
} from './banks';
import { clamp, createRng, type Rng } from './rng';
import type { Question, Respondent, SmartKind, TextConfig } from './types';

/* -------------------------------------------------------------- identity -- */

export function asciiFold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase();
}

export function createRespondent(rng: Rng, sentiment: number, domains: readonly string[] = EMAIL_DOMAINS): Respondent {
  const firstName = rng.pick(FIRST_NAMES);
  const lastName = rng.pick(LAST_NAMES);
  const f = asciiFold(firstName);
  const l = asciiFold(lastName);
  const num = rng.int(1, 99);
  const style = rng.int(0, 4);
  const local = [`${f}.${l}`, `${f}${l}${num}`, `${f[0]}${l}`, `${f}_${l}`, `${f}${num}`][style]!;
  const [city, country] = rng.pick(CITIES);
  return {
    firstName,
    lastName,
    email: `${local}@${rng.pick(domains.length ? domains : EMAIL_DOMAINS)}`,
    username: rng.chance(0.5) ? `${f}${l.slice(0, 3)}${num}` : `${f}_${rng.int(100, 9999)}`,
    phone: `+1 ${rng.int(201, 989)}-555-${String(rng.int(0, 9999)).padStart(4, '0')}`,
    age: Math.round(clamp(rng.normal(36, 13), 16, 85)),
    city,
    country,
    company: rng.pick(COMPANIES),
    jobTitle: rng.pick(JOB_TITLES),
    sentiment,
  };
}

/* ----------------------------------------------------------------- lorem -- */

export function words(rng: Rng, n: number, bank: readonly string[] = LOREM): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(rng.pick(bank));
  return out.join(' ');
}

export function sentence(rng: Rng, min = 6, max = 14): string {
  const s = words(rng, rng.int(min, max));
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

export function paragraph(rng: Rng, sentences = rng.int(2, 4)): string {
  return Array.from({ length: sentences }, () => sentence(rng)).join(' ');
}

/* -------------------------------------------------------------- feedback -- */

function fillWords(template: string, rng: Rng): string {
  const w = rng.pick(WORDS);
  let w2 = rng.pick(WORDS);
  if (w2 === w) w2 = WORDS[(WORDS.indexOf(w) + 1) % WORDS.length]!;
  return template.replace('{word}', w).replace('{word2}', w2);
}

/** Free-text comment whose tone follows the respondent's latent sentiment. */
export function feedback(rng: Rng, sentiment: number, long = false): string {
  const jitter = clamp(sentiment + rng.normal(0, 0.12), 0, 1);
  const bucket = jitter > 0.62 ? FEEDBACK.positive : jitter < 0.38 ? FEEDBACK.negative : FEEDBACK.neutral;
  const parts = [fillWords(rng.pick(bucket), rng)];
  if (long) {
    const second = fillWords(rng.pick(bucket), rng);
    if (second !== parts[0]) parts.push(second);
    if (rng.chance(0.6)) parts.push(fillWords(rng.pick(FEEDBACK.suggestions), rng));
  } else if (rng.chance(0.25)) {
    parts.push(fillWords(rng.pick(FEEDBACK.suggestions), rng));
  }
  return parts.join(' ');
}

/** Answer to "what could we improve?". Happy respondents often have nothing to add. */
export function suggestion(rng: Rng, sentiment: number): string {
  if (sentiment > 0.7 && rng.chance(0.45)) return rng.pick(FEEDBACK.nothingToImprove);
  const parts = [fillWords(rng.pick(FEEDBACK.suggestions), rng)];
  if (sentiment < 0.35 && rng.chance(0.6)) parts.push(fillWords(rng.pick(FEEDBACK.negative), rng));
  else if (rng.chance(0.3)) {
    const second = fillWords(rng.pick(FEEDBACK.suggestions), rng);
    if (second !== parts[0]) parts.push(second);
  }
  return parts.join(' ');
}

/* ---------------------------------------------------------- smart detect -- */

const SMART_RULES: ReadonlyArray<[SmartKind, RegExp]> = [
  ['email', /e-?mail|correo|courriel|mailadresse|e-?post/],
  ['phone', /phone|mobile|cell|telefon|tel\.|tlf|whatsapp|móvil|celular|handy/],
  ['firstName', /first\s*name|given\s*name|fornavn|vorname|prénom|nombre de pila/],
  ['lastName', /last\s*name|surname|family\s*name|efternavn|nachname|apellido|nom de famille/],
  ['fullName', /\bname\b|\bnavn\b|\bnombre\b|\bnom\b|\bnaam\b|full\s*name|your name|namn/],
  ['age', /\bage\b|how old|alder|\balter\b|\bedad\b|\bâge\b|\bidade\b/],
  ['studentId', /student\s*(id|number|no)|matric|enrol?lment|roll\s*(no|number)|employee\s*id|\bid\s*(number|no)\b/],
  ['zip', /zip|postal|post\s*code|postnummer|postleitzahl|código postal/],
  ['address', /address|street|adresse|dirección|indirizzo|anschrift/],
  ['city', /\bcity\b|\btown\b|\bby\b|stadt|ciudad|ville|città|where do you live/],
  ['country', /country|nation|\bland\b|país|pays|paese/],
  ['company', /company|organi[sz]ation|employer|business name|firma|virksomhed|empresa|entreprise/],
  ['jobTitle', /job|occupation|profession|position|role|title|stilling|beruf|ocupación|métier/],
  ['school', /school|university|college|institution|skole|universitet|schule|escuela|école/],
  ['url', /website|\burl\b|link|homepage|portfolio|linkedin/],
  ['username', /user\s*name|handle|nickname|gamertag|discord|instagram|twitter|tiktok/],
  ['suggestion', /improv|suggest|could we do better|do differently|change about|wish we|forbedr|verbesser|mejorar|améliorer|migliorare/],
  [
    'feedback',
    /comment|feedback|suggest|improv|why|explain|describe|opinion|thought|reason|experience|tell us|anything else|other remarks|kommentar|forslag|hvorfor|warum|por qué|pourquoi/,
  ],
  ['number', /how many|how much|number of|amount|quantity|count|hours|years|minutes|price|budget|antal|wie viele|cuántos/],
];

export function detectSmartKind(q: Pick<Question, 'title' | 'description' | 'kind' | 'validation'>): SmartKind {
  const v = q.validation;
  if (v?.kind === 'text' && v.op === 'email') return 'email';
  if (v?.kind === 'text' && v.op === 'url') return 'url';
  if (v?.kind === 'number') return /\bage\b|how old|alder|alter|edad/.test(q.title.toLowerCase()) ? 'age' : 'number';
  const hay = `${q.title} ${q.title === '' ? q.description : ''}`.toLowerCase();
  for (const [kind, re] of SMART_RULES) if (re.test(hay)) return kind;
  return q.kind === 'paragraph' ? 'feedback' : 'short';
}

export const SMART_KIND_LABELS: Record<SmartKind, string> = {
  auto: 'Auto-detect',
  fullName: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'E-mail',
  phone: 'Phone',
  age: 'Age',
  number: 'Number',
  city: 'City',
  country: 'Country',
  address: 'Street address',
  zip: 'Postal code',
  company: 'Company',
  jobTitle: 'Job title',
  url: 'Website',
  username: 'Username',
  school: 'School',
  studentId: 'ID number',
  feedback: 'Comment (tone follows persona)',
  suggestion: 'Improvement suggestion',
  short: 'Short phrase',
};

export interface TextContext {
  rng: Rng;
  respondent: Respondent;
  /** Submission index (0-based), for {index} and sequential lists. */
  index: number;
  /** Run seed + a stable key, used for "shuffle" lists (each item once per cycle). */
  runSeed?: string;
  key?: string;
  question?: Pick<Question, 'kind' | 'title'>;
}

export function smartValue(kind: SmartKind, ctx: TextContext): string {
  const { rng, respondent: p } = ctx;
  switch (kind) {
    case 'fullName':
      return `${p.firstName} ${p.lastName}`;
    case 'firstName':
      return p.firstName;
    case 'lastName':
      return p.lastName;
    case 'email':
      return p.email;
    case 'phone':
      return p.phone;
    case 'age':
      return String(p.age);
    case 'number':
      return String(rng.int(1, 20));
    case 'city':
      return p.city;
    case 'country':
      return p.country;
    case 'address':
      return `${rng.int(1, 299)} ${rng.pick(STREETS)}, ${p.city}`;
    case 'zip':
      return String(rng.int(10000, 99999));
    case 'company':
      return p.company;
    case 'jobTitle':
      return p.jobTitle;
    case 'url':
      return `https://www.${asciiFold(p.company).slice(0, 18)}.com`;
    case 'username':
      return p.username;
    case 'school':
      return rng.pick(SCHOOLS);
    case 'studentId':
      return String(rng.int(10000000, 99999999));
    case 'feedback':
      return feedback(rng, p.sentiment, ctx.question?.kind === 'paragraph');
    case 'suggestion':
      return suggestion(rng, p.sentiment);
    case 'short':
    case 'auto':
      return rng.pick(SHORT_PHRASES);
  }
}

/* -------------------------------------------------------------- template -- */

export const TEMPLATE_TOKENS: ReadonlyArray<[string, string]> = [
  ['{firstName}', 'First name'],
  ['{lastName}', 'Last name'],
  ['{fullName}', 'Full name'],
  ['{email}', 'E-mail (matches the name)'],
  ['{phone}', 'Phone number'],
  ['{age}', 'Age'],
  ['{city}', 'City'],
  ['{country}', 'Country'],
  ['{company}', 'Company'],
  ['{jobTitle}', 'Job title'],
  ['{username}', 'Username'],
  ['{number:1-100}', 'Random integer in range'],
  ['{decimal:0-10:2}', 'Random decimal with N digits'],
  ['{pick:red|green|blue}', 'One of the listed values'],
  ['{feedback}', "Comment in the persona's tone"],
  ['{suggestion}', 'Improvement suggestion'],
  ['{sentence}', 'Lorem sentence'],
  ['{words:3}', 'N lorem words'],
  ['{digits:6}', 'N random digits'],
  ['{letters:4}', 'N random letters'],
  ['{index}', 'Submission number (1, 2, 3 and so on)'],
  ['{date}', 'Today (YYYY-MM-DD)'],
  ['{uuid}', 'Random UUID'],
];

function uuid(rng: Rng): string {
  const h = () => rng.int(0, 15).toString(16);
  const s = (n: number) => Array.from({ length: n }, h).join('');
  return `${s(8)}-${s(4)}-4${s(3)}-${['8', '9', 'a', 'b'][rng.int(0, 3)]}${s(3)}-${s(12)}`;
}

export function renderTemplate(template: string, ctx: TextContext): string {
  const { rng } = ctx;
  return template.replace(/\{([a-zA-Z]+)(?::([^}]*))?\}/g, (whole, name: string, arg: string | undefined) => {
    switch (name) {
      case 'firstName':
      case 'lastName':
      case 'fullName':
      case 'email':
      case 'phone':
      case 'age':
      case 'city':
      case 'country':
      case 'company':
      case 'jobTitle':
      case 'username':
      case 'feedback':
      case 'suggestion':
        return smartValue(name, ctx);
      case 'name':
        return smartValue('fullName', ctx);
      case 'number':
      case 'int': {
        const [lo, hi] = parseRange(arg, 1, 100);
        return String(rng.int(lo, hi));
      }
      case 'decimal': {
        const [range, digits] = (arg ?? '').split(':');
        const [lo, hi] = parseRange(range, 0, 1);
        return rng.float(lo, hi).toFixed(clamp(Number(digits ?? 2) || 0, 0, 10));
      }
      case 'pick':
        return arg ? rng.pick(arg.split('|')) : '';
      case 'sentence':
        return sentence(rng);
      case 'paragraph':
        return paragraph(rng);
      case 'words':
      case 'word':
        return words(rng, clamp(Number(arg ?? 1) || 1, 1, 200));
      case 'digits':
        return Array.from({ length: clamp(Number(arg ?? 4) || 4, 1, 64) }, () => rng.int(0, 9)).join('');
      case 'letters':
        return Array.from({ length: clamp(Number(arg ?? 4) || 4, 1, 64) }, () =>
          String.fromCharCode(97 + rng.int(0, 25)),
        ).join('');
      case 'index':
        return String(ctx.index + 1);
      case 'date':
        return new Date().toISOString().slice(0, 10);
      case 'uuid':
        return uuid(rng);
      default:
        return whole;
    }
  });
}

function parseRange(arg: string | undefined, lo: number, hi: number): [number, number] {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*$/.exec(arg ?? '');
  if (!m) return [lo, hi];
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a <= b ? [a, b] : [b, a];
}

/* ------------------------------------------------------------ dispatcher -- */

export function generateText(cfg: TextConfig, ctx: TextContext, detected: SmartKind): string {
  const { rng } = ctx;
  switch (cfg.source) {
    case 'smart':
      return smartValue(cfg.smartKind === 'auto' ? detected : cfg.smartKind, ctx);
    case 'template':
      return renderTemplate(cfg.template, ctx);
    case 'list': {
      const list = cfg.list.map((s) => s.trim()).filter(Boolean);
      if (list.length === 0) return '';
      if (cfg.listOrder === 'sequential') return renderTemplate(list[ctx.index % list.length]!, ctx);
      if (cfg.listOrder === 'shuffle') {
        const perm = createRng(`${ctx.runSeed ?? ''}:${ctx.key ?? ''}:list`).shuffle(list.map((_, i) => i));
        return renderTemplate(list[perm[ctx.index % list.length]!]!, ctx);
      }
      return renderTemplate(rng.pick(list), ctx);
    }
    case 'number': {
      const lo = Math.min(cfg.numMin, cfg.numMax);
      const hi = Math.max(cfg.numMin, cfg.numMax);
      if (!cfg.decimals) return String(rng.int(lo, hi));
      return rng.float(lo, hi).toFixed(clamp(cfg.decimals, 0, 10));
    }
    case 'fixed':
      return renderTemplate(cfg.fixed, ctx);
    case 'lorem': {
      const n = rng.int(Math.max(1, cfg.loremMin), Math.max(cfg.loremMin, cfg.loremMax, 1));
      const s = words(rng, n);
      return s.charAt(0).toUpperCase() + s.slice(1) + (n > 3 ? '.' : '');
    }
  }
}
