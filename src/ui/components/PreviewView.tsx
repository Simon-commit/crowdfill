/** Preview tab: dry-run the generator, inspect distributions, export, autofill. */
import { Fragment } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { OTHER_VALUE } from '../../core/constants';
import { ResponseGenerator } from '../../core/generator';
import { publicIdFromUrl } from '../../core/parser';
import { answerText, buildPrefillUrl, toCsv } from '../../core/payload';
import { randomSeed } from '../../core/rng';
import type { FormModel, GeneratedResponse, Question } from '../../core/types';
import { download, send, slug } from '../api';
import { Icon } from '../icons';
import { activeTab, config, form, toast } from '../store';
import { Callout, CardHead, Segmented } from './controls';
import { AI_CROWD } from './DataView';
import { DistBars, optionLabel } from './editors';

const SIZES = [20, 100, 500, 2000] as const;

function observed(q: Question, responses: GeneratedResponse[]): { labels: string[]; values: number[]; answered: number } | null {
  const n = q.options.length;
  if (!n) return null;
  const counts = new Array<number>(n).fill(0);
  let answered = 0;
  let denom = 0;
  const idx = (v: string) => (v === OTHER_VALUE ? q.options.findIndex((o) => o.isOther) : q.options.findIndex((o) => o.label === v));
  for (const r of responses) {
    const a = r.answers[q.itemId];
    if (!a) continue;
    answered++;
    if (a.t === 'choice') {
      const i = idx(a.v);
      if (i >= 0) counts[i]!++;
      denom++;
    } else if (a.t === 'multi') {
      for (const v of a.v) {
        const i = idx(v);
        if (i >= 0) counts[i]!++;
      }
      denom++;
    } else if (a.t === 'grid') {
      for (const vals of Object.values(a.rows)) {
        for (const v of vals) {
          const i = idx(v);
          if (i >= 0) counts[i]!++;
        }
        if (q.kind === 'grid') denom++;
      }
      if (q.kind === 'checkGrid') denom += q.rows.length;
    }
  }
  const values = counts.map((c) => (denom ? c / denom : 0));
  return { labels: q.options.map((_, i) => optionLabel(q, i)), values, answered };
}

