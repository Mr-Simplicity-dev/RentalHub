import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  FaEnvelope, FaUsers, FaChartBar, FaPaperPlane, FaPlus, FaTrash, FaPlay,
  FaSyncAlt, FaSearch, FaTimes,
  FaChevronLeft, FaChevronRight, FaEdit, FaFileAlt,
} from 'react-icons/fa';
import api from '../../services/api';
import {
  MarketingShell, StatGrid, StatCard, Panel, Field, TextInput, TextArea, SelectInput,
  PrimaryButton, SecondaryButton, DangerButton, GhostButton, StatusBadge, DataTable, Td,
  EmptyState, Banner, Dialog, SegmentedControl,
} from './marketingUi';

const TAB_KEYS = ['overview', 'campaigns', 'subscribers', 'templates'];

const TAB_META = {
  overview: { label: 'Overview', icon: <FaChartBar className="mr-1.5 inline" /> },
  campaigns: { label: 'Campaigns', icon: <FaEnvelope className="mr-1.5 inline" /> },
  subscribers: { label: 'Contacts', icon: <FaUsers className="mr-1.5 inline" /> },
  templates: { label: 'Templates', icon: <FaFileAlt className="mr-1.5 inline" /> },
};

const emptyCampaign = {
  name: '', subject: '', content_html: '',
  sender_name: '', sender_email: '', reply_to: '',
  template_id: '', recipient_filter: '{}',
};

const emptyTemplate = {
  name: '', description: '', subject: '', content_html: '', category: 'general',
};

