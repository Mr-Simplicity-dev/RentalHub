import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaCheckCircle, FaClipboardCheck, FaExternalLinkAlt, FaExclamationTriangle, FaSyncAlt } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';

const statusClass = (status) => {
  if (status === 'action_required' || status === 'escalated') return 'bg-red-100 text-red-700';
  if (status === 'acknowledged') return 'bg-blue-100 text-blue-700';
  if (status === 'resolved') return 'bg-green-100 text-green-700';
  return 'bg-gray-100 text-gray-600';
};

const slaClass = (status) => {
  if (status === 'breached') return 'bg-red-100 text-red-700';
  if (status === 'due_soon') return 'bg-amber-100 text-amber-700';
  return 'bg-green-100 text-green-700';
};

const label = (value) => String(value || 'not set').replace(/_/g, ' ');

const DepartmentSupportEscalations = ({ department = '', title = 'Support Escalations' }) => {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [actionId, setActionId] = useState('');
  const [statusDialog, setStatusDialog] = useState({
    open: false,
    ticket: null,
    status: '',
    note: '',
    error: '',
  });

  const loadEscalations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/support/department-escalations', {
        params: department ? { department } : {},
      });
      setTickets(res.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load support escalations');
    } finally {
      setLoading(false);
    }
  }, [department]);

  useEffect(() => {
    loadEscalations();
  }, [loadEscalations]);

  const stats = useMemo(() => ({
    total: tickets.length,
    needsAction: tickets.filter((ticket) => ['escalated', 'action_required'].includes(ticket.escalation_status)).length,
    breached: tickets.filter((ticket) => ticket.sla_status === 'breached').length,
    resolved: tickets.filter((ticket) => ticket.escalation_status === 'resolved').length,
  }), [tickets]);

  const openStatusDialog = (ticket, status) => {
    setStatusDialog({
      open: true,
      ticket,
      status,
      note: '',
      error: '',
    });
  };

  const closeStatusDialog = () => {
    if (actionId) return;
    setStatusDialog({
      open: false,
      ticket: null,
      status: '',
      note: '',
      error: '',
    });
  };

  const updateStatus = async (event) => {
    event.preventDefault();

    const { ticket, status } = statusDialog;
    if (!ticket || !status) return;

    const note = statusDialog.note.trim();
    if (['action_required', 'resolved'].includes(status) && !note) {
      setStatusDialog((prev) => ({ ...prev, error: 'A note is required for this status.' }));
      return;
    }

    setActionId(`${ticket.id}-${status}`);
    try {
      await api.patch(`/support/department-escalations/${ticket.id}/status`, {
        status,
        note: note || undefined,
      });
      toast.success('Escalation updated');
      closeStatusDialog();
      await loadEscalations();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update escalation');
    } finally {
      setActionId('');
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500">Operational handoffs from support that need department ownership.</p>
        </div>
        <button onClick={loadEscalations} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <FaSyncAlt /> Refresh
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">Total</p><p className="text-xl font-bold text-gray-900">{stats.total}</p></div>
        <div className="rounded-lg bg-red-50 p-3"><p className="text-xs text-red-600">Needs Action</p><p className="text-xl font-bold text-red-700">{stats.needsAction}</p></div>
        <div className="rounded-lg bg-amber-50 p-3"><p className="text-xs text-amber-700">SLA Breached</p><p className="text-xl font-bold text-amber-800">{stats.breached}</p></div>
        <div className="rounded-lg bg-green-50 p-3"><p className="text-xs text-green-700">Resolved</p><p className="text-xl font-bold text-green-800">{stats.resolved}</p></div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">Loading escalations...</div>
      ) : tickets.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">No escalations assigned to this department.</div>
      ) : (
        <div className="mt-4 grid gap-3">
          {tickets.map((ticket) => (
            <article key={ticket.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-500">Ticket #{ticket.id} · {label(ticket.category)}</p>
                  <h3 className="mt-1 text-sm font-semibold text-gray-900">{ticket.subject}</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {ticket.user_name || ticket.user_email || 'Anonymous'} · {ticket.state || 'No state'}{ticket.lga ? ` / ${ticket.lga}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(ticket.escalation_status)}`}>{label(ticket.escalation_status)}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${slaClass(ticket.sla_status)}`}>{label(ticket.sla_status)}</span>
                </div>
              </div>

              {ticket.escalation_note && <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{ticket.escalation_note}</p>}

              <div className="mt-3 flex flex-wrap gap-2">
                {ticket.related_admin_path && (
                  <a href={ticket.related_admin_path} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    <FaExternalLinkAlt /> Open Related Work
                  </a>
                )}
                <button disabled={Boolean(actionId)} onClick={() => openStatusDialog(ticket, 'acknowledged')} className="inline-flex items-center gap-2 rounded-lg border border-blue-300 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                  <FaClipboardCheck /> Acknowledge
                </button>
                <button disabled={Boolean(actionId)} onClick={() => openStatusDialog(ticket, 'action_required')} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                  <FaExclamationTriangle /> Action Required
                </button>
                <button disabled={Boolean(actionId)} onClick={() => openStatusDialog(ticket, 'resolved')} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">
                  <FaCheckCircle /> Department Resolved
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {statusDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form onSubmit={updateStatus} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Mark as {label(statusDialog.status)}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Add context for ticket #{statusDialog.ticket?.id}. This note is saved to the support escalation timeline.
            </p>
            <label className="mt-5 block text-sm font-medium text-gray-700">
              Department Note {statusDialog.status === 'acknowledged' ? '(Optional)' : ''}
            </label>
            <textarea
              value={statusDialog.note}
              onChange={(event) => setStatusDialog((prev) => ({
                ...prev,
                note: event.target.value,
                error: '',
              }))}
              rows={4}
              className="mt-2 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="What did the department review, decide, or complete?"
            />
            {statusDialog.error && (
              <p className="mt-2 text-sm text-red-600">{statusDialog.error}</p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeStatusDialog}
                disabled={Boolean(actionId)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={Boolean(actionId)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {actionId ? 'Saving...' : 'Save Status'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};

export default DepartmentSupportEscalations;
