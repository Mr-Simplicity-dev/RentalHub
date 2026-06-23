import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FaTicketAlt, FaPaperPlane, FaClock, FaCheckCircle, FaExclamationCircle, FaBug, FaLightbulb, FaQuestionCircle, FaSpinner } from 'react-icons/fa';
import Loader from '../components/common/Loader';

const priorityOptions = [
  { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-600' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-700' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-700' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-700' },
];

const statusBadge = (status) => {
  const map = {
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    resolved: 'bg-emerald-100 text-emerald-700',
    closed: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
};

const Support = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', priority: 'medium' });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/support/tickets/my');
        setTickets(res.data?.data || []);
      } catch {
        toast.error('Failed to load your tickets');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/support/tickets', form);
      setTickets((prev) => [res.data.data, ...prev]);
      setForm({ subject: '', description: '', priority: 'medium' });
      setShowForm(false);
      toast.success('Ticket submitted successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Help & Support</h1>
            <p className="mt-2 text-sm text-gray-600">Submit a ticket and track your requests</p>
          </div>
          <button
            onClick={() => setShowForm((p) => !p)}
            className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            <FaPaperPlane /> {showForm ? 'Cancel' : 'New Ticket'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Create a new support ticket</h2>
            <p className="mt-1 text-sm text-gray-500">Describe your issue and our support team will get back to you.</p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Subject *</label>
                <input
                  value={form.subject}
                  onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                  className="input w-full"
                  placeholder="Brief summary of your issue"
                  maxLength={255}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className="input w-full min-h-[120px]"
                  placeholder="Provide as much detail as possible"
                  rows={4}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Priority</label>
                <div className="flex flex-wrap gap-2">
                  {priorityOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, priority: opt.value }))}
                      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                        form.priority === opt.value
                          ? 'ring-2 ring-primary-500 ring-offset-2 ' + opt.color
                          : opt.color + ' hover:ring-1 hover:ring-gray-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button type="submit" disabled={submitting} className="btn btn-primary inline-flex items-center gap-2">
                {submitting ? <FaSpinner className="animate-spin" /> : <FaPaperPlane />}
                {submitting ? 'Submitting...' : 'Submit Ticket'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn text-gray-600">
                Cancel
              </button>
            </div>
          </form>
        )}

        {tickets.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
            <FaTicketAlt className="mx-auto text-5xl text-gray-300" />
            <h3 className="mt-4 text-xl font-semibold text-gray-900">No support tickets yet</h3>
            <p className="mt-2 text-sm text-gray-600">
              Have an issue? Create a ticket and our team will help you out.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{ticket.subject}</h3>
                      {statusBadge(ticket.status)}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        priorityOptions.find((o) => o.value === ticket.priority)?.color || 'bg-gray-100 text-gray-600'
                      }`}>
                        {ticket.priority}
                      </span>
                    </div>
                    {ticket.description && (
                      <p className="mt-2 text-sm text-gray-600 line-clamp-2">{ticket.description}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                  <span className="inline-flex items-center gap-1">
                    <FaClock /> Created {new Date(ticket.created_at).toLocaleDateString()}
                  </span>
                  {ticket.resolved_at && (
                    <span className="inline-flex items-center gap-1 text-emerald-500">
                      <FaCheckCircle /> Resolved {new Date(ticket.resolved_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Quick help topics</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <FaQuestionCircle className="mt-0.5 text-primary-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">How to list a property</p>
                <p className="mt-0.5 text-xs text-gray-500">Visit your dashboard and click "Add Property" to get started.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <FaBug className="mt-0.5 text-primary-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">Report a bug</p>
                <p className="mt-0.5 text-xs text-gray-500">Create a ticket with the bug details and our team will investigate.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <FaLightbulb className="mt-0.5 text-primary-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">Feature suggestions</p>
                <p className="mt-0.5 text-xs text-gray-500">Share your ideas for improving the platform.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <FaExclamationCircle className="mt-0.5 text-primary-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">Account issues</p>
                <p className="mt-0.5 text-xs text-gray-500">Facing login, verification or profile issues? Let us know.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Support;
