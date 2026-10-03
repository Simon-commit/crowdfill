// Data tab: AI crowd, dataset replay, and strategy files.
import { useRef, useState } from 'preact/hooks';
import { createConfig, reconcileConfig } from '../../core/defaults';
import { describeRule } from '../../core/validation';
import { autoMapColumns, columnsFor, parseCsv } from '../../core/payload';
import type { Dataset, FormConfig, FormModel } from '../../core/types';
import type { CrowdQuestion, CrowdRespondent } from '../../shared/messages';
import { download, send, slug } from '../api';
import { Icon } from '../icons';
import { config, form, replaceConfig, settings, showSettings, toast, updateConfig } from '../store';
import { Callout, CardHead, Disclosure, Field, NumberInput, Segmented } from './controls';
import { crowdMix } from './editors';
import { Collapse } from './motion';

export const AI_CROWD = 'AI crowd';
const PERSONA_HEADER = 'Persona';
const BATCH = 8;

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

/* ------------------------------------------------------------- AI crowd -- */

const BRIEFS: ReadonlyArray<[string, string]> = [
  ['Mixed customers', 'A realistic mix of customers: regulars, first-timers, families, students and busy professionals.'],
  ['Price-sensitive', 'Mostly price-sensitive students and young people who compare everything and notice small annoyances.'],
  ['Loyal fans', 'Loyal regulars who love the place, with a few long-time fans who are disappointed by recent changes.'],
  ['Upset by a change', 'People reacting to a recent change they dislike: some angry, some sarcastic, a few who defend it.'],
  ['Business users', 'Busy professionals and managers who care about speed, reliability and value for money.'],
  ['Skeptics', 'Skeptical, hard-to-please respondents who give low scores unless something is clearly excellent.'],
];

function crowdQuestions(f: FormModel): CrowdQuestion[] {
  return f.questions
    .filter((q) => q.kind !== 'file' && q.kind !== 'unsupported')
    .map((q) => ({
      key: `q${q.itemId}`,
      title: q.title,
      description: q.description,
      kind: q.kind,
      required: q.required,
      options: q.options.filter((o) => !o.isOther).map((o) => o.label),
      hasOther: q.hasOther,
      rows: q.rows.length ? q.rows.map((r) => ({ key: `r${r.entryId}`, label: r.label })) : undefined,
      validation: q.validation ? describeRule(q.validation) : undefined,
      includeYear: q.includeYear,
      includeTime: q.includeTime,
      duration: q.duration,
    }));
}

/** Turns Claude's respondents into a dataset that the generator replays row by row. */
function crowdToDataset(f: FormModel, people: CrowdRespondent[]): Dataset {
  const cols = columnsFor(f);
  const headers = [...cols.map((c) => c.header), PERSONA_HEADER];
  const text = (v: unknown): string => (Array.isArray(v) ? v.map(String).join(', ') : v == null ? '' : String(v));
  const rows = people.map((p) => [
    ...cols.map((c) => {
      if (c.key === 'emailAddress') return p.email ?? '';
      const q = c.question!;
      const a = p.answers[`q${q.itemId}`];
      if (c.rowEntryId) return text((a as Record<string, unknown> | undefined)?.[`r${c.rowEntryId}`]);
      return text(a);
    }),
    p.persona ?? '',
  ]);
  const mapping = Object.fromEntries(cols.map((c, i) => [c.key, i]));
  return { name: AI_CROWD, headers, rows, mapping, order: 'sequential' };
}

