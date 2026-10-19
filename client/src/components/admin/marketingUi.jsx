import React from 'react';
import Modal from '../common/Modal';

/* Shared presentation kit for the Email / SMS / WhatsApp marketing tabs.
   Keeping one kit means the three channels look and behave the same way, so
   an admin who learns one panel already knows the other two. */

const TONES = {
  neutral: {
    card: 'border-gray-100 bg-white',
    value: 'text-gray-900',
    icon: 'bg-gray-100 text-gray-500',
  },
  primary: {
    card: 'border-primary-100 bg-primary-50/60',
    value: 'text-primary-700',
    icon: 'bg-primary-100 text-primary-600',
  },
  success: {
    card: 'border-green-100 bg-green-50/60',
    value: 'text-green-700',
    icon: 'bg-green-100 text-green-600',
  },
  warning: {
    card: 'border-amber-100 bg-amber-50/60',
    value: 'text-amber-700',
    icon: 'bg-amber-100 text-amber-600',
  },
  danger: {
    card: 'border-red-100 bg-red-50/60',
    value: 'text-red-700',
    icon: 'bg-red-100 text-red-600',
  },
};

export const MarketingShell = ({ eyebrow, title, subtitle, icon, actions, children }) => (
  <div className="space-y-6">
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
      <div className="flex flex-col gap-4 border-b border-gray-100 bg-gradient-to-r from-primary-600 to-primary-500 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {icon ? (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-xl text-white">
              {icon}
            </span>
          ) : null}
          <div>
            {eyebrow ? (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-100">{eyebrow}</p>
            ) : null}
            <h2 className="text-lg font-bold text-white sm:text-xl">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-primary-50 sm:text-sm">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

export const StatGrid = ({ children, columns = 4 }) => (
  <div
    className={`grid grid-cols-2 gap-3 ${columns >= 4 ? 'lg:grid-cols-4' : ''} ${
      columns === 3 ? 'lg:grid-cols-3' : ''
    }`}
  >
    {children}
  </div>
);

export const StatCard = ({ label, value, hint, tone = 'neutral', icon }) => {
  const t = TONES[tone] || TONES.neutral;
  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm transition-shadow hover:shadow-md ${t.card}`}>
      <div className="flex items-center gap-2">
        {icon ? (
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs ${t.icon}`}>{icon}</span>
        ) : null}
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      </div>
      <p className={`mt-2 text-2xl font-bold ${t.value}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  );
};

export const Panel = ({ title, description, actions, children, className = '', bodyClassName = '', noPadding = false }) => (
  <section className={`rounded-2xl border border-gray-100 bg-white shadow-sm ${className}`}>
    {title || actions ? (
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-gray-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
    ) : null}
    <div className={`${noPadding ? '' : 'px-5 py-4'} ${bodyClassName}`}>{children}</div>
  </section>
);

export const Field = ({ label, hint, required, error, children, className = '' }) => (
  <div className={className}>
    {label ? (
      <label className="mb-1 block text-xs font-medium text-gray-700">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
    ) : null}
    {children}
    {hint && !error ? <p className="mt-1 text-[11px] text-gray-400">{hint}</p> : null}
    {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : null}
  </div>
);

export const TextInput = ({ className = '', ...props }) => (
  <input className={`input ${className}`} {...props} />
);

export const TextArea = ({ className = '', rows = 4, ...props }) => (
  <textarea className={`input ${className}`} rows={rows} {...props} />
);

export const SelectInput = ({ className = '', children, ...props }) => (
  <select className={`input ${className}`} {...props}>
    {children}
  </select>
);

const SPINNER = (
  <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white align-middle" />
);

export const PrimaryButton = ({ children, loading, disabled, className = '', ...props }) => (
  <button
    type="button"
    className={`btn btn-primary text-sm ${className}`}
    disabled={disabled || loading}
    {...props}
  >
    {loading ? SPINNER : null}
    {children}
  </button>
);

export const SecondaryButton = ({ children, loading, disabled, className = '', ...props }) => (
  <button
    type="button"
    className={`btn btn-secondary text-sm ${className}`}
    disabled={disabled || loading}
    {...props}
  >
    {loading ? SPINNER : null}
    {children}
  </button>
);

export const DangerButton = ({ children, loading, disabled, className = '', ...props }) => (
  <button
    type="button"
    className={`btn btn-danger text-sm ${className}`}
    disabled={disabled || loading}
    {...props}
  >
    {loading ? SPINNER : null}
    {children}
  </button>
);

export const GhostButton = ({ children, className = '', ...props }) => (
  <button
    type="button"
    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 ${className}`}
    {...props}
  >
    {children}
  </button>
);

