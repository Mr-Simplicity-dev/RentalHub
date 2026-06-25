import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  FaEnvelope, FaUsers, FaChartBar, FaPaperPlane, FaPlus, FaTrash, FaPlay,
  FaSyncAlt, FaSearch, FaTimes, FaEdit, FaFileAlt, FaChevronLeft, FaChevronRight,
  FaPhone, FaUpload, FaRedo, FaDollarSign, FaClock,
} from 'react-icons/fa';
import api from '../../services/api';

const TAB_KEYS = ['overview', 'campaigns', 'subscribers', 'templates'];

const SEGMENT_LIMIT = 160;
const COST_PER_SEGMENT = 4;

const getSegments = (text) => Math.ceil((text || '').length / SEGMENT_LIMIT) || 1;

const formatCost = (segments, recipients) => {
  const total = segments * COST_PER_SEGMENT * (recipients || 0);
  return `\u20A6${total.toFixed(2)}`;
};

const emptyCampaign = {
  name: '', content: '',
  sender_name: '',
  template_id: '', recipient_filter: '{}',
  max_retries: 0, scheduled_at: '',
};

const emptyTemplate = {
  name: '', description: '', content: '', category: 'general',
};

const governanceCopy = {
  send_campaign: {
    title: 'Queue SMS campaign',
    label: 'Launch approval note',
    placeholder: 'Who approved this send and why is it needed now?',
    required: 'A launch approval note is required',
    tone: 'primary',
  },
  retry_campaign: {
    title: 'Retry failed SMS messages',
    label: 'Retry reason',
    placeholder: 'Explain why these failed messages should be retried',
    required: 'A retry reason is required',
    tone: 'secondary',
  },
  delete_campaign: {
    title: 'Delete SMS campaign',
    label: 'Deletion reason',
    placeholder: 'Explain why this campaign should be deleted',
    required: 'A campaign deletion reason is required',
    tone: 'danger',
  },
  delete_subscriber: {
    title: 'Remove SMS subscriber',
    label: 'Removal reason',
    placeholder: 'Explain why this contact is being removed',
    required: 'A subscriber removal reason is required',
    tone: 'danger',
  },
  delete_template: {
    title: 'Delete SMS template',
    label: 'Deletion reason',
    placeholder: 'Explain why this template should be deleted',
    required: 'A template deletion reason is required',
    tone: 'danger',
  },
};

