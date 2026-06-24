import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  FaEnvelope, FaUsers, FaChartBar, FaPaperPlane, FaPlus, FaTrash, FaPlay,
  FaCopy, FaEye, FaSyncAlt, FaSearch, FaTimes, FaCheck, FaExternalLinkAlt,
  FaChevronLeft, FaChevronRight, FaEdit, FaFileAlt,
} from 'react-icons/fa';
import api from '../../services/api';

const TAB_KEYS = ['overview', 'campaigns', 'subscribers', 'templates'];

const emptyCampaign = {
  name: '', subject: '', content_html: '',
  sender_name: '', sender_email: '', reply_to: '',
  template_id: '', recipient_filter: '{}',
};

const emptyTemplate = {
  name: '', description: '', subject: '', content_html: '', category: 'general',
};

const EmailMarketingTab = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);

  // Dashboard stats
  const [stats, setStats] = useState(null);

  // Subscribers
  const [subscribers, setSubscribers] = useState([]);
  const [subSearch, setSubSearch] = useState('');
  const [subPage, setSubPage] = useState(1);
  const [subTotal, setSubTotal] = useState(0);
  const [showAddSubscriber, setShowAddSubscriber] = useState(false);
  const [newSubscriber, setNewSubscriber] = useState({ email: '', full_name: '', source: 'manual' });

  // Campaigns
  const [campaigns, setCampaigns] = useState([]);
  const [campaignForm, setCampaignForm] = useState(emptyCampaign);
  const [editingCampaignId, setEditingCampaignId] = useState(null);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [campaignStats, setCampaignStats] = useState(null);
  const [viewingCampaignId, setViewingCampaignId] = useState(null);

  // Templates
  const [templates, setTemplates] = useState([]);
  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get('/email-marketing/stats');
      setStats(res.data.data);
    } catch { /* ignore */ }
  }, []);

  const loadSubscribers = useCallback(async (search = '', page = 1) => {
    try {
      const params = { page, limit: 30 };
      if (search) params.search = search;
      const res = await api.get('/email-marketing/subscribers', { params });
      setSubscribers(res.data.data);
      setSubTotal(res.data.pagination?.total || 0);
    } catch {
      toast.error('Failed to load subscribers');
    }
  }, []);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await api.get('/email-marketing/campaigns');
      setCampaigns(res.data.data);
    } catch {
      toast.error('Failed to load campaigns');
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await api.get('/email-marketing/templates');
      setTemplates(res.data.data);
    } catch {
      toast.error('Failed to load templates');
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadCampaigns();
    loadTemplates();
  }, [loadStats, loadCampaigns, loadTemplates]);

  useEffect(() => {
    if (activeTab === 'subscribers') loadSubscribers(subSearch, subPage);
  }, [activeTab, subSearch, subPage, loadSubscribers]);

  // ─── Sync ─────────────────────────────────────────────────────────────────
  const handleSync = async () => {
    try {
      setLoading(true);
      const res = await api.post('/email-marketing/subscribers/sync');
      toast.success(`Synced: ${res.data.data.added} added, ${res.data.data.updated} updated`);
      loadStats();
      if (activeTab === 'subscribers') loadSubscribers(subSearch, subPage);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Sync failed');
    } finally {
      setLoading(false);
    }
  };

  // ─── Add subscriber ───────────────────────────────────────────────────────
  const handleAddSubscriber = async (e) => {
    e.preventDefault();
    if (!newSubscriber.email.trim()) { toast.error('Email is required'); return; }
    try {
      await api.post('/email-marketing/subscribers', newSubscriber);
      toast.success('Subscriber added');
      setShowAddSubscriber(false);
      setNewSubscriber({ email: '', full_name: '', source: 'manual' });
      loadSubscribers(subSearch, subPage);
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add subscriber');
    }
  };

  const handleDeleteSubscriber = async (id) => {
    if (!window.confirm('Remove this subscriber?')) return;
    try {
      await api.delete(`/email-marketing/subscribers/${id}`);
      toast.success('Subscriber removed');
      loadSubscribers(subSearch, subPage);
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  const handleToggleSubscribed = async (sub) => {
    try {
      await api.patch(`/email-marketing/subscribers/${sub.id}`, { subscribed: !sub.subscribed });
      toast.success(sub.subscribed ? 'Unsubscribed' : 'Re-subscribed');
      loadSubscribers(subSearch, subPage);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    }
  };

  // ─── Campaigns ────────────────────────────────────────────────────────────
  const handleCampaignSubmit = async (e) => {
    e.preventDefault();
    if (!campaignForm.name.trim()) { toast.error('Campaign name is required'); return; }
    if (!campaignForm.subject.trim()) { toast.error('Subject is required'); return; }

    try {
      setLoading(true);
      const payload = {
        ...campaignForm,
        recipient_filter: campaignForm.recipient_filter ? JSON.parse(campaignForm.recipient_filter) : {},
        template_id: campaignForm.template_id || null,
      };

      if (editingCampaignId) {
        await api.patch(`/email-marketing/campaigns/${editingCampaignId}`, payload);
        toast.success('Campaign updated');
      } else {
        await api.post('/email-marketing/campaigns', payload);
        toast.success('Campaign created');
      }

      setShowCampaignForm(false);
      setEditingCampaignId(null);
      setCampaignForm(emptyCampaign);
      loadCampaigns();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save campaign');
    } finally {
      setLoading(false);
    }
  };

  const handleEditCampaign = (campaign) => {
    setCampaignForm({
      name: campaign.name || '',
      subject: campaign.subject || '',
      content_html: campaign.content_html || '',
      sender_name: campaign.sender_name || '',
      sender_email: campaign.sender_email || '',
      reply_to: campaign.reply_to || '',
      template_id: campaign.template_id || '',
      recipient_filter: JSON.stringify(campaign.recipient_filter || {}, null, 2),
    });
    setEditingCampaignId(campaign.id);
    setShowCampaignForm(true);
  };

  const handleSendCampaign = async (id) => {
    if (!window.confirm('Send this campaign to all matching subscribers?')) return;
    try {
      setLoading(true);
      const res = await api.post(`/email-marketing/campaigns/${id}/send`);
      toast.success(`Sent: ${res.data.data.sent} Success, ${res.data.data.failed} Failed`);
      loadCampaigns();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Send failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCampaign = async (id) => {
    if (!window.confirm('Delete this campaign?')) return;
    try {
      await api.delete(`/email-marketing/campaigns/${id}`);
      toast.success('Campaign deleted');
      loadCampaigns();
      if (viewingCampaignId === id) setViewingCampaignId(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  const handleViewStats = async (id) => {
    try {
      const res = await api.get(`/email-marketing/campaigns/${id}/stats`);
      setCampaignStats(res.data.data);
      setViewingCampaignId(id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load stats');
    }
  };

  // ─── Templates ────────────────────────────────────────────────────────────
  const handleTemplateSubmit = async (e) => {
    e.preventDefault();
    if (!templateForm.name.trim()) { toast.error('Template name is required'); return; }
    if (!templateForm.subject.trim()) { toast.error('Subject is required'); return; }

    try {
      setLoading(true);
      if (editingTemplateId) {
        await api.patch(`/email-marketing/templates/${editingTemplateId}`, templateForm);
        toast.success('Template updated');
      } else {
        await api.post('/email-marketing/templates', templateForm);
        toast.success('Template created');
      }
      setShowTemplateForm(false);
      setEditingTemplateId(null);
      setTemplateForm(emptyTemplate);
      loadTemplates();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save template');
    } finally {
      setLoading(false);
    }
  };

  const handleEditTemplate = (tpl) => {
    setTemplateForm({
      name: tpl.name || '', description: tpl.description || '',
      subject: tpl.subject || '', content_html: tpl.content_html || '',
      category: tpl.category || 'general',
    });
    setEditingTemplateId(tpl.id);
    setShowTemplateForm(true);
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await api.delete(`/email-marketing/templates/${id}`);
      toast.success('Template deleted');
      loadTemplates();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  const totalPages = Math.ceil(subTotal / 30);

  // ─── Renderers ────────────────────────────────────────────────────────────
  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary-50 p-3"><FaUsers className="text-lg text-primary-600" /></div>
            <div>
              <p className="text-2xl font-bold">{stats?.subscribers?.total || 0}</p>
              <p className="text-xs text-gray-500">Total Contacts</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-green-600">{stats?.subscribers?.active || 0} active subscribers</p>
        </div>

        <div className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-3"><FaEnvelope className="text-lg text-blue-600" /></div>
            <div>
              <p className="text-2xl font-bold">{stats?.campaigns?.total || 0}</p>
              <p className="text-xs text-gray-500">Total Campaigns</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-green-600">{stats?.campaigns?.sent || 0} sent</p>
        </div>

        <div className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-50 p-3"><FaPaperPlane className="text-lg text-green-600" /></div>
            <div>
              <p className="text-2xl font-bold">{stats?.monthlySent || 0}</p>
              <p className="text-xs text-gray-500">Sent (30 days)</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-50 p-3"><FaChartBar className="text-lg text-purple-600" /></div>
            <div>
              <p className="text-2xl font-bold">{stats?.subscribers?.active > 0 ? Math.round((stats?.subscribers?.active / stats?.subscribers?.total) * 100) : 0}%</p>
              <p className="text-xs text-gray-500">Engagement Rate</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={handleSync} disabled={loading} className="btn btn-primary gap-2">
          <FaSyncAlt className={loading ? 'animate-spin' : ''} />
          Sync Contacts from Users & Leads
        </button>
        <button onClick={() => setActiveTab('campaigns')} className="btn btn-secondary gap-2">
          <FaPlus /> New Campaign
        </button>
      </div>

      {stats?.recentCampaigns?.length > 0 && (
        <div className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Recent Campaigns</h3>
          <div className="space-y-3">
            {stats.recentCampaigns.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                <div>
                  <p className="font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500">
                    {c.status} &middot; {c.sent_at ? new Date(c.sent_at).toLocaleDateString() : 'Not sent'}
                    {c.stats?.sent ? ` &middot; ${c.stats.sent} sent` : ''}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  c.status === 'sent' ? 'bg-green-100 text-green-700' :
                  c.status === 'sending' ? 'bg-blue-100 text-blue-700' :
                  c.status === 'draft' ? 'bg-gray-100 text-gray-600' : 'bg-yellow-100 text-yellow-700'
                }`}>{c.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderSubscribers = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={subSearch} onChange={(e) => { setSubSearch(e.target.value); setSubPage(1); }}
              placeholder="Search subscribers..."
              className="input pl-9"
            />
          </div>
          <button onClick={() => loadSubscribers(subSearch, subPage)} className="btn btn-secondary">Search</button>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSync} disabled={loading} className="btn btn-secondary gap-2">
            <FaSyncAlt className={loading ? 'animate-spin' : ''} /> Sync
          </button>
          <button onClick={() => setShowAddSubscriber(true)} className="btn btn-primary gap-2">
            <FaPlus /> Add Contact
          </button>
        </div>
      </div>

      {showAddSubscriber && (
        <form onSubmit={handleAddSubscriber} className="rounded-xl border border-soft bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <input value={newSubscriber.email} onChange={(e) => setNewSubscriber({ ...newSubscriber, email: e.target.value })} placeholder="Email *" className="input" required />
            <input value={newSubscriber.full_name} onChange={(e) => setNewSubscriber({ ...newSubscriber, full_name: e.target.value })} placeholder="Full name" className="input" />
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary flex-1"><FaPlus /> Add</button>
              <button type="button" onClick={() => setShowAddSubscriber(false)} className="btn btn-secondary"><FaTimes /></button>
            </div>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-soft bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Added</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {subscribers.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No subscribers found. Sync contacts to get started.</td></tr>
            ) : subscribers.map((sub) => (
              <tr key={sub.id} className="border-b border-gray-50 transition hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{sub.email}</td>
                <td className="px-4 py-3 text-gray-600">{sub.full_name || '—'}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium">{sub.source}</span></td>
                <td className="px-4 py-3 text-gray-600">{sub.user_type || '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleToggleSubscribed(sub)} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sub.subscribed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {sub.subscribed ? 'Active' : 'Unsubscribed'}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(sub.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDeleteSubscriber(sub.id)} className="text-red-500 hover:text-red-700" title="Remove">
                    <FaTrash />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={subPage <= 1} onClick={() => setSubPage((p) => Math.max(1, p - 1))} className="btn btn-secondary px-3 py-2"><FaChevronLeft /></button>
          <span className="text-sm text-gray-600">Page {subPage} of {totalPages}</span>
          <button disabled={subPage >= totalPages} onClick={() => setSubPage((p) => p + 1)} className="btn btn-secondary px-3 py-2"><FaChevronRight /></button>
        </div>
      )}
    </div>
  );

  const renderCampaigns = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Campaigns</h3>
        <button onClick={() => { setShowCampaignForm(true); setEditingCampaignId(null); setCampaignForm(emptyCampaign); }} className="btn btn-primary gap-2">
          <FaPlus /> New Campaign
        </button>
      </div>

      {showCampaignForm && (
        <form onSubmit={handleCampaignSubmit} className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-sm font-semibold text-gray-900">{editingCampaignId ? 'Edit Campaign' : 'Create Campaign'}</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Campaign Name <input value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} className="input mt-1" placeholder="e.g., June Newsletter" /></label>
            <label className="text-sm font-medium text-gray-700">Email Subject <input value={campaignForm.subject} onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })} className="input mt-1" placeholder="Subject line" /></label>
            <label className="text-sm font-medium text-gray-700">Sender Name <input value={campaignForm.sender_name} onChange={(e) => setCampaignForm({ ...campaignForm, sender_name: e.target.value })} className="input mt-1" placeholder="RentalHub NG" /></label>
            <label className="text-sm font-medium text-gray-700">Sender Email <input value={campaignForm.sender_email} onChange={(e) => setCampaignForm({ ...campaignForm, sender_email: e.target.value })} className="input mt-1" placeholder="support@rentalhub.com.ng" /></label>
            <label className="text-sm font-medium text-gray-700">Template <select value={campaignForm.template_id} onChange={(e) => setCampaignForm({ ...campaignForm, template_id: e.target.value })} className="input mt-1">
              <option value="">No template (use raw HTML)</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></label>
            <label className="text-sm font-medium text-gray-700">Recipient Filter (JSON) <textarea value={campaignForm.recipient_filter} onChange={(e) => setCampaignForm({ ...campaignForm, recipient_filter: e.target.value })} className="input mt-1 min-h-[60px] font-mono text-xs" placeholder='{"sources":["user","lead"],"user_types":["tenant","landlord"]}' /></label>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-gray-700">HTML Content <textarea value={campaignForm.content_html} onChange={(e) => setCampaignForm({ ...campaignForm, content_html: e.target.value })} className="input mt-1 min-h-[200px] font-mono text-xs" placeholder="<h1>Your HTML here</h1>" /></label>
              <p className="mt-1 text-xs text-gray-500">Leave empty to use template. If provided, this overrides the template.</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={loading} className="btn btn-primary">{editingCampaignId ? 'Update' : 'Create'} Campaign</button>
            <button type="button" onClick={() => { setShowCampaignForm(false); setEditingCampaignId(null); }} className="btn btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {campaigns.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">No campaigns yet.</p>
        ) : campaigns.map((c) => (
          <div key={c.id} className="rounded-xl border border-soft bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-gray-900">{c.name}</h4>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    c.status === 'sent' ? 'bg-green-100 text-green-700' :
                    c.status === 'sending' ? 'bg-blue-100 text-blue-700' :
                    c.status === 'draft' ? 'bg-gray-100 text-gray-600' : 'bg-yellow-100 text-yellow-700'
                  }`}>{c.status}</span>
                </div>
                <p className="mt-1 text-sm text-gray-500">Subject: {c.subject}</p>
                {c.stats?.sent > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    Sent: {c.stats.sent} | Opened: {c.stats.opened} | Clicked: {c.stats.clicked} | Bounced: {c.stats.bounced} | Failed: {c.stats.failed}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">Created by {c.created_by_name || 'Unknown'} &middot; {new Date(c.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {c.status === 'draft' && (
                  <>
                    <button onClick={() => handleEditCampaign(c)} className="btn btn-secondary px-3 py-2 text-xs"><FaEdit /></button>
                    <button onClick={() => handleSendCampaign(c.id)} disabled={loading} className="btn btn-primary px-3 py-2 text-xs gap-1"><FaPlay /> Send</button>
                    <button onClick={() => handleDeleteCampaign(c.id)} className="btn btn-danger px-3 py-2 text-xs"><FaTrash /></button>
                  </>
                )}
                {c.status === 'sent' && (
                  <button onClick={() => handleViewStats(c.id)} className="btn btn-secondary px-3 py-2 text-xs gap-1"><FaChartBar /> Stats</button>
                )}
              </div>
            </div>

            {viewingCampaignId === c.id && campaignStats && (
              <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
                <h5 className="mb-3 text-sm font-semibold text-gray-900">Campaign Stats</h5>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded-lg bg-white p-3 text-center"><p className="text-lg font-bold text-gray-900">{campaignStats.stats.total}</p><p className="text-xs text-gray-500">Total</p></div>
                  <div className="rounded-lg bg-white p-3 text-center"><p className="text-lg font-bold text-green-600">{campaignStats.stats.sent}</p><p className="text-xs text-gray-500">Sent</p></div>
                  <div className="rounded-lg bg-white p-3 text-center"><p className="text-lg font-bold text-blue-600">{campaignStats.stats.opened}</p><p className="text-xs text-gray-500">Opened</p></div>
                  <div className="rounded-lg bg-white p-3 text-center"><p className="text-lg font-bold text-purple-600">{campaignStats.stats.clicked}</p><p className="text-xs text-gray-500">Clicked</p></div>
                  <div className="rounded-lg bg-white p-3 text-center"><p className="text-lg font-bold text-red-600">{campaignStats.stats.failed}</p><p className="text-xs text-gray-500">Failed</p></div>
                  <div className="rounded-lg bg-white p-3 text-center"><p className="text-lg font-bold text-yellow-600">{campaignStats.stats.bounced}</p><p className="text-xs text-gray-500">Bounced</p></div>
                </div>
                <button onClick={() => setViewingCampaignId(null)} className="mt-3 text-xs text-gray-500 hover:text-gray-700">&larr; Close stats</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderTemplates = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Email Templates</h3>
        <button onClick={() => { setShowTemplateForm(true); setEditingTemplateId(null); setTemplateForm(emptyTemplate); }} className="btn btn-primary gap-2">
          <FaPlus /> New Template
        </button>
      </div>

      {showTemplateForm && (
        <form onSubmit={handleTemplateSubmit} className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-sm font-semibold text-gray-900">{editingTemplateId ? 'Edit Template' : 'Create Template'}</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Name <input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} className="input mt-1" placeholder="Template name" /></label>
            <label className="text-sm font-medium text-gray-700">Category <select value={templateForm.category} onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })} className="input mt-1">
              <option value="general">General</option>
              <option value="newsletter">Newsletter</option>
              <option value="promo">Promotional</option>
              <option value="property_alert">Property Alert</option>
              <option value="re_engagement">Re-engagement</option>
            </select></label>
            <label className="text-sm font-medium text-gray-700 md:col-span-2">Description <input value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} className="input mt-1" placeholder="What's this template for?" /></label>
            <label className="text-sm font-medium text-gray-700 md:col-span-2">Default Subject <input value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} className="input mt-1" placeholder="Default email subject" /></label>
            <label className="text-sm font-medium text-gray-700 md:col-span-2">HTML Content <textarea value={templateForm.content_html} onChange={(e) => setTemplateForm({ ...templateForm, content_html: e.target.value })} className="input mt-1 min-h-[160px] font-mono text-xs" placeholder="<h1>Your reusable HTML template</h1>" /></label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={loading} className="btn btn-primary">{editingTemplateId ? 'Update' : 'Create'} Template</button>
            <button type="button" onClick={() => { setShowTemplateForm(false); setEditingTemplateId(null); }} className="btn btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {templates.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">No templates yet.</div>
        ) : templates.map((t) => (
          <div key={t.id} className="rounded-xl border border-soft bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-semibold text-gray-900">{t.name}</h4>
                <p className="text-xs text-gray-500 mt-0.5">{t.category} &middot; {t.is_system ? 'System' : 'Custom'}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleEditTemplate(t)} className="text-gray-500 hover:text-primary-600 p-1"><FaEdit /></button>
                {!t.is_system && <button onClick={() => handleDeleteTemplate(t.id)} className="text-gray-500 hover:text-red-600 p-1"><FaTrash /></button>}
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500 line-clamp-2">{t.description || 'No description'}</p>
            <p className="mt-1 text-xs text-gray-400">Subject: {t.subject}</p>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {key === 'overview' && <><FaChartBar className="mr-1.5 inline" />Overview</>}
            {key === 'campaigns' && <><FaEnvelope className="mr-1.5 inline" />Campaigns</>}
            {key === 'subscribers' && <><FaUsers className="mr-1.5 inline" />Contacts</>}
            {key === 'templates' && <><FaFileAlt className="mr-1.5 inline" />Templates</>}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'subscribers' && renderSubscribers()}
      {activeTab === 'campaigns' && renderCampaigns()}
      {activeTab === 'templates' && renderTemplates()}
    </div>
  );
};

export default EmailMarketingTab;
