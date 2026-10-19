import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { FaWhatsapp, FaPaperPlane, FaPlus, FaTrash, FaRedo, FaChartBar, FaUsers, FaTimes } from 'react-icons/fa';
import api from '../../services/api';

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-700',
  queued: 'bg-blue-100 text-blue-700',
  sending: 'bg-amber-100 text-amber-700',
  sent: 'bg-green-100 text-green-700',
  paused: 'bg-red-100 text-red-700',
};

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
    <div className="mb-3 rounded border border-dashed border-gray-300 p-3">
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      {hint && <p className="mb-2 text-xs text-gray-400">{hint}</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select
          className="rounded border px-2 py-1.5 text-sm"
          value={value.type}
          onChange={(e) => onChange({ ...value, type: e.target.value })}
        >
          <option value="">No media</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="document">Document (link only)</option>
        </select>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp"
          className="text-xs"
          disabled={uploading || !value.type || value.type === 'document'}
          onChange={handleFile}
        />
        <input
          className="rounded border px-2 py-1.5 text-sm"
          placeholder="https://… public link"
          value={value.url}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
        />
      </div>
      {uploading && <p className="mt-1 text-xs text-gray-500">Uploading…</p>}
      {value.url && <p className="mt-1 break-all text-xs text-green-700">{value.url}</p>}
    </div>
  );
};

