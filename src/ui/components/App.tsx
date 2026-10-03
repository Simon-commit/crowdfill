// App shell: header, tabs, landing screen, dialogs and the toast.
import { useRef, useState } from 'preact/hooks';
import { publicIdFromUrl } from '../../core/parser';
import { legalUrl } from '../../shared/brand';
import { Icon, Logo } from '../icons';
import {
  activeTab,
  closeForm,
  currentToast,
  dismissToast,
  form,
  isRunning,
  loadError,
  loadForm,
  loading,
  ready,
  recent,
  run,
  saveSettings,
  settings,
  showSettings,
  view,
  type View,
} from '../store';
import { Callout, Spinner } from './controls';
import { DataView } from './DataView';
import { DesignView } from './DesignView';
import { usePresence, useScrolled, useThumb } from './motion';
import { PreviewView } from './PreviewView';
import { RunView } from './RunView';
import { SettingsView } from './SettingsView';

const TABS: ReadonlyArray<{ id: View; label: string; icon: string }> = [
  { id: 'design', label: 'Design', icon: 'sliders' },
  { id: 'preview', label: 'Preview', icon: 'eye' },
  { id: 'run', label: 'Run', icon: 'rocket' },
  { id: 'data', label: 'Data', icon: 'database' },
];

const ERROR_HINTS: Record<string, string> = {
  'login-required': 'This form only accepts signed-in Google users. Sign in to Google in this browser and try again.',
  closed: 'The owner has stopped accepting responses.',
  'not-a-form': 'Make sure the link opens the form itself. It usually ends in /viewform.',
  'invalid-url': "Paste the link you'd share with respondents, like https://docs.google.com/forms/d/e/.../viewform or https://forms.gle/...",
};

/* --------------------------------------------------------------- landing -- */

function LoadingSkeleton() {
  return (
    <div class="stack" aria-busy="true" aria-label="Loading form">
      <div class="skeleton" style={{ height: '232px' }} />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} class="skeleton" style={{ height: '68px', animationDelay: `${i * 90}ms` }} />
      ))}
    </div>
  );
}