const SmsMarketingTab = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);

  const [stats, setStats] = useState(null);

  const [subscribers, setSubscribers] = useState([]);
  const [subSearch, setSubSearch] = useState('');
  const [subPage, setSubPage] = useState(1);
  const [subTotal, setSubTotal] = useState(0);
  const [showAddSubscriber, setShowAddSubscriber] = useState(false);
  const [newSubscriber, setNewSubscriber] = useState({ phone: '', full_name: '', source: 'manual' });

  const [campaigns, setCampaigns] = useState([]);
  const [campaignForm, setCampaignForm] = useState(emptyCampaign);
  const [editingCampaignId, setEditingCampaignId] = useState(null);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [campaignStats, setCampaignStats] = useState(null);
  const [viewingCampaignId, setViewingCampaignId] = useState(null);
  const [estimatedRecipients, setEstimatedRecipients] = useState(0);

  const [templates, setTemplates] = useState([]);
  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);

  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [governanceAction, setGovernanceAction] = useState({
    open: false,
    type: '',
    target: null,
    note: '',
    error: '',
  });

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get('/sms-marketing/stats');
      setStats(res.data.data);
    } catch { /* ignore */ }
  }, []);

  const loadSubscribers = useCallback(async (search = '', page = 1) => {
    try {
      const params = { page, limit: 30 };
      if (search) params.search = search;
      const res = await api.get('/sms-marketing/subscribers', { params });
      setSubscribers(res.data.data);
      setSubTotal(res.data.pagination?.total || 0);
    } catch {
      toast.error('Failed to load SMS subscribers');
    }
  }, []);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await api.get('/sms-marketing/campaigns');
      setCampaigns(res.data.data);
    } catch {
      toast.error('Failed to load SMS campaigns');
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await api.get('/sms-marketing/templates');
      setTemplates(res.data.data);
    } catch {
      toast.error('Failed to load SMS templates');
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

  const openGovernanceAction = (type, target) => {
    setGovernanceAction({
      open: true,
      type,
      target,
      note: '',
      error: '',
    });
  };

  const closeGovernanceAction = () => {
    setGovernanceAction({
      open: false,
      type: '',
      target: null,
      note: '',
      error: '',
    });
  };

  const updateGovernanceNote = (note) => {
    setGovernanceAction((prev) => ({
      ...prev,
      note,
      error: '',
    }));
  };

  const setGovernanceError = (error) => {
    setGovernanceAction((prev) => ({
      ...prev,
      error,
    }));
  };

  const submitGovernanceAction = async () => {
    const copy = governanceCopy[governanceAction.type];
    const note = governanceAction.note.trim();
    const target = governanceAction.target;

    if (!copy) return;
    if (!note) {
      setGovernanceError(copy.required);
      return;
    }

    try {
      if (governanceAction.type === 'delete_subscriber') {
        await handleDeleteSubscriber(target.id, note);
      } else if (governanceAction.type === 'send_campaign') {
        await handleSendCampaign(target.id, note);
      } else if (governanceAction.type === 'retry_campaign') {
        await handleRetryCampaign(target.id, note);
      } else if (governanceAction.type === 'delete_campaign') {
        await handleDeleteCampaign(target.id, note);
      } else if (governanceAction.type === 'delete_template') {
        await handleDeleteTemplate(target.id, note);
      }

      closeGovernanceAction();
    } catch (err) {
      setGovernanceError(err.response?.data?.message || 'SMS marketing action failed');
    }
  };

  const handleSync = async () => {
    try {
      setLoading(true);
      const res = await api.post('/sms-marketing/subscribers/sync');
      toast.success(`Synced: ${res.data.data.added} added, ${res.data.data.updated} updated`);
      loadStats();
      if (activeTab === 'subscribers') loadSubscribers(subSearch, subPage);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Sync failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubscriber = async (e) => {
    e.preventDefault();
    if (!newSubscriber.phone.trim()) { toast.error('Phone number is required'); return; }
    try {
      await api.post('/sms-marketing/subscribers', newSubscriber);
      toast.success('SMS subscriber added');
      setShowAddSubscriber(false);
      setNewSubscriber({ phone: '', full_name: '', source: 'manual' });
      loadSubscribers(subSearch, subPage);
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add subscriber');
    }
  };

  const handleDeleteSubscriber = async (id, reason = '') => {
    try {
      await api.delete(`/sms-marketing/subscribers/${id}`, {
        data: { reason },
      });
      toast.success('Subscriber removed');
      loadSubscribers(subSearch, subPage);
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
      throw err;
    }
  };

  const handleToggleSubscribed = async (sub) => {
    try {
      await api.patch(`/sms-marketing/subscribers/${sub.id}`, { subscribed: !sub.subscribed });
      toast.success(sub.subscribed ? 'Unsubscribed' : 'Re-subscribed');
      loadSubscribers(subSearch, subPage);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    }
  };

  const handleCsvFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').filter((l) => l.trim());
      const phones = lines.map((l) => l.split(',')[0].replace(/[\s"']/g, '')).filter((p) => p.length >= 10);
      setCsvPreview(phones.slice(0, 10));
    };
    reader.readAsText(file);
  };

  const handleCsvImport = async () => {
    if (!csvFile) { toast.error('Select a CSV file first'); return; }
    try {
      setLoading(true);
      const text = await csvFile.text();
      const phones = text.split('\n')
        .map((l) => l.split(',')[0].replace(/[\s"']/g, '').trim())
        .filter((p) => p.length >= 10 && /^\d+$/.test(p));

      const res = await api.post('/sms-marketing/subscribers/import', { phones });
      toast.success(`Imported: ${res.data.data.added} contacts`);
      setCsvFile(null);
      setCsvPreview([]);
      document.getElementById('csv-input').value = '';
      loadSubscribers(subSearch, subPage);
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCampaignSubmit = async (e) => {
    e.preventDefault();
    if (!campaignForm.name.trim()) { toast.error('Campaign name is required'); return; }

    try {
      setLoading(true);
      const payload = {
        ...campaignForm,
        recipient_filter: campaignForm.recipient_filter ? JSON.parse(campaignForm.recipient_filter) : {},
        template_id: campaignForm.template_id || null,
        scheduled_at: campaignForm.scheduled_at || null,
        max_retries: parseInt(campaignForm.max_retries, 10) || 0,
      };

      if (editingCampaignId) {
        await api.patch(`/sms-marketing/campaigns/${editingCampaignId}`, payload);
        toast.success('SMS campaign updated');
      } else {
        await api.post('/sms-marketing/campaigns', payload);
        toast.success('SMS campaign created');
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
      content: campaign.content || '',
      sender_name: campaign.sender_name || '',
      template_id: campaign.template_id || '',
      recipient_filter: JSON.stringify(campaign.recipient_filter || {}, null, 2),
      max_retries: campaign.max_retries ?? 0,
      scheduled_at: campaign.scheduled_at ? campaign.scheduled_at.slice(0, 16) : '',
    });
    setEditingCampaignId(campaign.id);
    setShowCampaignForm(true);
  };

  const handleSendCampaign = async (id, approvalNote = '') => {
    try {
      setLoading(true);
      const form = campaigns.find((c) => c.id === id);
      const retries = form?.max_retries ?? 0;
      const res = await api.post(`/sms-marketing/campaigns/${id}/send`, {
        max_retries: retries,
        approval_note: approvalNote,
      });
      toast.success(`Queued for ${res.data.data.total} recipients \u2022 \u20A6${res.data.data.estimated_cost} est. cost`);
      loadCampaigns();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Send failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleRetryCampaign = async (id, reason = '') => {
    try {
      setLoading(true);
      const res = await api.post(`/sms-marketing/campaigns/${id}/retry`, {
        reason,
      });
      toast.success(`Retrying ${res.data.data.retrying} messages`);
      loadCampaigns();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Retry failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCampaign = async (id, reason = '') => {
    try {
      await api.delete(`/sms-marketing/campaigns/${id}`, {
        data: { reason },
      });
      toast.success('SMS campaign deleted');
      loadCampaigns();
      if (viewingCampaignId === id) setViewingCampaignId(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
      throw err;
    }
  };

  const handleViewStats = async (id) => {
    try {
      const res = await api.get(`/sms-marketing/campaigns/${id}/stats`);
      setCampaignStats(res.data.data);
      setViewingCampaignId(id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load stats');
    }
  };

  const handleTemplateSubmit = async (e) => {
    e.preventDefault();
    if (!templateForm.name.trim()) { toast.error('Template name is required'); return; }

    try {
      setLoading(true);
      if (editingTemplateId) {
        await api.patch(`/sms-marketing/templates/${editingTemplateId}`, templateForm);
        toast.success('SMS template updated');
      } else {
        await api.post('/sms-marketing/templates', templateForm);
        toast.success('SMS template created');
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
      content: tpl.content || '',
      category: tpl.category || 'general',
    });
    setEditingTemplateId(tpl.id);
    setShowTemplateForm(true);
  };

  const handleDeleteTemplate = async (id, reason = '') => {
    try {
      await api.delete(`/sms-marketing/templates/${id}`, {
        data: { reason },
      });
      toast.success('SMS template deleted');
      loadTemplates();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
      throw err;
    }
  };

  const totalPages = Math.ceil(subTotal / 30);

  const segments = getSegments(campaignForm.content);
  const segCost = segments * COST_PER_SEGMENT;
  const totalCost = segCost * Math.max(estimatedRecipients, 0);

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary-50 p-3"><FaUsers className="text-lg text-primary-600" /></div>
            <div>
              <p className="text-2xl font-bold">{stats?.subscribers?.total || 0}</p>
              <p className="text-xs text-gray-500">Total SMS Contacts</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-green-600">{stats?.subscribers?.active || 0} active subscribers</p>
        </div>

        <div className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-3"><FaPhone className="text-lg text-blue-600" /></div>
            <div>
              <p className="text-2xl font-bold">{stats?.campaigns?.total || 0}</p>
              <p className="text-xs text-gray-500">Total SMS Campaigns</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-green-600">{stats?.campaigns?.sent || 0} sent</p>
        </div>

        <div className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-50 p-3"><FaPaperPlane className="text-lg text-green-600" /></div>
            <div>
              <p className="text-2xl font-bold">{stats?.monthlySent || 0}</p>
              <p className="text-xs text-gray-500">SMS Sent (30 days)</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-50 p-3"><FaChartBar className="text-lg text-purple-600" /></div>
            <div>
              <p className="text-2xl font-bold">{stats?.subscribers?.active > 0 ? Math.round((stats?.subscribers?.active / stats?.subscribers?.total) * 100) : 0}%</p>
              <p className="text-xs text-gray-500">Active Rate</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={handleSync} disabled={loading} className="btn btn-primary gap-2">
          <FaSyncAlt className={loading ? 'animate-spin' : ''} />
          Sync Contacts from Users
        </button>
        <button onClick={() => setActiveTab('campaigns')} className="btn btn-secondary gap-2">
          <FaPlus /> New SMS Campaign
        </button>
      </div>

      {stats?.recentCampaigns?.length > 0 && (
        <div className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Recent SMS Campaigns</h3>
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
                  c.status === 'queued' ? 'bg-yellow-100 text-yellow-700' :
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
              placeholder="Search phone or name..."
              className="input pl-9"
            />
          </div>
          <button onClick={() => loadSubscribers(subSearch, subPage)} className="btn btn-secondary">Search</button>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSync} disabled={loading} className="btn btn-secondary gap-2">
            <FaSyncAlt className={loading ? 'animate-spin' : ''} /> Sync
          </button>
          <button onClick={() => document.getElementById('csv-input').click()} className="btn btn-secondary gap-2">
            <FaUpload /> Import CSV
          </button>
          <button onClick={() => setShowAddSubscriber(true)} className="btn btn-primary gap-2">
            <FaPlus /> Add Contact
          </button>
        </div>
      </div>

      <input
        id="csv-input" type="file" accept=".csv,.txt"
        className="hidden" onChange={handleCsvFileChange}
      />

      {csvFile && (
        <div className="rounded-xl border border-soft bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900"><FaFileAlt className="mr-1 inline" /> {csvFile.name}</p>
              {csvPreview.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  Preview: {csvPreview.join(', ')}
                  {csvPreview.length >= 10 && '...'}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={handleCsvImport} disabled={loading} className="btn btn-primary text-xs px-3 py-2 gap-1">
                <FaUpload /> Import
              </button>
              <button onClick={() => { setCsvFile(null); setCsvPreview([]); document.getElementById('csv-input').value = ''; }} className="btn btn-secondary text-xs px-3 py-2">
                <FaTimes />
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddSubscriber && (
        <form onSubmit={handleAddSubscriber} className="rounded-xl border border-soft bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <input value={newSubscriber.phone} onChange={(e) => setNewSubscriber({ ...newSubscriber, phone: e.target.value })} placeholder="Phone number *" className="input" required />
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
              <th className="px-4 py-3">Phone</th>
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
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No SMS subscribers found. Sync contacts or import a CSV to get started.</td></tr>
            ) : subscribers.map((sub) => (
              <tr key={sub.id} className="border-b border-gray-50 transition hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{sub.phone}</td>
                <td className="px-4 py-3 text-gray-600">{sub.full_name || '\u2014'}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium">{sub.source}</span></td>
                <td className="px-4 py-3 text-gray-600">{sub.user_type || '\u2014'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleToggleSubscribed(sub)} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sub.subscribed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {sub.subscribed ? 'Active' : 'Unsubscribed'}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(sub.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openGovernanceAction('delete_subscriber', sub)} className="text-red-500 hover:text-red-700" title="Remove">
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
        <h3 className="text-lg font-semibold text-gray-900">SMS Campaigns</h3>
        <button onClick={() => { setShowCampaignForm(true); setEditingCampaignId(null); setCampaignForm(emptyCampaign); setEstimatedRecipients(0); }} className="btn btn-primary gap-2">
          <FaPlus /> New SMS Campaign
        </button>
      </div>

      {showCampaignForm && (
        <form onSubmit={handleCampaignSubmit} className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-sm font-semibold text-gray-900">{editingCampaignId ? 'Edit SMS Campaign' : 'Create SMS Campaign'}</h4>
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">
                Campaign Name
                <input value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} className="input mt-1" placeholder="e.g., Rent Reminder" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Sender Name
                <input value={campaignForm.sender_name} onChange={(e) => setCampaignForm({ ...campaignForm, sender_name: e.target.value })} className="input mt-1" placeholder="RentalHub NG" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Template
                <select value={campaignForm.template_id} onChange={(e) => { const t = templates.find((x) => String(x.id) === e.target.value); setCampaignForm({ ...campaignForm, template_id: e.target.value, content: t?.content || campaignForm.content }); }} className="input mt-1">
                  <option value="">No template</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Max Retries
                <select value={campaignForm.max_retries} onChange={(e) => setCampaignForm({ ...campaignForm, max_retries: e.target.value })} className="input mt-1">
                  <option value={0}>No retries</option>
                  <option value={1}>1 retry</option>
                  <option value={2}>2 retries</option>
                  <option value={3}>3 retries</option>
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700 md:col-span-2">
                Schedule Send (optional)
                <input type="datetime-local" value={campaignForm.scheduled_at} onChange={(e) => setCampaignForm({ ...campaignForm, scheduled_at: e.target.value })} className="input mt-1" />
              </label>
              <label className="text-sm font-medium text-gray-700 md:col-span-2">
                Recipient Filter (JSON)
                <textarea value={campaignForm.recipient_filter} onChange={(e) => setCampaignForm({ ...campaignForm, recipient_filter: e.target.value })} className="input mt-1 min-h-[60px] font-mono text-xs" placeholder='{"sources":["user","lead"],"user_types":["tenant","landlord"]}' />
              </label>
            </div>
            <label className="text-sm font-medium text-gray-700">
              SMS Text Content
              <textarea value={campaignForm.content} onChange={(e) => setCampaignForm({ ...campaignForm, content: e.target.value })} className="input mt-1 min-h-[120px] font-mono text-xs" placeholder="Your SMS message here. Keep it short." />
              <div className="mt-1 flex flex-wrap gap-4 text-xs">
                <span className="text-gray-500">{campaignForm.content.length} chars</span>
                <span className="text-gray-500">{segments} segment{segments > 1 ? 's' : ''} ({SEGMENT_LIMIT} chars each)</span>
                <span className="text-gray-500">
                  <FaDollarSign className="mr-0.5 inline" />
                  ~{formatCost(segments, estimatedRecipients || 50)} for {estimatedRecipients || 50} recipients
                </span>
              </div>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Estimated Recipients Count
              <input type="number" min={0} value={estimatedRecipients} onChange={(e) => setEstimatedRecipients(parseInt(e.target.value, 10) || 0)} className="input mt-1" placeholder="e.g., 500" />
              <p className="mt-0.5 text-xs text-gray-400">Enter roughly how many subscribers match your filter for cost estimation</p>
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={loading} className="btn btn-primary">{editingCampaignId ? 'Update' : 'Create'} SMS Campaign</button>
            <button type="button" onClick={() => { setShowCampaignForm(false); setEditingCampaignId(null); }} className="btn btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {campaigns.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">No SMS campaigns yet.</p>
        ) : campaigns.map((c) => {
          const hasFailures = c.stats?.failed > 0;
          const hasRetries = c.max_retries > 0;
          return (
            <div key={c.id} className="rounded-xl border border-soft bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-gray-900">{c.name}</h4>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      c.status === 'sent' ? 'bg-green-100 text-green-700' :
                      c.status === 'sending' ? 'bg-blue-100 text-blue-700' :
                      c.status === 'queued' ? 'bg-yellow-100 text-yellow-700' :
                      c.status === 'draft' ? 'bg-gray-100 text-gray-600' : 'bg-yellow-100 text-yellow-700'
                    }`}>{c.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500 text-pretty line-clamp-2">{c.content}</p>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-400">
                    {c.stats?.sent > 0 && (
                      <span>Sent: {c.stats.sent} | Failed: {c.stats.failed}</span>
                    )}
                    {c.scheduled_at && (
                      <span><FaClock className="mr-0.5 inline" />Scheduled: {new Date(c.scheduled_at).toLocaleString()}</span>
                    )}
                    {c.max_retries > 0 && (
                      <span>Max retries: {c.max_retries}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">Created by {c.created_by_name || 'Unknown'} &middot; {new Date(c.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.status === 'draft' && (
                    <>
                      <button onClick={() => handleEditCampaign(c)} className="btn btn-secondary px-3 py-2 text-xs"><FaEdit /></button>
                      <button onClick={() => openGovernanceAction('send_campaign', c)} disabled={loading} className="btn btn-primary px-3 py-2 text-xs gap-1"><FaPlay /> Send</button>
                      <button onClick={() => openGovernanceAction('delete_campaign', c)} className="btn btn-danger px-3 py-2 text-xs"><FaTrash /></button>
                    </>
                  )}
                  {(c.status === 'queued' || c.status === 'sending') && (
                    <span className="text-xs text-yellow-600 px-3 py-2">Processing...</span>
                  )}
                  {c.status === 'sent' && (
                    <>
                      <button onClick={() => handleViewStats(c.id)} className="btn btn-secondary px-3 py-2 text-xs gap-1"><FaChartBar /> Stats</button>
                      {hasFailures && hasRetries && (
                        <button onClick={() => openGovernanceAction('retry_campaign', c)} disabled={loading} className="btn btn-secondary px-3 py-2 text-xs gap-1">
                          <FaRedo /> Retry Failed
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {Array.isArray(c.operations) && c.operations.length > 0 && (
                <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  <p className="mb-1 font-semibold text-gray-600">Recent governance</p>
                  <div className="space-y-1">
                    {c.operations.slice(0, 2).map((op) => (
                      <p key={op.id} className="truncate" title={op.note || op.event_type}>
                        {String(op.event_type || '').replace(/_/g, ' ')} by {op.actor_name || 'Admin'}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {viewingCampaignId === c.id && campaignStats && (
                <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <h5 className="mb-3 text-sm font-semibold text-gray-900">Campaign Stats</h5>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="rounded-lg bg-white p-3 text-center"><p className="text-lg font-bold text-gray-900">{campaignStats.stats.total || 0}</p><p className="text-xs text-gray-500">Total</p></div>
                    <div className="rounded-lg bg-white p-3 text-center"><p className="text-lg font-bold text-green-600">{campaignStats.stats.sent || 0}</p><p className="text-xs text-gray-500">Sent</p></div>
                    <div className="rounded-lg bg-white p-3 text-center"><p className="text-lg font-bold text-red-600">{campaignStats.stats.failed || 0}</p><p className="text-xs text-gray-500">Failed</p></div>
                    <div className="rounded-lg bg-white p-3 text-center"><p className="text-lg font-bold text-blue-600">{campaignStats.stats.pending || 0}</p><p className="text-xs text-gray-500">Pending</p></div>
                  </div>
                  {campaignStats.cost && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-white p-3 text-center"><p className="text-sm font-bold text-gray-900">{campaignStats.cost.segments_per_message} seg/msg</p><p className="text-xs text-gray-500">Segments per message</p></div>
                      <div className="rounded-lg bg-white p-3 text-center"><p className="text-sm font-bold text-gray-900">{campaignStats.cost.total_segments}</p><p className="text-xs text-gray-500">Total segments sent</p></div>
                      <div className="rounded-lg bg-white p-3 text-center"><p className="text-sm font-bold text-purple-600">\u20A6{campaignStats.cost.actual}</p><p className="text-xs text-gray-500">Est. cost @ \u20A6{campaignStats.cost.per_segment}/seg</p></div>
                    </div>
                  )}
                  {campaignStats.recipients?.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1 text-xs font-semibold text-gray-600">Recent recipients (last 200):</p>
                      <div className="max-h-40 overflow-y-auto rounded-lg bg-white text-xs">
                        {campaignStats.recipients.map((r) => (
                          <div key={r.id} className="flex items-center justify-between border-b border-gray-50 px-3 py-1.5">
                            <span className="text-gray-700">{r.phone} {r.full_name ? `(${r.full_name})` : ''}</span>
                            <span className={`font-medium ${r.status === 'sent' ? 'text-green-600' : 'text-red-600'}`}>
                              {r.status}{r.retry_count > 0 ? ` (retry ${r.retry_count})` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <button onClick={() => setViewingCampaignId(null)} className="mt-3 text-xs text-gray-500 hover:text-gray-700">&larr; Close stats</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderTemplates = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">SMS Templates</h3>
        <button onClick={() => { setShowTemplateForm(true); setEditingTemplateId(null); setTemplateForm(emptyTemplate); }} className="btn btn-primary gap-2">
          <FaPlus /> New Template
        </button>
      </div>

      {showTemplateForm && (
        <form onSubmit={handleTemplateSubmit} className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-sm font-semibold text-gray-900">{editingTemplateId ? 'Edit SMS Template' : 'Create SMS Template'}</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Name <input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} className="input mt-1" placeholder="Template name" /></label>
            <label className="text-sm font-medium text-gray-700">Category <select value={templateForm.category} onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })} className="input mt-1">
              <option value="general">General</option>
              <option value="promo">Promotional</option>
              <option value="reminder">Reminder</option>
              <option value="alert">Alert</option>
            </select></label>
            <label className="text-sm font-medium text-gray-700 md:col-span-2">Description <input value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} className="input mt-1" placeholder="What's this template for?" /></label>
            <label className="text-sm font-medium text-gray-700 md:col-span-2">SMS Content <textarea value={templateForm.content} onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })} className="input mt-1 min-h-[100px] font-mono text-xs" placeholder="Your reusable SMS text template." /></label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={loading} className="btn btn-primary">{editingTemplateId ? 'Update' : 'Create'} Template</button>
            <button type="button" onClick={() => { setShowTemplateForm(false); setEditingTemplateId(null); }} className="btn btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {templates.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">No SMS templates yet.</div>
        ) : templates.map((t) => (
          <div key={t.id} className="rounded-xl border border-soft bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-semibold text-gray-900">{t.name}</h4>
                <p className="text-xs text-gray-500 mt-0.5">{t.category} &middot; {t.is_system ? 'System' : 'Custom'}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleEditTemplate(t)} className="text-gray-500 hover:text-primary-600 p-1"><FaEdit /></button>
                {!t.is_system && <button onClick={() => openGovernanceAction('delete_template', t)} className="text-gray-500 hover:text-red-600 p-1"><FaTrash /></button>}
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500 line-clamp-2">{t.description || 'No description'}</p>
            <p className="mt-1 text-xs text-gray-400 text-pretty line-clamp-2">{t.content}</p>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
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
            {key === 'campaigns' && <><FaPhone className="mr-1.5 inline" />SMS Campaigns</>}
            {key === 'subscribers' && <><FaUsers className="mr-1.5 inline" />Contacts</>}
            {key === 'templates' && <><FaFileAlt className="mr-1.5 inline" />Templates</>}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'subscribers' && renderSubscribers()}
      {activeTab === 'campaigns' && renderCampaigns()}
      {activeTab === 'templates' && renderTemplates()}

      {governanceAction.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {governanceCopy[governanceAction.type]?.title || 'Confirm SMS action'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {governanceAction.type.includes('campaign')
                  ? governanceAction.target?.name
                  : governanceAction.type === 'delete_template'
                    ? governanceAction.target?.name
                    : `${governanceAction.target?.phone || ''} ${governanceAction.target?.full_name ? `- ${governanceAction.target.full_name}` : ''}`}
              </p>
            </div>

            <div className="space-y-4 px-6 py-4">
              {governanceAction.type === 'send_campaign' && (
                <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
                  <p className="font-semibold">Cost and audience check</p>
                  <p className="mt-1">
                    Message length: {getSegments(governanceAction.target?.content)} segment
                    {getSegments(governanceAction.target?.content) > 1 ? 's' : ''}. This will queue every subscriber matching the campaign filter.
                  </p>
                </div>
              )}

              {governanceAction.type === 'retry_campaign' && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
                  Only transient failed SMS messages that are still within the retry limit will be queued again.
                </div>
              )}

              <label className="block text-sm font-medium text-gray-700">
                {governanceCopy[governanceAction.type]?.label || 'Reason'}
                <textarea
                  value={governanceAction.note}
                  onChange={(event) => updateGovernanceNote(event.target.value)}
                  rows={4}
                  className="input mt-2 min-h-[110px]"
                  placeholder={governanceCopy[governanceAction.type]?.placeholder || 'Add the reason for this action'}
                />
              </label>

              <p className="text-xs text-gray-500">
                This note is saved in SMS marketing governance history.
              </p>

              {governanceAction.error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {governanceAction.error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button type="button" onClick={closeGovernanceAction} className="btn btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitGovernanceAction}
                disabled={loading}
                className={governanceCopy[governanceAction.type]?.tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary'}
              >
                {loading ? 'Working...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SmsMarketingTab;
