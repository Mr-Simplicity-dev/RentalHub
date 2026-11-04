import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { FaWhatsapp, FaPaperPlane, FaPlus, FaTrash, FaRedo, FaChartBar, FaUsers, FaFileAlt, FaCheckCircle, FaTimes, FaSyncAlt, FaSearch, FaChevronLeft, FaChevronRight, FaEdit, FaEye, FaCheck } from 'react-icons/fa';
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
  const [csvContacts, setCsvContacts] = useState([]);
  const [csvBatchName, setCsvBatchName] = useState('');
  const [csvSearch, setCsvSearch] = useState('');
  const [csvPage, setCsvPage] = useState(1);
  const [editingCsvId, setEditingCsvId] = useState(null);
  const [editingCsvName, setEditingCsvName] = useState('');
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deletingInvalid, setDeletingInvalid] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [batches, setBatches] = useState([]);
  const [contactPage, setContactPage] = useState(1);
  const [contactTotal, setContactTotal] = useState(0);
  const [contactTotalPages, setContactTotalPages] = useState(1);
  const [contactPageSize, setContactPageSize] = useState(50);
  const CSV_PREVIEW_PER_PAGE = 15;

  // Contact editing state
  const [editingContact, setEditingContact] = useState(null);
  const [editContactName, setEditContactName] = useState('');
  const [savingContactEdit, setSavingContactEdit] = useState(false);

  // Audience preview modal state
  const [audienceModal, setAudienceModal] = useState({
    open: false,
    loading: false,
    recipients: [],
    total: 0,
    page: 1,
    totalPages: 1,
    search: '',
  });

  // Campaign recipients modal state
  const [campaignRecipientsModal, setCampaignRecipientsModal] = useState({
    open: false,
    campaign: null,
    loading: false,
    recipients: [],
    total: 0,
    page: 1,
    totalPages: 1,
    search: '',
  });

  const loadContacts = useCallback(async (search = '', page = 1, batch = '', limit = contactPageSize) => {
    setContactsLoading(true);
    try {
      const params = { page, limit };
      if (search) params.search = search;
      if (batch) params.batch = batch;
      const res = await api.get('/whatsapp-marketing/contacts', { params });
      setContacts(res.data.data.contacts || []);
      setContactStats(res.data.data.stats || null);
      setBatches(res.data.data.batches || []);
      const total = res.data.data.pagination?.total ?? res.data.data.contacts?.length ?? 0;
      setContactTotal(total);
      setContactTotalPages(res.data.data.pagination?.totalPages || Math.ceil(total / limit) || 1);
    } catch {
      toast.error('Failed to load imported contacts');
    } finally {
      setContactsLoading(false);
    }
  }, [contactPageSize]);

  useEffect(() => {
    const boot = async () => {
      setListLoading(true);
      await Promise.all([loadStats(), loadCampaigns()]);
      setListLoading(false);
    };
    boot();
    loadContacts(contactSearch, contactPage, selectedBatch, contactPageSize);
  }, []);

  useEffect(() => {
    if (activeTab === 'contacts') {
      loadContacts(contactSearch, contactPage, selectedBatch, contactPageSize);
    }
  }, [activeTab, contactSearch, contactPage, selectedBatch, contactPageSize, loadContacts]);

  const parseCsvContacts = (text = '') => {
    if (!text) return [];
    const normalized = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n').filter((l) => l.trim().length > 0);
    if (!lines.length) return [];

    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';') && (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length) delimiter = ';';
    else if (firstLine.includes('|') && (firstLine.match(/\|/g) || []).length > (firstLine.match(/,/g) || []).length) delimiter = '|';

    const parseLine = (line) => {
      const cells = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          cells.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      cells.push(current.trim());
      return cells.map((c) => c.replace(/^["']|["']$/g, '').trim());
    };

    const headerCells = parseLine(firstLine).map((h) => h.toLowerCase().trim());
    const hasHeader = headerCells.some((h) =>
      /phone|mobile|tel|contact|number|name|full_name|fullname|client|customer/i.test(h)
    );

    let phoneCol = -1;
    let nameCol = -1;

    if (hasHeader) {
      phoneCol = headerCells.findIndex((h) => /phone|mobile|tel|number/i.test(h));
      if (phoneCol === -1) {
        phoneCol = headerCells.findIndex((h) => /contact/i.test(h));
      }
      nameCol = headerCells.findIndex((h) => /name|full_name|fullname|client|customer/i.test(h));
    }

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const parsed = [];
    const seenPhones = new Set();

    dataLines.forEach((line, index) => {
      const cells = parseLine(line);
      if (!cells.length || cells.every((c) => !c)) return;

      let rawPhone = '';
      let rawName = '';

      if (phoneCol !== -1 && cells[phoneCol]) {
        rawPhone = cells[phoneCol];
        rawName = nameCol !== -1 && cells[nameCol] ? cells[nameCol] : '';
      } else {
        for (let i = 0; i < cells.length; i++) {
          const cell = cells[i];
          const digits = cell.replace(/\D/g, '');
          if (digits.length >= 10 && digits.length <= 15) {
            rawPhone = cell;
            const otherIdx = cells.findIndex((c, idx) => idx !== i && c && c.replace(/\D/g, '').length < 7);
            if (otherIdx !== -1) {
              rawName = cells[otherIdx];
            }
            break;
          }
        }
        if (!rawPhone && cells[0]) {
          rawPhone = cells[0];
          if (cells[1]) rawName = cells[1];
        }
      }

      const digitsOnly = String(rawPhone || '').replace(/\D/g, '');
      let isValid = false;
      let errorReason = '';

      if (!digitsOnly) {
        isValid = false;
        errorReason = 'Missing phone number';
      } else if (digitsOnly.length < 10) {
        isValid = false;
        errorReason = 'Too short (< 10 digits)';
      } else if (digitsOnly.length > 15) {
        isValid = false;
        errorReason = 'Too long (> 15 digits)';
      } else {
        isValid = true;
      }

      // Lack of name does NOT stop contact from importing!
      const cleanName = String(rawName || '').trim();

      parsed.push({
        id: `csv-${index + 1}`,
        rawPhone: rawPhone.trim(),
        phone: rawPhone.trim(),
        digits: digitsOnly,
        name: cleanName,
        isValid,
        errorReason,
        isDuplicate: digitsOnly ? seenPhones.has(digitsOnly) : false,
      });

      if (digitsOnly) seenPhones.add(digitsOnly);
    });

    return parsed;
  };

  const handleCsvFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFile(file);
    setCsvBatchName(file.name.replace(/\.[^/.]+$/, ''));
    setCsvPage(1);
    setCsvSearch('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsedContacts = parseCsvContacts(ev.target.result || '');
      setCsvContacts(parsedContacts);
    };
    reader.readAsText(file);
  };

  const handleUpdateCsvContactName = (contactId, newName) => {
    setCsvContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, name: newName.trim() } : c))
    );
    setEditingCsvId(null);
    setEditingCsvName('');
  };

  const handleRemoveCsvContact = (contactId) => {
    setCsvContacts((prev) => prev.filter((c) => c.id !== contactId));
  };

  const handleCsvImport = async () => {
    if (!csvContacts.length) {
      toast.error('Select a CSV file first');
      return;
    }
    const validContacts = csvContacts.filter((c) => c.isValid);
    if (!validContacts.length) {
      toast.error('No valid phone numbers found in the file');
      return;
    }

    setImporting(true);
    try {
      const importedBatch = csvBatchName.trim() || csvFile?.name?.replace(/\.[^/.]+$/, '') || 'CSV_Import';
      const payload = {
        contacts: validContacts.map((c) => ({
          phone: c.phone,
          full_name: c.name || null,
        })),
        import_batch: importedBatch,
      };

      const res = await api.post('/whatsapp-marketing/contacts/import', payload);
      const { added, updated, total } = res.data.data;
      toast.success(
        `Import complete: ${added} new contacts added, ${updated || 0} updated. All ${validContacts.length} contacts are viewable below.`
      );
      setCsvFile(null);
      setCsvContacts([]);
      setContactSearch('');
      setSelectedBatch(importedBatch);
      setContactPage(1);
      loadContacts('', 1, importedBatch, contactPageSize);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleSaveContactName = async () => {
    if (!editingContact) return;
    setSavingContactEdit(true);
    try {
      const res = await api.patch(`/whatsapp-marketing/contacts/${editingContact.id}`, {
        full_name: editContactName.trim() || null,
      });
      toast.success('Contact name updated');
      setContacts((prev) =>
        prev.map((c) => (c.id === editingContact.id ? { ...c, full_name: res.data.data.full_name } : c))
      );
      setEditingContact(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update contact name');
    } finally {
      setSavingContactEdit(false);
    }
  };

  const loadAudiencePreview = async (search = '', page = 1) => {
    setAudienceModal((prev) => ({ ...prev, loading: true, search, page }));
    try {
      const params = {
        source: form.source,
        scope: form.scope,
        page,
        limit: 50,
      };
      if (form.scope === 'user_type' && form.user_type.trim()) params.user_type = form.user_type.trim();
      if (search) params.search = search;
      const res = await api.get('/whatsapp-marketing/campaigns/preview-audience', { params });
      setAudienceModal((prev) => ({
        ...prev,
        open: true,
        loading: false,
        recipients: res.data.data.recipients || [],
        total: res.data.data.total || 0,
        totalPages: res.data.data.totalPages || 1,
        page: res.data.data.page || 1,
      }));
    } catch (err) {
      toast.error('Failed to load audience preview');
      setAudienceModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const openCampaignRecipients = async (campaign, search = '', page = 1) => {
    setCampaignRecipientsModal({
      open: true,
      campaign,
      loading: true,
      recipients: [],
      total: 0,
      page: 1,
      totalPages: 1,
      search,
    });
    try {
      const params = { page, limit: 50 };
      if (search) params.search = search;
      const res = await api.get(`/whatsapp-marketing/campaigns/${campaign.id}/recipients`, { params });
      setCampaignRecipientsModal({
        open: true,
        campaign,
        loading: false,
        recipients: res.data.data.recipients || [],
        total: res.data.data.total || 0,
        page: res.data.data.page || 1,
        totalPages: res.data.data.totalPages || 1,
        search,
      });
    } catch {
      toast.error('Failed to load campaign recipients');
      setCampaignRecipientsModal((prev) => ({ ...prev, loading: false }));
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
                <div className="flex gap-2">
                  <SecondaryButton onClick={previewAudience} loading={audienceLoading} className="flex-1" title="Get quick estimate of audience size">
                    <FaUsers className="mr-1.5" /> Quick count
                  </SecondaryButton>
                  <SecondaryButton
                    onClick={() => loadAudiencePreview('', 1)}
                    className="flex-1"
                    title="Inspect the exact contacts and users who will receive this campaign"
                  >
                    <FaEye className="mr-1.5" /> View audience list
                  </SecondaryButton>
                </div>
              </div>
              {audienceCount !== null ? (
                <div className="mt-3 flex items-center justify-between text-sm text-gray-700">
                  <p>
                    ≈ <strong>{audienceCount}</strong> recipient(s) will receive this campaign.
                  </p>
                  <GhostButton onClick={() => loadAudiencePreview('', 1)} className="text-xs text-primary-600">
                    <FaEye className="mr-1" /> View recipient details
                  </GhostButton>
                </div>
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
                    <GhostButton onClick={() => openCampaignRecipients(c)} aria-label={`View recipients for ${c.name}`}>
                      <FaEye /> Recipients
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

  const renderContacts = () => {
    const validCsvCount = csvContacts.filter((c) => c.isValid).length;
    const invalidCsvCount = csvContacts.filter((c) => !c.isValid).length;
    const withNameCsvCount = csvContacts.filter((c) => c.name && c.name.trim()).length;
    const withoutNameCsvCount = csvContacts.length - withNameCsvCount;

    const filteredCsv = csvContacts.filter((c) => {
      if (!csvSearch) return true;
      const q = csvSearch.toLowerCase();
      return (c.phone && c.phone.toLowerCase().includes(q)) || (c.name && c.name.toLowerCase().includes(q));
    });

    const csvTotalPages = Math.ceil(filteredCsv.length / CSV_PREVIEW_PER_PAGE) || 1;
    const paginatedCsv = filteredCsv.slice((csvPage - 1) * CSV_PREVIEW_PER_PAGE, csvPage * CSV_PREVIEW_PER_PAGE);

    return (
      <Panel
        title="WhatsApp contacts"
        description="Numbers that are not platform users — import them, verify them, and target them in campaigns."
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
                <p className="text-xs uppercase tracking-wide text-gray-400">Total in System</p>
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

          {/* CSV File Selection & Verification Action */}
          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
            <Field label="Choose CSV / Text File" hint="Supports phone, name, customer, and comma/tab/semicolon formats">
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={handleCsvFileChange}
                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
              />
            </Field>
            {csvContacts.length > 0 ? (
              <PrimaryButton onClick={handleCsvImport} loading={importing} disabled={validCsvCount === 0} className="w-full">
                <FaCheckCircle className="mr-2" /> Import {validCsvCount} Valid
              </PrimaryButton>
            ) : (
              <SecondaryButton onClick={() => toast.info('Please select a CSV file first')} className="w-full">
                <FaFileAlt className="mr-2" /> Select CSV file above
              </SecondaryButton>
            )}
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

          {/* Pre-Import Inspection Table Panel */}
          {csvContacts.length > 0 ? (
            <div className="rounded-xl border-2 border-primary-200 bg-primary-50/20 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
                      ✓
                    </span>
                    <h4 className="text-base font-semibold text-gray-900">
                      Pre-Import Verification &amp; Inspection
                    </h4>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    File: <strong className="text-gray-700">{csvFile?.name}</strong> &middot; Review all {csvContacts.length} parsed contacts before saving to the system.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <GhostButton
                    onClick={() => {
                      setCsvFile(null);
                      setCsvContacts([]);
                      setCsvSearch('');
                    }}
                    className="text-gray-500 hover:text-red-600"
                  >
                    <FaTimes className="mr-1.5" /> Discard file
                  </GhostButton>
                  <PrimaryButton
                    onClick={handleCsvImport}
                    loading={importing}
                    disabled={validCsvCount === 0}
                    className="gap-2"
                  >
                    <FaCheckCircle /> Import {validCsvCount} Valid Contacts
                  </PrimaryButton>
                </div>
              </div>

              {/* CSV Metrics Grid */}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div className="rounded-lg border border-gray-200 bg-white p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total Parsed</p>
                  <p className="text-base font-bold text-gray-800">{csvContacts.length}</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50/60 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-green-700">Valid Phone Numbers</p>
                  <p className="text-base font-bold text-green-800">{validCsvCount}</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50/60 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700">Invalid / Malformed</p>
                  <p className="text-base font-bold text-red-800">{invalidCsvCount}</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">With Name</p>
                  <p className="text-base font-bold text-blue-800">{withNameCsvCount}</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Without Name</p>
                  <p className="text-base font-bold text-amber-800">{withoutNameCsvCount}</p>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
                <strong>Friendly reminder:</strong> Lack of names will <u>never</u> stop contacts from importing. Contacts without names are stored safely with their phone numbers and can receive campaigns. You can also edit names inline below before importing, or later in the contacts table.
              </div>

              {/* Batch tag & Preview Search */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Import Batch Tag" hint="Group and filter these contacts later">
                  <TextInput
                    value={csvBatchName}
                    onChange={(e) => setCsvBatchName(e.target.value)}
                    placeholder="e.g. Lekki Landlords Nov 2026"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Filter Preview Table" hint={`Showing ${filteredCsv.length} of ${csvContacts.length} contacts`}>
                    <div className="relative">
                      <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <TextInput
                        value={csvSearch}
                        onChange={(e) => {
                          setCsvSearch(e.target.value);
                          setCsvPage(1);
                        }}
                        placeholder="Search phone or name in preview..."
                        className="pl-9"
                      />
                    </div>
                  </Field>
                </div>
              </div>

              {/* Table of Parsed Contacts */}
              <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
                <DataTable columns={['#', 'Phone Number', 'Status', 'Contact Name', 'Actions']}>
                  {paginatedCsv.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-sm text-gray-500">
                        No contacts match your preview search.
                      </td>
                    </tr>
                  ) : (
                    paginatedCsv.map((c, idx) => {
                      const globalIdx = (csvPage - 1) * CSV_PREVIEW_PER_PAGE + idx + 1;
                      const isEditingThis = editingCsvId === c.id;

                      return (
                        <tr key={c.id} className="transition-colors hover:bg-gray-50/70">
                          <Td className="text-xs text-gray-500">{globalIdx}</Td>
                          <Td>
                            <span className="font-mono font-medium text-gray-900">{c.phone}</span>
                            {c.isDuplicate && (
                              <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                Duplicate in file
                              </span>
                            )}
                          </Td>
                          <Td>
                            {c.isValid ? (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                ✓ Ready
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
                                title={c.errorReason}
                              >
                                ✕ {c.errorReason || 'Invalid'}
                              </span>
                            )}
                          </Td>
                          <Td>
                            {isEditingThis ? (
                              <div className="flex items-center gap-1.5">
                                <TextInput
                                  value={editingCsvName}
                                  onChange={(e) => setEditingCsvName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleUpdateCsvContactName(c.id, editingCsvName);
                                    } else if (e.key === 'Escape') {
                                      setEditingCsvId(null);
                                      setEditingCsvName('');
                                    }
                                  }}
                                  autoFocus
                                  placeholder="Enter contact name..."
                                  className="h-8 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateCsvContactName(c.id, editingCsvName)}
                                  className="rounded bg-green-600 p-1.5 text-white hover:bg-green-700"
                                  title="Save name"
                                >
                                  <FaCheck className="text-xs" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCsvId(null);
                                    setEditingCsvName('');
                                  }}
                                  className="rounded bg-gray-200 p-1.5 text-gray-700 hover:bg-gray-300"
                                  title="Cancel"
                                >
                                  <FaTimes className="text-xs" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                {c.name ? (
                                  <span className="font-medium text-gray-800">{c.name}</span>
                                ) : (
                                  <span className="text-xs italic text-gray-400">
                                    No name (optional)
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCsvId(c.id);
                                    setEditingCsvName(c.name || '');
                                  }}
                                  className="text-gray-400 hover:text-primary-600"
                                  title="Edit contact name"
                                >
                                  <FaEdit className="text-xs" />
                                </button>
                              </div>
                            )}
                          </Td>
                          <Td>
                            <GhostButton
                              onClick={() => handleRemoveCsvContact(c.id)}
                              className="text-red-500 hover:bg-red-50 hover:text-red-700"
                              title="Remove from import"
                            >
                              <FaTrash className="text-xs" />
                            </GhostButton>
                          </Td>
                        </tr>
                      );
                    })
                  )}
                </DataTable>
              </div>

              {/* Pagination for CSV Preview */}
              {csvTotalPages > 1 && (
                <div className="mt-3 flex items-center justify-between border-t border-primary-100 pt-2 text-xs text-gray-600">
                  <span>
                    Showing {Math.min(filteredCsv.length, (csvPage - 1) * CSV_PREVIEW_PER_PAGE + 1)} to{' '}
                    {Math.min(filteredCsv.length, csvPage * CSV_PREVIEW_PER_PAGE)} of {filteredCsv.length} contacts
                  </span>
                  <div className="flex items-center gap-1.5">
                    <SecondaryButton
                      disabled={csvPage <= 1}
                      onClick={() => setCsvPage((p) => Math.max(1, p - 1))}
                      className="px-2 py-1 text-xs"
                    >
                      <FaChevronLeft />
                    </SecondaryButton>
                    <span className="font-medium">
                      Page {csvPage} of {csvTotalPages}
                    </span>
                    <SecondaryButton
                      disabled={csvPage >= csvTotalPages}
                      onClick={() => setCsvPage((p) => p + 1)}
                      className="px-2 py-1 text-xs"
                    >
                      <FaChevronRight />
                    </SecondaryButton>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Search, Batch filter & Actions bar for Saved Contacts */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[200px] max-w-xs flex-1">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <TextInput
                  value={contactSearch}
                  onChange={(e) => {
                    setContactSearch(e.target.value);
                    setContactPage(1);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      loadContacts(contactSearch, 1, selectedBatch, contactPageSize);
                    }
                  }}
                  placeholder="Search phone or name..."
                  aria-label="Search WhatsApp contacts"
                  className="pl-9"
                />
              </div>

              {batches.length > 0 && (
                <SelectInput
                  value={selectedBatch}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedBatch(val);
                    setContactPage(1);
                    loadContacts(contactSearch, 1, val, contactPageSize);
                  }}
                  aria-label="Filter by batch"
                  className="max-w-[200px]"
                >
                  <option value="">All batches ({batches.length})</option>
                  {batches.map((b) => (
                    <option key={b} value={b}>
                      Batch: {b}
                    </option>
                  ))}
                </SelectInput>
              )}

              <SecondaryButton onClick={() => loadContacts(contactSearch, 1, selectedBatch, contactPageSize)}>
                Filter
              </SecondaryButton>

              {(contactSearch || selectedBatch) && (
                <GhostButton
                  onClick={() => {
                    setContactSearch('');
                    setSelectedBatch('');
                    setContactPage(1);
                    loadContacts('', 1, '', contactPageSize);
                  }}
                  className="text-xs text-gray-500"
                >
                  <FaTimes className="mr-1" /> Reset filters
                </GhostButton>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <span>Per page:</span>
                <select
                  value={contactPageSize}
                  onChange={(e) => {
                    const nextSize = Number(e.target.value);
                    setContactPageSize(nextSize);
                    setContactPage(1);
                    loadContacts(contactSearch, 1, selectedBatch, nextSize);
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm outline-none focus:border-primary-500"
                >
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={1000}>All (up to 1,000)</option>
                </select>
              </div>

              <div className="text-xs text-gray-500">
                Showing <strong className="text-gray-800">{contacts.length}</strong> of <strong className="text-gray-800">{contactTotal}</strong>
              </div>
            </div>
          </div>

          {selectedBatch && (
            <div className="flex items-center justify-between rounded-lg bg-primary-50/70 px-3 py-2 text-xs text-primary-900 border border-primary-200">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Filtered by batch:</span>
                <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-primary-200 text-primary-800">
                  {selectedBatch}
                </span>
                <span>({contactTotal} contacts)</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedBatch('');
                  setContactPage(1);
                  loadContacts(contactSearch, 1, '', contactPageSize);
                }}
                className="font-semibold text-primary-700 hover:text-primary-900 underline ml-2"
              >
                View all imported batches
              </button>
            </div>
          )}

          {contactsLoading ? (
            <LoadingState label="Loading WhatsApp contacts" rows={3} />
          ) : contacts.length === 0 ? (
            <EmptyState
              icon={<FaUsers />}
              title="No imported contacts found"
              message={
                contactSearch || selectedBatch
                  ? 'No contacts match your search or batch filter. Try clearing filters.'
                  : 'Upload a CSV of contacts above. You can inspect all numbers, edit names, and target them when building a campaign.'
              }
            />
          ) : (
            <div className="space-y-4">
              <DataTable columns={['S/N', 'Number', 'Name', 'Batch', 'Source', 'On WhatsApp', 'Added', 'Actions']}>
                {contacts.map((c, index) => (
                  <tr key={c.id} className="transition-colors hover:bg-gray-50/70">
                    <Td className="text-gray-600">{(contactPage - 1) * contactPageSize + index + 1}</Td>
                    <Td className="font-mono font-medium text-gray-900">{c.phone}</Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        {c.full_name ? (
                          <span className="font-medium text-gray-900">{c.full_name}</span>
                        ) : (
                          <span className="text-xs italic text-gray-400">No name</span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingContact(c);
                            setEditContactName(c.full_name || '');
                          }}
                          className="text-gray-400 hover:text-primary-600"
                          title="Edit name"
                        >
                          <FaEdit className="text-xs" />
                        </button>
                      </div>
                    </Td>
                    <Td>
                      <button
                        type="button"
                        onClick={() => {
                          const b = c.import_batch || 'CSV_Import';
                          setSelectedBatch(b);
                          setContactPage(1);
                          loadContacts(contactSearch, 1, b, contactPageSize);
                        }}
                        className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 transition hover:bg-primary-100 hover:text-primary-800"
                        title="Click to filter by this batch"
                      >
                        {c.import_batch || 'CSV_Import'}
                      </button>
                    </Td>
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
                      <div className="flex items-center gap-1">
                        <GhostButton
                          onClick={() => {
                            setEditingContact(c);
                            setEditContactName(c.full_name || '');
                          }}
                          aria-label={`Edit name for ${c.phone}`}
                        >
                          <FaEdit /> Edit
                        </GhostButton>
                        <GhostButton
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteContact(c)}
                          aria-label={`Remove ${c.phone}`}
                        >
                          <FaTimes /> Remove
                        </GhostButton>
                      </div>
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
  };

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

      {/* Edit Contact Name Dialog */}
      <Dialog
        open={Boolean(editingContact)}
        onClose={() => setEditingContact(null)}
        title="Edit Contact Name"
        subtitle={editingContact ? `Phone: ${editingContact.phone}` : ''}
        size="small"
        footer={
          <>
            <SecondaryButton onClick={() => setEditingContact(null)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSaveContactName} loading={savingContactEdit}>
              Save Name
            </PrimaryButton>
          </>
        }
      >
        <Field label="Full Name" hint="Leave blank to remove/clear the contact name">
          <TextInput
            value={editContactName}
            onChange={(e) => setEditContactName(e.target.value)}
            placeholder="e.g. John Doe"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveContactName();
              }
            }}
          />
        </Field>
      </Dialog>

      {/* Audience Preview Dialog */}
      <Dialog
        open={audienceModal.open}
        onClose={() => setAudienceModal((prev) => ({ ...prev, open: false }))}
        title={`Audience Preview (${audienceModal.total} contacts)`}
        subtitle={`Targeting: ${form.source === 'users' ? 'Platform Users' : form.source === 'contacts' ? 'Imported Contacts' : 'Both (Users & Contacts)'}`}
        footer={
          <SecondaryButton onClick={() => setAudienceModal((prev) => ({ ...prev, open: false }))}>
            Close
          </SecondaryButton>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <TextInput
                value={audienceModal.search}
                onChange={(e) => {
                  const val = e.target.value;
                  setAudienceModal((prev) => ({ ...prev, search: val }));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    loadAudiencePreview(audienceModal.search, 1);
                  }
                }}
                placeholder="Search recipient by phone or name..."
                className="pl-9"
              />
            </div>
            <SecondaryButton onClick={() => loadAudiencePreview(audienceModal.search, 1)}>
              Search
            </SecondaryButton>
          </div>

          {audienceModal.loading ? (
            <LoadingState label="Loading recipient preview..." rows={4} />
          ) : audienceModal.recipients.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              No matching recipients found for this audience filter.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <DataTable columns={['#', 'Phone', 'Name', 'Source', 'Details']}>
                {audienceModal.recipients.map((r, i) => (
                  <tr key={`${r.phone}-${i}`} className="hover:bg-gray-50/70">
                    <Td className="text-xs text-gray-500">
                      {(audienceModal.page - 1) * 50 + i + 1}
                    </Td>
                    <Td className="font-mono font-medium text-gray-900">{r.phone}</Td>
                    <Td className="text-gray-700">{r.full_name || '—'}</Td>
                    <Td className="text-xs uppercase text-gray-500">{r.source}</Td>
                    <Td className="text-xs text-gray-500">{r.user_type || r.role || '—'}</Td>
                  </tr>
                ))}
              </DataTable>
            </div>
          )}

          {audienceModal.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-600">
              <span>
                Page {audienceModal.page} of {audienceModal.totalPages} ({audienceModal.total} total)
              </span>
              <div className="flex items-center gap-1.5">
                <SecondaryButton
                  disabled={audienceModal.page <= 1}
                  onClick={() => loadAudiencePreview(audienceModal.search, audienceModal.page - 1)}
                  className="px-2 py-1 text-xs"
                >
                  <FaChevronLeft />
                </SecondaryButton>
                <SecondaryButton
                  disabled={audienceModal.page >= audienceModal.totalPages}
                  onClick={() => loadAudiencePreview(audienceModal.search, audienceModal.page + 1)}
                  className="px-2 py-1 text-xs"
                >
                  <FaChevronRight />
                </SecondaryButton>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* Campaign Recipients Modal */}
      <Dialog
        open={campaignRecipientsModal.open}
        onClose={() => setCampaignRecipientsModal((prev) => ({ ...prev, open: false }))}
        title={`${campaignRecipientsModal.campaign?.name || 'Campaign'} — Recipients (${campaignRecipientsModal.total})`}
        subtitle="Individual delivery status for each recipient in this campaign"
        footer={
          <SecondaryButton onClick={() => setCampaignRecipientsModal((prev) => ({ ...prev, open: false }))}>
            Close
          </SecondaryButton>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <TextInput
                value={campaignRecipientsModal.search}
                onChange={(e) => {
                  const val = e.target.value;
                  setCampaignRecipientsModal((prev) => ({ ...prev, search: val }));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (campaignRecipientsModal.campaign) {
                      openCampaignRecipients(campaignRecipientsModal.campaign, campaignRecipientsModal.search, 1);
                    }
                  }
                }}
                placeholder="Search by phone, name, or status..."
                className="pl-9"
              />
            </div>
            <SecondaryButton
              onClick={() => {
                if (campaignRecipientsModal.campaign) {
                  openCampaignRecipients(campaignRecipientsModal.campaign, campaignRecipientsModal.search, 1);
                }
              }}
            >
              Search
            </SecondaryButton>
          </div>

          {campaignRecipientsModal.loading ? (
            <LoadingState label="Loading campaign recipients..." rows={4} />
          ) : campaignRecipientsModal.recipients.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              No recipients found for this campaign.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <DataTable columns={['#', 'Phone', 'Name', 'Status', 'Sent At', 'Error']}>
                {campaignRecipientsModal.recipients.map((r, i) => (
                  <tr key={r.id || `${r.phone}-${i}`} className="hover:bg-gray-50/70">
                    <Td className="text-xs text-gray-500">
                      {(campaignRecipientsModal.page - 1) * 50 + i + 1}
                    </Td>
                    <Td className="font-mono font-medium text-gray-900">{r.phone}</Td>
                    <Td className="text-gray-700">{r.full_name || '—'}</Td>
                    <Td>
                      <StatusBadge status={r.status} />
                    </Td>
                    <Td className="text-xs text-gray-500">
                      {r.sent_at ? formatDate(r.sent_at) : '—'}
                    </Td>
                    <Td className="text-xs text-red-600 max-w-[200px] truncate" title={r.error_message || ''}>
                      {r.error_message || '—'}
                    </Td>
                  </tr>
                ))}
              </DataTable>
            </div>
          )}

          {campaignRecipientsModal.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-600">
              <span>
                Page {campaignRecipientsModal.page} of {campaignRecipientsModal.totalPages} ({campaignRecipientsModal.total} total)
              </span>
              <div className="flex items-center gap-1.5">
                <SecondaryButton
                  disabled={campaignRecipientsModal.page <= 1}
                  onClick={() => {
                    if (campaignRecipientsModal.campaign) {
                      openCampaignRecipients(
                        campaignRecipientsModal.campaign,
                        campaignRecipientsModal.search,
                        campaignRecipientsModal.page - 1
                      );
                    }
                  }}
                  className="px-2 py-1 text-xs"
                >
                  <FaChevronLeft />
                </SecondaryButton>
                <SecondaryButton
                  disabled={campaignRecipientsModal.page >= campaignRecipientsModal.totalPages}
                  onClick={() => {
                    if (campaignRecipientsModal.campaign) {
                      openCampaignRecipients(
                        campaignRecipientsModal.campaign,
                        campaignRecipientsModal.search,
                        campaignRecipientsModal.page + 1
                      );
                    }
                  }}
                  className="px-2 py-1 text-xs"
                >
                  <FaChevronRight />
                </SecondaryButton>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
};

export default WhatsappMarketingTab;
