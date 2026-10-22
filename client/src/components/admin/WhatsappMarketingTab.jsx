import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { FaWhatsapp, FaPaperPlane, FaPlus, FaTrash, FaRedo, FaChartBar, FaUsers, FaFileAlt, FaCheckCircle, FaTimes, FaSyncAlt, FaSearch, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import api from '../../services/api';
import {
  Banner,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  GhostButton,
  LoadingState,
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

const GOVERNANCE_COPY = {
  send: {
    title: 'Queue WhatsApp campaign',
    label: 'Launch approval note',
    placeholder: 'Who approved this send and why is it needed now?',
    required: 'A launch approval note is required',
    tone: 'primary',
  },
  retry: {
    title: 'Retry failed WhatsApp messages',
    label: 'Retry reason',
    placeholder: 'Explain why these failed messages should be retried',
    required: 'A retry reason is required',
    tone: 'secondary',
  },
  delete: {
    title: 'Delete WhatsApp campaign',
    label: 'Deletion reason',
    placeholder: 'Explain why this campaign should be deleted',
    required: 'A deletion reason is required',
    tone: 'danger',
  },
};

const TAB_KEYS = ['overview', 'campaigns', 'contacts'];

const TAB_META = {
  overview: { label: 'Overview', icon: <FaChartBar className="mr-1.5 inline" /> },
  campaigns: { label: 'Campaigns', icon: <FaWhatsapp className="mr-1.5 inline" /> },
  contacts: { label: 'Contacts', icon: <FaUsers className="mr-1.5 inline" /> },
};

const KIND_OPTIONS = [
  { value: 'template', label: 'Approved template' },
  { value: 'text', label: 'Free text (24h)' },
];

const emptyForm = {
  name: '',
  kind: 'template',
  template_name: '',
  template_language: 'en',
  template_params: '',
  content: '',
  scope: 'all',
  user_type: '',
  source: 'users',
  media: { type: '', url: '' },
  headerMedia: { type: '', url: '' },
};

const MediaField = ({ label, hint, value, onChange }) => {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const data = new FormData();
    data.append('file', file);
    setUploading(true);
    try {
      const res = await api.post('/whatsapp-marketing/media', data);
      onChange({ type: res.data.data.media_type, url: res.data.data.url });
      toast.success('Media uploaded');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 p-4">
      <Field label={label} hint={hint}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SelectInput
            value={value.type}
            aria-label={`${label} type`}
            onChange={(e) => onChange({ ...value, type: e.target.value })}
          >
            <option value="">No media</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="document">Document (link only)</option>
          </SelectInput>
          <div className="flex items-center">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp"
              className="w-full text-xs text-gray-600 file:mr-2 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-primary-700 hover:file:bg-primary-100 disabled:opacity-50"
              aria-label={`Upload ${label} file`}
              disabled={uploading || !value.type || value.type === 'document'}
              onChange={handleFile}
            />
          </div>
          <TextInput
            placeholder="https://… public link"
            aria-label={`${label} public link`}
            value={value.url}
            onChange={(e) => onChange({ ...value, url: e.target.value })}
          />
        </div>
        {uploading && <p className="mt-2 text-[11px] text-gray-500">Uploading…</p>}
        {value.url && <p className="mt-2 break-all text-[11px] text-green-700">{value.url}</p>}
      </Field>
    </div>
  );
};

const WhatsappMarketingTab = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [audienceCount, setAudienceCount] = useState(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [governanceAction, setGovernanceAction] = useState({ open: false, type: '', target: null, note: '', error: '' });
  const [statsModal, setStatsModal] = useState({ open: false, data: null });

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get('/whatsapp-marketing/stats');
      setStats(res.data.data);
    } catch { /* ignore */ }
  }, []);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await api.get('/whatsapp-marketing/campaigns');
      setCampaigns(res.data.data);
    } catch {
      toast.error('Failed to load WhatsApp campaigns');
    }
  }, []);

  // Imported contacts (numbers that are not platform users) + their WhatsApp verdict.
  const [contacts, setContacts] = useState([]);
  const [contactStats, setContactStats] = useState(null);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deletingInvalid, setDeletingInvalid] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [contactPage, setContactPage] = useState(1);
  const [contactTotal, setContactTotal] = useState(0);
  const CONTACTS_PER_PAGE = 30;

  const loadContacts = useCallback(async (search = '', page = 1) => {
    setContactsLoading(true);
    try {
      const params = { page, limit: CONTACTS_PER_PAGE };
      if (search) params.search = search;
      const res = await api.get('/whatsapp-marketing/contacts', { params });
      setContacts(res.data.data.contacts || []);
      setContactStats(res.data.data.stats || null);
      setContactTotal(res.data.data.pagination?.total || res.data.data.contacts?.length || 0);
    } catch {
      toast.error('Failed to load imported contacts');
    } finally {
      setContactsLoading(false);
    }
  }, []);

  useEffect(() => {
    const boot = async () => {
      setListLoading(true);
      await Promise.all([loadStats(), loadCampaigns()]);
      setListLoading(false);
    };
    boot();
    loadContacts(contactSearch, contactPage);
  }, []);

  useEffect(() => {
    if (activeTab === 'contacts') {
      loadContacts(contactSearch, contactPage);
    }
  }, [activeTab, contactSearch, contactPage, loadContacts]);

  const extractPhoneNumbers = (text = '') => {
    if (!text) return [];
    const normalized = String(text)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    const tokens = normalized.split(/[\n,;\t|]+/);
    const phones = [];
    const seen = new Set();
    for (let i = 0; i < tokens.length; i += 1) {
      const raw = tokens[i];
      if (!raw) continue;
      const matches = raw.match(/\+?\d[\d\s\-\(\)]{7,}\d/g);
      if (matches && matches.length > 0) {
        for (let m = 0; m < matches.length; m += 1) {
          const cleaned = matches[m].replace(/[\s\-\(\)\+]/g, '').trim();
          if (cleaned.length >= 10 && cleaned.length <= 15 && !seen.has(cleaned)) {
            seen.add(cleaned);
            phones.push(cleaned);
          }
        }
      } else {
        const cleaned = raw.replace(/[^0-9+]/g, '').replace(/^\+/, '');
        if (cleaned.length >= 10 && cleaned.length <= 15 && !seen.has(cleaned)) {
          seen.add(cleaned);
          phones.push(cleaned);
        }
      }
    }
    return phones;
  };

  const handleCsvFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const phones = extractPhoneNumbers(ev.target.result || '');
      setCsvPreview(phones.slice(0, 10));
    };
    reader.readAsText(file);
  };

  const handleCsvImport = async () => {
    if (!csvFile) {
      toast.error('Select a CSV file first');
      return;
    }
    setImporting(true);
    try {
      const text = await csvFile.text();
      const phones = extractPhoneNumbers(text);

      if (phones.length === 0) {
        toast.error('No valid phone numbers found in the file');
        return;
      }

      const res = await api.post('/whatsapp-marketing/contacts/import', { phones });
      const { added, alreadyKnown, invalid, duplicates, removedDuplicates, total } = res.data.data;
      toast.success(
        `Imported ${added} new · Already in system: ${alreadyKnown} · Duplicates: ${duplicates} · Invalid: ${invalid} · Old duplicates removed: ${removedDuplicates || 0} · Total now: ${total}`
      );
      setCsvFile(null);
      setCsvPreview([]);
      setContactPage(1);
      loadContacts(contactSearch, 1);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleCheckContacts = async () => {
    setChecking(true);
    try {
      const res = await api.post('/whatsapp-marketing/contacts/check', { all: true });
      const { checked, valid, invalid } = res.data.data;
      if (checked === 0) {
        toast.info('Nothing new to check — every contact already has a verdict');
      } else {
        toast.success(`Checked ${checked} · On WhatsApp: ${valid} · Not on WhatsApp: ${invalid}`);
      }
      loadContacts(contactSearch, contactPage);
    } catch (err) {
      toast.error(err.response?.data?.message || 'WhatsApp check failed');
    } finally {
      setChecking(false);
    }
  };

  const handleDeleteContact = async (contact) => {
    try {
      await api.delete(`/whatsapp-marketing/contacts/${contact.id}`);
      toast.success('Contact removed');
      loadContacts(contactSearch, contactPage);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove contact');
    }
  };

  const handleDeleteInvalidContacts = async () => {
    const count = contactStats?.invalid ?? 0;
    if (count === 0) {
      toast.info('There are no invalid contacts to delete');
      return;
    }
    setDeletingInvalid(true);
    try {
      const res = await api.delete('/whatsapp-marketing/contacts/invalid');
      toast.success(`Removed ${res.data.data.deleted} invalid contact(s)`);
      loadContacts(contactSearch, contactPage);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete invalid contacts');
    } finally {
      setDeletingInvalid(false);
    }
  };

  const handleCleanDuplicates = async () => {
    try {
      const res = await api.delete('/whatsapp-marketing/contacts/duplicates', {
        data: { note: 'Bulk duplicate cleanup' },
      });
      const { deleted = 0, normalized = 0 } = res.data.data || {};
      toast.success(`Removed ${deleted} duplicate(s) and normalised ${normalized} number(s)`);
      loadContacts(contactSearch, contactPage);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to clean duplicate contacts');
    }
  };

  const updateForm = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setAudienceCount(null);
  };

  const previewAudience = async () => {
    setAudienceLoading(true);
    try {
      const params = { source: form.source, scope: form.scope };
      if (form.scope === 'user_type' && form.user_type.trim()) params.user_type = form.user_type.trim();
      const res = await api.get('/whatsapp-marketing/audience', { params });
      setAudienceCount(res.data.data.count);
    } catch {
      toast.error('Failed to estimate audience');
    } finally {
      setAudienceLoading(false);
    }
  };

  const openGovernanceAction = (type, target) => {
    setGovernanceAction({ open: true, type, target, note: '', error: '' });
  };

  const closeGovernanceAction = () => {
    setGovernanceAction({ open: false, type: '', target: null, note: '', error: '' });
  };

  const submitGovernanceAction = async () => {
    const { type, target, note } = governanceAction;
    if (!note.trim()) {
      setGovernanceAction((prev) => ({ ...prev, error: GOVERNANCE_COPY[type].required }));
      return;
    }
    setLoading(true);
    try {
      if (type === 'send') {
        await api.post(`/whatsapp-marketing/campaigns/${target.id}/send`, { note: note.trim() });
        toast.success('Campaign queued — messages go out within a minute');
      } else if (type === 'retry') {
        await api.post(`/whatsapp-marketing/campaigns/${target.id}/retry`, { note: note.trim() });
        toast.success('Failed messages re-queued');
      } else if (type === 'delete') {
        await api.delete(`/whatsapp-marketing/campaigns/${target.id}`, { data: { note: note.trim() } });
        toast.success('Campaign deleted');
      }
      closeGovernanceAction();
      loadCampaigns();
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('A campaign name is required');
    if (form.kind === 'template' && !form.template_name.trim()) {
      return toast.error('The approved Meta template name is required');
    }
    if (form.kind === 'text' && !form.content.trim() && !form.media.url.trim()) {
      return toast.error('A message or a media attachment is required');
    }
    if (form.media.type && !form.media.url.trim()) {
      return toast.error('Upload a file or paste a public link for the selected media type');
    }
    if (form.headerMedia.type && !form.headerMedia.url.trim()) {
      return toast.error('Upload a file or paste a public link for the template header media');
    }
    if (form.source === 'users' && form.scope === 'user_type' && !form.user_type.trim()) {
      return toast.error('Enter the user type to target, or switch to all users');
    }

    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        kind: form.kind,
        recipient_filter: {
          scope: form.source === 'users' ? form.scope : 'all',
          user_type: form.source === 'users' && form.scope === 'user_type' ? form.user_type.trim() : null,
          source: form.source,
        },
        media_type: form.kind === 'text' ? form.media.type || null : null,
        media_url: form.kind === 'text' ? form.media.url.trim() || null : null,
        header_media_type: form.kind === 'template' ? form.headerMedia.type || null : null,
        header_media_url: form.kind === 'template' ? form.headerMedia.url.trim() || null : null,
        ...(form.kind === 'template'
          ? {
              template_name: form.template_name.trim(),
              template_language: form.template_language.trim() || 'en',
              template_params: form.template_params.split(',').map((s) => s.trim()).filter(Boolean),
            }
          : { content: form.content.trim() || null }),
      };
      const res = await api.post('/whatsapp-marketing/campaigns', payload);
      const created = res.data.data;
      setShowForm(false);
      setForm(emptyForm);
      setAudienceCount(null);
      await loadCampaigns();
      loadStats();
      toast.success(`Campaign created for ${created.recipients} recipient(s)${created.skipped ? `, skipped ${created.skipped} invalid/duplicate` : ''}`);
      openGovernanceAction('send', created);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  };

  const openStats = async (campaign) => {
    try {
      const res = await api.get(`/whatsapp-marketing/campaigns/${campaign.id}/stats`);
      setStatsModal({ open: true, data: res.data.data });
    } catch {
      toast.error('Failed to load campaign stats');
    }
  };

  const gov = GOVERNANCE_COPY[governanceAction.type] || GOVERNANCE_COPY.send;
  const contactTotalPages = Math.ceil(contactTotal / CONTACTS_PER_PAGE);

  const renderOverview = () => (
    <div className="space-y-6">
      <Banner tone="warning" title="Meta rules">
        Template messages must first be approved inside your Meta app (WhatsApp → Message templates).
        Free-text messages only reach users who messaged your business number within the last 24 hours —
        anyone else will be rejected by Meta. Images and clips attached to free text follow the same
        24-hour rule; for campaigns, add the image/video header when creating the template in Meta.
        Marketing templates must mention how to opt out.
      </Banner>

      {stats ? (
        <StatGrid columns={4}>
          <StatCard
            label="Total campaigns"
            value={stats.campaigns?.total ?? 0}
            tone="primary"
            icon={<FaChartBar />}
          />
          <StatCard
            label="Messages sent"
            value={stats.messages?.sent ?? 0}
            tone="success"
            icon={<FaPaperPlane />}
          />
          <StatCard
            label="Messages failed"
            value={stats.messages?.failed ?? 0}
            tone="danger"
            hint="Failures are retryable from the table below"
          />
          <StatCard
            label="Sent today"
            value={`${stats.daily_quota?.sent_today ?? 0} / ${stats.daily_quota?.limit ?? 250}`}
            tone="warning"
            icon={<FaWhatsapp />}
            hint="Sends pause at the daily cap and resume automatically the next day"
          />
        </StatGrid>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <PrimaryButton
          onClick={() => {
            setActiveTab('campaigns');
            setShowForm(true);
          }}
          className="gap-2"
        >
          <FaPlus /> New WhatsApp Campaign
        </PrimaryButton>
        <SecondaryButton onClick={() => setActiveTab('contacts')} className="gap-2">
          <FaUsers /> Manage Contacts
        </SecondaryButton>
      </div>

      {stats?.recentCampaigns?.length > 0 && (
        <Panel title="Recent WhatsApp Campaigns">
          <div className="space-y-3">
            {stats.recentCampaigns.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500">
                    {c.status} &middot; {c.created_at ? formatDate(c.created_at) : ''}
                    {c.sent_count ? ` &middot; ${c.sent_count} sent` : ''}
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

  const renderCampaigns = () => (
    <div className="space-y-6">
      {showForm ? (
        <Panel title="Create WhatsApp campaign" description="Build the audience, then queue the send with an approval note.">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Campaign name" required>
                <TextInput
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="e.g. October rent reminder"
                />
              </Field>
              <Field label="Message type" required>
                <div className="pt-1">
                  <SegmentedControl
                    options={KIND_OPTIONS}
                    value={form.kind}
                    onChange={(kind) => updateForm({ kind })}
                  />
                </div>
              </Field>
            </div>

            {form.kind === 'template' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="Meta template name" required>
                    <TextInput
                      value={form.template_name}
                      onChange={(e) => updateForm({ template_name: e.target.value })}
                      placeholder="rent_due_reminder"
                    />
                  </Field>
                  <Field label="Language">
                    <TextInput
                      value={form.template_language}
                      onChange={(e) => updateForm({ template_language: e.target.value })}
                      placeholder="en or en_US"
                    />
                  </Field>
                  <Field label="Body parameters" hint="Comma separated, in template order">
                    <TextInput
                      value={form.template_params}
                      onChange={(e) => updateForm({ template_params: e.target.value })}
                      placeholder="Ada, N50,000"
                    />
                  </Field>
                </div>
                <MediaField
                  label="Template header media (optional)"
                  hint="Only for templates approved with an image or video header. Leave as 'No media' otherwise."
                  value={form.headerMedia}
                  onChange={(v) => setForm((prev) => ({ ...prev, headerMedia: v }))}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <Field label="Message" hint={`${form.content.length}/1000 characters — free text only inside the 24-hour window`}>
                  <TextArea
                    rows={4}
                    maxLength={1000}
                    value={form.content}
                    onChange={(e) => updateForm({ content: e.target.value })}
                    placeholder="Type the message users will receive"
                  />
                </Field>
                <MediaField
                  label="Attach an image or clip (optional)"
                  hint="Upload JPG/PNG/WEBP up to 5MB or MP4/3GP up to 16MB, or paste a public https link. The message text becomes the caption."
                  value={form.media}
                  onChange={(v) => setForm((prev) => ({ ...prev, media: v }))}
                />
              </div>
            )}

            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
              <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
                <Field label="Audience source" hint="Platform users, or numbers you imported below">
                  <SelectInput
                    value={form.source}
                    onChange={(e) => updateForm({ source: e.target.value })}
                  >
                    <option value="users">Platform users</option>
                    <option value="contacts">Imported contacts</option>
                    <option value="both">Both</option>
                  </SelectInput>
                </Field>
                {form.source === 'users' ? (
                  <Field label="Filter">
                    <SelectInput
                      value={form.scope}
                      onChange={(e) => updateForm({ scope: e.target.value })}
                    >
                      <option value="all">All users with a phone number</option>
                      <option value="user_type">By user type</option>
                    </SelectInput>
                  </Field>
                ) : (
                  <div className="hidden sm:block" />
                )}
                {form.source === 'users' && form.scope === 'user_type' ? (
                  <Field label="User type">
                    <TextInput
                      value={form.user_type}
                      onChange={(e) => updateForm({ user_type: e.target.value })}
                      placeholder="e.g. tenant, landlord, agent"
                    />
                  </Field>
                ) : null}
                <SecondaryButton onClick={previewAudience} loading={audienceLoading} className="w-full">
                  <FaUsers className="mr-2" /> Preview audience
                </SecondaryButton>
              </div>
              {audienceCount !== null ? (
                <p className="mt-3 text-sm text-gray-700">
                  ≈ <strong>{audienceCount}</strong> recipient(s) will receive this campaign.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-4">
              <PrimaryButton type="submit" loading={loading}>
                <FaPaperPlane className="mr-2" /> Create &amp; queue send
              </PrimaryButton>
              <SecondaryButton
                onClick={() => {
                  setShowForm(false);
                  setAudienceCount(null);
                }}
              >
                Cancel
              </SecondaryButton>
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel
        title="WhatsApp campaigns"
        description="Draft campaigns can be queued here; paused campaigns can be retried."
        actions={
          !showForm ? (
            <PrimaryButton onClick={() => setShowForm(true)} className="gap-2">
              <FaPlus /> New Campaign
            </PrimaryButton>
          ) : null
        }
        noPadding
      >
        {listLoading ? (
          <div className="p-5">
            <LoadingState label="Loading WhatsApp campaigns" rows={3} />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<FaWhatsapp />}
              title="No WhatsApp campaigns yet"
              message="Create your first campaign above. You will need a Meta-approved template before you can message users who have not contacted you in the last 24 hours."
            />
          </div>
        ) : (
          <DataTable
            columns={['Name', 'Type', 'Status', 'Sent / Failed / Pending', 'Created', 'Actions']}
          >
            {campaigns.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-gray-50/70">
                <Td>
                  <p className="font-medium text-gray-900">{c.name}</p>
                  {c.kind === 'template' ? (
                    <p className="text-xs text-gray-400">template: {c.template_name}</p>
                  ) : null}
                </Td>
                <Td className="text-xs uppercase text-gray-500">{c.kind}</Td>
                <Td>
                  <StatusBadge status={c.status} />
                </Td>
                <Td className="text-xs">
                  <span className="font-semibold text-green-600">{c.sent_count}</span>
                  <span className="text-gray-300"> / </span>
                  <span className="font-semibold text-red-600">{c.failed_count}</span>
                  <span className="text-gray-300"> / </span>
                  <span className="font-semibold text-gray-500">{c.pending_count}</span>
                  <span className="text-gray-400"> of {c.total_recipients}</span>
                </Td>
                <Td className="text-xs text-gray-500">
                  <span className="block text-gray-600">{c.created_by_name || '—'}</span>
                  {formatDate(c.created_at)}
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1">
                    <GhostButton onClick={() => openStats(c)} aria-label={`View stats for ${c.name}`}>
                      <FaChartBar /> Stats
                    </GhostButton>
                    {['draft', 'paused'].includes(c.status) ? (
                      <GhostButton
                        className="text-green-700 hover:bg-green-50"
                        onClick={() => openGovernanceAction('send', c)}
                        aria-label={`Send ${c.name}`}
                      >
                        <FaPaperPlane /> Send
                      </GhostButton>
                    ) : null}
                    {['sent', 'paused'].includes(c.status) ? (
                      <GhostButton
                        className="text-amber-700 hover:bg-amber-50"
                        onClick={() => openGovernanceAction('retry', c)}
                        aria-label={`Retry ${c.name}`}
                      >
                        <FaRedo /> Retry
                      </GhostButton>
                    ) : null}
                    {c.status !== 'sending' ? (
                      <GhostButton
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => openGovernanceAction('delete', c)}
                        aria-label={`Delete ${c.name}`}
                      >
                        <FaTrash /> Delete
                      </GhostButton>
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
    </div>
  );

  const renderContacts = () => (
    <Panel
      title="WhatsApp contacts"
      description="Numbers that are not platform users — import them, then check which are actually on WhatsApp."
    >
      <div className="space-y-5">
        <Banner tone="info" title="How this works">
          A number only counts as reachable if Meta confirms it is on WhatsApp. Imported numbers start as
          <strong> Not checked </strong>
          until you run the check. Numbers Meta rejects are skipped automatically when you build an audience.
        </Banner>

        {contactStats ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Total</p>
              <p className="text-lg font-semibold text-gray-900">{contactStats.total ?? 0}</p>
            </div>
            <div className="rounded-lg border border-green-100 bg-green-50/60 p-3">
              <p className="text-xs uppercase tracking-wide text-green-600">On WhatsApp</p>
              <p className="text-lg font-semibold text-green-700">{contactStats.valid ?? 0}</p>
            </div>
            <div className="rounded-lg border border-red-100 bg-red-50/60 p-3">
              <p className="text-xs uppercase tracking-wide text-red-500">Not on WhatsApp</p>
              <p className="text-lg font-semibold text-red-600">{contactStats.invalid ?? 0}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Not checked</p>
              <p className="text-lg font-semibold text-gray-500">{contactStats.unknown ?? 0}</p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
          <Field label="Import from CSV" hint="One number per line, or the first column of a CSV">
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={handleCsvFileChange}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
            />
          </Field>
          <SecondaryButton onClick={handleCsvImport} loading={importing} disabled={!csvFile} className="w-full">
            <FaFileAlt className="mr-2" /> Import numbers
          </SecondaryButton>
          <button
            type="button"
            onClick={handleCheckContacts}
            disabled={checking}
            className="btn w-full bg-green-600 text-white shadow-sm hover:bg-green-700 disabled:opacity-60"
          >
            <FaCheckCircle className="mr-2" />
            {checking ? 'Checking…' : 'Check on WhatsApp'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <GhostButton
            className="text-red-600 hover:bg-red-50"
            onClick={handleDeleteInvalidContacts}
            disabled={deletingInvalid || (contactStats?.invalid ?? 0) === 0}
          >
            <FaTrash className="mr-2" />
            {deletingInvalid
              ? 'Deleting…'
              : `Delete all invalid contacts (${contactStats?.invalid ?? 0})`}
          </GhostButton>
          <GhostButton onClick={handleCleanDuplicates}>
            <FaSyncAlt className="mr-2" />
            Remove duplicates
          </GhostButton>
          <p className="text-xs text-gray-500">
            Removes every number Meta confirmed is not on WhatsApp. Unchecked numbers are kept.
          </p>
        </div>

        {csvPreview.length > 0 ? (
          <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
            <p className="text-xs font-medium text-gray-500">
              Preview — first {csvPreview.length} number(s) in {csvFile?.name}:
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {csvPreview.map((p, i) => (
                <span key={`${p}-${i}`} className="rounded bg-white px-2 py-0.5 text-xs text-gray-600 shadow-sm">
                  {p}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-1 items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <TextInput
              value={contactSearch}
              onChange={(e) => {
                setContactSearch(e.target.value);
                setContactPage(1);
              }}
              placeholder="Search phone or name..."
              aria-label="Search WhatsApp contacts"
              className="pl-9"
            />
          </div>
          <SecondaryButton onClick={() => loadContacts(contactSearch, contactPage)}>Search</SecondaryButton>
        </div>

        {contactsLoading ? (
          <LoadingState label="Loading WhatsApp contacts" rows={3} />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={<FaUsers />}
            title="No imported contacts yet"
            message="Upload a CSV of phone numbers above. You can then target 'Imported contacts' when building a campaign."
          />
        ) : (
          <div className="space-y-4">
            <DataTable columns={['S/N', 'Number', 'Name', 'Source', 'On WhatsApp', 'Added', '']}>
              {contacts.map((c, index) => (
                <tr key={c.id} className="transition-colors hover:bg-gray-50/70">
                  <Td className="text-gray-600">{(contactPage - 1) * CONTACTS_PER_PAGE + index + 1}</Td>
                  <Td className="font-medium text-gray-900">{c.phone}</Td>
                  <Td className="text-gray-600">{c.full_name || '—'}</Td>
                  <Td className="text-xs uppercase text-gray-500">{c.source}</Td>
                  <Td>
                    {c.wa_status === 'valid' ? (
                      <span className="badge bg-green-100 text-green-700">🟢 On WhatsApp</span>
                    ) : c.wa_status === 'invalid' ? (
                      <span className="badge bg-red-100 text-red-700">🔴 Not on WhatsApp</span>
                    ) : (
                      <span className="badge bg-gray-100 text-gray-500">⚪ Not checked</span>
                    )}
                  </Td>
                  <Td className="text-xs text-gray-500">
                    <span className="block text-gray-600">{formatDate(c.created_at)}</span>
                    {c.wa_checked_at ? (
                      <span className="text-gray-400">checked {formatDate(c.wa_checked_at)}</span>
                    ) : null}
                  </Td>
                  <Td>
                    <GhostButton
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => handleDeleteContact(c)}
                      aria-label={`Remove ${c.phone}`}
                    >
                      <FaTimes /> Remove
                    </GhostButton>
                  </Td>
                </tr>
              ))}
            </DataTable>

            {contactTotalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <SecondaryButton
                  disabled={contactPage <= 1}
                  onClick={() => setContactPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <FaChevronLeft />
                </SecondaryButton>
                <span className="text-sm text-gray-600">Page {contactPage} of {contactTotalPages}</span>
                <SecondaryButton
                  disabled={contactPage >= contactTotalPages}
                  onClick={() => setContactPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  <FaChevronRight />
                </SecondaryButton>
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );

  return (
    <div className="space-y-6">
      <MarketingShell
        eyebrow="Super admin"
        title="WhatsApp Marketing"
        subtitle="Send approved template or free-text campaigns to users, with optional images and clips."
        icon={<FaWhatsapp />}
        actions={
          <PrimaryButton
            onClick={() => {
              setActiveTab('campaigns');
              setShowForm(true);
            }}
            className="gap-2"
          >
            <FaPlus /> New WhatsApp Campaign
          </PrimaryButton>
        }
      >
        <div className="space-y-6">
          <SegmentedControl
            className="w-full"
            value={activeTab}
            onChange={(tab) => {
              setActiveTab(tab);
              if (tab === 'campaigns') setShowForm(false);
            }}
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
          {activeTab === 'campaigns' && renderCampaigns()}
          {activeTab === 'contacts' && renderContacts()}
        </div>
      </MarketingShell>

      <Dialog
        open={governanceAction.open}
        onClose={closeGovernanceAction}
        title={gov.title}
        subtitle={governanceAction.target?.name ? `Campaign: ${governanceAction.target.name}` : ''}
        size="small"
        footer={
          <>
            <SecondaryButton onClick={closeGovernanceAction}>Cancel</SecondaryButton>
            {gov.tone === 'danger' ? (
              <button type="button" className="btn btn-danger text-sm" onClick={submitGovernanceAction} disabled={loading}>
                {loading ? 'Working…' : 'Confirm'}
              </button>
            ) : (
              <PrimaryButton onClick={submitGovernanceAction} loading={loading}>
                Confirm
              </PrimaryButton>
            )}
          </>
        }
      >
        <Field label={gov.label} required error={governanceAction.error || undefined}>
          <TextArea
            rows={3}
            value={governanceAction.note}
            onChange={(e) => setGovernanceAction((prev) => ({ ...prev, note: e.target.value, error: '' }))}
            placeholder={gov.placeholder}
          />
        </Field>
        <Banner tone="info" className="mt-4">
          This action is written to the marketing audit log with your name and the note above.
        </Banner>
      </Dialog>

      <Dialog
        open={statsModal.open && Boolean(statsModal.data)}
        onClose={() => setStatsModal({ open: false, data: null })}
        title={statsModal.data ? `${statsModal.data.campaign?.name} — delivery` : 'Delivery'}
        subtitle="Live counts from the campaign recipient queue"
        footer={<SecondaryButton onClick={() => setStatsModal({ open: false, data: null })}>Close</SecondaryButton>}
      >
        {statsModal.data ? (
          <div className="space-y-4">
            <StatGrid>
              <StatCard label="Total" value={statsModal.data.counts?.total ?? 0} />
              <StatCard label="Sent" value={statsModal.data.counts?.sent ?? 0} tone="success" />
              <StatCard label="Failed" value={statsModal.data.counts?.failed ?? 0} tone="danger" />
              <StatCard label="Pending" value={statsModal.data.counts?.pending ?? 0} tone="warning" />
            </StatGrid>
            {statsModal.data.recent_failures?.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold text-gray-700">Recent failures</p>
                <ul className="max-h-44 space-y-1 overflow-y-auto text-xs text-gray-600">
                  {statsModal.data.recent_failures.map((f, i) => (
                    <li key={i} className="rounded-lg bg-red-50 px-3 py-2">
                      <span className="font-medium">{f.phone}</span> — {f.error_message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-[11px] text-gray-400">
              Delivery receipts (delivered/read/failed) arrive through the Meta webhook and enrich
              message statuses over time.
            </p>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
};

export default WhatsappMarketingTab;
