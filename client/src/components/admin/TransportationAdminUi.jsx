import React from 'react';

export const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
};

export const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const STATUS_STYLES = {
  default: 'bg-slate-100 text-slate-700 border-slate-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  in_progress: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  cancelled: 'bg-rose-100 text-rose-800 border-rose-200',
  failed: 'bg-rose-100 text-rose-800 border-rose-200',
  refunded: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
  info: 'bg-sky-100 text-sky-800 border-sky-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  critical: 'bg-rose-100 text-rose-800 border-rose-200',
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  inactive: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function StatusPill({ value, className = '' }) {
  const normalized = String(value || 'default').toLowerCase();
  const style = STATUS_STYLES[normalized] || STATUS_STYLES.default;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${style} ${className}`.trim()}
    >
      {String(value || 'unknown').replace(/_/g, ' ')}
    </span>
  );
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-900 px-6 py-7 text-white shadow-xl">
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
          {eyebrow}
        </p>
      ) : null}
      <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-slate-200 md:text-base">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}

export function MetricCard({ label, value, subtext, tone = 'slate' }) {
  const toneMap = {
    slate: 'from-slate-50 to-white border-slate-200',
    cyan: 'from-cyan-50 to-white border-cyan-200',
    emerald: 'from-emerald-50 to-white border-emerald-200',
    amber: 'from-amber-50 to-white border-amber-200',
    rose: 'from-rose-50 to-white border-rose-200',
  };

  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-5 shadow-sm ${toneMap[tone] || toneMap.slate}`}
    >
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {subtext ? <p className="mt-2 text-xs text-slate-500">{subtext}</p> : null}
    </div>
  );
}

export function SectionCard({ title, description, action, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`.trim()}>
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SectionTabs({ tabs, active, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            active === tab.value
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
          }`}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function LoadingState({ label = 'Loading...' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-cyan-600 border-t-transparent" />
      <p className="mt-4 text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-8 text-center shadow-sm">
      <p className="text-sm font-medium text-rose-700">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, description }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description ? <p className="mt-2 text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}
