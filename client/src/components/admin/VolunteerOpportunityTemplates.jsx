import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { FaPlus } from 'react-icons/fa';
import api from '../../services/api';

const today = () => {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
};

export default function VolunteerOpportunityTemplates({ cycles = [], onCreated, className = '' }) {
  const [templates, setTemplates] = useState([]);
  const [cycleId, setCycleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const eligibleCycles = useMemo(
    () => cycles.filter((cycle) => {
      if (!cycle || cycle.is_active === false) return false;
      const closeDate = cycle.extension_date || cycle.close_date;
      return closeDate && new Date(closeDate) >= today();
    }),
    [cycles]
  );

  useEffect(() => {
    let active = true;
    api.get('/recruitment/admin/volunteer-templates')
      .then((res) => {
        if (active) setTemplates(res.data?.data || []);
      })
      .catch(() => {
        if (active) setTemplates([]);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!eligibleCycles.some((cycle) => String(cycle.id) === String(cycleId))) {
      setCycleId(eligibleCycles[0] ? String(eligibleCycles[0].id) : '');
    }
  }, [eligibleCycles, cycleId]);

  const createTemplates = async () => {
    if (!cycleId) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await api.post('/recruitment/admin/volunteer-templates/apply', {
        cycle_id: Number(cycleId),
      });
      const data = res.data?.data || { created: [], skipped: [] };
      setResult(data);
      toast.success(res.data?.message || 'Volunteer opportunities processed');
      await onCreated?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create volunteer opportunities');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-emerald-950">Volunteer opportunity templates</h4>
          <p className="mt-1 text-xs leading-5 text-emerald-800">
            Add the eight standard volunteer roles with complete descriptions, zero fees and
            experience-friendly requirements. Existing roles in the cycle are left untouched.
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
          Admin controlled
        </span>
      </div>

      {templates.length > 0 && (
        <ul className="mt-3 grid gap-1 text-xs text-emerald-900 sm:grid-cols-2">
          {templates.map((template) => (
            <li key={template.title} className="break-words">- {template.title}</li>
          ))}
        </ul>
      )}

      {eligibleCycles.length === 0 ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          Create an active or upcoming recruitment cycle first. Templates are never attached to a
          closed cycle and never invent production dates.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            value={cycleId}
            onChange={(event) => setCycleId(event.target.value)}
            className="input min-w-0 flex-1 text-sm"
            aria-label="Volunteer template cycle"
          >
            {eligibleCycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>{cycle.title}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={createTemplates}
            disabled={saving || !cycleId}
            className="btn shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <FaPlus className="mr-2" />
            {saving ? 'Creating...' : 'Create volunteer opportunities'}
          </button>
        </div>
      )}

      <p className="mt-2 text-[11px] leading-5 text-emerald-700">
        This does not change the Volunteer Applications toggle or create user, staff or agent accounts.
      </p>

      {result && (
        <p role="status" className="mt-2 rounded-xl border border-emerald-200 bg-white p-3 text-xs leading-5 text-emerald-900">
          Created {result.created?.length || 0}; already existed {result.skipped?.length || 0}.
        </p>
      )}
    </div>
  );
}
