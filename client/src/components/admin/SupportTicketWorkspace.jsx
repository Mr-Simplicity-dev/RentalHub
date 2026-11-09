import React, { useMemo, useState } from 'react';
import { FaArrowUp, FaCheckCircle, FaFilter, FaReply, FaSearch, FaUserCheck } from 'react-icons/fa';

const normalize = (value) => String(value || '').toLowerCase().trim();
const label = (value) => String(value || 'not set').replace(/_/g, ' ');

const badge = {
  priority: (value) => value === 'urgent' ? 'bg-red-100 text-red-700' : value === 'high' ? 'bg-orange-100 text-orange-700' : value === 'medium' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600',
  status: (value) => value === 'open' ? 'bg-amber-100 text-amber-700' : value === 'in_progress' ? 'bg-blue-100 text-blue-700' : value === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600',
  sla: (value) => value === 'breached' ? 'bg-red-100 text-red-700' : value === 'due_soon' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700',
  escalation: (value) => value === 'escalated' || value === 'action_required' ? 'bg-red-100 text-red-700' : value === 'acknowledged' ? 'bg-blue-100 text-blue-700' : value === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600',
};

const serviceSummary = (ticket) => (
  <div className="text-xs text-gray-700">
    <p className="font-semibold capitalize">{label(ticket.category || 'general')}</p>
    <p className="text-gray-500">
      {ticket.related_type ? `${label(ticket.related_type)} #${ticket.related_id}` : label(ticket.escalation_department || 'support')}
    </p>
  </div>
);

