import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { FaWhatsapp, FaPaperPlane, FaPlus, FaTrash, FaRedo, FaChartBar, FaUsers } from 'react-icons/fa';
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

  useEffect(() => {
    const boot = async () => {
      setListLoading(true);
      await Promise.all([loadStats(), loadCampaigns()]);
      setListLoading(false);
    };
    boot();
  }, [loadStats, loadCampaigns]);

  const updateForm = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setAudienceCount(null);
  };

  const previewAudience = async () => {
    setAudienceLoading(true);
    try {
      const params = { scope: form.scope };
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
    if (form.scope === 'user_type' && !form.user_type.trim()) {
      return toast.error('Enter the user type to target, or switch to all users');
    }

    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        kind: form.kind,
        recipient_filter: {
          scope: form.scope,
          user_type: form.scope === 'user_type' ? form.user_type.trim() : null,
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

  return (
    <div className="space-y-6">
      <MarketingShell
        eyebrow="Super admin"
        title="WhatsApp Marketing"
        subtitle="Send approved template or free-text campaigns to users, with optional images and clips."
        icon={<FaWhatsapp />}
        actions={
          <button
            type="button"
            className="btn bg-white text-primary-700 shadow-sm hover:bg-primary-50"
            onClick={() => setShowForm((v) => !v)}
          >
            <FaPlus className="mr-2" /> {showForm ? 'Close builder' : 'New WhatsApp Campaign'}
          </button>
        }
      >
        <div className="space-y-6">
          <Banner tone="warning" title="Meta rules">
            Template messages must first be approved inside your Meta app (WhatsApp → Message templates).
            Free-text messages only reach users who messaged your business number within the last 24 hours —
            anyone else will be rejected by Meta. Images and clips attached to free text follow the same
            24-hour rule; for campaigns, add the image/video header when creating the template in Meta.
            Marketing templates must mention how to opt out.
          </Banner>

          {stats ? (
            <StatGrid columns={3}>
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
            </StatGrid>
          ) : null}

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
                    <Field label="Audience">
                      <SelectInput
                        value={form.scope}
                        onChange={(e) => updateForm({ scope: e.target.value })}
                      >
                        <option value="all">All users with a phone number</option>
                        <option value="user_type">By user type</option>
                      </SelectInput>
                    </Field>
                    {form.scope === 'user_type' ? (
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
                      ≈ <strong>{audienceCount}</strong> user(s) will receive this campaign.
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
