import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { FaEdit, FaExternalLinkAlt, FaPlus, FaShareAlt, FaTrash, FaUpload } from 'react-icons/fa';
import api from '../../services/api';

const fallbackPlacements = [
  { value: 'home_top', label: 'Home top banner' },
  { value: 'home_featured', label: 'Home featured section' },
  { value: 'dashboard_top', label: 'Dashboard top banner' },
  { value: 'dashboard_inline', label: 'Dashboard inline banner' },
  { value: 'properties_top', label: 'Properties top banner' },
  { value: 'properties_inline', label: 'Properties inline banner' },
];

const emptyForm = {
  placement: 'home_top',
  title: '',
  description: '',
  sponsor_name: '',
  image_url: '',
  target_url: '',
  cta_label: 'Learn more',
  background_color: '#ffffff',
  text_color: '#111827',
  sharing_enabled: false,
  is_active: true,
  sort_order: '0',
  starts_at: '',
  ends_at: '',
};

const toDatetimeLocal = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

const formatDate = (value) => {
  if (!value) return 'Anytime';
  return new Date(value).toLocaleString();
};

const getUploadErrorMessage = (error) => {
  const data = error.response?.data;
  if (data?.message) return data.message;
  if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 160);
  if (error.response?.status) return `Upload failed with status ${error.response.status}`;
  return error.message || 'Failed to upload ad image';
};

