/**
 * Optional, bring-your-own-key answer generation with Claude.
 *
 * Generates a pool of varied, realistic free-text answers for one question.
 * The pool is stored in the question's "list" source, so the API is called
 * once while designing, never per submission.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { AiRequest, CrowdQuestion, CrowdRequest, CrowdRespondent } from '../shared/messages';

/** Models that accept `effort` and server-side refusal fallbacks. */
const SUPPORTS_EFFORT_AND_FALLBACKS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-opus-5', 'claude-fable-5-1']);

const SCHEMA = {
  type: 'object',
  properties: {
    answers: { type: 'array', items: { type: 'string' } },
  },
  required: ['answers'],
  additionalProperties: false,
} as const;

const SYSTEM = [
  'You write synthetic survey answers that are used as realistic test data for a form owner.',
  'Each answer must read like it was typed by a different person: vary length, vocabulary, detail, punctuation and perspective.',
  'Answer in the language the question is written in. Never number the answers or add commentary.',
].join(' ');

function client(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly code: 'no-key' | 'auth' | 'rate-limit' | 'refusal' | 'bad-output' | 'api',
  ) {
    super(message);
  }
}

function describeError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new AiError('Your Claude API key was rejected. Check it in Settings.', 'auth');
  if (e instanceof Anthropic.PermissionDeniedError) return new AiError('This API key cannot use the selected model.', 'auth');
  if (e instanceof Anthropic.NotFoundError) return new AiError('The selected model is not available for this API key.', 'api');
  if (e instanceof Anthropic.RateLimitError) return new AiError('Claude API rate limit reached. Try again in a moment.', 'rate-limit');
  if (e instanceof Anthropic.BadRequestError) return new AiError(`Claude API rejected the request: ${e.message}`, 'api');
  if (e instanceof Anthropic.APIError) return new AiError(`Claude API error ${e.status ?? ''}: ${e.message}`, 'api');
  return new AiError(e instanceof Error ? e.message : 'Unknown error contacting Claude.', 'api');
}

async function ask(apiKey: string, model: string, prompt: string, maxTokens: number, schema: Record<string, unknown> = SCHEMA, system = SYSTEM): Promise<string> {
  const advanced = SUPPORTS_EFFORT_AND_FALLBACKS.has(model);
  const response = await client(apiKey).beta.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
    output_config: advanced ? { effort: 'low', format: { type: 'json_schema', schema } } : { format: { type: 'json_schema', schema } },
    ...(advanced ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  });
  if (response.stop_reason === 'refusal') {
    throw new AiError('Claude declined to write answers for this question.', 'refusal');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AiError('The answer pool was cut off. Ask for fewer answers.', 'bad-output');
  }
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  return text;
}

export async function generateAnswers(apiKey: string, model: string, req: AiRequest): Promise<string[]> {
  if (!apiKey) throw new AiError('Add your Claude API key in Settings first.', 'no-key');
  const count = Math.max(1, Math.min(200, Math.floor(req.count)));
  const long = req.question.kind === 'paragraph';
  const lines = [
    `Form: ${req.formTitle || 'Untitled form'}`,
    req.formDescription ? `Form description: ${req.formDescription.slice(0, 600)}` : '',
    `Question: ${req.question.title || '(untitled question)'}`,
    req.question.description ? `Question help text: ${req.question.description}` : '',
    req.question.validation ? `The answer must satisfy: ${req.question.validation}` : '',
    '',
    `Write ${count} distinct answers to this question.`,
    long
      ? 'These go into a paragraph field: most answers are one to three sentences, a few are longer, a few are very short.'
      : 'These go into a short-answer field: keep each answer to a few words or one short sentence.',
    `Sentiment mix (where it applies): about ${req.mix.positive}% positive, ${req.mix.neutral}% neutral, ${req.mix.negative}% negative.`,
    'Include natural imperfections some people have (lowercase, missing punctuation, a typo now and then).',
    req.language ? `Write in ${req.language}.` : '',
    req.extraInstructions ? `Extra instructions from the form owner: ${req.extraInstructions}` : '',
    'Return JSON: {"answers": [...]}',
  ];
  try {
    const text = await ask(apiKey, model, lines.filter(Boolean).join('\n'), Math.min(16000, 400 + count * (long ? 160 : 40)));
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AiError('Claude returned an unexpected format. Try again.', 'bad-output');
    }
    const answers = (parsed as { answers?: unknown }).answers;
    if (!Array.isArray(answers)) throw new AiError('Claude returned an unexpected format. Try again.', 'bad-output');
    const clean = [...new Set(answers.filter((a): a is string => typeof a === 'string').map((a) => a.trim()).filter(Boolean))];
    if (clean.length === 0) throw new AiError('Claude returned no answers. Try again.', 'bad-output');
    return clean;
  } catch (e) {
    throw describeError(e);
  }
}

/** Cheap connectivity check for the Settings screen. */
export async function testKey(apiKey: string, model: string): Promise<string> {
  if (!apiKey) throw new AiError('Enter an API key first.', 'no-key');
  try {
    await ask(apiKey, model, 'Return {"answers": ["ok"]}', 300);
    return model;
  } catch (e) {
    throw describeError(e);
  }
}

/* ------------------------------------------------------------- AI crowd -- */

