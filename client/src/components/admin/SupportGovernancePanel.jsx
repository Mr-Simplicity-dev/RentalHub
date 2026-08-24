import React, { useCallback, useEffect, useState } from 'react';
import { FaArrowUp, FaDownload, FaExclamationTriangle, FaSave, FaShieldAlt, FaSyncAlt, FaUsers } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';

const label = (value) => String(value || 'not set').replace(/_/g, ' ');

const SupportGovernancePanel = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [policy, setPolicy] = useState({
    sla_due_soon_hours: 2,
    escalation_acknowledgement_hours: 4,
    department_resolution_hours: 24,
    notify_super_admin_on_breach: true,
  });
  const [savingPolicy, setSavingPolicy] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/support/governance/summary');
      setData(res.data?.data || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load support governance summary');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPolicies = useCallback(async () => {
    try {
      const res = await api.get('/support/governance/policies');
      if (res.data?.data) setPolicy(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load support policies');
    }
  }, []);

  useEffect(() => {
    loadSummary();
    loadPolicies();
  }, [loadPolicies, loadSummary]);

  const exportCsv = async () => {
    try {
      const res = await api.get('/support/governance/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `support-governance-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to export support report');
    }
  };

  const savePolicy = async () => {
    setSavingPolicy(true);
    try {
      const res = await api.put('/support/governance/policies', policy);
      setPolicy(res.data?.data || policy);
      toast.success('Support governance policies saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save support policies');
    } finally {
      setSavingPolicy(false);
    }
  };

  const summary = data?.summary || {};

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Super Admin Support Governance</h2>
          <p className="text-sm text-slate-500">Platform-wide oversight for support accountability, SLA risk, and department handoffs.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <FaDownload /> Export CSV
          </button>
          <button onClick={loadSummary} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <FaSyncAlt /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">Loading governance summary...</div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="rounded-lg bg-slate-50 p-3"><FaShieldAlt className="text-slate-500" /><p className="mt-2 text-xs text-slate-500">Total Tickets</p><p className="text-xl font-bold text-slate-900">{summary.total_tickets || 0}</p></div>
            <div className="rounded-lg bg-blue-50 p-3"><FaUsers className="text-blue-500" /><p className="mt-2 text-xs text-blue-600">Active</p><p className="text-xl font-bold text-blue-700">{summary.active_tickets || 0}</p></div>
            <div className="rounded-lg bg-amber-50 p-3"><FaArrowUp className="text-amber-600" /><p className="mt-2 text-xs text-amber-700">Escalated</p><p className="text-xl font-bold text-amber-800">{summary.escalated_tickets || 0}</p></div>
            <div className="rounded-lg bg-red-50 p-3"><FaExclamationTriangle className="text-red-600" /><p className="mt-2 text-xs text-red-700">SLA Breached</p><p className="text-xl font-bold text-red-800">{summary.breached_sla || 0}</p></div>
            <div className="rounded-lg bg-purple-50 p-3"><FaUsers className="text-purple-600" /><p className="mt-2 text-xs text-purple-700">Unassigned</p><p className="text-xl font-bold text-purple-800">{summary.unassigned_active || 0}</p></div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Governance Policy</h3>
                <button onClick={savePolicy} disabled={savingPolicy} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                  <FaSave /> {savingPolicy ? 'Saving...' : 'Save Policy'}
                </button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-medium text-slate-600">
                  SLA warning hours
                  <input type="number" min="1" max="24" value={policy.sla_due_soon_hours} onChange={(e) => setPolicy((prev) => ({ ...prev, sla_due_soon_hours: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800" />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Acknowledge within hours
                  <input type="number" min="1" max="72" value={policy.escalation_acknowledgement_hours} onChange={(e) => setPolicy((prev) => ({ ...prev, escalation_acknowledgement_hours: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800" />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Department resolution hours
                  <input type="number" min="1" max="168" value={policy.department_resolution_hours} onChange={(e) => setPolicy((prev) => ({ ...prev, department_resolution_hours: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800" />
                </label>
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-600">
                <input type="checkbox" checked={Boolean(policy.notify_super_admin_on_breach)} onChange={(e) => setPolicy((prev) => ({ ...prev, notify_super_admin_on_breach: e.target.checked }))} />
                Notify super admins when SLA is breached
              </label>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Department Accountability</h3>
              <div className="mt-3 space-y-2">
                {(data?.by_department || []).length === 0 ? (
                  <p className="text-sm text-slate-500">No department escalations yet.</p>
                ) : data.by_department.map((row) => (
                  <div key={row.department} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm">
                    <span className="font-medium capitalize text-slate-800">{label(row.department)}</span>
                    <span className="text-slate-600">{row.needs_action} needs action · {row.breached_sla} breached · {row.total} total</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Recent Escalations</h3>
              <div className="mt-3 space-y-2">
                {(data?.recent_escalations || []).length === 0 ? (
                  <p className="text-sm text-slate-500">No recent escalations.</p>
                ) : data.recent_escalations.map((ticket) => (
                  <div key={ticket.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                    <p className="font-medium text-slate-900">#{ticket.id} {ticket.subject}</p>
                    <p className="mt-1 text-xs capitalize text-slate-500">{label(ticket.escalation_department)} · {label(ticket.escalation_status)} · {label(ticket.category)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default SupportGovernancePanel;
