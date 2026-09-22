import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaFileSignature, FaHome, FaSpinner, FaSyncAlt } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useAuth } from '../hooks/useAuth';
import {
  tenancyAgreementService,
  TENANCY_AGREEMENT_STATUS_LABELS,
  TENANCY_AGREEMENT_STATUS_TONES,
} from '../services/tenancyAgreementService';

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
};

const StatusBadge = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${TENANCY_AGREEMENT_STATUS_TONES[status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
    {TENANCY_AGREEMENT_STATUS_LABELS[status] || status}
  </span>
);

const needsMyAction = (agreement, role) => {
  if (role === 'landlord') {
    return ['PENDING_LANDLORD_REVIEW', 'PENDING_LANDLORD_SIGNATURE'].includes(agreement.status);
  }
  if (role === 'tenant') {
    return ['PENDING_TENANT_REVIEW', 'PENDING_TENANT_SIGNATURE'].includes(agreement.status);
  }
  return false;
};

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'PENDING_LANDLORD_REVIEW', label: 'Awaiting landlord review' },
  { value: 'PENDING_LANDLORD_SIGNATURE', label: 'Awaiting landlord signature' },
  { value: 'PENDING_TENANT_REVIEW', label: 'Awaiting tenant review' },
  { value: 'PENDING_TENANT_SIGNATURE', label: 'Awaiting tenant signature' },
  { value: 'FULLY_EXECUTED', label: 'Fully executed' },
  { value: 'DECLINED', label: 'Declined' },
];

const TenancyAgreements = () => {
  const { user } = useAuth();
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await tenancyAgreementService.list(statusFilter ? { status: statusFilter } : undefined);
      setAgreements(res.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load tenancy agreements');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const actionCount = useMemo(
    () => agreements.filter((agreement) => needsMyAction(agreement, user?.user_type)).length,
    [agreements, user]
  );

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-amber-300">
              <FaFileSignature />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">My Tenancy Agreements</h1>
              <p className="mt-1 text-sm text-slate-600">
                Review and electronically execute your tenancy agreements. An approved application is not a tenancy until both parties have signed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <FaSyncAlt className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {actionCount > 0 && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-900">
            {actionCount} agreement{actionCount > 1 ? 's' : ''} awaiting your action.
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.value || 'all'}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                statusFilter === filter.value
                  ? 'bg-slate-950 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-10 flex items-center justify-center gap-3 text-slate-500">
            <FaSpinner className="animate-spin" /> Loading agreements...
          </div>
        ) : agreements.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <FaFileSignature className="mx-auto text-3xl text-slate-300" />
            <p className="mt-3 font-semibold text-slate-700">No tenancy agreements yet</p>
            <p className="mt-1 text-sm text-slate-500">
              When a landlord approves an application, a tenancy agreement will appear here for review and signature.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {agreements.map((agreement) => (
              <div key={agreement.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="flex items-center gap-2 font-bold text-slate-900">
                        <FaHome className="text-slate-400" />
                        {agreement.property_title || 'Property'}
                      </h2>
                      <StatusBadge status={agreement.status} />
                      {needsMyAction(agreement, user?.user_type) && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-700">Action needed</span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-600">{agreement.full_address || '—'}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Agreement #{agreement.id} · Version {agreement.current_version} · Created {formatDate(agreement.created_at)}
                      {agreement.executed_at ? ` · Executed ${formatDate(agreement.executed_at)}` : ''}
                    </p>
                  </div>
                  <Link
                    to={`/tenancy-agreements/${agreement.id}`}
                    className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Open agreement
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TenancyAgreements;
