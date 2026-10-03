// Settings drawer.
import { useState } from 'preact/hooks';
import { BRAND, LEGAL_PAGES, legalUrl } from '../../shared/brand';
import { AI_MODELS } from '../../shared/models';
import { send } from '../api';
import { Icon, Logo } from '../icons';
import { saveSettings, settings, showSettings, toast } from '../store';
import { CardHead, Field, Segmented, Select, Spinner, Toggle } from './controls';

declare const __REPO_URL__: string;

export function SettingsView({ leaving }: { leaving: boolean }) {
  const s = settings.value;
  const [key, setKey] = useState(s.apiKey);
  const [testing, setTesting] = useState(false);
  const version = chrome.runtime.getManifest().version;
  const close = () => (showSettings.value = false);

  const test = async () => {
    await saveSettings({ apiKey: key.trim() });
    setTesting(true);
    try {
      await send({ type: 'ai:test' });
      toast('Your Claude API key works', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error', 6000);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div class={`overlay ${leaving ? 'leaving' : ''}`} onClick={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div class="drawer" role="dialog" aria-modal="true" aria-label="Settings">
        <div class="drawer-head">
          <div class="brand">
            <div class="brand-name">Settings</div>
          </div>
          <button class="btn ghost icon" aria-label="Close settings" onClick={close} autoFocus>
            <Icon name="x" />
          </button>
        </div>
        <div class="stack stagger" style={{ padding: '14px' }}>
          <section class="card card-pad stack" style={{ '--i': 0 }}>
            <CardHead icon="eye" title="Appearance" />
            <Segmented
              label="Theme"
              value={s.theme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              onChange={(theme) => void saveSettings({ theme })}
            />
            <Toggle checked={s.notify} onChange={(notify) => void saveSettings({ notify })} label="Notify me when a run finishes" hint="A desktop notification with the result." />
          </section>

          <section class="card card-pad stack" style={{ '--i': 1 }}>
            <CardHead icon="sparkles" title="Claude answer writer" sub="Optional. Uses your own Anthropic API key." />
            <div class="muted small">
              Writes realistic, varied answers for short-answer and paragraph questions. Claude is only called when you click Generate, never during a run. Get a key at{' '}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                console.anthropic.com
              </a>
              .
            </div>
            <Field label="API key">
              <input
                class="input mono"
                type="password"
                autoComplete="off"
                spellcheck={false}
                placeholder="sk-ant-..."
                value={key}
                onInput={(e) => setKey((e.target as HTMLInputElement).value)}
                onBlur={() => void saveSettings({ apiKey: key.trim() })}
              />
            </Field>
            <Field label="Model">
              <Select label="Model" value={s.aiModel} options={AI_MODELS.map((m) => ({ value: m.id, label: m.label }))} onChange={(aiModel) => void saveSettings({ aiModel })} />
            </Field>
            <div class="row">
              <button class="btn" disabled={!key.trim() || testing} onClick={test}>
                {testing ? <Spinner /> : <Icon name="check" size={14} />} Test key
              </button>
              {s.apiKey && (
                <button
                  class="btn ghost danger"
                  onClick={() => {
                    setKey('');
                    void saveSettings({ apiKey: '' });
                    toast('API key removed');
                  }}
                >
                  Remove key
                </button>
              )}
            </div>
            <div class="faint small">The key stays in this browser's extension storage and is only ever sent to api.anthropic.com.</div>
          </section>

          <section class="card card-pad stack" style={{ '--i': 2 }}>
            <CardHead icon="shield" title="Privacy" />
            <div class="muted small">
              No accounts, no analytics, no servers of ours. Your forms, strategies and history never leave this browser. Please only use Crowdfill on forms you own or are allowed to
              test.
            </div>
          </section>

          <section class="card card-pad" style={{ '--i': 3 }}>
            <CardHead icon="scale" title="Legal" />
            <div class="link-list">
              {LEGAL_PAGES.map((p) => (
                <a key={p.id} href={legalUrl(p.id)} target="_blank" rel="noreferrer">
                  {p.label}
                  <span class="spacer" />
                  <Icon name="external" size={14} />
                </a>
              ))}
            </div>
          </section>

          <section class="card card-pad stack" style={{ '--i': 4 }}>
            <div class="row" style={{ gap: '12px' }}>
              <Logo size={38} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>Crowdfill {version}</div>
                <div class="faint small">
                  Made with <Icon name="heart" size={11} /> by {BRAND.maker} at {BRAND.publisher}
                </div>
              </div>
            </div>
            <div class="row wrap">
              <a class="btn sm" href={BRAND.website} target="_blank" rel="noreferrer">
                <Icon name="globe" size={13} /> {BRAND.publisher}
              </a>
              <a class="btn sm" href={`mailto:${BRAND.supportEmail}`}>
                <Icon name="mail" size={13} /> Support
              </a>
              {__REPO_URL__ && (
                <a class="btn sm" href={__REPO_URL__} target="_blank" rel="noreferrer">
                  <Icon name="github" size={13} /> Source
                </a>
              )}
            </div>
            <div class="faint small">
              Open with <span class="kbd">Alt</span> + <span class="kbd">Shift</span> + <span class="kbd">F</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
