import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaClock, FaExchangeAlt, FaExternalLinkAlt, FaInfoCircle, FaRoute, FaSprayCan, FaSyncAlt } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';

const departments = [
  { value: 'transportation', label: 'Transportation' },
  { value: 'fumigation', label: 'Fumigation & Cleaning' },
  { value: 'finance', label: 'Finance' },
  { value: 'legal', label: 'Legal' },
  { value: 'technical', label: 'Technical' },
];

const statusOptions = [
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'action_required', label: 'Action Required' },
  { value: 'resolved', label: 'Department Resolved' },
];

const formatLabel = (value) => String(value || 'Not set').replace(/_/g, ' ');

const formatDateTime = (value) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleString();
};

const Field = ({ label, value }) => (
  <div>
    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
    <p className="mt-0.5 text-sm font-medium text-gray-900">{value || 'Not set'}</p>
  </div>
);

const ContextFields = ({ context }) => {
  if (!context?.data) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-500">
        No linked transport or fumigation booking was found for this ticket.
      </div>
    );
  }

  const data = context.data;
  if (context.type === 'transportation_booking') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Service" value={`${data.service_name || 'Transportation'}${data.service_type ? ` (${data.service_type})` : ''}`} />
        <Field label="Booking Status" value={formatLabel(data.booking_status)} />
        <Field label="Payment" value={formatLabel(data.payment_status)} />
        <Field label="Schedule" value={`${data.booking_date || 'Not set'} ${data.booking_time || ''}`.trim()} />
        <Field label="Pickup" value={data.pickup_address} />
        <Field label="Destination" value={data.destination_address} />
        <Field label="Driver" value={data.driver_name || data.provider_name} />
        <Field label="Driver Phone" value={data.driver_phone} />
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Service" value={`${data.service_name || 'Fumigation/Cleaning'}${data.category_type ? ` (${data.category_type})` : ''}`} />
      <Field label="Reference" value={data.booking_reference} />
      <Field label="Booking Status" value={formatLabel(data.booking_status)} />
      <Field label="Payment" value={formatLabel(data.payment_status)} />
      <Field label="Schedule" value={`${data.booking_date || 'Not set'} ${data.specific_time || data.preferred_time_slot || ''}`.trim()} />
      <Field label="Provider" value={data.assigned_provider || data.assigned_team_leader} />
      <Field label="Provider Phone" value={data.provider_phone || data.team_contact_phone} />
      <Field label="Property" value={data.property_title || data.property_address} />
    </div>
  );
};

const SupportTicketServicePanel = ({ ticket, onTicketUpdated }) => {
  const [loading, setLoading] = useState(false);
  const [contextData, setContextData] = useState(null);
  const [department, setDepartment] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('acknowledged');
  const [saving, setSaving] = useState(false);

  const effectiveTicket = contextData?.ticket || ticket;
  const relatedContext = contextData?.related_context;
  const timeline = contextData?.timeline || [];

  const loadContext = useCallback(async () => {
    if (!ticket?.id) return;
    setLoading(true);
    try {
      const res = await api.get(`/support/tickets/${ticket.id}/context`);
      setContextData(res.data?.data || null);
      const nextTicket = res.data?.data?.ticket;
      if (nextTicket) {
        setDepartment(nextTicket.escalation_department && nextTicket.escalation_department !== 'support' ? nextTicket.escalation_department : '');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load ticket context');
    } finally {
      setLoading(false);
    }
  }, [ticket?.id]);

  useEffect(() => {
    setContextData(null);
    setDepartment('');
    setNote('');
    setStatus('acknowledged');
    loadContext();
  }, [loadContext]);

  const slaClass = useMemo(() => {
    if (effectiveTicket?.sla_status === 'breached') return 'bg-red-100 text-red-700';
    if (effectiveTicket?.sla_status === 'due_soon') return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
  }, [effectiveTicket?.sla_status]);

  const handleEscalate = async () => {
    if (!department) return toast.error('Choose a department');
    setSaving(true);
    try {
      const res = await api.post(`/support/tickets/${ticket.id}/escalate-department`, { department, note });
      toast.success('Ticket handed off');
      setNote('');
      onTicketUpdated?.(res.data?.data);
      await loadContext();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to hand off ticket');
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async () => {
    setSaving(true);
    try {
      const res = await api.patch(`/support/tickets/${ticket.id}/escalation-status`, { status, note });
      toast.success('Escalation updated');
      setNote('');
      onTicketUpdated?.(res.data?.data);
      await loadContext();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update escalation');
    } finally {
      setSaving(false);
    }
  };

  const icon = effectiveTicket?.related_type === 'transportation_booking'
    ? <FaRoute className="text-blue-600" />
    : effectiveTicket?.related_type === 'fumigation_cleaning_booking'
      ? <FaSprayCan className="text-emerald-600" />
      : <FaInfoCircle className="text-gray-500" />;

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-gray-100 p-2.5">{icon}</div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Service Context & Handoff</h4>
            <p className="text-xs text-gray-500">
              {formatLabel(effectiveTicket?.category)} ticket
              {effectiveTicket?.related_type ? ` linked to ${formatLabel(effectiveTicket.related_type)} #${effectiveTicket.related_id}` : ''}
            </p>
          </div>
        </div>
        <button
          onClick={loadContext}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <FaSyncAlt className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Department</p>
          <p className="mt-1 text-sm font-semibold capitalize text-gray-900">{formatLabel(effectiveTicket?.escalation_department)}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Escalation</p>
          <p className="mt-1 text-sm font-semibold capitalize text-gray-900">{formatLabel(effectiveTicket?.escalation_status)}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-gray-500"><FaClock /> SLA</p>
          <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${slaClass}`}>
            {formatLabel(effectiveTicket?.sla_status)}
          </span>
          <p className="mt-1 text-xs text-gray-500">{formatDateTime(effectiveTicket?.sla_due_at)}</p>
        </div>
      </div>

      <ContextFields context={relatedContext} />

      {effectiveTicket?.related_admin_path && (
        <a href={effectiveTicket.related_admin_path} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
          <FaExternalLinkAlt /> Open related operational record
        </a>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-400"
        >
          <option value="">Choose department</option>
          {departments.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Handoff note or department update"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-400"
        />
        <button
          onClick={handleEscalate}
          disabled={saving || !department}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <FaExchangeAlt /> Hand Off
        </button>
      </div>

      {effectiveTicket?.escalation_status && effectiveTicket.escalation_status !== 'none' && (
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-400"
          >
            {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button
            onClick={handleStatus}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Update Escalation
          </button>
        </div>
      )}

      {timeline.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Timeline</p>
          <div className="mt-2 max-h-36 space-y-2 overflow-y-auto">
            {timeline.map((item) => (
              <div key={item.id} className="rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
                <p className="font-medium capitalize text-gray-800">{formatLabel(item.event_type)}</p>
                {item.message && <p className="mt-0.5">{item.message}</p>}
                <p className="mt-0.5 text-gray-400">{formatDateTime(item.created_at)}{item.actor_name ? ` by ${item.actor_name}` : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportTicketServicePanel;