const governanceCopy = {
  send_campaign: {
    title: 'Send email campaign',
    label: 'Launch approval note',
    placeholder: 'Who approved this send and why is it needed now?',
    required: 'A launch approval note is required',
    tone: 'primary',
  },
  delete_campaign: {
    title: 'Delete email campaign',
    label: 'Deletion reason',
    placeholder: 'Explain why this campaign should be deleted',
    required: 'A campaign deletion reason is required',
    tone: 'danger',
  },
  delete_subscriber: {
    title: 'Remove email subscriber',
    label: 'Removal reason',
    placeholder: 'Explain why this contact is being removed',
    required: 'A subscriber removal reason is required',
    tone: 'danger',
  },
  delete_template: {
    title: 'Delete email template',
    label: 'Deletion reason',
    placeholder: 'Explain why this template should be deleted',
    required: 'A template deletion reason is required',
    tone: 'danger',
  },
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
  const [emailCsvFile, setEmailCsvFile] = useState(null);
  const [emailCsvPreview, setEmailCsvPreview] = useState([]);

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
  const [governanceAction, setGovernanceAction] = useState({
    open: false,
    type: '',
    target: null,
    note: '',
    error: '',
  });

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
      } else if (governanceAction.type === 'delete_campaign') {
        await handleDeleteCampaign(target.id, note);
      } else if (governanceAction.type === 'delete_template') {
        await handleDeleteTemplate(target.id, note);
      }

      closeGovernanceAction();
    } catch (err) {
      setGovernanceError(err.response?.data?.message || 'Email marketing action failed');
    }
  };

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

  // ─── Import subscribers (CSV or paste) ────────────────────────────────────
  const extractEmails = (text = '') => {
    if (!text) return [];
    const normalized = String(text)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    const tokens = normalized.split(/[\n,;\t|]+/);
    const emails = [];
    const seen = new Set();
    for (let i = 0; i < tokens.length; i += 1) {
      const raw = tokens[i];
      if (!raw) continue;
      const matches = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
      if (matches && matches.length > 0) {
        for (let m = 0; m < matches.length; m += 1) {
          const email = matches[m].trim().toLowerCase();
          if (!seen.has(email)) {
            seen.add(email);
            emails.push(email);
          }
        }
      } else {
        const cleaned = raw.replace(/[\s"']/g, '').trim().toLowerCase();
        if (cleaned.includes('@') && !seen.has(cleaned)) {
          seen.add(cleaned);
          emails.push(cleaned);
        }
      }
    }
    return emails;
  };

  const handleEmailCsvFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setEmailCsvFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const emails = extractEmails(ev.target.result || '');
      setEmailCsvPreview(emails.slice(0, 10));
    };
    reader.readAsText(file);
  };

  const handleEmailImport = async () => {
    if (!emailCsvFile) { toast.error('Select a CSV file first'); return; }
    try {
      setLoading(true);
      const text = await emailCsvFile.text();
      const emails = extractEmails(text);

      if (emails.length === 0) { toast.error('No valid email addresses found in the file'); return; }

      const res = await api.post('/email-marketing/subscribers/import', { emails });
      const { added, alreadyKnown, invalid, duplicates, removedDuplicates } = res.data.data;
      toast.success(
        `Imported ${added} new · Already in system: ${alreadyKnown} · Duplicates: ${duplicates} · Invalid: ${invalid} · Old duplicates removed: ${removedDuplicates || 0}`
      );
      setEmailCsvFile(null);
      setEmailCsvPreview([]);
      loadSubscribers(subSearch, subPage);
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCleanDuplicates = async () => {
    try {
      const res = await api.delete('/email-marketing/subscribers/duplicates', {
        data: { note: 'Bulk duplicate cleanup' },
      });
      const { deleted = 0, normalized = 0 } = res.data.data || {};
      toast.success(`Removed ${deleted} duplicate(s) and normalised ${normalized} address(es)`);
      loadSubscribers(subSearch, subPage);
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to clean duplicates');
    }
  };

  const handleDeleteUnsubscribedEmails = async () => {
    try {
      const res = await api.delete('/email-marketing/subscribers/unsubscribed', {
        data: { note: 'Bulk cleanup of opted-out email contacts' },
      });
      toast.success(`Removed ${res.data.data.deleted} unsubscribed contact(s)`);
      loadSubscribers(subSearch, subPage);
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete unsubscribed contacts');
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

  const handleDeleteSubscriber = async (id, reason = '') => {
    try {
      await api.delete(`/email-marketing/subscribers/${id}`, {
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

  const handleSendCampaign = async (id, approvalNote = '') => {
    try {
      setLoading(true);
      const res = await api.post(`/email-marketing/campaigns/${id}/send`, {
        approval_note: approvalNote,
      });
      toast.success(`Sent: ${res.data.data.sent} Success, ${res.data.data.failed} Failed`);
      loadCampaigns();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Send failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCampaign = async (id, reason = '') => {
    try {
      await api.delete(`/email-marketing/campaigns/${id}`, {
        data: { reason },
      });
      toast.success('Campaign deleted');
      loadCampaigns();
      if (viewingCampaignId === id) setViewingCampaignId(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
      throw err;
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

  const handleDeleteTemplate = async (id, reason = '') => {
    try {
      await api.delete(`/email-marketing/templates/${id}`, {
        data: { reason },
      });
      toast.success('Template deleted');
      loadTemplates();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
      throw err;
    }
  };

  const totalPages = Math.ceil(subTotal / 30);

  // ─── Renderers ────────────────────────────────────────────────────────────
  const renderOverview = () => (
    <div className="space-y-6">
      <Panel title="Overview" description="Audience and delivery health at a glance">
        <StatGrid>
          <StatCard
            label="Total Contacts"
            value={stats?.subscribers?.total || 0}
            hint={`${stats?.subscribers?.active || 0} active subscribers`}
            tone="primary"
            icon={<FaUsers />}
          />
          <StatCard
            label="Total Campaigns"
            value={stats?.campaigns?.total || 0}
            hint={`${stats?.campaigns?.sent || 0} sent`}
            tone="success"
            icon={<FaEnvelope />}
          />
          <StatCard
            label="Sent (30 days)"
            value={stats?.monthlySent || 0}
            icon={<FaPaperPlane />}
          />
          <StatCard
            label="Engagement Rate"
            value={`${stats?.subscribers?.active > 0 ? Math.round((stats?.subscribers?.active / stats?.subscribers?.total) * 100) : 0}%`}
            tone="warning"
            icon={<FaChartBar />}
          />
        </StatGrid>

        <div className="mt-4 flex flex-wrap gap-3">
          <PrimaryButton onClick={handleSync} disabled={loading} className="gap-2">
            <FaSyncAlt className={loading ? 'animate-spin' : ''} />
            Sync Contacts from Users & Leads
          </PrimaryButton>
          <SecondaryButton onClick={() => setActiveTab('campaigns')} className="gap-2">
            <FaPlus /> New Campaign
          </SecondaryButton>
        </div>
      </Panel>

      {stats?.recentCampaigns?.length > 0 && (
        <Panel title="Recent Campaigns">
          <div className="space-y-3">
            {stats.recentCampaigns.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500">
                    {c.status} &middot; {c.sent_at ? new Date(c.sent_at).toLocaleDateString() : 'Not sent'}
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
      title="Contacts"
      description="Every contact who can receive your email campaigns"
      actions={
        <>
          <SecondaryButton onClick={handleSync} disabled={loading} className="gap-2">
            <FaSyncAlt className={loading ? 'animate-spin' : ''} /> Sync
          </SecondaryButton>
          <SecondaryButton onClick={() => document.getElementById('email-csv-input').click()} className="gap-2">
            <FaFileAlt /> Import CSV
          </SecondaryButton>
          <SecondaryButton
            onClick={handleDeleteUnsubscribedEmails}
            className="gap-2 text-red-600 hover:bg-red-50"
            aria-label="Delete all unsubscribed email contacts"
          >
            <FaTrash /> Delete unsubscribed
          </SecondaryButton>
          <SecondaryButton onClick={handleCleanDuplicates} className="gap-2 text-amber-700 hover:bg-amber-50">
            <FaSyncAlt /> Remove duplicates
          </SecondaryButton>
          <PrimaryButton onClick={() => setShowAddSubscriber(true)} className="gap-2">
            <FaPlus /> Add Contact
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <TextInput
              value={subSearch} onChange={(e) => { setSubSearch(e.target.value); setSubPage(1); }}
              placeholder="Search subscribers..."
              aria-label="Search subscribers"
              className="pl-9"
            />
          </div>
          <SecondaryButton onClick={() => loadSubscribers(subSearch, subPage)}>Search</SecondaryButton>
        </div>

        <input
          id="email-csv-input" type="file" accept=".csv,.txt"
          className="hidden" onChange={handleEmailCsvFileChange}
          aria-label="Choose email CSV file"
        />

        {emailCsvFile && (
          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900"><FaFileAlt className="mr-1 inline" /> {emailCsvFile.name}</p>
                {emailCsvPreview.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    Preview: {emailCsvPreview.join(', ')}
                    {emailCsvPreview.length >= 10 && '...'}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <PrimaryButton onClick={handleEmailImport} loading={loading} className="gap-1">
                  <FaFileAlt /> Import
                </PrimaryButton>
                <SecondaryButton
                  aria-label="Cancel email CSV import"
                  onClick={() => { setEmailCsvFile(null); setEmailCsvPreview([]); document.getElementById('email-csv-input').value = ''; }}
                >
                  <FaTimes />
                </SecondaryButton>
              </div>
            </div>
          </div>
        )}

        {showAddSubscriber && (
          <form onSubmit={handleAddSubscriber} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <TextInput value={newSubscriber.email} onChange={(e) => setNewSubscriber({ ...newSubscriber, email: e.target.value })} placeholder="Email *" aria-label="Email" required />
              <TextInput value={newSubscriber.full_name} onChange={(e) => setNewSubscriber({ ...newSubscriber, full_name: e.target.value })} placeholder="Full name" aria-label="Full name" />
              <div className="flex gap-2">
                <PrimaryButton type="submit" className="flex-1"><FaPlus /> Add</PrimaryButton>
                <SecondaryButton type="button" onClick={() => setShowAddSubscriber(false)} aria-label="Cancel adding contact"><FaTimes /></SecondaryButton>
              </div>
            </div>
          </form>
        )}

        <div className="rounded-2xl border border-gray-100">
          <DataTable columns={['S/N', 'Email', 'Name', 'Source', 'Type', 'Status', 'Added', 'Actions']}>
            {subscribers.length === 0 ? (
              <tr>
                <Td colSpan={8} className="px-4 py-6">
                  <EmptyState title="No subscribers found" message="Sync contacts to get started." />
                </Td>
              </tr>
            ) : subscribers.map((sub, index) => (
              <tr key={sub.id} className="transition-colors hover:bg-gray-50/70">
                <Td className="text-gray-600">{(subPage - 1) * 30 + index + 1}</Td>
                <Td className="font-medium text-gray-900">{sub.email}</Td>
                <Td className="text-gray-600">{sub.full_name || '—'}</Td>
                <Td><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{sub.source}</span></Td>
                <Td className="text-gray-600">{sub.user_type || '—'}</Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => handleToggleSubscribed(sub)}
                    aria-label={sub.subscribed ? 'Unsubscribe contact' : 'Re-subscribe contact'}
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
                      sub.subscribed ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    {sub.subscribed ? 'Active' : 'Unsubscribed'}
                  </button>
                </Td>
                <Td className="text-xs text-gray-500">{new Date(sub.created_at).toLocaleDateString()}</Td>
                <Td className="text-right">
                  <GhostButton onClick={() => openGovernanceAction('delete_subscriber', sub)} aria-label="Remove subscriber" title="Remove" className="text-red-500 hover:bg-red-50 hover:text-red-700">
                    <FaTrash />
                  </GhostButton>
                </Td>
              </tr>
            ))}
          </DataTable>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <SecondaryButton disabled={subPage <= 1} onClick={() => setSubPage((p) => Math.max(1, p - 1))} aria-label="Previous page" className="px-3 py-2"><FaChevronLeft /></SecondaryButton>
            <span className="text-sm text-gray-600">Page {subPage} of {totalPages}</span>
            <SecondaryButton disabled={subPage >= totalPages} onClick={() => setSubPage((p) => p + 1)} aria-label="Next page" className="px-3 py-2"><FaChevronRight /></SecondaryButton>
          </div>
        )}
      </div>
    </Panel>
  );

  const renderCampaigns = () => (
    <Panel
      title="Campaigns"
      description="Draft, send and audit email broadcasts"
      actions={
        <PrimaryButton onClick={() => { setShowCampaignForm(true); setEditingCampaignId(null); setCampaignForm(emptyCampaign); }} className="gap-2">
          <FaPlus /> New Campaign
        </PrimaryButton>
      }
    >
      <div className="space-y-4">
        {showCampaignForm && (
          <form onSubmit={handleCampaignSubmit} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-5">
            <h4 className="mb-4 text-sm font-semibold text-gray-900">{editingCampaignId ? 'Edit Campaign' : 'Create Campaign'}</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Campaign Name" required>
                <TextInput value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} aria-label="Campaign Name" placeholder="e.g., June Newsletter" />
              </Field>
              <Field label="Email Subject" required>
                <TextInput value={campaignForm.subject} onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })} aria-label="Email Subject" placeholder="Subject line" />
              </Field>
              <Field label="Sender Name">
                <TextInput value={campaignForm.sender_name} onChange={(e) => setCampaignForm({ ...campaignForm, sender_name: e.target.value })} aria-label="Sender Name" placeholder="Amana RentalHub NG" />
              </Field>
              <Field label="Sender Email">
                <TextInput value={campaignForm.sender_email} onChange={(e) => setCampaignForm({ ...campaignForm, sender_email: e.target.value })} aria-label="Sender Email" placeholder="support@rentalhub.com.ng" />
              </Field>
              <Field label="Template">
                <SelectInput value={campaignForm.template_id} onChange={(e) => setCampaignForm({ ...campaignForm, template_id: e.target.value })} aria-label="Template">
                  <option value="">No template (use raw HTML)</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </SelectInput>
              </Field>
              <Field label="Recipient Filter (JSON)">
                <TextArea value={campaignForm.recipient_filter} onChange={(e) => setCampaignForm({ ...campaignForm, recipient_filter: e.target.value })} rows={3} aria-label="Recipient Filter (JSON)" className="min-h-[60px] font-mono text-xs" placeholder='{"sources":["user","lead"],"user_types":["tenant","landlord"]}' />
              </Field>
              <Field label="HTML Content" hint="Leave empty to use template. If provided, this overrides the template." className="md:col-span-2">
                <TextArea value={campaignForm.content_html} onChange={(e) => setCampaignForm({ ...campaignForm, content_html: e.target.value })} rows={8} aria-label="HTML Content" className="min-h-[200px] font-mono text-xs" placeholder="<h1>Your HTML here</h1>" />
              </Field>
            </div>
            <div className="mt-4 flex gap-2">
              <PrimaryButton type="submit" loading={loading}>{editingCampaignId ? 'Update' : 'Create'} Campaign</PrimaryButton>
              <SecondaryButton type="button" onClick={() => { setShowCampaignForm(false); setEditingCampaignId(null); }}>Cancel</SecondaryButton>
            </div>
          </form>
        )}

        <div className="space-y-3">
          {campaigns.length === 0 ? (
            <EmptyState title="No campaigns yet" />
          ) : campaigns.map((c) => (
            <div key={c.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-gray-900">{c.name}</h4>
                    <StatusBadge status={c.status} />
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
                      <SecondaryButton onClick={() => handleEditCampaign(c)} aria-label="Edit campaign" className="px-3 py-2"><FaEdit /></SecondaryButton>
                      <PrimaryButton onClick={() => openGovernanceAction('send_campaign', c)} disabled={loading} className="gap-1 px-3 py-2"><FaPlay /> Send</PrimaryButton>
                      <DangerButton onClick={() => openGovernanceAction('delete_campaign', c)} aria-label="Delete campaign" className="px-3 py-2"><FaTrash /></DangerButton>
                    </>
                  )}
                  {c.status === 'sent' && (
                    <SecondaryButton onClick={() => handleViewStats(c.id)} className="gap-1 px-3 py-2"><FaChartBar /> Stats</SecondaryButton>
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
                <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                  <h5 className="mb-3 text-sm font-semibold text-gray-900">Campaign Stats</h5>
                  <StatGrid columns={3}>
                    <StatCard label="Total" value={campaignStats.stats.total} />
                    <StatCard label="Sent" value={campaignStats.stats.sent} tone="success" />
                    <StatCard label="Opened" value={campaignStats.stats.opened} tone="primary" />
                    <StatCard label="Clicked" value={campaignStats.stats.clicked} tone="primary" />
                    <StatCard label="Failed" value={campaignStats.stats.failed} tone="danger" />
                    <StatCard label="Bounced" value={campaignStats.stats.bounced} tone="warning" />
                  </StatGrid>
                  <GhostButton onClick={() => setViewingCampaignId(null)} className="mt-3">&larr; Close stats</GhostButton>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );

  const renderTemplates = () => (
    <Panel
      title="Email Templates"
      description="Reusable HTML blocks for your campaigns"
      actions={
        <PrimaryButton onClick={() => { setShowTemplateForm(true); setEditingTemplateId(null); setTemplateForm(emptyTemplate); }} className="gap-2">
          <FaPlus /> New Template
        </PrimaryButton>
      }
    >
      <div className="space-y-4">
        {showTemplateForm && (
          <form onSubmit={handleTemplateSubmit} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-5">
            <h4 className="mb-4 text-sm font-semibold text-gray-900">{editingTemplateId ? 'Edit Template' : 'Create Template'}</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name" required>
                <TextInput value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} aria-label="Name" placeholder="Template name" />
              </Field>
              <Field label="Category">
                <SelectInput value={templateForm.category} onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })} aria-label="Category">
                  <option value="general">General</option>
                  <option value="newsletter">Newsletter</option>
                  <option value="promo">Promotional</option>
                  <option value="property_alert">Property Alert</option>
                  <option value="re_engagement">Re-engagement</option>
                </SelectInput>
              </Field>
              <Field label="Description" className="md:col-span-2">
                <TextInput value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} aria-label="Description" placeholder="What's this template for?" />
              </Field>
              <Field label="Default Subject" required className="md:col-span-2">
                <TextInput value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} aria-label="Default Subject" placeholder="Default email subject" />
              </Field>
              <Field label="HTML Content" className="md:col-span-2">
                <TextArea value={templateForm.content_html} onChange={(e) => setTemplateForm({ ...templateForm, content_html: e.target.value })} rows={6} aria-label="HTML Content" className="min-h-[160px] font-mono text-xs" placeholder="<h1>Your reusable HTML template</h1>" />
              </Field>
            </div>
            <div className="mt-4 flex gap-2">
              <PrimaryButton type="submit" loading={loading}>{editingTemplateId ? 'Update' : 'Create'} Template</PrimaryButton>
              <SecondaryButton type="button" onClick={() => { setShowTemplateForm(false); setEditingTemplateId(null); }}>Cancel</SecondaryButton>
            </div>
          </form>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          {templates.length === 0 ? (
            <div className="col-span-full">
              <EmptyState title="No templates yet" />
            </div>
          ) : templates.map((t) => (
            <div key={t.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="truncate font-semibold text-gray-900">{t.name}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">{t.category} &middot; {t.is_system ? 'System' : 'Custom'}</p>
                </div>
                <div className="flex gap-1">
                  <GhostButton onClick={() => handleEditTemplate(t)} aria-label="Edit template"><FaEdit /></GhostButton>
                  {!t.is_system && (
                    <GhostButton onClick={() => openGovernanceAction('delete_template', t)} aria-label="Delete template" className="hover:bg-red-50 hover:text-red-600"><FaTrash /></GhostButton>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500 line-clamp-2">{t.description || 'No description'}</p>
              <p className="mt-1 text-xs text-gray-400">Subject: {t.subject}</p>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );

  return (
    <MarketingShell
      eyebrow="Super admin"
      title="Email Marketing"
      subtitle="Send campaigns, manage contacts and reuse templates"
      icon={<FaEnvelope />}
      actions={
        <PrimaryButton
          onClick={() => {
            setActiveTab('campaigns');
            setEditingCampaignId(null);
            setCampaignForm(emptyCampaign);
            setShowCampaignForm(true);
          }}
          className="gap-2"
        >
          <FaPlus /> New campaign
        </PrimaryButton>
      }
    >
      <div className="space-y-6">
        <SegmentedControl
          className="w-full"
          value={activeTab}
          onChange={setActiveTab}
          options={TAB_KEYS.map((key) => ({
            value: key,
            label: (
              <>
                {TAB_META[key]?.icon}
                {TAB_META[key]?.label}
              </>
            ),
          }))}
        />

        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'subscribers' && renderSubscribers()}
        {activeTab === 'campaigns' && renderCampaigns()}
        {activeTab === 'templates' && renderTemplates()}
      </div>

      <Dialog
        open={governanceAction.open}
        onClose={closeGovernanceAction}
        title={governanceCopy[governanceAction.type]?.title || 'Confirm email action'}
        subtitle={
          governanceAction.type.includes('campaign')
            ? governanceAction.target?.name
            : governanceAction.type === 'delete_template'
              ? governanceAction.target?.name
              : `${governanceAction.target?.email || ''} ${governanceAction.target?.full_name ? `- ${governanceAction.target.full_name}` : ''}`
        }
        footer={
          <>
            <SecondaryButton type="button" onClick={closeGovernanceAction}>
              Cancel
            </SecondaryButton>
            {governanceCopy[governanceAction.type]?.tone === 'danger' ? (
              <DangerButton type="button" onClick={submitGovernanceAction} loading={loading}>
                {loading ? 'Working...' : 'Confirm'}
              </DangerButton>
            ) : (
              <PrimaryButton type="button" onClick={submitGovernanceAction} loading={loading}>
                {loading ? 'Working...' : 'Confirm'}
              </PrimaryButton>
            )}
          </>
        }
      >
        {governanceAction.type === 'send_campaign' && (
          <Banner tone="warning" title="Audience and compliance check" className="mb-4">
            <p className="mt-1">
              This will send the campaign to every subscribed contact matching the campaign filter.
            </p>
          </Banner>
        )}

        <Field
          label={governanceCopy[governanceAction.type]?.label || 'Reason'}
          hint="This note is saved in email marketing governance history."
        >
          <TextArea
            value={governanceAction.note}
            onChange={(event) => updateGovernanceNote(event.target.value)}
            rows={4}
            aria-label={governanceCopy[governanceAction.type]?.label || 'Reason'}
            className="min-h-[110px]"
            placeholder={governanceCopy[governanceAction.type]?.placeholder || 'Add the reason for this action'}
          />
        </Field>

        {governanceAction.error && (
          <Banner tone="danger" className="mt-3">
            {governanceAction.error}
          </Banner>
        )}
      </Dialog>
    </MarketingShell>
  );
};

export default EmailMarketingTab;