const CROWD_SYSTEM = [
  'You role-play a crowd of survey respondents to create synthetic test data for the owner of a form.',
  'Every respondent is a distinct, believable person with their own customer type, mood, priorities and biases, and answers the whole form in character.',
  "A respondent's answers must agree with each other: an unhappy person rates low, writes critical comments and is unlikely to recommend.",
  'Write free-text answers the way that person would type them, in the language of the form. Never mention that the data is synthetic.',
].join(' ');

function answerSchema(q: CrowdQuestion): Record<string, unknown> {
  const opts = q.options ?? [];
  const optional = q.required ? [] : [''];
  switch (q.kind) {
    case 'short':
    case 'paragraph':
      return { type: 'string', description: q.required ? 'Answer text' : 'Answer text, or empty to skip' };
    case 'choice':
    case 'dropdown':
    case 'scale':
    case 'rating':
      return q.hasOther
        ? { type: 'string', description: `One of ${JSON.stringify(opts)}, or a short custom answer${q.required ? '' : ', or empty to skip'}` }
        : { type: 'string', enum: [...opts, ...optional] };
    case 'checkbox':
      return { type: 'array', items: q.hasOther ? { type: 'string' } : { type: 'string', enum: opts } };
    case 'grid':
    case 'checkGrid': {
      const rows = q.rows ?? [];
      const cell = q.kind === 'grid' ? { type: 'string', enum: [...opts, ...optional] } : { type: 'array', items: { type: 'string', enum: opts } };
      return {
        type: 'object',
        properties: Object.fromEntries(rows.map((r) => [r.key, cell])),
        required: rows.map((r) => r.key),
        additionalProperties: false,
      };
    }
    case 'date':
      return { type: 'string', description: q.includeYear === false ? 'MM-DD' : 'YYYY-MM-DD' };
    case 'time':
      return { type: 'string', description: q.duration ? 'HH:MM:SS duration' : 'HH:MM, 24-hour clock' };
    default:
      return { type: 'string' };
  }
}

function describeQuestion(q: CrowdQuestion): string {
  const parts = [`[${q.key}] ${q.title || '(untitled)'} (${q.kind}${q.required ? ', required' : ', optional'})`];
  if (q.description) parts.push(`  help: ${q.description}`);
  if (q.options?.length) parts.push(`  options: ${q.options.join(' | ')}${q.hasOther ? ' | (Other: free text)' : ''}`);
  if (q.rows?.length) parts.push(`  rows: ${q.rows.map((r) => `${r.key}=${r.label}`).join(', ')}`);
  if (q.validation) parts.push(`  must satisfy: ${q.validation}`);
  return parts.join('\n');
}

export async function generateCrowd(apiKey: string, model: string, req: CrowdRequest): Promise<CrowdRespondent[]> {
  if (!apiKey) throw new AiError('Add your Claude API key in Settings first.', 'no-key');
  const count = Math.max(1, Math.min(12, Math.floor(req.count)));
  const questions = req.questions.filter((q) => q.kind !== 'file' && q.kind !== 'unsupported');
  const respondent = {
    type: 'object',
    properties: {
      persona: { type: 'string', description: 'One short line: who this person is, their mood and bias' },
      ...(req.collectsEmail ? { email: { type: 'string', description: "A plausible e-mail address matching the person's name" } } : {}),
      answers: {
        type: 'object',
        properties: Object.fromEntries(questions.map((q) => [q.key, answerSchema(q)])),
        required: questions.map((q) => q.key),
        additionalProperties: false,
      },
    },
    required: ['persona', 'answers', ...(req.collectsEmail ? ['email'] : [])],
    additionalProperties: false,
  };
  const schema = {
    type: 'object',
    properties: { respondents: { type: 'array', items: respondent } },
    required: ['respondents'],
    additionalProperties: false,
  };
  const prompt = [
    `Form: ${req.formTitle || 'Untitled form'}`,
    req.formDescription ? `About the form: ${req.formDescription.slice(0, 800)}` : '',
    '',
    'Questions:',
    ...questions.map(describeQuestion),
    '',
    `Write ${count} respondents.`,
    req.brief.trim() ? `The crowd: ${req.brief.trim()}` : 'The crowd: a realistic mix of people who would plausibly fill in this form.',
    `Overall mood mix: about ${req.mix.positive}% positive, ${req.mix.neutral}% neutral, ${req.mix.negative}% negative.`,
    req.avoid.length ? `Already written (make the new ones clearly different): ${req.avoid.slice(-30).join(' / ')}` : '',
    'Optional questions may be skipped with an empty answer when that person would not bother.',
    'Return JSON: {"respondents": [{"persona": ..., "answers": {...}}]}',
  ];
  try {
    const text = await ask(apiKey, model, prompt.filter(Boolean).join('\n'), 16000, schema, CROWD_SYSTEM);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AiError('Claude returned an unexpected format. Try again.', 'bad-output');
    }
    const list = (parsed as { respondents?: unknown }).respondents;
    if (!Array.isArray(list) || list.length === 0) throw new AiError('Claude returned no respondents. Try again.', 'bad-output');
    return list.filter((r): r is CrowdRespondent => !!r && typeof r === 'object' && typeof (r as CrowdRespondent).answers === 'object');
  } catch (e) {
    throw describeError(e);
  }
}
