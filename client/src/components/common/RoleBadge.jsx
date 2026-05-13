import React from 'react';

const DEFAULT_MAP = {
  tenant: {
    label: 'TENANT',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  landlord: {
    label: 'LANDLORD',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  admin: {
    label: 'LGA ADMIN',
    className: 'bg-admin-100 text-admin-700 border-admin-200',
  },
  lga_financial_admin: {
    label: 'LGA FINANCIAL ADMIN',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  super_admin: {
    label: 'SUPER ADMIN',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  state_admin: {
    label: 'STATE ADMIN',
    className: 'bg-state-100 text-state-700 border-state-200',
  },
  state_financial_admin: {
    label: 'STATE FINANCIAL ADMIN',
    className: 'bg-teal-100 text-teal-700 border-teal-200',
  },
  super_financial_admin: {
    label: 'SUPER FINANCIAL ADMIN',
    className: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  },
  financial_admin: {
    label: 'FINANCIAL ADMIN',
    className: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  },
  state_support_admin: {
    label: 'STATE SUPPORT ADMIN',
    className: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  super_support_admin: {
    label: 'SUPER SUPPORT ADMIN',
    className: 'bg-orange-100 text-orange-700 border-orange-200',
  },
  fumigation_admin: {
    label: 'FUMIGATION ADMIN',
    className: 'bg-rose-100 text-rose-700 border-rose-200',
  },
  lga_fumigation_admin: {
    label: 'LGA FUMIGATION ADMIN',
    className: 'bg-rose-100 text-rose-700 border-rose-200',
  },
  state_fumigation_admin: {
    label: 'STATE FUMIGATION ADMIN',
    className: 'bg-rose-100 text-rose-700 border-rose-200',
  },
  super_fumigation_admin: {
    label: 'SUPER FUMIGATION ADMIN',
    className: 'bg-rose-100 text-rose-700 border-rose-200',
  },
  transportation_admin: {
    label: 'TRANSPORTATION ADMIN',
    className: 'bg-sky-100 text-sky-700 border-sky-200',
  },
  lga_transportation_admin: {
    label: 'LGA TRANSPORTATION ADMIN',
    className: 'bg-sky-100 text-sky-700 border-sky-200',
  },
  state_transportation_admin: {
    label: 'STATE TRANSPORTATION ADMIN',
    className: 'bg-sky-100 text-sky-700 border-sky-200',
  },
  super_transportation_admin: {
    label: 'SUPER TRANSPORTATION ADMIN',
    className: 'bg-sky-100 text-sky-700 border-sky-200',
  },
  agent: {
    label: 'AGENT',
    className: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  },
  lawyer: {
    label: 'LGA LAWYER',
    className: 'bg-violet-100 text-violet-700 border-violet-200',
  },
  state_lawyer: {
    label: 'STATE LAWYER',
    className: 'bg-violet-100 text-violet-700 border-violet-200',
  },
  super_lawyer: {
    label: 'SUPER LAWYER',
    className: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  },
};

export default function RoleBadge({ role, className = '', compact = false }) {
  const key = String(role || '').trim().toLowerCase();
  const fallbackLabel = key ? key.replace(/_/g, ' ').toUpperCase() : 'UNKNOWN';
  const config = DEFAULT_MAP[key] || {
    label: fallbackLabel,
    className: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${config.className} ${className}`.trim()}
      title={config.label}
    >
      {compact ? config.label.split(' ')[0] : config.label}
    </span>
  );
}
