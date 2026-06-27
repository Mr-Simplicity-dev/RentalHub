import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaSyncAlt, FaHome } from 'react-icons/fa';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../hooks/useSocket';
import api from '../../services/api';
import PropertyRequestWorkflowPanel from '../../components/admin/PropertyRequestWorkflowPanel';
import TenancyWorkflowPanel from '../../components/admin/TenancyWorkflowPanel';
import SupportTicketWorkspace from '../../components/admin/SupportTicketWorkspace';
import TicketConversationModal from '../../components/common/TicketConversationModal';

const LgaSupportAdminDashboard = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ tickets: [] });
  const [selectedTicket, setSelectedTicket] = useState(null);
  const activeTab = useMemo(() => {
    const tab = new URLSearchParams(location.search).get('tab') || 'overview';
    return ['overview', 'property_requests', 'tenancy', 'tickets', 'escalations'].includes(tab) ? tab : 'overview';
  }, [location.search]);

  const workspaceTabs = [
    { key: 'overview', label: 'Overview', to: '/admin/lga-support-dashboard?tab=overview' },
    { key: 'property_requests', label: 'Property Requests', to: '/admin/lga-support-dashboard?tab=property_requests' },
    { key: 'tenancy', label: 'Tenancy Actions', to: '/admin/lga-support-dashboard?tab=tenancy' },
    { key: 'tickets', label: 'Support Tickets', to: '/admin/lga-support-dashboard?tab=tickets' },
    { key: 'escalations', label: 'Escalations', to: '/admin/lga-support-dashboard?tab=escalations' },
  ];

  // Socket listener for real-time ticket list updates
  useEffect(() => {
    if (!socket) return;
    const refreshTickets = async () => {
      try {
        const ticketsRes = await api.get('/support/tickets');
        setData({ tickets: ticketsRes.data?.data || [] });
      } catch {}
    };
    socket.on('ticket:new_reply', refreshTickets);
    socket.on('ticket:created', refreshTickets);
    socket.on('ticket:updated', refreshTickets);
    return () => {
      socket.off('ticket:new_reply', refreshTickets);
      socket.off('ticket:created', refreshTickets);
      socket.off('ticket:updated', refreshTickets);
    };
  }, [socket]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const ticketsRes = await api.get('/support/tickets');
      setData({ tickets: ticketsRes.data?.data || [] });
    } catch {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const ticketStats = useMemo(() => {
    const tickets = data.tickets || [];
    return {
      total: tickets.length,
      open: tickets.filter((t) => t.status === 'open').length,
      inProgress: tickets.filter((t) => t.status === 'in_progress').length,
      resolved: tickets.filter((t) => t.status === 'resolved').length,
      unassigned: tickets.filter((t) => !t.assigned_to).length,
    };
  }, [data.tickets]);

  const openTicket = (ticket) => {
    setSelectedTicket(ticket);
  };

  const closeTicketModal = () => {
    setSelectedTicket(null);
  };

  const handleQuickAction = async (action, ticket) => {
    try {
      if (action === 'resolve') {
        await api.patch(`/support/tickets/${ticket.id}/resolve`);
        toast.success('Ticket resolved');
      } else if (action === 'assign_me') {
        await api.patch(`/support/tickets/${ticket.id}/assign`, { assigned_to: user.id });
        toast.success('Ticket assigned to you');
      } else if (action === 'escalate') {
        await api.post('/support/tickets/escalate', { ticketId: ticket.id });
        toast.success('Ticket escalated');
      }
      loadDashboard();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const handleTicketUpdated = (updatedTicket) => {
    if (!updatedTicket) return;
    loadDashboard();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-admin-50 via-white to-admin-100/40 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">LGA Support Dashboard</h1>
          <p className="mt-1 text-gray-600">
            Manage property requests, tenancy operations, and support tickets for{' '}
            <span className="font-semibold text-admin-700">{user?.assigned_city || user?.assigned_state || 'your LGA'}</span>.
          </p>
          <div className="mt-4">
            <button onClick={loadDashboard} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><FaSyncAlt /> Refresh</button>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          {workspaceTabs.map((tab) => (
            <Link
              key={tab.key}
              to={tab.to}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? 'bg-admin-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {activeTab === 'overview' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-600">Open Tickets</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{ticketStats.open}</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs font-medium text-blue-700">In Progress</p>
              <p className="mt-1 text-2xl font-bold text-blue-800">{ticketStats.inProgress}</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-xs font-medium text-green-700">Resolved</p>
              <p className="mt-1 text-2xl font-bold text-green-800">{ticketStats.resolved}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-600">Unassigned</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">{ticketStats.unassigned}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Link to="/admin/lga-support-dashboard?tab=property_requests" className="rounded-lg border border-gray-200 p-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Review property requests
            </Link>
            <Link to="/admin/lga-support-dashboard?tab=tenancy" className="rounded-lg border border-gray-200 p-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Handle tenancy actions
            </Link>
            <Link to="/admin/lga-support-dashboard?tab=tickets" className="rounded-lg border border-gray-200 p-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Open support inbox
            </Link>
          </div>
        </div>
        )}

        {activeTab === 'property_requests' && (
        <div className="lga-support-property-requests-section">
          <PropertyRequestWorkflowPanel mode="support" title="Property Requests in Your LGA" />
        </div>
        )}
        {activeTab === 'tenancy' && (
        <div className="lga-support-tenancy-section">
          <TenancyWorkflowPanel title="LGA Support Tenancy Grace and Refund Enablement" />
        </div>
        )}

        {activeTab === 'tickets' && (
        <SupportTicketWorkspace tickets={data.tickets} loading={loading} user={user} onOpenTicket={openTicket} onTicketAction={handleQuickAction} mode="tickets" />
        )}

        {activeTab === 'escalations' && (
        <SupportTicketWorkspace tickets={data.tickets} loading={loading} user={user} onOpenTicket={openTicket} onTicketAction={handleQuickAction} mode="escalations" />
        )}
      </div>

      {selectedTicket && (
        <TicketConversationModal
          ticket={selectedTicket}
          user={user}
          socket={socket}
          onClose={closeTicketModal}
          onTicketUpdated={handleTicketUpdated}
          onAssign={(t) => handleQuickAction('assign_me', t)}
          onEscalate={(t) => handleQuickAction('escalate', t)}
          onResolve={(t) => handleQuickAction('resolve', t)}
          accentColor="amber"
        />
      )}
    </div>
  );
};

export default LgaSupportAdminDashboard;
