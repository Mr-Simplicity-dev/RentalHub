import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  FaUsers, FaChartBar, FaPaperPlane, FaPlus, FaTrash, FaPlay,
  FaSyncAlt, FaSearch, FaTimes, FaEdit, FaFileAlt, FaChevronLeft, FaChevronRight,
  FaPhone, FaUpload, FaRedo, FaDollarSign, FaClock,
} from 'react-icons/fa';
import api from '../../services/api';
import {
  Banner,
  DataTable,
  DangerButton,
  Dialog,
  EmptyState,
  Field,
  GhostButton,
  MarketingShell,
  Panel,
  PrimaryButton,
  SecondaryButton,
  SegmentedControl,
  SelectInput,
  StatCard,
  StatGrid,
  StatusBadge,
  Td,
  TextArea,
  TextInput,
  formatDate,
} from './marketingUi';

const TAB_KEYS = ['overview', 'campaigns', 'subscribers', 'templates'];

const TAB_LABELS = {
  overview: 'Overview',
  campaigns: 'SMS Campaigns',
  subscribers: 'Contacts',
  templates: 'Templates',
};

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
        .filter((p) => p.length >= 10);

      const res = await api.post('/sms-marketing/subscribers/import', { phones });
      const { added, alreadyKnown, invalid, duplicates } = res.data.data;
      toast.success(
        `Imported ${added} new · Already in system: ${alreadyKnown} · Duplicates: ${duplicates} · Invalid: ${invalid}`
      );
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

  const handleDeleteUnsubscribed = async () => {
    try {
      const res = await api.delete('/sms-marketing/subscribers/unsubscribed', {
        data: { note: 'Bulk cleanup of opted-out subscribers' },
      });
      toast.success(`Removed ${res.data.data.deleted} unsubscribed subscriber(s)`);
      loadSubscribers(subSearch, subPage);
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete unsubscribed subscribers');
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

  const renderOverview = () => (
    <div className="space-y-6">
      <StatGrid>
        <StatCard
          label="Total SMS Contacts"
          value={stats?.subscribers?.total || 0}
          hint={`${stats?.subscribers?.active || 0} active subscribers`}
          tone="primary"
          icon={<FaUsers />}
        />
        <StatCard
          label="Total SMS Campaigns"
          value={stats?.campaigns?.total || 0}
          hint={`${stats?.campaigns?.sent || 0} sent`}
          icon={<FaPhone />}
        />
        <StatCard
          label="SMS Sent (30 days)"
          value={stats?.monthlySent || 0}
          tone="success"
          icon={<FaPaperPlane />}
        />
        <StatCard
          label="Active Rate"
          value={`${stats?.subscribers?.active > 0 ? Math.round((stats?.subscribers?.active / stats?.subscribers?.total) * 100) : 0}%`}
          tone="warning"
          icon={<FaChartBar />}
        />
      </StatGrid>

      <div className="flex flex-wrap gap-3">
        <PrimaryButton onClick={handleSync} loading={loading} className="gap-2">
          <FaSyncAlt className={loading ? 'animate-spin' : ''} />
          Sync Contacts from Users
        </PrimaryButton>
        <SecondaryButton onClick={() => setActiveTab('campaigns')} className="gap-2">
          <FaPlus /> New SMS Campaign
        </SecondaryButton>
      </div>

      {stats?.recentCampaigns?.length > 0 && (
        <Panel title="Recent SMS Campaigns">
          <div className="space-y-3">
            {stats.recentCampaigns.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500">
                    {c.status} &middot; {c.sent_at ? formatDate(c.sent_at) : 'Not sent'}
                    {c.stats?.sent ? ` &middot; ${c.stats.sent} sent` : ''}
                  </p>
                </div>
                <StatusBadge status={c.status} />
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );

  const renderSubscribers = () => (
    <Panel
      title="SMS Contacts"
      description="People who receive your SMS broadcasts."
      actions={
        <>
          <SecondaryButton onClick={handleSync} loading={loading} className="gap-2">
            <FaSyncAlt className={loading ? 'animate-spin' : ''} /> Sync
          </SecondaryButton>
          <SecondaryButton onClick={() => document.getElementById('csv-input').click()} className="gap-2">
            <FaUpload /> Import CSV
          </SecondaryButton>
          <SecondaryButton
            onClick={handleDeleteUnsubscribed}
            className="gap-2 text-red-600 hover:bg-red-50"
            aria-label="Delete all unsubscribed SMS contacts"
          >
            <FaTrash /> Delete unsubscribed
          </SecondaryButton>
          <PrimaryButton onClick={() => setShowAddSubscriber(true)} className="gap-2">
            <FaPlus /> Add Contact
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <TextInput
              id="sms-subscriber-search"
              value={subSearch} onChange={(e) => { setSubSearch(e.target.value); setSubPage(1); }}
              placeholder="Search phone or name..."
              aria-label="Search SMS contacts"
              className="pl-9"
            />
          </div>
          <SecondaryButton onClick={() => loadSubscribers(subSearch, subPage)}>Search</SecondaryButton>
        </div>

        <input
          id="csv-input" type="file" accept=".csv,.txt"
          className="hidden" onChange={handleCsvFileChange}
        />

        {csvFile && (
          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
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
                <PrimaryButton onClick={handleCsvImport} loading={loading} className="gap-1">
                  <FaUpload /> Import
                </PrimaryButton>
                <SecondaryButton
                  aria-label="Cancel CSV import"
                  onClick={() => { setCsvFile(null); setCsvPreview([]); document.getElementById('csv-input').value = ''; }}
                >
                  <FaTimes />
                </SecondaryButton>
              </div>
            </div>
          </div>
        )}

        {showAddSubscriber && (
          <form onSubmit={handleAddSubscriber} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Phone number" required>
                <TextInput
                  id="new-sms-subscriber-phone"
                  value={newSubscriber.phone} onChange={(e) => setNewSubscriber({ ...newSubscriber, phone: e.target.value })}
                  placeholder="e.g. 0803 000 0000" required
                />
              </Field>
              <Field label="Full name">
                <TextInput
                  id="new-sms-subscriber-name"
                  value={newSubscriber.full_name} onChange={(e) => setNewSubscriber({ ...newSubscriber, full_name: e.target.value })}
                  placeholder="Full name"
                />
              </Field>
              <div className="flex items-end gap-2">
                <PrimaryButton type="submit" className="flex-1 gap-1"><FaPlus /> Add</PrimaryButton>
                <SecondaryButton type="button" aria-label="Cancel add contact" onClick={() => setShowAddSubscriber(false)}><FaTimes /></SecondaryButton>
              </div>
            </div>
          </form>
        )}

        {subscribers.length === 0 ? (
          <EmptyState
            icon={<FaUsers />}
            title="No SMS subscribers found"
            message="Sync contacts or import a CSV to get started."
          />
        ) : (
          <DataTable columns={['Phone', 'Name', 'Source', 'Type', 'Status', 'Added', 'Actions']}>
            {subscribers.map((sub) => (
              <tr key={sub.id} className="transition-colors hover:bg-gray-50/70">
                <Td className="font-medium text-gray-900">{sub.phone}</Td>
                <Td className="text-gray-600">{sub.full_name || '\u2014'}</Td>
                <Td><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium">{sub.source}</span></Td>
                <Td className="text-gray-600">{sub.user_type || '\u2014'}</Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => handleToggleSubscribed(sub)}
                    aria-label={sub.subscribed ? `Unsubscribe ${sub.phone}` : `Re-subscribe ${sub.phone}`}
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
                      sub.subscribed ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    {sub.subscribed ? 'Active' : 'Unsubscribed'}
                  </button>
                </Td>
                <Td className="text-xs text-gray-500">{formatDate(sub.created_at)}</Td>
                <Td className="text-right">
                  <GhostButton
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => openGovernanceAction('delete_subscriber', sub)}
                    aria-label={`Remove ${sub.phone}`}
                    title="Remove"
                  >
                    <FaTrash />
                  </GhostButton>
                </Td>
              </tr>
            ))}
          </DataTable>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <SecondaryButton
              aria-label="Previous page"
              disabled={subPage <= 1}
              onClick={() => setSubPage((p) => Math.max(1, p - 1))}
            >
              <FaChevronLeft />
            </SecondaryButton>
            <span className="text-sm text-gray-600">Page {subPage} of {totalPages}</span>
            <SecondaryButton
              aria-label="Next page"
              disabled={subPage >= totalPages}
              onClick={() => setSubPage((p) => p + 1)}
            >
              <FaChevronRight />
            </SecondaryButton>
          </div>
        )}
      </div>
    </Panel>
  );

  const renderCampaigns = () => (
    <Panel
      title="SMS Campaigns"
      description="Draft campaigns can be queued here; sent campaigns with failures can be retried."
    >
      <div className="space-y-4">
        {showCampaignForm && (
          <form onSubmit={handleCampaignSubmit} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-5">
            <h4 className="mb-4 text-sm font-semibold text-gray-900">{editingCampaignId ? 'Edit SMS Campaign' : 'Create SMS Campaign'}</h4>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Campaign Name">
                  <TextInput id="campaign-name" value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} placeholder="e.g., Rent Reminder" />
                </Field>
                <Field label="Sender Name">
                  <TextInput id="campaign-sender-name" value={campaignForm.sender_name} onChange={(e) => setCampaignForm({ ...campaignForm, sender_name: e.target.value })} placeholder="Amana RentalHub NG" />
                </Field>
                <Field label="Template">
                  <SelectInput id="campaign-template" value={campaignForm.template_id} onChange={(e) => { const t = templates.find((x) => String(x.id) === e.target.value); setCampaignForm({ ...campaignForm, template_id: e.target.value, content: t?.content || campaignForm.content }); }}>
                    <option value="">No template</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Max Retries">
                  <SelectInput id="campaign-max-retries" value={campaignForm.max_retries} onChange={(e) => setCampaignForm({ ...campaignForm, max_retries: e.target.value })}>
                    <option value={0}>No retries</option>
                    <option value={1}>1 retry</option>
                    <option value={2}>2 retries</option>
                    <option value={3}>3 retries</option>
                  </SelectInput>
                </Field>
                <Field label="Schedule Send (optional)" className="md:col-span-2">
                  <TextInput id="campaign-scheduled-at" type="datetime-local" value={campaignForm.scheduled_at} onChange={(e) => setCampaignForm({ ...campaignForm, scheduled_at: e.target.value })} />
                </Field>
                <Field label="Recipient Filter (JSON)" className="md:col-span-2">
                  <TextArea id="campaign-recipient-filter" className="min-h-[60px] font-mono text-xs" value={campaignForm.recipient_filter} onChange={(e) => setCampaignForm({ ...campaignForm, recipient_filter: e.target.value })} placeholder='{"sources":["user","lead"],"user_types":["tenant","landlord"]}' />
                </Field>
              </div>
              <Field label="SMS Text Content">
                <TextArea id="campaign-content" className="min-h-[120px] font-mono text-xs" value={campaignForm.content} onChange={(e) => setCampaignForm({ ...campaignForm, content: e.target.value })} placeholder="Your SMS message here. Keep it short." />
                <div className="mt-1 flex flex-wrap gap-4 text-xs">
                  <span className="text-gray-500">{campaignForm.content.length} chars</span>
                  <span className="text-gray-500">{segments} segment{segments > 1 ? 's' : ''} ({SEGMENT_LIMIT} chars each)</span>
                  <span className="text-gray-500">
                    <FaDollarSign className="mr-0.5 inline" />
                    ~{formatCost(segments, estimatedRecipients || 50)} for {estimatedRecipients || 50} recipients
                  </span>
                </div>
              </Field>
              <Field label="Estimated Recipients Count" hint="Enter roughly how many subscribers match your filter for cost estimation">
                <TextInput id="campaign-estimated-recipients" type="number" min={0} value={estimatedRecipients} onChange={(e) => setEstimatedRecipients(parseInt(e.target.value, 10) || 0)} placeholder="e.g., 500" />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <PrimaryButton type="submit" loading={loading}>{editingCampaignId ? 'Update' : 'Create'} SMS Campaign</PrimaryButton>
              <SecondaryButton type="button" onClick={() => { setShowCampaignForm(false); setEditingCampaignId(null); }}>Cancel</SecondaryButton>
            </div>
          </form>
        )}

        {campaigns.length === 0 ? (
          <EmptyState
            icon={<FaPhone />}
            title="No SMS campaigns yet"
            message="Create a campaign to queue an SMS broadcast to your contacts."
          />
        ) : campaigns.map((c) => {
          const hasFailures = c.stats?.failed > 0;
          const hasRetries = c.max_retries > 0;
          return (
            <div key={c.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-gray-900">{c.name}</h4>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-1 text-sm text-gray-500 text-pretty line-clamp-2">{c.content}</p>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-400">
                    {c.stats?.sent > 0 && (
                      <span>Sent: {c.stats.sent} | Failed: {c.stats.failed}</span>
                    )}
                    {c.scheduled_at && (
                      <span><FaClock className="mr-0.5 inline" />Scheduled: {formatDate(c.scheduled_at)}</span>
                    )}
                    {c.max_retries > 0 && (
                      <span>Max retries: {c.max_retries}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">Created by {c.created_by_name || 'Unknown'} &middot; {formatDate(c.created_at)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.status === 'draft' && (
                    <>
                      <GhostButton onClick={() => handleEditCampaign(c)} aria-label={`Edit ${c.name}`} title="Edit"><FaEdit /></GhostButton>
                      <PrimaryButton onClick={() => openGovernanceAction('send_campaign', c)} loading={loading} className="gap-1"><FaPlay /> Send</PrimaryButton>
                      <GhostButton className="text-red-600 hover:bg-red-50" onClick={() => openGovernanceAction('delete_campaign', c)} aria-label={`Delete ${c.name}`} title="Delete"><FaTrash /></GhostButton>
                    </>
                  )}
                  {(c.status === 'queued' || c.status === 'sending') && (
                    <span className="px-3 py-2 text-xs text-amber-600">Processing...</span>
                  )}
                  {c.status === 'sent' && (
                    <>
                      <SecondaryButton onClick={() => handleViewStats(c.id)} className="gap-1"><FaChartBar /> Stats</SecondaryButton>
                      {hasFailures && hasRetries && (
                        <SecondaryButton onClick={() => openGovernanceAction('retry_campaign', c)} loading={loading} className="gap-1">
                          <FaRedo /> Retry Failed
                        </SecondaryButton>
                      )}
                    </>
                  )}
                </div>
              </div>

              {Array.isArray(c.operations) && c.operations.length > 0 && (
                <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
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
                <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <h5 className="mb-3 text-sm font-semibold text-gray-900">Campaign Stats</h5>
                  <StatGrid>
                    <StatCard label="Total" value={campaignStats.stats.total || 0} />
                    <StatCard label="Sent" value={campaignStats.stats.sent || 0} tone="success" />
                    <StatCard label="Failed" value={campaignStats.stats.failed || 0} tone="danger" />
                    <StatCard label="Pending" value={campaignStats.stats.pending || 0} tone="primary" />
                  </StatGrid>
                  {campaignStats.cost && (
                    <div className="mt-3">
                      <StatGrid columns={3}>
                        <StatCard label="Segments per message" value={campaignStats.cost.segments_per_message} />
                        <StatCard label="Total segments sent" value={campaignStats.cost.total_segments} />
                        <StatCard
                          label={`Est. cost @ \\u20A6${campaignStats.cost.per_segment}/seg`}
                          value={`\\u20A6${campaignStats.cost.actual}`}
                        />
                      </StatGrid>
                    </div>
                  )}
                  {campaignStats.recipients?.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1 text-xs font-semibold text-gray-600">Recent recipients (last 200):</p>
                      <div className="max-h-40 overflow-y-auto rounded-xl bg-white text-xs">
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
                  <GhostButton className="mt-3" onClick={() => setViewingCampaignId(null)}>&larr; Close stats</GhostButton>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );

  const renderTemplates = () => (
    <Panel
      title="SMS Templates"
      description="Reusable message bodies you can drop into any campaign."
      actions={
        <PrimaryButton onClick={() => { setShowTemplateForm(true); setEditingTemplateId(null); setTemplateForm(emptyTemplate); }} className="gap-2">
          <FaPlus /> New Template
        </PrimaryButton>
      }
    >
      <div className="space-y-4">
        {showTemplateForm && (
          <form onSubmit={handleTemplateSubmit} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-5">
            <h4 className="mb-4 text-sm font-semibold text-gray-900">{editingTemplateId ? 'Edit SMS Template' : 'Create SMS Template'}</h4>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Name">
                <TextInput id="template-name" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} placeholder="Template name" />
              </Field>
              <Field label="Category">
                <SelectInput id="template-category" value={templateForm.category} onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}>
                  <option value="general">General</option>
                  <option value="promo">Promotional</option>
                  <option value="reminder">Reminder</option>
                  <option value="alert">Alert</option>
                </SelectInput>
              </Field>
              <Field label="Description" className="md:col-span-2">
                <TextInput id="template-description" value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} placeholder="What's this template for?" />
              </Field>
              <Field label="SMS Content" className="md:col-span-2">
                <TextArea id="template-content" className="min-h-[100px] font-mono text-xs" value={templateForm.content} onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })} placeholder="Your reusable SMS text template." />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <PrimaryButton type="submit" loading={loading}>{editingTemplateId ? 'Update' : 'Create'} Template</PrimaryButton>
              <SecondaryButton type="button" onClick={() => { setShowTemplateForm(false); setEditingTemplateId(null); }}>Cancel</SecondaryButton>
            </div>
          </form>
        )}

        {templates.length === 0 ? (
          <EmptyState
            icon={<FaFileAlt />}
            title="No SMS templates yet"
            message="Create a reusable template to speed up campaign setup."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {templates.map((t) => (
              <div key={t.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-semibold text-gray-900">{t.name}</h4>
                    <p className="mt-0.5 text-xs text-gray-500">{t.category} &middot; {t.is_system ? 'System' : 'Custom'}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <GhostButton onClick={() => handleEditTemplate(t)} aria-label={`Edit ${t.name}`} title="Edit"><FaEdit /></GhostButton>
                    {!t.is_system && (
                      <GhostButton className="text-red-600 hover:bg-red-50" onClick={() => openGovernanceAction('delete_template', t)} aria-label={`Delete ${t.name}`} title="Delete"><FaTrash /></GhostButton>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500 line-clamp-2">{t.description || 'No description'}</p>
                <p className="mt-1 text-xs text-gray-400 text-pretty line-clamp-2">{t.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );

  return (
    <div className="space-y-6">
      <MarketingShell
        eyebrow="Super admin"
        title="SMS Marketing"
        subtitle="Broadcast SMS campaigns, manage contacts and reusable templates from one place."
        icon={<FaPhone />}
        actions={
          <button
            type="button"
            className="btn bg-white text-primary-700 shadow-sm hover:bg-primary-50"
            onClick={() => {
              setActiveTab('campaigns');
              setShowCampaignForm(true);
              setEditingCampaignId(null);
              setCampaignForm(emptyCampaign);
              setEstimatedRecipients(0);
            }}
          >
            <FaPlus className="mr-2" /> New campaign
          </button>
        }
      >
        <div className="space-y-6">
          <SegmentedControl
            options={TAB_KEYS.map((key) => ({ value: key, label: TAB_LABELS[key] }))}
            value={activeTab}
            onChange={setActiveTab}
          />

          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'subscribers' && renderSubscribers()}
          {activeTab === 'campaigns' && renderCampaigns()}
          {activeTab === 'templates' && renderTemplates()}
        </div>
      </MarketingShell>

      <Dialog
        open={governanceAction.open}
        onClose={closeGovernanceAction}
        title={governanceCopy[governanceAction.type]?.title || 'Confirm SMS action'}
        subtitle={
          governanceAction.type.includes('campaign')
            ? governanceAction.target?.name
            : governanceAction.type === 'delete_template'
              ? governanceAction.target?.name
              : `${governanceAction.target?.phone || ''} ${governanceAction.target?.full_name ? `- ${governanceAction.target.full_name}` : ''}`
        }
        size="small"
        footer={
          <>
            <SecondaryButton onClick={closeGovernanceAction}>Cancel</SecondaryButton>
            {governanceCopy[governanceAction.type]?.tone === 'danger' ? (
              <DangerButton onClick={submitGovernanceAction} loading={loading}>Confirm</DangerButton>
            ) : (
              <PrimaryButton onClick={submitGovernanceAction} loading={loading}>Confirm</PrimaryButton>
            )}
          </>
        }
      >
        <div className="space-y-4">
          {governanceAction.type === 'send_campaign' && (
            <Banner tone="warning" title="Cost and audience check">
              Message length: {getSegments(governanceAction.target?.content)} segment
              {getSegments(governanceAction.target?.content) > 1 ? 's' : ''}. This will queue every subscriber matching the campaign filter.
            </Banner>
          )}

          {governanceAction.type === 'retry_campaign' && (
            <Banner tone="info">
              Only transient failed SMS messages that are still within the retry limit will be queued again.
            </Banner>
          )}

          <Field
            label={governanceCopy[governanceAction.type]?.label || 'Reason'}
            error={governanceAction.error || undefined}
          >
            <TextArea
              rows={4}
              className="min-h-[110px]"
              value={governanceAction.note}
              onChange={(event) => updateGovernanceNote(event.target.value)}
              placeholder={governanceCopy[governanceAction.type]?.placeholder || 'Add the reason for this action'}
            />
          </Field>

          <Banner tone="info">This note is saved in SMS marketing governance history.</Banner>
        </div>
      </Dialog>
    </div>
  );
};

export default SmsMarketingTab;
