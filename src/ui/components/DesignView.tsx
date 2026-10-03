// Design tab: the crowd and a strategy per question.
import { useMemo, useState } from 'preact/hooks';
import { applyPreset, PRESETS, type CrowdPreset, type QuestionMeta } from '../../core/defaults';
import { sentimentHistogram } from '../../core/distributions';
import { KIND_LABELS } from '../../core/parser';
import { SMART_KIND_LABELS } from '../../core/text';
import type { PersonaConfig, Question, QuestionConfig } from '../../core/types';
import { Icon } from '../icons';
import { config, form, meta, openCards, replaceConfig, toast, toggleCard, updateConfig, updateQuestion } from '../store';
import { Callout, CardHead, Disclosure, Field, Segmented, Slider } from './controls';
import { CheckboxEditor, ChoiceEditor, DateEditor, displayDistribution, GridEditor, MiniBars, optionLabel, TextEditor, TimeEditor } from './editors';
import { Collapse } from './motion';

/* ---------------------------------------------------------------- crowd -- */

function moodColor(x: number): string {
  return `hsl(${Math.round(x * 125)} 72% 54%)`;
}

function moodLabel(v: number): string {
  if (v < 20) return 'Very unhappy';
  if (v < 40) return 'Unhappy';
  if (v < 60) return 'Neutral';
  if (v < 80) return 'Happy';
  return 'Very happy';
}

