// Shared form controls.
import type { ComponentChildren } from 'preact';
import { useId, useRef, useState } from 'preact/hooks';
import { Icon } from '../icons';
import { Collapse, useThumb } from './motion';

export function Field({ label, hint, help, children, class: cls }: { label?: ComponentChildren; hint?: ComponentChildren; help?: string; children: ComponentChildren; class?: string }) {
  return (
    <div class={`field ${cls ?? ''}`}>
      {label && (
        <div class="label">
          {label}
          {help && <Help text={help} />}
        </div>
      )}
      {children}
      {hint && <div class="hint">{hint}</div>}
    </div>
  );
}

export function Help({ text }: { text: string }) {
  return (
    <span class="tooltip" tabIndex={0} data-tip={text} aria-label={text}>
      <Icon name="info" size={13} />
    </span>
  );
}

export function Slider({
  value,
  onInput,
  min = 0,
  max = 100,
  step = 1,
  format = (v: number) => `${v}%`,
  label,
  variant,
}: {
  value: number;
  onInput: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  label?: string;
  variant?: 'mood';
}) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <div class={`slider ${variant ?? ''}`}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ '--pct': `${pct}%` }}
        onInput={(e) => onInput(Number((e.target as HTMLInputElement).value))}
      />
      <span class="value">{format(value)}</span>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: ComponentChildren; title?: string }>;
  onChange: (v: T) => void;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { rect, animate } = useThumb(ref, 'button[aria-pressed="true"]', [value, options.length]);
  return (
    <div class="seg" role="group" aria-label={label} ref={ref}>
      {rect && (
        <span
          class={`seg-thumb ${animate ? 'animate' : ''}`}
          style={{ width: `${rect.w}px`, height: `${rect.h}px`, transform: `translate(${rect.x}px, ${rect.y}px)` }}
        />
      )}
      {options.map((o) => (
        <button type="button" key={o.value} aria-pressed={o.value === value} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ComponentChildren; hint?: ComponentChildren; disabled?: boolean }) {
  return (
    <label class="toggle" style={disabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span class="switch" />
      <span>
        <div class="t-label">{label}</div>
        {hint && <div class="t-hint">{hint}</div>}
      </span>
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  class: cls = 'input num',
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  class?: string;
  label?: string;
}) {
  return (
    <input
      class={cls}
      type="number"
      inputMode="decimal"
      aria-label={label}
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        let v = Number((e.target as HTMLInputElement).value);
        if (!Number.isFinite(v)) return;
        if (min !== undefined) v = Math.max(min, v);
        if (max !== undefined) v = Math.min(max, v);
        onChange(v);
      }}
    />
  );
}

export function Select<T extends string>({ value, options, onChange, class: cls = 'select', label }: { value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (v: T) => void; class?: string; label?: string }) {
  const id = useId();
  return (
    <select id={id} class={cls} value={value} aria-label={label} onChange={(e) => onChange((e.target as HTMLSelectElement).value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Callout({ kind = 'info', children }: { kind?: 'info' | 'warning' | 'danger'; children: ComponentChildren }) {
  return (
    <div class={`callout ${kind}`} role={kind === 'danger' ? 'alert' : undefined}>
      <Icon name={kind === 'info' ? 'info' : 'alert'} size={15} />
      <div>{children}</div>
    </div>
  );
}

/** A labelled section that slides open and closed. */
export function Disclosure({ title, children, defaultOpen = false }: { title: ComponentChildren; children: ComponentChildren; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button type="button" class="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
        {title}
        <span class="spacer" />
        <Icon name="chevron" size={15} />
      </button>
      <Collapse open={open}>
        <div style={{ paddingTop: '8px' }}>{children}</div>
      </Collapse>
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <Icon name="loader" size={size} class="spin" />;
}

export function CardHead({ icon, title, sub, children }: { icon: string; title: ComponentChildren; sub?: ComponentChildren; children?: ComponentChildren }) {
  return (
    <div class="card-head">
      <span class="card-icon">
        <Icon name={icon} size={16} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div class="card-title">{title}</div>
        {sub && <div class="card-sub">{sub}</div>}
      </div>
      {children}
    </div>
  );
}