const AdSpacesTab = () => {
  const [loading, setLoading] = useState(false);
  const [ads, setAds] = useState([]);
  const [placements, setPlacements] = useState(fallbackPlacements);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [imageUploading, setImageUploading] = useState(false);

  const placementLabelMap = useMemo(
    () => new Map(placements.map((placement) => [placement.value, placement.label])),
    [placements]
  );

  const loadAds = async () => {
    try {
      setLoading(true);
      const response = await api.get('/super/ad-spaces');
      const payload = response.data?.data || {};
      setAds(payload.ads || []);
      setPlacements(payload.placements || fallbackPlacements);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load ad spaces');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAds();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Select an image file');
      return;
    }

    const formData = new FormData();
    formData.append('image', file);

    try {
      setImageUploading(true);
      const response = await api.post('/super/ad-spaces/image', formData);
      const url = response.data?.data?.url;

      if (!url) {
        toast.error('Upload completed but no image URL was returned');
        return;
      }

      setForm((prev) => ({ ...prev, image_url: url }));
      toast.success('Ad image uploaded');
    } catch (error) {
      console.error('Ad image upload failed:', error.response || error);
      toast.error(getUploadErrorMessage(error));
    } finally {
      setImageUploading(false);
    }
  };

  const buildPayload = () => ({
    placement: form.placement,
    title: form.title,
    description: form.description,
    sponsor_name: form.sponsor_name,
    image_url: form.image_url,
    target_url: form.target_url,
    cta_label: form.cta_label,
    background_color: form.background_color,
    text_color: form.text_color,
    sharing_enabled: form.sharing_enabled,
    is_active: form.is_active,
    sort_order: Number(form.sort_order || 0),
    starts_at: form.starts_at || null,
    ends_at: form.ends_at || null,
  });

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.title.trim()) {
      toast.error('Ad title is required');
      return;
    }

    if (!form.target_url.trim()) {
      toast.error('Target URL is required so users can open the ad');
      return;
    }

    try {
      setLoading(true);
      const payload = buildPayload();

      if (editingId) {
        await api.patch(`/super/ad-spaces/${editingId}`, payload);
        toast.success('Ad space updated');
      } else {
        await api.post('/super/ad-spaces', payload);
        toast.success('Ad space created');
      }

      resetForm();
      await loadAds();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save ad space');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (ad) => {
    setEditingId(ad.id);
    setForm({
      placement: ad.placement || 'home_top',
      title: ad.title || '',
      description: ad.description || '',
      sponsor_name: ad.sponsor_name || '',
      image_url: ad.image_url || '',
      target_url: ad.target_url || '',
      cta_label: ad.cta_label || '',
      background_color: ad.background_color || '#ffffff',
      text_color: ad.text_color || '#111827',
      sharing_enabled: ad.sharing_enabled === true,
      is_active: ad.is_active === true,
      sort_order: String(ad.sort_order || 0),
      starts_at: toDatetimeLocal(ad.starts_at),
      ends_at: toDatetimeLocal(ad.ends_at),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleActive = async (ad) => {
    try {
      setLoading(true);
      await api.patch(`/super/ad-spaces/${ad.id}`, {
        ...ad,
        is_active: !ad.is_active,
      });
      toast.success(`Ad space ${ad.is_active ? 'paused' : 'activated'}`);
      await loadAds();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update ad space');
    } finally {
      setLoading(false);
    }
  };

  const deleteAd = async (adId) => {
    if (!window.confirm('Delete this ad space?')) return;

    try {
      setLoading(true);
      await api.delete(`/super/ad-spaces/${adId}`);
      toast.success('Ad space deleted');

      if (editingId === adId) {
        resetForm();
      }

      await loadAds();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete ad space');
    } finally {
      setLoading(false);
    }
  };

  const previewStyle = {
    backgroundColor: form.background_color || '#ffffff',
    color: form.text_color || '#111827',
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form
          onSubmit={handleSubmit}
          className="rounded-xl2 border border-soft bg-white p-6 shadow-card"
        >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edit Ad Space' : 'Create Ad Space'}
              </h3>
              <p className="text-sm text-gray-500">
                Manage public sponsored placements without touching page code.
              </p>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="btn btn-secondary"
              >
                New Ad
              </button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              Placement
              <select
                name="placement"
                value={form.placement}
                onChange={handleChange}
                className="input mt-1"
              >
                {placements.map((placement) => (
                  <option key={placement.value} value={placement.value}>
                    {placement.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-gray-700">
              Sort Order
              <input
                name="sort_order"
                type="number"
                value={form.sort_order}
                onChange={handleChange}
                className="input mt-1"
              />
            </label>

            <label className="text-sm font-medium text-gray-700 md:col-span-2">
              Title
              <input
                name="title"
                value={form.title}
                onChange={handleChange}
                className="input mt-1"
                placeholder="Ad headline"
              />
            </label>

            <label className="text-sm font-medium text-gray-700">
              Sponsor
              <input
                name="sponsor_name"
                value={form.sponsor_name}
                onChange={handleChange}
                className="input mt-1"
                placeholder="Sponsor name"
              />
            </label>

            <label className="text-sm font-medium text-gray-700">
              CTA Label
              <input
                name="cta_label"
                value={form.cta_label}
                onChange={handleChange}
                className="input mt-1"
                placeholder="Learn more"
              />
            </label>

            <label className="text-sm font-medium text-gray-700 md:col-span-2">
              Description
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                className="input mt-1 min-h-[96px]"
                placeholder="Short ad message"
              />
            </label>

            <div className="text-sm font-medium text-gray-700">
              <label htmlFor="ad-image-url">Image URL or Upload</label>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                <input
                  id="ad-image-url"
                  name="image_url"
                  value={form.image_url}
                  onChange={handleChange}
                  className="input min-w-0 flex-1"
                  placeholder="https://... or /uploads/ad-spaces/image.jpg"
                />
                <label className="btn btn-secondary shrink-0 cursor-pointer gap-2">
                  <FaUpload className="text-xs" />
                  {imageUploading ? 'Uploading...' : 'Upload'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleImageUpload}
                    disabled={imageUploading || loading}
                    className="sr-only"
                  />
                </label>
              </div>
              <p className="mt-1 text-xs font-normal text-gray-500">
                Paste an https URL or upload JPG, PNG, WEBP, or GIF up to 5MB.
              </p>
            </div>

            <label className="text-sm font-medium text-gray-700">
              Target URL *
              <input
                name="target_url"
                value={form.target_url}
                onChange={handleChange}
                className="input mt-1"
                placeholder="/register, /login, /properties/123, or https://..."
              />
              <span className="mt-1 block text-xs font-normal text-gray-500">
                Use app routes like /register, /login, or /properties/PROPERTY_ID. External links must start with https://.
              </span>
            </label>

            <label className="text-sm font-medium text-gray-700">
              Background
              <input
                name="background_color"
                type="color"
                value={form.background_color}
                onChange={handleChange}
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white p-1"
              />
            </label>

            <label className="text-sm font-medium text-gray-700">
              Text Color
              <input
                name="text_color"
                type="color"
                value={form.text_color}
                onChange={handleChange}
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white p-1"
              />
            </label>

            <label className="text-sm font-medium text-gray-700">
              Starts At
              <input
                name="starts_at"
                type="datetime-local"
                value={form.starts_at}
                onChange={handleChange}
                className="input mt-1"
              />
            </label>

            <label className="text-sm font-medium text-gray-700">
              Ends At
              <input
                name="ends_at"
                type="datetime-local"
                value={form.ends_at}
                onChange={handleChange}
                className="input mt-1"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  name="is_active"
                  type="checkbox"
                  checked={form.is_active}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600"
                />
                Active
              </label>

              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  name="sharing_enabled"
                  type="checkbox"
                  checked={form.sharing_enabled}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600"
                />
                Enable ad sharing
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
            >
              <FaPlus className="mr-2 text-xs" />
              {editingId ? 'Save Changes' : 'Create Ad'}
            </button>
          </div>
        </form>

        <aside className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
          <h3 className="mb-3 text-lg font-semibold text-gray-900">Preview</h3>
          <div
            className="overflow-hidden rounded-xl2 border border-gray-100 shadow-sm"
            style={previewStyle}
          >
            {form.image_url && (
              <div className="h-36 overflow-hidden bg-gray-100">
                <img
                  src={form.image_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                Sponsored{form.sponsor_name ? ` | ${form.sponsor_name}` : ''}
              </p>
              <h4 className="mt-2 text-lg font-bold leading-snug">
                {form.title || 'Ad headline'}
              </h4>
              <p className="mt-1 text-sm leading-relaxed opacity-80">
                {form.description || 'Ad description appears here.'}
              </p>
              {form.cta_label && (
                <span className="mt-3 inline-flex rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white">
                  {form.cta_label}
                </span>
              )}
              {form.sharing_enabled && (
                <span className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white/80 px-3 py-2 text-xs font-semibold text-gray-700">
                  <FaShareAlt className="text-gray-500" />
                  Sharing enabled
                </span>
              )}
            </div>
          </div>
        </aside>
      </div>

      <section className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Ad Spaces</h3>
          {loading && <span className="text-sm text-gray-500">Loading...</span>}
        </div>

        {ads.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
            No ad spaces created yet.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {ads.map((ad) => (
              <article
                key={ad.id}
                className="rounded-xl2 border border-gray-100 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">
                      {placementLabelMap.get(ad.placement) || ad.placement}
                    </p>
                    <h4 className="mt-1 text-base font-semibold text-gray-900">
                      {ad.title}
                    </h4>
                    <p className="text-sm text-gray-500">
                      {ad.sponsor_name || 'No sponsor'} | Order {ad.sort_order || 0}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      ad.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {ad.is_active ? 'Active' : 'Paused'}
                  </span>
                </div>

                {ad.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-gray-600">
                    {ad.description}
                  </p>
                )}

                <div className="mt-4 grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
                  <span>Starts: {formatDate(ad.starts_at)}</span>
                  <span>Ends: {formatDate(ad.ends_at)}</span>
                  <span>Impressions: {Number(ad.impression_count || 0).toLocaleString()}</span>
                  <span>Clicks: {Number(ad.click_count || 0).toLocaleString()}</span>
                  <span>Sharing: {ad.sharing_enabled ? 'Enabled' : 'Disabled'}</span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(ad)}
                    className="btn btn-secondary px-3 py-2 text-xs"
                  >
                    <FaEdit className="mr-2" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(ad)}
                    className="btn btn-secondary px-3 py-2 text-xs"
                  >
                    {ad.is_active ? 'Pause' : 'Activate'}
                  </button>
                  {ad.target_url && (
                    <a
                      href={ad.target_url}
                      target={/^https?:\/\//i.test(ad.target_url) ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className="btn btn-secondary px-3 py-2 text-xs"
                    >
                      <FaExternalLinkAlt className="mr-2" />
                      Open
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteAd(ad.id)}
                    className="btn btn-danger px-3 py-2 text-xs"
                  >
                    <FaTrash className="mr-2" />
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default AdSpacesTab;