function averageScore(q: Question, responses: GeneratedResponse[]): number | null {
  if (q.kind !== 'scale' && q.kind !== 'rating') return null;
  const vals = responses.flatMap((r) => {
    const a = r.answers[q.itemId];
    return a?.t === 'choice' && Number.isFinite(Number(a.v)) ? [Number(a.v)] : [];
  });
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function ResponseCard({ f, r, onFill, canFill, persona }: { f: FormModel; r: GeneratedResponse; onFill: (r: GeneratedResponse) => void; canFill: boolean; persona?: string }) {
  const rows = f.questions.filter((q) => r.answers[q.itemId]);
  return (
    <div class="resp">
      <div class="resp-head">
        <b>#{r.index + 1}</b>
        <span class="faint ellipsis" style={{ flex: 1 }}>
          {persona ?? `${r.respondent.firstName} ${r.respondent.lastName}`}
          {f.sections.length > 1 && <span class="dot-sep">sections {r.path.map((p) => p + 1).join(', ')}</span>}
        </span>
        <span class="mood-meter" title={`Mood ${Math.round(r.respondent.sentiment * 100)} out of 100`}>
          <i style={{ left: `${r.respondent.sentiment * 100}%` }} />
        </span>
        <button class="btn ghost sm icon" title="Open as pre-filled link" onClick={() => chrome.tabs.create({ url: buildPrefillUrl(f, r) })}>
          <Icon name="external" size={13} />
        </button>
        <button class="btn ghost sm icon" title={canFill ? 'Fill the open form tab with this response' : 'Open this form in the current tab to fill it'} disabled={!canFill} onClick={() => onFill(r)}>
          <Icon name="pointer" size={13} />
        </button>
      </div>
      <dl>
        {r.email && (
          <>
            <dt>E-mail</dt>
            <dd>{r.email}</dd>
          </>
        )}
        {rows.map((q) => (
          <Fragment key={q.itemId}>
            <dt class="ellipsis" title={q.title}>
              {q.title || 'Untitled'}
            </dt>
            <dd>{answerText(q, r.answers[q.itemId])}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

export function PreviewView() {
  const f = form.value!;
  const cfg = config.value!;
  const [size, setSize] = useState<(typeof SIZES)[number]>(100);
  const [seed, setSeed] = useState(() => cfg.run.seed || randomSeed());
  const [shown, setShown] = useState(10);

  const responses = useMemo(() => {
    const gen = new ResponseGenerator(f, cfg, { runSeed: seed, followBranching: cfg.run.followBranching });
    return Array.from({ length: size }, (_, i) => gen.generate(i));
  }, [f, cfg, seed, size]);

  const tab = activeTab.value;
  const canFill = !!tab?.isForm && publicIdFromUrl(tab.url) === f.id;

  const fill = async (r: GeneratedResponse) => {
    if (!tab) return;
    try {
      const report = await send({ type: 'page:autofill', tabId: tab.id, form: f, response: r });
      const extra = report.notOnPage ? `, ${report.notOnPage} on other pages` : '';
      toast(`Filled ${report.filled} question${report.filled === 1 ? '' : 's'}${extra}${report.skipped ? `, ${report.skipped} skipped` : ''}`, report.skipped ? 'info' : 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const choiceQs = f.questions.filter((q) => q.options.length > 0);
  const ds = cfg.dataset;
  const personaCol = ds?.name === AI_CROWD ? ds.headers.indexOf('Persona') : -1;
  const personaFor = (i: number) => (ds && personaCol >= 0 && ds.order === 'sequential' ? ds.rows[i % ds.rows.length]?.[personaCol] || undefined : undefined);

  return (
    <div class="split">
      <div class="sticky stack">
        <section class="card card-pad">
          <CardHead icon="eye" title="Dry run" sub="Everything is generated right here. Nothing is sent." />
          <div class="stack">
            <Segmented label="Sample size" value={String(size)} options={SIZES.map((s) => ({ value: String(s), label: `${s}` }))} onChange={(v) => setSize(Number(v) as (typeof SIZES)[number])} />
            <div class="row">
              <span class="faint small">Seed</span>
              <span class="mono ellipsis" style={{ flex: 1 }}>
                {seed}
              </span>
              <button class="btn sm" onClick={() => setSeed(randomSeed())}>
                <Icon name="dice" size={13} /> Reroll
              </button>
            </div>
            <div class="row wrap">
              <button class="btn" onClick={() => download(`${slug(f.title)}-sample.csv`, toCsv(f, responses), 'text/csv')}>
                <Icon name="download" size={14} /> CSV
              </button>
              <button class="btn" onClick={() => download(`${slug(f.title)}-sample.json`, JSON.stringify(responses, null, 2), 'application/json')}>
                <Icon name="download" size={14} /> JSON
              </button>
              <button
                class="btn"
                onClick={async () => {
                  await navigator.clipboard.writeText(buildPrefillUrl(f, responses[0]!));
                  toast('Pre-filled link copied', 'success');
                }}
              >
                <Icon name="link" size={14} /> Copy link #1
              </button>
            </div>
            {!canFill && (
              <Callout>
                Open this form in the current tab to use <b>Fill this page</b> <Icon name="pointer" size={12} />. It's a nice way to check a response with your own eyes before a run.
              </Callout>
            )}
          </div>
        </section>

        {choiceQs.length > 0 && (
          <section class="card card-pad">
            <CardHead icon="sliders" title="How the answers came out" sub={`Across ${size} sample responses`} />
            <div class="stack">
              {choiceQs.map((q) => {
                const o = observed(q, responses);
                if (!o) return null;
                const avg = averageScore(q, responses);
                return (
                  <div key={q.itemId}>
                    <div class="row small" style={{ marginBottom: '6px' }}>
                      <b class="ellipsis" style={{ flex: 1 }} title={q.title}>
                        {q.title || 'Untitled'}
                      </b>
                      {avg !== null && <span class="badge accent">avg {avg.toFixed(2)}</span>}
                      <span class="faint">{Math.round((o.answered / size) * 100)}% answered</span>
                    </div>
                    <DistBars labels={o.labels} values={o.values} />
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <div class="stack stagger">
        {responses.slice(0, shown).map((r) => (
          <div key={`${seed}-${r.index}`} style={{ '--i': r.index % 20 }}>
            <ResponseCard f={f} r={r} onFill={fill} canFill={canFill} persona={personaFor(r.index)} />
          </div>
        ))}
        {shown < responses.length && (
          <button class="btn block" onClick={() => setShown(shown + 20)}>
            Show more ({responses.length - shown} left)
          </button>
        )}
      </div>
    </div>
  );
}