function Landing() {
  const [url, setUrl] = useState('');
  const tab = activeTab.value;
  const err = loadError.value;
  const busy = loading.value;
  const submit = (e: Event) => {
    e.preventDefault();
    if (url.trim()) void loadForm(url.trim());
  };

  if (busy) return <LoadingSkeleton />;

  return (
    <div class="stack stagger" style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div class="hero" style={{ '--i': 0 }}>
        <div class="hero-logo-wrap">
          <Logo size={60} />
        </div>
        <h1>
          A crowd of respondents,
          <br />
          <em>ready when you are.</em>
        </h1>
        <p>Design how people answer, preview every response, then fill your Google Form with as many as you need.</p>
      </div>

      {tab?.isForm && (
        <button class="btn primary lg block" style={{ '--i': 1 }} onClick={() => void loadForm(tab.url)}>
          <Icon name="wand" size={16} /> Use the form in this tab
        </button>
      )}

      <form class="card card-pad stack" style={{ '--i': 2 }} onSubmit={submit}>
        <label class="field">
          <span class="label">{tab?.isForm ? 'Or paste another form link' : 'Paste a Google Form link'}</span>
          <div class="row">
            <input class="input" placeholder="https://docs.google.com/forms/d/e/.../viewform" value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
            <button class="btn primary" type="submit" disabled={!url.trim()}>
              Load
            </button>
          </div>
        </label>
        {err && (
          <Callout kind="danger">
            <b>{err.message}</b>
            {err.code && ERROR_HINTS[err.code] && <div>{ERROR_HINTS[err.code]}</div>}
          </Callout>
        )}
      </form>

      {recent.value.length > 0 && (
        <section class="card" style={{ '--i': 3, overflow: 'hidden' }}>
          <div class="section-label" style={{ margin: '12px 14px 8px' }}>
            Recent forms
          </div>
          {recent.value.map((r) => (
            <button class="recent-item" key={r.id} onClick={() => void loadForm(r.url)}>
              <Icon name="file" size={15} />
              <span class="ellipsis" style={{ flex: 1, fontWeight: 560 }}>
                {r.title}
              </span>
              <span class="faint small">{new Date(r.at).toLocaleDateString()}</span>
              <Icon name="arrowRight" size={14} class="go" />
            </button>
          ))}
        </section>
      )}

      <div class="features" style={{ '--i': 4 }}>
        <div class="feature">
          <Icon name="users" />
          <div>
            <b>Crowds with a mood</b>Every respondent has one, and all their answers agree with it.
          </div>
        </div>
        <div class="feature">
          <Icon name="sliders" />
          <div>
            <b>Tendency and weights</b>Lean towards any option, or set the exact split.
          </div>
        </div>
        <div class="feature">
          <Icon name="shield" />
          <div>
            <b>Passes your rules</b>Numbers, lengths, regex, e-mails and checkbox limits.
          </div>
        </div>
        <div class="feature">
          <Icon name="rocket" />
          <div>
            <b>Runs on its own</b>Follows branching, paces itself, keeps going in the background.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ onboarding -- */

function Onboarding() {
  const [agree, setAgree] = useState(false);
  const [closing, setClosing] = useState(false);
  const accept = () => {
    setClosing(true);
    setTimeout(() => void saveSettings({ acknowledged: true }), 210);
  };
  return (
    <div class={`dialog-wrap ${closing ? 'leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div class="card dialog stack">
        <div class="row" style={{ gap: '12px' }}>
          <Logo size={38} />
          <div>
            <h2 id="ob-title" style={{ margin: 0, fontSize: '17px', letterSpacing: '-0.02em' }}>
              Welcome to Crowdfill
            </h2>
            <div class="faint small">Before you start</div>
          </div>
        </div>
        <p class="muted" style={{ margin: 0 }}>
          Crowdfill sends <b>real responses</b> to Google Forms. It's made for testing forms you own: load tests, demo data, and checking the sheets and dashboards behind them.
        </p>
        <p class="muted" style={{ margin: 0 }}>Please don't use it on surveys, polls or votes run by other people. It would quietly ruin their results.</p>
        <label class="toggle">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree((e.target as HTMLInputElement).checked)} />
          <span class="switch" />
          <span class="t-label">I'll only use Crowdfill on forms I own or have permission to test.</span>
        </label>
        <button class="btn primary lg" disabled={!agree} onClick={accept}>
          Get started
        </button>
        <div class="faint small" style={{ textAlign: 'center' }}>
          By continuing you agree to the{' '}
          <a href={legalUrl('terms')} target="_blank" rel="noreferrer">
            Terms of Use
          </a>{' '}
          and{' '}
          <a href={legalUrl('privacy')} target="_blank" rel="noreferrer">
            Privacy Policy
          </a>
          .
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- toast -- */

function ToastSlot() {
  const t = currentToast.value;
  if (!t) return null;
  const icon = t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'check' : 'info';
  return (
    <div class="toast-slot" aria-live="polite">
      <div key={t.id} class={`toast ${t.kind} ${t.leaving ? 'leaving' : ''}`} role={t.kind === 'error' ? 'alert' : 'status'} onClick={() => dismissToast(t.id)}>
        <span class="toast-icon">
          <Icon name={icon} size={15} strokeWidth={2.4} />
        </span>
        <span>{t.text}</span>
        <span class="toast-timer" style={{ animationDuration: `${t.ms}ms` }} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- header -- */

function Tabs() {
  const ref = useRef<HTMLElement>(null);
  const { rect, animate } = useThumb(ref, '.tab[aria-selected="true"]', [view.value]);
  return (
    <nav class="tabs" role="tablist" ref={ref}>
      {TABS.map((t) => (
        <button key={t.id} class="tab" role="tab" aria-selected={view.value === t.id} onClick={() => (view.value = t.id)}>
          <Icon name={t.icon} size={14} />
          {t.label}
          {t.id === 'run' && isRunning.value && <span class="live-dot" title={run.value?.phase} />}
        </button>
      ))}
      {rect && <span class={`tab-indicator ${animate ? 'animate' : ''}`} style={{ width: `${rect.w - 16}px`, transform: `translateX(${rect.x + 8}px)` }} />}
    </nav>
  );
}

function Header() {
  const f = form.value;
  const tab = activeTab.value;
  const scrolled = useScrolled();
  const tabFormId = tab?.isForm ? publicIdFromUrl(tab.url) : null;
  const otherFormInTab = !!f && !!tabFormId && tabFormId !== f.id;
  const isPanel = !location.search.includes('tab=1');
  return (
    <header class={`topbar ${scrolled ? 'scrolled' : ''}`}>
      <div class="topbar-row">
        <div class="brand">
          <Logo class="brand-logo" />
          <div class="brand-text">
            <div class="brand-name">Crowdfill</div>
            <div class="brand-sub" title={f?.title}>
              {f ? (
                <>
                  {f.title}
                  <span class="dot-sep">
                    {f.questions.length} question{f.questions.length === 1 ? '' : 's'}
                  </span>
                  {f.sections.length > 1 && <span class="dot-sep">{f.sections.length} sections</span>}
                </>
              ) : (
                'Response generator for Google Forms'
              )}
            </div>
          </div>
        </div>
        {f && (
          <button class="btn ghost icon" title="Reload the form from Google" aria-label="Reload form" onClick={() => void loadForm(f.url)}>
            <Icon name="refresh" />
          </button>
        )}
        {f && (
          <button class="btn ghost icon" title="Load a different form" aria-label="Load a different form" onClick={closeForm}>
            <Icon name="arrowLeft" />
          </button>
        )}
        {isPanel && (
          <button
            class="btn ghost icon"
            title="Open in a full tab"
            aria-label="Open in a full tab"
            onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL(`app.html?tab=1${f ? `&form=${encodeURIComponent(f.url)}` : ''}`) })}
          >
            <Icon name="external" />
          </button>
        )}
        <button class="btn ghost icon" title="Settings" aria-label="Settings" onClick={() => (showSettings.value = true)}>
          <Icon name="settings" />
        </button>
      </div>
      {otherFormInTab && (
        <div style={{ padding: '0 12px 10px' }}>
          <button class="btn sm block" onClick={() => void loadForm(tab!.url)}>
            <Icon name="wand" size={13} /> Switch to the form in this tab
          </button>
        </div>
      )}
      {f && <Tabs />}
    </header>
  );
}

/* ------------------------------------------------------------------- app -- */

function RunBar() {
  const r = run.value;
  const live = isRunning.value && r;
  return (
    <div class="actionbar">
      <div class="actionbar-inner">
        {live ? (
          <>
            <span class="live-dot" />
            <span class="ellipsis" style={{ flex: 1 }}>
              {r.phase === 'scheduled' ? 'Run scheduled' : `${r.sent} of ${r.total} sent, ${r.ok} accepted${r.failed ? `, ${r.failed} failed` : ''}`}
            </span>
          </>
        ) : (
          <span class="faint small ellipsis" style={{ flex: 1 }}>
            Changes save automatically
          </span>
        )}
        <button class="btn primary" onClick={() => (view.value = 'run')}>
          <Icon name={live ? 'eye' : 'rocket'} size={14} /> {live ? 'View run' : 'Go to Run'}
        </button>
      </div>
    </div>
  );
}

function CurrentView() {
  switch (view.value) {
    case 'design':
      return <DesignView />;
    case 'preview':
      return <PreviewView />;
    case 'run':
      return <RunView />;
    case 'data':
      return <DataView />;
  }
}

export function App() {
  const [settingsMounted, settingsLeaving] = usePresence(showSettings.value, 230);
  if (!ready.value) {
    return (
      <div class="empty" style={{ minHeight: '60vh', justifyContent: 'center' }}>
        <Spinner size={20} />
      </div>
    );
  }
  const f = form.value;
  return (
    <div class="app">
      <Header />
      <main class="main">
        {!f ? (
          <div class="view" key="landing">
            <Landing />
          </div>
        ) : (
          <div class="view" key={`${f.id}-${view.value}`}>
            <CurrentView />
          </div>
        )}
      </main>
      {f && view.value !== 'run' && <RunBar />}
      {settingsMounted && <SettingsView leaving={settingsLeaving} />}
      {!settings.value.acknowledged && <Onboarding />}
      <ToastSlot />
    </div>
  );
}
