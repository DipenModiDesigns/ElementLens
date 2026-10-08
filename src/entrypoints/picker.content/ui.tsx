import type { ComponentChildren } from 'preact';

export function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ComponentChildren;
}) {
  return (
    <section class={`el-section ${open ? 'el-section-open' : ''}`}>
      <button class="el-section-head" aria-expanded={open} onClick={onToggle}>
        <span>{title}</span>
        <svg class="el-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      {open && <div class="el-section-body">{children}</div>}
    </section>
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
  /** Not built yet: shown disabled with a "Soon" badge. */
  soon?: boolean;
}

export function OptionGroup<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div class="el-group" role="radiogroup" aria-label={label}>
      <div class="el-group-label">
        {label}
        {hint && (
          <span class="el-hint" title={hint} aria-label={hint}>
            i
          </span>
        )}
      </div>
      <div class="el-options">
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            disabled={o.soon}
            class={`el-option ${value === o.value ? 'el-option-on' : ''}`}
            onClick={() => onChange(o.value)}
            title={o.soon ? `${o.label}: coming soon` : o.label}
          >
            <span>{o.label}</span>
            {o.soon ? <span class="el-badge">Soon</span> : <span class="el-radio" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div class="el-switch-row">
      <span class="el-group-label">
        {label}
        {hint && (
          <span class="el-hint" title={hint} aria-label={hint}>
            i
          </span>
        )}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        class={`el-switch ${checked ? 'el-switch-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span class="el-switch-knob" />
      </button>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  return (
    <div class="el-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="el-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header class="el-modal-head">
          <strong>{title}</strong>
          <button class="el-btn el-btn-icon" onClick={onClose} title="Close (Esc)" aria-label="Close">
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
