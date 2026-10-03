/** Per-question strategy editors. */
import { useMemo, useState } from 'preact/hooks';
import { defaultChoice, type QuestionMeta } from '../../core/defaults';
import { expectedDistribution, sentimentHistogram } from '../../core/distributions';
import { createRng } from '../../core/rng';
import { createRespondent, generateText, SMART_KIND_LABELS, TEMPLATE_TOKENS } from '../../core/text';
import type { ChoiceConfig, ChoiceMode, CheckboxConfig, PersonaConfig, Question, QuestionConfig, SmartKind, TextConfig } from '../../core/types';
import { describeRule, satisfyText } from '../../core/validation';
import { send } from '../api';
import { Icon } from '../icons';
import { config, form, settings, showSettings, toast } from '../store';
import { Callout, Field, NumberInput, Segmented, Select, Slider, Spinner, Toggle } from './controls';

/* ------------------------------------------------------------ helpers -- */

export function optionLabel(q: Question, i: number): string {
  const o = q.options[i];
  if (!o) return '';
  if (o.isOther) return 'Other';
  if (q.kind === 'scale' && q.scaleLabels) {
    if (i === 0) return `${o.label}, ${q.scaleLabels[0]}`;
    if (i === q.options.length - 1) return `${o.label}, ${q.scaleLabels[1]}`;
  }
  return o.label || `Option ${i + 1}`;
}

/** Expected share of each option (including "Other") for display. */
export function displayDistribution(q: Question, cfg: ChoiceConfig, otherRate: number, meta: QuestionMeta, persona: PersonaConfig): number[] {
  const n = q.options.length;
  const otherIdx = q.options.findIndex((o) => o.isOther);
  const ctx = { ordinal: meta.ordering.ordinal, reversed: meta.ordering.reversed, persona };
  const explicit = cfg.mode === 'weighted' || cfg.mode === 'fixed' || (cfg.mode === 'tendency' && !meta.ordering.ordinal);
  if (explicit || otherIdx < 0) return expectedDistribution(cfg, n, ctx);
  const regular = q.options.map((_, i) => i).filter((i) => i !== otherIdx);
  const d = expectedDistribution(cfg, regular.length, ctx);
  const share = Math.min(1, Math.max(0, otherRate / 100));
  const out = new Array<number>(n).fill(0);
  regular.forEach((idx, k) => (out[idx] = d[k]! * (1 - share)));
  out[otherIdx] = share;
  return out;
}