const WhatsappMarketingTab = () => {
  const [loading, setLoading] = useState(false);
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
    loadStats();
    loadCampaigns();
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <FaWhatsapp className="text-green-600" /> WhatsApp Marketing
        </h2>
        <button className="btn btn-primary flex items-center gap-2" onClick={() => setShowForm((v) => !v)}>
          <FaPlus /> New WhatsApp Campaign
        </button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <strong>Meta rules:</strong> template messages must first be approved inside your Meta app
        (WhatsApp → Message templates). Free-text messages only reach users who messaged your
        business number within the last 24 hours — anyone else will be rejected by Meta.
        Images and clips attached to free text follow the same 24-hour rule; for campaigns, add
        the image/video header when creating the template in Meta. Marketing templates must
        mention how to opt out.
      </div>

      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs text-gray-500">Total Campaigns</p>
            <p className="text-2xl font-bold text-gray-900">{stats.campaigns?.total ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs text-gray-500">Messages Sent</p>
            <p className="text-2xl font-bold text-green-600">{stats.messages?.sent ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs text-gray-500">Messages Failed</p>
            <p className="text-2xl font-bold text-red-600">{stats.messages?.failed ?? 0}</p>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-lg border bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Create WhatsApp Campaign</h3>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-gray-700">Campaign name</label>
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
              placeholder="e.g. October rent reminder"
            />
          </div>

          <div className="mb-3 flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                checked={form.kind === 'template'}
                onChange={() => updateForm({ kind: 'template' })}
              />
              Approved template message
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                checked={form.kind === 'text'}
                onChange={() => updateForm({ kind: 'text' })}
              />
              Free text (24h window only)
            </label>
          </div>

          {form.kind === 'template' ? (
            <>
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Meta template name</label>
                <input
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={form.template_name}
                  onChange={(e) => updateForm({ template_name: e.target.value })}
                  placeholder="rent_due_reminder"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Language</label>
                <input
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={form.template_language}
                  onChange={(e) => updateForm({ template_language: e.target.value })}
                  placeholder="en or en_US"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Body parameters (comma separated)</label>
                <input
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={form.template_params}
                  onChange={(e) => updateForm({ template_params: e.target.value })}
                  placeholder="Ada, N50,000"
                />
              </div>
            </div>
            <MediaField
              label="Template header media (optional)"
              hint="Only for templates approved with an image or video header. Leave as 'No media' otherwise."
              value={form.headerMedia}
              onChange={(v) => setForm((prev) => ({ ...prev, headerMedia: v }))}
            />
            </>
          ) : (
            <>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-gray-700">Message</label>
              <textarea
                className="w-full rounded border px-3 py-2 text-sm"
                rows={4}
                maxLength={1000}
                value={form.content}
                onChange={(e) => updateForm({ content: e.target.value })}
                placeholder="Type the message users will receive"
              />
              <p className="mt-1 text-xs text-gray-400">{form.content.length}/1000</p>
            </div>
            <MediaField
              label="Attach an image or clip (optional)"
              hint="Upload JPG/PNG/WEBP up to 5MB or MP4/3GP up to 16MB, or paste a public https link. The message text becomes the caption."
              value={form.media}
              onChange={(v) => setForm((prev) => ({ ...prev, media: v }))}
            />
            </>
          )}

          <div className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Audience</label>
              <select
                className="w-full rounded border px-3 py-2 text-sm"
                value={form.scope}
                onChange={(e) => updateForm({ scope: e.target.value })}
              >
                <option value="all">All users with a phone number</option>
                <option value="user_type">By user type</option>
              </select>
            </div>
            {form.scope === 'user_type' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">User type</label>
                <input
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={form.user_type}
                  onChange={(e) => updateForm({ user_type: e.target.value })}
                  placeholder="e.g. tenant, landlord, agent"
                />
              </div>
            )}
            <button
              type="button"
              className="btn btn-secondary flex items-center justify-center gap-2"
              onClick={previewAudience}
              disabled={audienceLoading}
            >
              <FaUsers /> {audienceLoading ? 'Counting…' : 'Preview audience'}
            </button>
          </div>

          {audienceCount !== null && (
            <p className="mb-3 text-sm text-gray-700">
              ≈ <strong>{audienceCount}</strong> user(s) will receive this campaign.
            </p>
          )}

          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="btn btn-primary flex items-center gap-2">
              <FaPaperPlane /> Create & queue send
            </button>
            <button type="button" className="btn" onClick={() => { setShowForm(false); setAudienceCount(null); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="rounded-lg border bg-white">
        <h3 className="border-b px-4 py-3 text-sm font-semibold text-gray-900">WhatsApp Campaigns</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Sent / Failed / Pending</th>
                <th className="px-4 py-2">Created by</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    No WhatsApp campaigns yet
                  </td>
                </tr>
              )}
              {campaigns.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2">
                    <p className="font-medium text-gray-900">{c.name}</p>
                    {c.kind === 'template' && (
                      <p className="text-xs text-gray-400">template: {c.template_name}</p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs uppercase text-gray-600">{c.kind}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status] || STATUS_STYLES.draft}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">
                    <span className="text-green-600">{c.sent_count}</span> /{' '}
                    <span className="text-red-600">{c.failed_count}</span> /{' '}
                    <span className="text-gray-500">{c.pending_count}</span>
                    <span className="text-gray-400"> (of {c.total_recipients})</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">{c.created_by_name || '—'}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2 text-xs">
                      <button className="text-blue-600 hover:underline" onClick={() => openStats(c)}>
                        <FaChartBar className="mr-1 inline" /> Stats
                      </button>
                      {['draft', 'paused'].includes(c.status) && (
                        <button className="text-green-600 hover:underline" onClick={() => openGovernanceAction('send', c)}>
                          <FaPaperPlane className="mr-1 inline" /> Send
                        </button>
                      )}
                      {['sent', 'paused'].includes(c.status) && (
                        <button className="text-amber-600 hover:underline" onClick={() => openGovernanceAction('retry', c)}>
                          <FaRedo className="mr-1 inline" /> Retry
                        </button>
                      )}
                      {c.status !== 'sending' && (
                        <button className="text-red-600 hover:underline" onClick={() => openGovernanceAction('delete', c)}>
                          <FaTrash className="mr-1 inline" /> Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {governanceAction.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">{gov.title}</h4>
              <button onClick={closeGovernanceAction} className="text-gray-400 hover:text-gray-600">
                <FaTimes />
              </button>
            </div>
            <p className="mb-2 text-xs text-gray-600">
              {governanceAction.target?.name ? `Campaign: ${governanceAction.target.name}` : ''}
            </p>
            <label className="mb-1 block text-xs font-medium text-gray-700">{gov.label}</label>
            <textarea
              className="w-full rounded border px-3 py-2 text-sm"
              rows={3}
              value={governanceAction.note}
              onChange={(e) => setGovernanceAction((prev) => ({ ...prev, note: e.target.value, error: '' }))}
              placeholder={gov.placeholder}
            />
            {governanceAction.error && (
              <p className="mt-1 text-xs text-red-600">{governanceAction.error}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                className={`btn ${gov.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                onClick={submitGovernanceAction}
                disabled={loading}
              >
                {loading ? 'Working…' : 'Confirm'}
              </button>
              <button className="btn" onClick={closeGovernanceAction}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {statsModal.open && statsModal.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">
                {statsModal.data.campaign?.name} — delivery
              </h4>
              <button onClick={() => setStatsModal({ open: false, data: null })} className="text-gray-400 hover:text-gray-600">
                <FaTimes />
              </button>
            </div>
            <div className="mb-3 grid grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded bg-gray-50 p-2"><p className="font-bold text-gray-900">{statsModal.data.counts?.total ?? 0}</p>Total</div>
              <div className="rounded bg-green-50 p-2"><p className="font-bold text-green-700">{statsModal.data.counts?.sent ?? 0}</p>Sent</div>
              <div className="rounded bg-red-50 p-2"><p className="font-bold text-red-700">{statsModal.data.counts?.failed ?? 0}</p>Failed</div>
              <div className="rounded bg-gray-50 p-2"><p className="font-bold text-gray-600">{statsModal.data.counts?.pending ?? 0}</p>Pending</div>
            </div>
            {statsModal.data.recent_failures?.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-gray-700">Recent failures</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-gray-600">
                  {statsModal.data.recent_failures.map((f, i) => (
                    <li key={i} className="rounded bg-red-50 px-2 py-1">
                      <span className="font-medium">{f.phone}</span> — {f.error_message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-3 text-xs text-gray-400">
              Delivery receipts (delivered/read/failed) arrive through the Meta webhook and enrich
              message statuses over time.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsappMarketingTab;