export function CrowdCard() {
  const p = config.value!.persona;
  const hist = useMemo(() => sentimentHistogram(p, 24, 2500), [p.shape, p.mean, p.spread]);
  const max = Math.max(...hist, 0.0001);
  const [active, setActive] = useState<CrowdPreset | null>(null);
  const set = (patch: Partial<PersonaConfig>) => {
    setActive(null);
    updateConfig((c) => Object.assign(c.persona, patch));
  };
  return (
    <section class="card card-pad">
      <CardHead icon="users" title="Crowd" sub="Who's answering? This sets the mood for every question in Persona mode." />

      <div class="row wrap" style={{ gap: '6px', marginBottom: '16px' }}>
        {PRESETS.map((pr) => (
          <button
            type="button"
            class="chip"
            key={pr.id}
            title={pr.hint}
            aria-pressed={active === pr.id}
            onClick={() => {
              replaceConfig(applyPreset(form.value!, config.value!, pr.id));
              setActive(pr.id);
              toast(`${pr.label} crowd applied`, 'success');
            }}
          >
            {pr.label}
          </button>
        ))}
      </div>

      <div class="histo" aria-label="How moods are spread across the crowd">
        {hist.map((h, i) => (
          <span key={i} style={{ height: `${Math.max(3, (h / max) * 100)}%`, background: moodColor(i / (hist.length - 1)) }} />
        ))}
      </div>
      <div class="histo-axis">
        <span>Unhappy</span>
        <span>Neutral</span>
        <span>Happy</span>
      </div>

      <div class="stack" style={{ marginTop: '16px', gap: '12px' }}>
        <Field label="Shape">
          <Segmented
            label="Crowd shape"
            value={p.shape}
            options={[
              { value: 'bell', label: 'Bell curve', title: 'Most people sit near the average mood' },
              { value: 'polarized', label: 'Polarized', title: 'Two camps, happy and unhappy' },
              { value: 'uniform', label: 'Anything goes', title: 'Moods spread out evenly' },
            ]}
            onChange={(shape) => set({ shape })}
          />
        </Field>
        <Collapse open={p.shape !== 'uniform'}>
          <div class="stack" style={{ gap: '12px' }}>
            <Field label={p.shape === 'polarized' ? 'Share of happy people' : 'Average mood'} help="Left means negative answers, right means positive answers.">
              <Slider
                variant="mood"
                label="Average mood"
                value={p.mean}
                onInput={(mean) => set({ mean })}
                format={(v) => (p.shape === 'polarized' ? `${v}%` : moodLabel(v))}
              />
            </Field>
            <Field label="Diversity" help="How different people are from each other.">
              <Slider label="Diversity" value={p.spread} onInput={(spread) => set({ spread })} />
            </Field>
          </div>
        </Collapse>
        <Field label="Consistency" help="How closely each answer follows a person's mood. Low is noisy, high is very consistent.">
          <Slider label="Consistency" value={p.consistency} onInput={(consistency) => set({ consistency })} />
        </Field>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ questions -- */

function strategySummary(q: Question, qc: QuestionConfig, m: QuestionMeta): string {
  switch (q.kind) {
    case 'short':
    case 'paragraph': {
      const t = qc.text;
      if (t.source === 'smart') return `Smart: ${SMART_KIND_LABELS[t.smartKind === 'auto' ? m.smartKind : t.smartKind]}`;
      if (t.source === 'list') return `List of ${t.list.filter((s) => s.trim()).length} answers`;
      if (t.source === 'number') return `Number from ${t.numMin} to ${t.numMax}`;
      if (t.source === 'template') return `Template: ${t.template}`;
      if (t.source === 'fixed') return `Always "${t.fixed}"`;
      return 'Lorem ipsum';
    }
    case 'checkbox':
    case 'checkGrid':
      return qc.checkbox.mode === 'random' ? 'Random ticks' : qc.checkbox.mode === 'weighted' ? 'Chance per option' : `Always ${qc.checkbox.fixed.length} ticked`;
    case 'date':
      return qc.date.mode === 'range' ? `${qc.date.from} to ${qc.date.to}` : qc.date.mode === 'fixed' ? qc.date.fixed : 'Today';
    case 'time':
      return `${qc.time.from} to ${qc.time.to}`;
    case 'file':
    case 'unsupported':
      return 'Skipped';
    default: {
      const c = qc.choice;
      if (c.mode === 'tendency') return `Leans to "${optionLabel(q, Math.round(c.target))}" at ${c.strength}%`;
      if (c.mode === 'fixed') return `Always "${optionLabel(q, c.fixed)}"`;
      const labels: Record<string, string> = { uniform: 'Random', weighted: 'Weighted', cycle: 'Cycles through options', persona: m.ordering.ordinal ? 'Follows the crowd' : 'Random' };
      return labels[c.mode] + (q.kind === 'grid' && qc.rowChoice ? ', custom rows' : '');
    }
  }
}

function QuestionCard({ q, n, i }: { q: Question; n: number; i: number }) {
  const qc = config.value!.questions[q.itemId];
  const m = meta.value.get(q.itemId);
  if (!qc || !m) return null;
  const open = openCards.value.has(q.itemId);
  const choiceLike = ['choice', 'dropdown', 'scale', 'rating', 'grid'].includes(q.kind);
  const dist = choiceLike ? displayDistribution(q, qc.choice, qc.otherRate, m, config.value!.persona) : null;
  const onChange = (fn: (c: QuestionConfig) => void) => updateQuestion(q.itemId, fn);
  const skipped = q.kind === 'file' || q.kind === 'unsupported';

  return (
    <article class={`card qcard ${open ? 'open' : ''}`} style={{ '--i': i }}>
      <button type="button" class="qhead" aria-expanded={open} onClick={() => toggleCard(q.itemId)}>
        <span class="qnum">{n}</span>
        <span style={{ minWidth: 0 }}>
          <div class="qtitle">
            {q.title || <span class="faint">Untitled question</span>} {q.required && <span class="req" title="Required">*</span>}
          </div>
          <div class="qmeta">
            <span class="badge">{KIND_LABELS[q.kind]}</span>
            {m.ordering.ordinal && choiceLike && (
              <span class="badge accent" title="An ordered scale, so Persona mode works here">
                Scale
              </span>
            )}
            {q.validation && <span class="badge warning">Has rules</span>}
            {!q.required && !skipped && qc.answerRate < 100 && <span class="badge">{qc.answerRate}% answer</span>}
            <span class="qsummary ellipsis">{strategySummary(q, qc, m)}</span>
          </div>
        </span>
        <span class="row" style={{ gap: '8px' }}>
          {dist && <MiniBars values={dist} />}
          <Icon name="chevron" class="qchev" />
        </span>
      </button>
      <Collapse open={open}>
        <div class="qbody">
          <div class="stack">
            {q.description && <div class="faint small">{q.description}</div>}
            {(q.kind === 'choice' || q.kind === 'dropdown' || q.kind === 'scale' || q.kind === 'rating') && (
              <ChoiceEditor
                q={q}
                cfg={qc.choice}
                meta={m}
                onChange={(fn) => onChange((c) => fn(c.choice))}
                otherRate={qc.otherRate}
                onOtherRate={(v) => onChange((c) => (c.otherRate = v))}
              />
            )}
            {(q.kind === 'grid' || q.kind === 'checkGrid') && <GridEditor q={q} qc={qc} meta={m} onChange={onChange} />}
            {q.kind === 'checkbox' && <CheckboxEditor q={q} cfg={qc.checkbox} onChange={(fn) => onChange((c) => fn(c.checkbox))} />}
            {(q.kind === 'short' || q.kind === 'paragraph') && <TextEditor q={q} cfg={qc.text} detected={m.smartKind} onChange={(fn) => onChange((c) => fn(c.text))} />}
            {q.kind === 'date' && <DateEditor q={q} qc={qc} onChange={onChange} />}
            {q.kind === 'time' && <TimeEditor q={q} qc={qc} onChange={onChange} />}
            {q.kind === 'file' && (
              <Callout kind={q.required ? 'danger' : 'info'}>
                File uploads need a signed-in Google account, so Crowdfill can't answer them.{' '}
                {q.required ? "This one is required, which means Google will reject responses that reach it." : "It'll be left empty."}
              </Callout>
            )}
            {q.kind === 'unsupported' && <Callout kind="warning">This question type isn't supported yet and will be left empty.</Callout>}

            {q.hasOther && (q.kind === 'choice' || q.kind === 'checkbox') && (
              <Disclosure title='Text for the "Other" option'>
                <TextEditor cfg={qc.otherText} detected="short" compact onChange={(fn) => onChange((c) => fn(c.otherText))} />
              </Disclosure>
            )}

            {!q.required && !skipped && (
              <Field label="Answer rate" help="This question is optional. How often should people answer it at all?">
                <Slider label="Answer rate" value={qc.answerRate} onInput={(v) => onChange((c) => (c.answerRate = v))} />
              </Field>
            )}
          </div>
        </div>
      </Collapse>
    </article>
  );
}

export function QuestionList() {
  const f = form.value!;
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const allOpen = f.questions.length > 0 && f.questions.every((q) => openCards.value.has(q.itemId));
  let i = 0;
  return (
    <div class="stack">
      <div class="row">
        <input class="input" placeholder={`Search ${f.questions.length} questions`} value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} />
        <button class="btn" onClick={() => (openCards.value = allOpen ? new Set() : new Set(f.questions.map((q) => q.itemId)))}>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      {f.emailMode !== 'none' && <EmailCard />}
      {f.sections.map((s, si) => {
        const qs = f.questions.filter((q) => q.section === si);
        const visible = qs.filter((q) => !needle || `${q.title} ${q.description}`.toLowerCase().includes(needle));
        if (visible.length === 0 && needle) return null;
        return (
          <div class="stack stagger" key={si} style={{ gap: '8px' }}>
            {f.sections.length > 1 && (
              <div class="section-label" title={s.description} style={{ '--i': i++ }}>
                Section {si + 1}
                {s.title ? `: ${s.title}` : ''}
                {s.next.kind === 'submit' && <span class="badge">then submit</span>}
                {s.next.kind === 'section' && <span class="badge">then section {s.next.index + 1}</span>}
              </div>
            )}
            {qs.length === 0 && <div class="faint small" style={{ padding: '0 4px' }}>No questions in this section.</div>}
            {visible.map((q) => (
              <QuestionCard key={q.itemId} q={q} n={f.questions.indexOf(q) + 1} i={i++} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function EmailCard() {
  const f = form.value!;
  const [open, setOpen] = useState(false);
  if (f.emailMode === 'verified') {
    return (
      <Callout kind="warning">
        This form collects <b>verified</b> e-mail addresses, so respondents must be signed in. Responses will come from your own Google account (turn on "Submit as signed-in user"
        under Run).
      </Callout>
    );
  }
  return (
    <article class={`card qcard ${open ? 'open' : ''}`}>
      <button type="button" class="qhead" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span class="qnum">@</span>
        <span>
          <div class="qtitle">
            E-mail address <span class="req">*</span>
          </div>
          <div class="qmeta">
            <span class="badge">Collected by the form</span>
            <span class="qsummary">Matches each person's name</span>
          </div>
        </span>
        <Icon name="chevron" class="qchev" />
      </button>
      <Collapse open={open}>
        <div class="qbody">
          <div class="stack">
            <TextEditor cfg={config.value!.email} detected="email" compact onChange={(fn) => updateConfig((c) => fn(c.email))} />
          </div>
        </div>
      </Collapse>
    </article>
  );
}

function FormNotes() {
  const f = form.value!;
  const branches = f.questions.some((q) => q.options.some((o) => o.nav && o.nav.kind !== 'next')) || f.sections.some((s) => s.next.kind !== 'next');
  const requiredFile = f.questions.some((q) => q.kind === 'file' && q.required);
  return (
    <>
      {branches && (
        <Callout>
          This form <b>branches</b> between sections. Crowdfill follows it like a real person would, so later sections depend on earlier answers.
        </Callout>
      )}
      {requiredFile && <Callout kind="danger">A required file upload can't be answered automatically. Google will reject responses that reach it.</Callout>}
    </>
  );
}

export function DesignView() {
  return (
    <div class="split">
      <div class="sticky stack">
        <CrowdCard />
        <FormNotes />
      </div>
      <QuestionList />
    </div>
  );
}