export function DistBars({ labels, values }: { labels: string[]; values: number[] }) {
  return (
    <div class="dist">
      {labels.map((l, i) => (
        <div class="dist-row" key={i}>
          <span class="dist-label" title={l}>
            {l}
          </span>
          <span class="dist-track">
            <span class="dist-fill" style={{ width: `${Math.round((values[i] ?? 0) * 100)}%` }} />
          </span>
          <span class="dist-pct">{Math.round((values[i] ?? 0) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

export function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 0.0001);
  return (
    <span class="mini-bars" aria-hidden="true">
      {values.slice(0, 14).map((v, i) => (
        <span key={i} style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />
      ))}
    </span>
  );
}

const MODE_INFO: Record<ChoiceMode, { label: string; help: string }> = {
  persona: { label: 'Persona', help: "Answers follow each person's mood from the Crowd settings, so everything one person says fits together." },
  uniform: { label: 'Random', help: 'Every option is equally likely.' },
  tendency: { label: 'Tendency', help: 'Random, but leaning towards one option. On scales, nearby options get some of the share too.' },
  weighted: { label: 'Weighted', help: 'You set exactly how often each option is picked.' },
  fixed: { label: 'Fixed', help: 'Always the same option.' },
  cycle: { label: 'Cycle', help: 'Goes through the options in order, then starts over, so every option gets covered evenly.' },
};

/* ------------------------------------------------------------- choice -- */

export function ChoiceEditor({
  q,
  cfg,
  meta,
  onChange,
  otherRate,
  onOtherRate,
}: {
  q: Question;
  cfg: ChoiceConfig;
  meta: QuestionMeta;
  onChange: (fn: (c: ChoiceConfig) => void) => void;
  otherRate?: number;
  onOtherRate?: (v: number) => void;
}) {
  const persona = config.value!.persona;
  const n = q.options.length;
  const labels = q.options.map((_, i) => optionLabel(q, i));
  const dist = displayDistribution(q, cfg, otherRate ?? 0, meta, persona);
  const ordinal = meta.ordering.ordinal;
  const modes: ChoiceMode[] = ['persona', 'uniform', 'tendency', 'weighted', 'fixed', 'cycle'];
  const usesOtherRate = q.hasOther && onOtherRate && !(cfg.mode === 'weighted' || cfg.mode === 'fixed' || (cfg.mode === 'tendency' && !ordinal));

  return (
    <div class="stack">
      <Field label="Answer strategy" help={MODE_INFO[cfg.mode].help}>
        <Segmented
          label="Answer strategy"
          value={cfg.mode}
          options={modes.map((m) => ({ value: m, label: MODE_INFO[m].label, title: MODE_INFO[m].help }))}
          onChange={(m) =>
            onChange((c) => {
              if (m === 'weighted' && c.weights.every((w) => w === c.weights[0])) {
                // Start from the distribution the user is looking at right now.
                const cur = displayDistribution(q, c, otherRate ?? 0, meta, persona);
                c.weights = cur.map((v) => Math.round(v * 100));
              }
              c.mode = m;
            })
          }
        />
      </Field>

      {cfg.mode === 'persona' && !ordinal && (
        <Callout kind="warning">These options don't look like an ordered scale, so Persona acts like Random here. Use Tendency or Weighted to lean them.</Callout>
      )}

      {cfg.mode === 'tendency' && (
        <div class="grid-2">
          <Field label="Lean towards">
            <Select
              label="Lean towards"
              value={String(Math.round(cfg.target))}
              options={labels.map((l, i) => ({ value: String(i), label: l }))}
              onChange={(v) => onChange((c) => (c.target = Number(v)))}
            />
          </Field>
          <Field label="Strength" help="0% = plain random, 100% = always the chosen option.">
            <Slider label="Tendency strength" value={cfg.strength} onInput={(v) => onChange((c) => (c.strength = v))} />
          </Field>
        </div>
      )}

      {cfg.mode === 'fixed' && (
        <Field label="Always answer">
          <Select label="Always answer" value={String(cfg.fixed)} options={labels.map((l, i) => ({ value: String(i), label: l }))} onChange={(v) => onChange((c) => (c.fixed = Number(v)))} />
        </Field>
      )}

      {cfg.mode === 'persona' && ordinal && (
        <Toggle
          checked={cfg.reverse}
          onChange={(v) => onChange((c) => (c.reverse = v))}
          label="Reverse-scored"
          hint={`Happy people pick the "${labels[0]}" end instead of "${labels[n - 1]}"${meta.ordering.reversed ? '. Detected as a descending scale' : ''}.`}
        />
      )}

      {cfg.mode === 'weighted' ? (
        <Field label="Weights" hint="Drag to set how often each option is picked. Percentages update live.">
          <div class="dist">
            {labels.map((l, i) => (
              <div class="dist-row editable" key={i}>
                <span class="dist-label" title={l}>
                  {l}
                </span>
                <Slider label={`Weight for ${l}`} value={cfg.weights[i] ?? 0} format={() => ''} onInput={(v) => onChange((c) => (c.weights[i] = v))} />
                <span class="dist-pct">{Math.round((dist[i] ?? 0) * 100)}%</span>
              </div>
            ))}
          </div>
        </Field>
      ) : (
        <Field label="Expected distribution">
          <DistBars labels={labels} values={dist} />
        </Field>
      )}

      {usesOtherRate && (
        <Field label='How often "Other" is picked' help="How often people choose Other and type their own answer.">
          <Slider label="Other rate" value={otherRate ?? 0} max={60} onInput={(v) => onOtherRate!(v)} />
        </Field>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- checkbox -- */

export function CheckboxEditor({ q, cfg, onChange }: { q: Question; cfg: CheckboxConfig; onChange: (fn: (c: CheckboxConfig) => void) => void }) {
  const labels = q.options.map((_, i) => optionLabel(q, i));
  const avg = cfg.mode === 'weighted' ? cfg.probs.reduce((a, p) => a + p / 100, 0) : cfg.mode === 'fixed' ? cfg.fixed.length : q.options.reduce((a, o) => a + (o.isOther ? 0.06 : 0.35), 0);
  return (
    <div class="stack">
      <Field label="Selection strategy">
        <Segmented
          label="Selection strategy"
          value={cfg.mode}
          options={[
            { value: 'random', label: 'Random' },
            { value: 'weighted', label: 'Per-option chance' },
            { value: 'fixed', label: 'Fixed set' },
          ]}
          onChange={(m) => onChange((c) => (c.mode = m))}
        />
      </Field>
      {cfg.mode === 'weighted' && (
        <Field label="Chance each option is ticked">
          <div class="dist">
            {labels.map((l, i) => (
              <div class="dist-row editable" key={i}>
                <span class="dist-label" title={l}>
                  {l}
                </span>
                <Slider label={`Chance for ${l}`} value={cfg.probs[i] ?? 0} format={() => ''} onInput={(v) => onChange((c) => (c.probs[i] = v))} />
                <span class="dist-pct">{cfg.probs[i] ?? 0}%</span>
              </div>
            ))}
          </div>
        </Field>
      )}
      {cfg.mode === 'fixed' && (
        <Field label="Always tick">
          <div class="stack" style={{ gap: '6px' }}>
            {labels.map((l, i) => (
              <Toggle
                key={i}
                checked={cfg.fixed.includes(i)}
                label={l}
                onChange={(v) => onChange((c) => (c.fixed = v ? [...new Set([...c.fixed, i])].sort() : c.fixed.filter((x) => x !== i)))}
              />
            ))}
          </div>
        </Field>
      )}
      {cfg.mode !== 'fixed' && (
        <div class="row wrap">
          <Field label="Min ticks" help="0 = automatic (at least one if the question is required).">
            <NumberInput label="Minimum selections" value={cfg.min} min={0} max={q.options.length} onChange={(v) => onChange((c) => (c.min = v))} />
          </Field>
          <Field label="Max ticks" help="0 = no limit.">
            <NumberInput label="Maximum selections" value={cfg.max} min={0} max={q.options.length} onChange={(v) => onChange((c) => (c.max = v))} />
          </Field>
          <span class="faint small" style={{ alignSelf: 'flex-end', paddingBottom: '7px' }}>
            About {avg.toFixed(1)} ticked on average
          </span>
        </div>
      )}
      {q.validation?.kind === 'count' && <Callout>Form rule: {describeRule(q.validation)}. Crowdfill always respects it.</Callout>}
    </div>
  );
}

/* --------------------------------------------------------------- text -- */

const SOURCES: ReadonlyArray<{ value: TextConfig['source']; label: string }> = [
  { value: 'smart', label: 'Smart' },
  { value: 'template', label: 'Template' },
  { value: 'list', label: 'List' },
  { value: 'number', label: 'Number' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'lorem', label: 'Lorem' },
];

function useSamples(cfg: TextConfig, detected: SmartKind, q?: Question, seed = 0): string[] {
  return useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < 3; i++) {
      const rng = createRng(`sample:${seed}:${i}`);
      const respondent = createRespondent(rng, rng.next());
      const ctx = { rng, respondent, index: i, runSeed: `sample:${seed}`, key: q?.itemId ?? 'x', question: q };
      let v = generateText(cfg, ctx, detected);
      if (q?.validation) v = satisfyText(q.validation, v, rng, () => generateText(cfg, ctx, detected));
      out.push(v);
    }
    return out;
  }, [JSON.stringify(cfg), detected, q?.itemId, seed]);
}

export function crowdMix(persona: PersonaConfig) {
  const h = sentimentHistogram(persona, 20, 2000);
  const neg = Math.round(h.slice(0, 8).reduce((a, b) => a + b, 0) * 100);
  const pos = Math.round(h.slice(12).reduce((a, b) => a + b, 0) * 100);
  return { positive: pos, negative: neg, neutral: Math.max(0, 100 - pos - neg) };
}

export function TextEditor({
  cfg,
  onChange,
  detected,
  q,
  compact = false,
}: {
  cfg: TextConfig;
  onChange: (fn: (c: TextConfig) => void) => void;
  detected: SmartKind;
  q?: Question;
  compact?: boolean;
}) {
  const [seed, setSeed] = useState(0);
  const [aiCount, setAiCount] = useState(40);
  const [aiBusy, setAiBusy] = useState(false);
  const samples = useSamples(cfg, detected, q, seed);
  const listText = cfg.list.join('\n');

  const generateAi = async () => {
    if (!settings.value.apiKey) {
      toast('Add your Claude API key in Settings to generate answers.', 'info');
      showSettings.value = true;
      return;
    }
    if (!q) return;
    setAiBusy(true);
    try {
      const f = form.value!;
      const answers = await send({
        type: 'ai:generate',
        request: {
          formTitle: f.title,
          formDescription: f.description,
          question: { title: q.title, description: q.description, kind: q.kind, validation: q.validation ? describeRule(q.validation) : undefined },
          count: aiCount,
          mix: crowdMix(config.value!.persona),
        },
      });
      onChange((c) => {
        c.source = 'list';
        c.list = answers;
        c.listOrder = 'shuffle';
      });
      toast(`Claude wrote ${answers.length} answers`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error', 6000);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div class="stack">
      <Field label="Answer source">
        <Segmented label="Answer source" value={cfg.source} options={SOURCES} onChange={(s) => onChange((c) => (c.source = s))} />
      </Field>

      {cfg.source === 'smart' && (
        <Field label="Generate" hint={cfg.smartKind === 'auto' ? `Detected from the question: ${SMART_KIND_LABELS[detected]}` : undefined}>
          <Select
            label="Smart generator"
            value={cfg.smartKind}
            options={(Object.keys(SMART_KIND_LABELS) as SmartKind[]).map((k) => ({ value: k, label: k === 'auto' ? `Auto (${SMART_KIND_LABELS[detected]})` : SMART_KIND_LABELS[k] }))}
            onChange={(v) => onChange((c) => (c.smartKind = v))}
          />
        </Field>
      )}

      {cfg.source === 'template' && (
        <Field label="Template" hint="Tokens are replaced per respondent. Click a token to insert it.">
          <input class="input mono" value={cfg.template} onInput={(e) => onChange((c) => (c.template = (e.target as HTMLInputElement).value))} />
          <div class="row wrap" style={{ gap: '4px', marginTop: '4px' }}>
            {TEMPLATE_TOKENS.slice(0, compact ? 8 : undefined).map(([tok, help]) => (
              <button type="button" class="badge" style={{ cursor: 'pointer', border: 0 }} title={help} key={tok} onClick={() => onChange((c) => (c.template = `${c.template}${c.template && !c.template.endsWith(' ') ? ' ' : ''}${tok}`))}>
                {tok}
              </button>
            ))}
          </div>
        </Field>
      )}

      {cfg.source === 'list' && (
        <>
          <Field label={`Answers (${cfg.list.filter((s) => s.trim()).length})`} hint="One answer per line. Lines may contain template tokens.">
            <textarea class="textarea" rows={6} value={listText} onInput={(e) => onChange((c) => (c.list = (e.target as HTMLTextAreaElement).value.split('\n')))} />
          </Field>
          <Field label="Order">
            <Segmented
              label="List order"
              value={cfg.listOrder}
              options={[
                { value: 'random', label: 'Random', title: 'Pick any line each time' },
                { value: 'shuffle', label: 'Shuffle', title: 'Each line once (random order) before repeating' },
                { value: 'sequential', label: 'In order', title: 'Line 1, then 2, then 3, and around again' },
              ]}
              onChange={(v) => onChange((c) => (c.listOrder = v))}
            />
          </Field>
        </>
      )}

      {q && !compact && (q.kind === 'short' || q.kind === 'paragraph') && (
        <div class="card card-pad" style={{ background: 'var(--accent-soft)', borderColor: 'transparent', boxShadow: 'none' }}>
          <div class="row wrap">
            <Icon name="sparkles" size={16} />
            <div style={{ flex: '1 1 160px' }}>
              <div style={{ fontWeight: 600 }}>Write answers with Claude</div>
              <div class="faint small">Varied, human-sounding answers that match your crowd's mood. Uses your own API key.</div>
            </div>
            <NumberInput label="How many answers" value={aiCount} min={5} max={200} onChange={setAiCount} />
            <button class="btn primary sm" disabled={aiBusy} onClick={generateAi}>
              {aiBusy ? <Spinner /> : <Icon name="sparkles" size={14} />} Generate
            </button>
          </div>
        </div>
      )}

      {cfg.source === 'number' && (
        <div class="row wrap">
          <Field label="Min">
            <NumberInput label="Minimum" value={cfg.numMin} onChange={(v) => onChange((c) => (c.numMin = v))} />
          </Field>
          <Field label="Max">
            <NumberInput label="Maximum" value={cfg.numMax} onChange={(v) => onChange((c) => (c.numMax = v))} />
          </Field>
          <Field label="Decimals">
            <NumberInput label="Decimals" value={cfg.decimals} min={0} max={6} onChange={(v) => onChange((c) => (c.decimals = v))} />
          </Field>
        </div>
      )}

      {cfg.source === 'fixed' && (
        <Field label="Always answer" hint="Template tokens work here too.">
          <input class="input" value={cfg.fixed} onInput={(e) => onChange((c) => (c.fixed = (e.target as HTMLInputElement).value))} />
        </Field>
      )}

      {cfg.source === 'lorem' && (
        <div class="row wrap">
          <Field label="Min words">
            <NumberInput label="Minimum words" value={cfg.loremMin} min={1} max={500} onChange={(v) => onChange((c) => (c.loremMin = v))} />
          </Field>
          <Field label="Max words">
            <NumberInput label="Maximum words" value={cfg.loremMax} min={1} max={500} onChange={(v) => onChange((c) => (c.loremMax = v))} />
          </Field>
        </div>
      )}

      {q?.validation && q.validation.kind !== 'count' && <Callout>Form rule: {describeRule(q.validation)}. Generated answers are adjusted to pass it.</Callout>}

      <Field
        label={
          <>
            Examples
            <span class="spacer" />
            <button type="button" class="btn ghost sm" onClick={() => setSeed(seed + 1)} title="New examples">
              <Icon name="refresh" size={13} /> Reroll
            </button>
          </>
        }
      >
        <div class="stack" style={{ gap: '4px' }}>
          {samples.map((s, i) => (
            <div key={i} class="small ellipsis" style={{ padding: '6px 9px', borderRadius: '7px', background: 'var(--surface)', border: '1px solid var(--border)' }} title={s}>
              {s || <span class="faint">(empty)</span>}
            </div>
          ))}
        </div>
      </Field>
    </div>
  );
}

/* ---------------------------------------------------------- date/time -- */

export function DateEditor({ q, qc, onChange }: { q: Question; qc: QuestionConfig; onChange: (fn: (c: QuestionConfig) => void) => void }) {
  const d = qc.date;
  return (
    <div class="stack">
      <Field label="Dates">
        <Segmented
          label="Date mode"
          value={d.mode}
          options={[
            { value: 'range', label: 'Random in range' },
            { value: 'fixed', label: 'Fixed' },
            { value: 'today', label: 'Today' },
          ]}
          onChange={(m) => onChange((c) => (c.date.mode = m))}
        />
      </Field>
      {d.mode === 'range' && (
        <div class="grid-2">
          <Field label="From">
            <input class="input" type="date" value={d.from} onInput={(e) => onChange((c) => (c.date.from = (e.target as HTMLInputElement).value))} />
          </Field>
          <Field label="To">
            <input class="input" type="date" value={d.to} onInput={(e) => onChange((c) => (c.date.to = (e.target as HTMLInputElement).value))} />
          </Field>
        </div>
      )}
      {d.mode === 'fixed' && (
        <Field label="Date">
          <input class="input" type="date" value={d.fixed} onInput={(e) => onChange((c) => (c.date.fixed = (e.target as HTMLInputElement).value))} />
        </Field>
      )}
      {q.includeTime && (
        <div class="grid-2">
          <Field label="Time from">
            <input class="input" type="time" value={d.timeFrom} onInput={(e) => onChange((c) => (c.date.timeFrom = (e.target as HTMLInputElement).value))} />
          </Field>
          <Field label="Time to">
            <input class="input" type="time" value={d.timeTo} onInput={(e) => onChange((c) => (c.date.timeTo = (e.target as HTMLInputElement).value))} />
          </Field>
        </div>
      )}
      {q.includeYear === false && <div class="faint small">This question has no year, so only the month and day are sent.</div>}
    </div>
  );
}

export function TimeEditor({ q, qc, onChange }: { q: Question; qc: QuestionConfig; onChange: (fn: (c: QuestionConfig) => void) => void }) {
  const step = q.duration ? 1 : 60;
  return (
    <div class="grid-2">
      <Field label={q.duration ? 'Shortest duration' : 'Earliest'} hint={q.duration ? 'hh:mm:ss' : undefined}>
        <input class="input" type="time" step={step} value={qc.time.from} onInput={(e) => onChange((c) => (c.time.from = (e.target as HTMLInputElement).value))} />
      </Field>
      <Field label={q.duration ? 'Longest duration' : 'Latest'} hint={q.duration ? 'hh:mm:ss' : undefined}>
        <input class="input" type="time" step={step} value={qc.time.to} onInput={(e) => onChange((c) => (c.time.to = (e.target as HTMLInputElement).value))} />
      </Field>
    </div>
  );
}

/* --------------------------------------------------------------- grid -- */

export function GridEditor({ q, qc, meta, onChange }: { q: Question; qc: QuestionConfig; meta: QuestionMeta; onChange: (fn: (c: QuestionConfig) => void) => void }) {
  const [row, setRow] = useState<string>('*');
  const custom = row !== '*' && !!qc.rowChoice?.[row];
  if (q.kind === 'checkGrid') {
    return (
      <div class="stack">
        <div class="faint small">Applied to every row ({q.rows.map((r) => r.label).join(', ')}).</div>
        <CheckboxEditor q={q} cfg={qc.checkbox} onChange={(fn) => onChange((c) => fn(c.checkbox))} />
      </div>
    );
  }
  return (
    <div class="stack">
      <Field label="Rows" hint={row === '*' ? 'Settings apply to every row unless a row is customized.' : undefined}>
        <Select
          label="Row"
          value={row}
          options={[{ value: '*', label: 'All rows' }, ...q.rows.map((r) => ({ value: r.entryId, label: `${r.label}${qc.rowChoice?.[r.entryId] ? ' (custom)' : ''}` }))]}
          onChange={setRow}
        />
      </Field>
      {row !== '*' && (
        <Toggle
          checked={custom}
          label="Customize this row"
          hint="Give this row its own strategy instead of the shared one."
          onChange={(v) =>
            onChange((c) => {
              const rc = { ...(c.rowChoice ?? {}) };
              if (v) rc[row] = structuredClone(c.choice ?? defaultChoice(q.options.length, meta.ordering.ordinal));
              else delete rc[row];
              c.rowChoice = Object.keys(rc).length ? rc : undefined;
            })
          }
        />
      )}
      {(row === '*' || custom) && (
        <ChoiceEditor
          q={q}
          meta={meta}
          cfg={row === '*' ? qc.choice : qc.rowChoice![row]!}
          onChange={(fn) => onChange((c) => fn(row === '*' ? c.choice : c.rowChoice![row]!))}
        />
      )}
    </div>
  );
}