const AVATAR_COLORS = ['#5b5bf6', '#a24df2', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#ef4444', '#8b5cf6'];

function initials(persona: string, i: number): string {
  const words = persona.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return words.length ? words[0]!.slice(0, 1).toUpperCase() + (words[1]?.slice(0, 1).toUpperCase() ?? '') : String(i + 1);
}

function AiCrowdCard() {
  const f = form.value!;
  const cfg = config.value!;
  const ds = cfg.dataset;
  const [brief, setBrief] = useState(BRIEFS[0]![1]);
  const [count, setCount] = useState(24);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cancel = useRef(false);
  const mix = crowdMix(cfg.persona);
  const hasCrowd = ds?.name === AI_CROWD;

  const generate = async () => {
    if (!settings.value.apiKey) {
      toast('Add your Claude API key in Settings first', 'info');
      showSettings.value = true;
      return;
    }
    cancel.current = false;
    const people: CrowdRespondent[] = [];
    const questions = crowdQuestions(f);
    setProgress({ done: 0, total: count });
    try {
      while (people.length < count && !cancel.current) {
        const batch = Math.min(BATCH, count - people.length);
        const result = await send({
          type: 'ai:crowd',
          request: {
            formTitle: f.title,
            formDescription: f.description,
            collectsEmail: f.emailMode === 'input',
            questions,
            count: batch,
            brief,
            mix,
            avoid: people.map((p) => p.persona),
          },
        });
        people.push(...result.slice(0, batch));
        setProgress({ done: people.length, total: count });
      }
      if (people.length) {
        const dataset = crowdToDataset(f, people);
        updateConfig((c) => {
          c.dataset = dataset;
          c.run.count = dataset.rows.length;
        });
        toast(`${people.length} people are ready to answer`, 'success');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error', 6000);
      if (people.length) {
        const dataset = crowdToDataset(f, people);
        updateConfig((c) => {
          c.dataset = dataset;
          c.run.count = dataset.rows.length;
        });
      }
    } finally {
      setProgress(null);
    }
  };

  const personaCol = hasCrowd ? ds!.headers.indexOf(PERSONA_HEADER) : -1;

  return (
    <section class="card card-pad">
      <CardHead icon="sparkles" title="AI crowd" sub="Claude invents people with their own moods, habits and biases, then answers the whole form as each of them." />
      <div class="stack">
        <Field label="Who's in the crowd?" hint="Describe customer types, moods and biases. The more specific, the more character in the answers.">
          <textarea class="textarea" rows={3} value={brief} onInput={(e) => setBrief((e.target as HTMLTextAreaElement).value)} />
          <div class="row wrap" style={{ gap: '5px', marginTop: '6px' }}>
            {BRIEFS.map(([label, text]) => (
              <button type="button" class="chip" key={label} aria-pressed={brief === text} onClick={() => setBrief(text)}>
                {label}
              </button>
            ))}
          </div>
        </Field>
        <div class="row wrap">
          <Field label="People">
            <NumberInput label="Number of people" value={count} min={1} max={200} onChange={(v) => setCount(Math.round(v))} />
          </Field>
          <div class="faint small" style={{ flex: 1, alignSelf: 'flex-end', paddingBottom: '8px' }}>
            Mood mix from your Crowd settings: {mix.positive}% happy, {mix.neutral}% neutral, {mix.negative}% unhappy.
          </div>
        </div>

        {progress ? (
          <div class="stack" style={{ gap: '8px' }}>
            <div class="progress live">
              <span class="ok" style={{ width: `${Math.max(4, (progress.done / progress.total) * 100)}%` }} />
            </div>
            <div class="row small">
              <span class="muted">
                Writing people {progress.done + 1} to {Math.min(progress.total, progress.done + BATCH)} of {progress.total}
              </span>
              <span class="spacer" />
              <button class="btn sm ghost" onClick={() => (cancel.current = true)}>
                Stop after this batch
              </button>
            </div>
          </div>
        ) : (
          <button class="btn primary block" onClick={generate}>
            <Icon name="sparkles" size={15} /> {hasCrowd ? 'Write a new crowd' : 'Write the crowd'}
          </button>
        )}

        <Collapse open={hasCrowd && !progress}>
          {hasCrowd && (
            <div class="stack" style={{ gap: '10px' }}>
              <div class="row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{ds!.rows.length} people ready</b>
                  <div class="faint small">Runs use them in order, one response each.</div>
                </div>
                <button class="btn sm danger" onClick={() => updateConfig((c) => (c.dataset = null))}>
                  Clear
                </button>
              </div>
              <div class="persona-list">
                {ds!.rows.map((row, i) => (
                  <div class="persona" key={i} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                    <span class="avatar" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                      {initials(row[personaCol] ?? '', i)}
                    </span>
                    <span>{row[personaCol] || `Person ${i + 1}`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Collapse>
        {!settings.value.apiKey && <div class="faint small">Needs a Claude API key, which you can add in Settings. You only pay Anthropic for what you generate.</div>}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- dataset -- */

function DatasetCard() {
  const f = form.value!;
  const ds = config.value!.dataset;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const load = async (file: File) => {
    try {
      const rows = parseCsv(await readFile(file));
      if (rows.length < 2) throw new Error('The file needs a header row and at least one row of answers.');
      const [headers, ...data] = rows;
      const mapping = autoMapColumns(f, headers!);
      updateConfig((c) => {
        c.dataset = { name: file.name, headers: headers!, rows: data, mapping, order: 'sequential' };
        c.run.count = data.length;
      });
      toast(`${data.length} rows loaded, ${Object.keys(mapping).length} columns matched`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const cols = columnsFor(f);
  const isCsv = ds && ds.name !== AI_CROWD;

  return (
    <section class="card card-pad">
      <CardHead icon="database" title="Replay a spreadsheet" sub="Send rows from a CSV, like a Google Forms response export. Questions without a column keep their strategy." />
      {!isCsv ? (
        <div
          class={`dropzone ${over ? 'over' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const file = e.dataTransfer?.files[0];
            if (file) void load(file);
          }}
        >
          <Icon name="upload" size={22} />
          <b>Drop a CSV here, or click to choose one</b>
          <span class="small faint">Headers are matched to question titles. Grid rows use "Question [Row]".</span>
          {ds?.name === AI_CROWD && <span class="small faint">Loading a file replaces the current AI crowd.</span>}
        </div>
      ) : (
        <div class="stack">
          <div class="row">
            <Icon name="file" size={15} />
            <b class="ellipsis" style={{ flex: 1 }}>
              {ds.name}
            </b>
            <span class="badge">{ds.rows.length} rows</span>
            <button class="btn sm danger" onClick={() => updateConfig((c) => (c.dataset = null))}>
              Remove
            </button>
          </div>
          <Field label="Row order">
            <Segmented
              label="Row order"
              value={ds.order}
              options={[
                { value: 'sequential', label: 'In order', title: 'Row 1 for the first response, row 2 for the second, and so on' },
                { value: 'random', label: 'Random rows', title: 'Each response picks a random row' },
              ]}
              onChange={(v) => updateConfig((c) => (c.dataset!.order = v))}
            />
          </Field>
          <Disclosure title="Column matching" defaultOpen>
            <table class="map-table">
              <tbody>
                {cols.map((col) => (
                  <tr key={col.key}>
                    <td class="ellipsis" style={{ maxWidth: '0', width: '55%' }} title={col.header}>
                      {col.header}
                    </td>
                    <td>
                      <select
                        class="select sm"
                        value={String(ds.mapping[col.key] ?? -1)}
                        aria-label={`Column for ${col.header}`}
                        onChange={(e) =>
                          updateConfig((c) => {
                            const v = Number((e.target as HTMLSelectElement).value);
                            if (v < 0) delete c.dataset!.mapping[col.key];
                            else c.dataset!.mapping[col.key] = v;
                          })
                        }
                      >
                        <option value="-1">Use the strategy</option>
                        {ds.headers.map((h, i) => (
                          <option key={i} value={String(i)}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Disclosure>
          <Callout>Choice values must match option labels (capitals don't matter). Unknown values go into "Other" when the question has one.</Callout>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
        hidden
        onChange={(e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) void load(file);
          (e.target as HTMLInputElement).value = '';
        }}
      />
    </section>
  );
}

/* --------------------------------------------------------- strategy file -- */

function ConfigCard() {
  const f = form.value!;
  const input = useRef<HTMLInputElement>(null);
  return (
    <section class="card card-pad">
      <CardHead icon="sliders" title="Strategy file" sub="Save your setup for this form, share it, or keep it in version control." />
      <div class="row wrap">
        <button class="btn" onClick={() => download(`${slug(f.title)}.crowdfill.json`, JSON.stringify(config.value, null, 2), 'application/json')}>
          <Icon name="download" size={14} /> Export
        </button>
        <button class="btn" onClick={() => input.current?.click()}>
          <Icon name="upload" size={14} /> Import
        </button>
        <span class="spacer" />
        <button
          class="btn danger"
          onClick={() => {
            if (!confirm('Reset every question to its default strategy?')) return;
            replaceConfig(createConfig(f));
            toast('Back to defaults', 'success');
          }}
        >
          <Icon name="refresh" size={14} /> Reset
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          (e.target as HTMLInputElement).value = '';
          if (!file) return;
          try {
            const parsed = JSON.parse(await readFile(file)) as FormConfig;
            if (parsed.version !== 1 || typeof parsed.questions !== 'object') throw new Error("That isn't a Crowdfill strategy file.");
            const sameForm = parsed.formId === f.id;
            replaceConfig(reconcileConfig(f, { ...parsed, formId: f.id }));
            toast(sameForm ? 'Strategy imported' : 'Imported from another form. Matching questions were updated', 'success');
          } catch (err) {
            toast(err instanceof Error ? err.message : String(err), 'error');
          }
        }}
      />
    </section>
  );
}

export function DataView() {
  return (
    <div class="split">
      <div class="sticky stack">
        <AiCrowdCard />
      </div>
      <div class="stack">
        <DatasetCard />
        <ConfigCard />
      </div>
    </div>
  );
}
