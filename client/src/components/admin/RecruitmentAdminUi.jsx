import React from 'react';
import { FaSpinner } from 'react-icons/fa';

// ─── Formatting utilities ───────────────────────────────

export const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
};

export const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
};

export const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

// ─── Status badge styles ───────────────────────────────

export const RECRUITMENT_STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  submitted: 'bg-blue-100 text-blue-700 border-blue-200',
  under_review: 'bg-amber-100 text-amber-700 border-amber-200',
  shortlisted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  disqualified: 'bg-rose-100 text-rose-700 border-rose-200',
};

export const PAYMENT_STATUS_STYLES = {
  paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  failed: 'bg-rose-100 text-rose-700 border-rose-200',
  refunded: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
};

export const statusBadgeStyle = (status) =>
  RECRUITMENT_STATUS_STYLES[status] || 'bg-slate-100 text-slate-700 border-slate-200';

export const paymentBadgeStyle = (status) =>
  PAYMENT_STATUS_STYLES[status] || 'bg-slate-100 text-slate-700 border-slate-200';

// ─── UI Components ──────────────────────────────────────

export function StatusPill({ value, className = '' }) {
  const normalized = String(value || 'default').toLowerCase();
  const style =
    RECRUITMENT_STATUS_STYLES[normalized] ||
    PAYMENT_STATUS_STYLES[normalized] ||
    'bg-slate-100 text-slate-700 border-slate-200';

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
    <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-6 py-7 text-white shadow-xl">
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">{eyebrow}</p>
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
    indigo: 'from-indigo-50 to-white border-indigo-200',
    emerald: 'from-emerald-50 to-white border-emerald-200',
    amber: 'from-amber-50 to-white border-amber-200',
    rose: 'from-rose-50 to-white border-rose-200',
    blue: 'from-blue-50 to-white border-blue-200',
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
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`.trim()}
    >
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
              ? 'bg-indigo-700 text-white shadow-sm'
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
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
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

export function FormInput({ label, value, onChange, type = 'text', ...props }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        {...props}
      />
    </label>
  );
}

export function FormSelect({ label, value, onChange, children, ...props }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function FormTextarea({ label, value, onChange, rows = 3, ...props }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="block w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        {...props}
      />
    </label>
  );
}

export function FilterInput({ icon, ...props }) {
  return (
    <label className="relative block">
      {icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </span>
      )}
      <input
        {...props}
        className={`block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 ${
          icon ? 'pl-9' : ''
        }`}
      />
    </label>
  );
}

export function ActionButton({ children, onClick, disabled, variant = 'primary', size = 'md', icon: Icon, loading }) {
  const variantStyles = {
    primary:
      'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-500/20',
    secondary:
      'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    success:
      'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
    amber:
      'bg-amber-600 text-white hover:bg-amber-700 shadow-sm',
    dark:
      'bg-slate-900 text-white hover:bg-slate-800 shadow-sm',
  };

  const sizeStyles = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-sm',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]}`}
    >
      {loading ? <FaSpinner className="animate-spin" /> : Icon ? <Icon /> : null}
      {children}
    </button>
  );
}