const STATUS_TONE = {
  draft: 'badge bg-gray-100 text-gray-600',
  scheduled: 'badge bg-amber-100 text-amber-700',
  queued: 'badge bg-primary-100 text-primary-700',
  sending: 'badge bg-primary-100 text-primary-700',
  sent: 'badge bg-green-100 text-green-700',
  paused: 'badge bg-amber-100 text-amber-700',
  failed: 'badge bg-red-100 text-red-700',
  cancelled: 'badge bg-gray-100 text-gray-500',
  pending: 'badge bg-gray-100 text-gray-600',
};

export const StatusBadge = ({ status }) => (
  <span className={STATUS_TONE[String(status || '').toLowerCase()] || STATUS_TONE.draft}>
    {String(status || 'unknown').toUpperCase()}
  </span>
);

export const DataTable = ({ columns, children, className = '' }) => (
  <div className={`overflow-x-auto ${className}`}>
    <table className="min-w-full divide-y divide-gray-100">
      <thead className="bg-gray-50/80">
        <tr>
          {columns.map((column) => (
            <th
              key={column}
              className="whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500"
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">{children}</tbody>
    </table>
  </div>
);

export const Td = ({ children, className = '', ...props }) => (
  <td className={`px-4 py-3 text-sm text-gray-700 ${className}`} {...props}>
    {children}
  </td>
);

export const EmptyState = ({ icon, title, message, action }) => (
  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
    {icon ? <span className="text-2xl text-gray-300">{icon}</span> : null}
    <p className="text-sm font-semibold text-gray-700">{title}</p>
    {message ? <p className="max-w-md text-xs text-gray-500">{message}</p> : null}
    {action ? <div className="mt-2">{action}</div> : null}
  </div>
);

export const LoadingState = ({ label = 'Loading…', rows = 3 }) => (
  <div className="space-y-3" aria-busy="true" aria-label={label}>
    {Array.from({ length: rows }).map((_, index) => (
      <div key={index} className="animate-pulse-soft rounded-xl border border-gray-100 bg-white p-4">
        <div className="h-3 w-1/3 rounded bg-gray-100" />
        <div className="mt-3 h-2.5 w-2/3 rounded bg-gray-100" />
        <div className="mt-2 h-2.5 w-1/2 rounded bg-gray-100" />
      </div>
    ))}
  </div>
);

export const Banner = ({ tone = 'info', title, children, className = '' }) => {
  const tones = {
    info: 'border-primary-200 bg-primary-50 text-primary-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    success: 'border-green-200 bg-green-50 text-green-800',
    danger: 'border-red-200 bg-red-50 text-red-800',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${tones[tone]} ${className}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children}
    </div>
  );
};

export const Dialog = ({ open, onClose, title, subtitle, children, footer, size = 'medium' }) => (
  <Modal isOpen={open} onClose={onClose} title={title} size={size}>
    {subtitle ? <p className="-mt-1 mb-4 text-xs text-gray-500">{subtitle}</p> : null}
    {children}
    {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">{footer}</div> : null}
  </Modal>
);

export const SegmentedControl = ({ options, value, onChange, className = '' }) => (
  <div className={`inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 ${className}`}>
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
            active ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
};