const TicketActions = ({ ticket, user, onOpen, onAction }) => (
  <div className="flex flex-wrap items-center gap-2">
    <button onClick={() => onOpen(ticket)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"><FaReply size={12} /> View</button>
    <button onClick={() => onAction('assign_me', ticket)} disabled={Number(ticket.assigned_to) === Number(user?.id)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"><FaUserCheck size={12} /> Assign</button>
    {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
      <>
        <button onClick={() => onAction('escalate', ticket)} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"><FaArrowUp size={12} /> Escalate</button>
        <button onClick={() => onAction('resolve', ticket)} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"><FaCheckCircle size={12} /> Resolve</button>
      </>
    )}
  </div>
);

const SupportTicketWorkspace = ({
  tickets = [],
  loading = false,
  user,
  onOpenTicket,
  onTicketAction,
  mode = 'tickets',
}) => {
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    priority: '',
    category: '',
    department: '',
    sla: '',
    assignment: '',
  });

  const visibleTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (mode === 'escalations' && (!ticket.escalation_status || ticket.escalation_status === 'none')) return false;
      if (filters.status && ticket.status !== filters.status) return false;
      if (filters.priority && ticket.priority !== filters.priority) return false;
      if (filters.category && ticket.category !== filters.category) return false;
      if (filters.department && ticket.escalation_department !== filters.department) return false;
      if (filters.sla && ticket.sla_status !== filters.sla) return false;
      if (filters.assignment === 'mine' && Number(ticket.assigned_to) !== Number(user?.id)) return false;
      if (filters.assignment === 'unassigned' && ticket.assigned_to) return false;

      const search = normalize(filters.search);
      if (!search) return true;
      return [
        ticket.id,
        ticket.subject,
        ticket.description,
        ticket.user_name,
        ticket.user_email,
        ticket.category,
        ticket.related_type,
        ticket.escalation_department,
      ].some((value) => normalize(value).includes(search));
    });
  }, [filters, mode, tickets, user?.id]);

  const title = mode === 'escalations' ? 'Escalation Inbox' : 'Support Ticket Workspace';
  const subtitle = mode === 'escalations'
    ? 'Department handoffs that need tracking, acknowledgement, or closure.'
    : 'Filter, triage, assign, reply, and resolve support work from one queue.';

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">
          {visibleTickets.length} visible
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500"><FaFilter /> Filters</div>
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
          <label className="relative md:col-span-2 xl:col-span-1">
            <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
            <input value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder="Search tickets" className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-8 pr-3 text-sm text-gray-700 outline-none focus:border-indigo-400" />
          </label>
          <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
          <select value={filters.priority} onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
            <option value="">All priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select value={filters.category} onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
            <option value="">All categories</option>
            <option value="transportation">Transportation</option>
            <option value="fumigation_cleaning">Fumigation</option>
            <option value="payment">Payment</option>
            <option value="property">Property</option>
            <option value="tenancy">Tenancy</option>
            <option value="general">General</option>
          </select>
          <select value={filters.department} onChange={(e) => setFilters((prev) => ({ ...prev, department: e.target.value }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
            <option value="">All departments</option>
            <option value="transportation">Transportation</option>
            <option value="fumigation">Fumigation</option>
            <option value="finance">Finance</option>
            <option value="legal">Legal</option>
            <option value="technical">Technical</option>
            <option value="support">Support</option>
          </select>
          <select value={filters.sla} onChange={(e) => setFilters((prev) => ({ ...prev, sla: e.target.value }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
            <option value="">All SLA</option>
            <option value="breached">Breached</option>
            <option value="due_soon">Due Soon</option>
            <option value="on_track">On Track</option>
          </select>
          <select value={filters.assignment} onChange={(e) => setFilters((prev) => ({ ...prev, assignment: e.target.value }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
            <option value="">All owners</option>
            <option value="mine">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">Loading tickets...</div>
      ) : visibleTickets.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">No tickets match this view.</div>
      ) : (
        <>
          <div className="mt-4 hidden overflow-x-auto rounded-lg border border-gray-200 lg:block">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['ID', 'Subject', 'Service', 'SLA', 'Escalation', 'Priority', 'Status', 'Actions'].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {visibleTickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3"><code className="text-sm font-semibold text-gray-900">#{ticket.id}</code></td>
                    <td className="max-w-xs px-4 py-3">
                      <p className="truncate text-sm font-medium text-gray-900">{ticket.subject}</p>
                      <p className="truncate text-xs text-gray-500">{ticket.user_name || ticket.user_email || 'Anonymous'}</p>
                      {ticket.unread_user_replies > 0 && <span className="mt-1 inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">{ticket.unread_user_replies} unread</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{serviceSummary(ticket)}</td>
                    <td className="whitespace-nowrap px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.sla(ticket.sla_status)}`}>{label(ticket.sla_status || 'on_track')}</span></td>
                    <td className="whitespace-nowrap px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.escalation(ticket.escalation_status)}`}>{label(ticket.escalation_status || 'none')}</span></td>
                    <td className="whitespace-nowrap px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.priority(ticket.priority)}`}>{label(ticket.priority)}</span></td>
                    <td className="whitespace-nowrap px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.status(ticket.status)}`}>{label(ticket.status)}</span></td>
                    <td className="whitespace-nowrap px-4 py-3"><TicketActions ticket={ticket} user={user} onOpen={onOpenTicket} onAction={onTicketAction} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-3 lg:hidden">
            {visibleTickets.map((ticket) => (
              <article key={ticket.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-500">#{ticket.id}</p>
                    <h3 className="mt-1 truncate text-sm font-semibold text-gray-900">{ticket.subject}</h3>
                    <p className="mt-1 text-xs text-gray-500">{ticket.user_name || ticket.user_email || 'Anonymous'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.sla(ticket.sla_status)}`}>{label(ticket.sla_status || 'on_track')}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-gray-50 p-2">{serviceSummary(ticket)}</div>
                  <div className="rounded-lg bg-gray-50 p-2"><p className="font-semibold capitalize text-gray-800">{label(ticket.escalation_status || 'none')}</p><p className="text-gray-500">{label(ticket.escalation_department || 'support')}</p></div>
                  <span className={`inline-flex justify-center rounded-full px-2.5 py-1 font-medium ${badge.priority(ticket.priority)}`}>{label(ticket.priority)}</span>
                  <span className={`inline-flex justify-center rounded-full px-2.5 py-1 font-medium ${badge.status(ticket.status)}`}>{label(ticket.status)}</span>
                </div>
                <div className="mt-3"><TicketActions ticket={ticket} user={user} onOpen={onOpenTicket} onAction={onTicketAction} /></div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export default SupportTicketWorkspace;
