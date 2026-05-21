import React, { useEffect, useMemo, useState } from 'react';
import { FaCheck, FaEyeSlash, FaMapMarkerAlt, FaStar, FaSync, FaTimes, FaTrash } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';

const emptyRuleForm = {
  state_id: '',
  lga_name: '',
  user_role: 'all',
  rating_context: 'all',
  submissions_enabled: true,
  flyins_enabled: true,
  notes: '',
};

const statusStyles = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  hidden: 'bg-slate-100 text-slate-600',
  rejected: 'bg-red-100 text-red-700',
};

const formatContext = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatDate = (value) => {
  if (!value) return 'Not reviewed';
  return new Date(value).toLocaleString();
};

const Stars = ({ value }) => (
  <div className="flex items-center gap-0.5 text-amber-400">
    {[1, 2, 3, 4, 5].map((star) => (
      <FaStar
        key={star}
        className={star <= Number(value || 0) ? 'opacity-100' : 'opacity-25'}
      />
    ))}
  </div>
);

const PlatformRatingsTab = () => {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [rules, setRules] = useState([]);
  const [states, setStates] = useState([]);
  const [contexts, setContexts] = useState([]);
  const [roles, setRoles] = useState([]);
  const [ruleForm, setRuleForm] = useState(emptyRuleForm);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingRule, setSavingRule] = useState(false);

  const contextOptions = useMemo(
    () => [{ value: 'all', label: 'All rating categories' }, ...contexts],
    [contexts]
  );

  const roleOptions = useMemo(
    () => [
      { value: 'all', label: 'All roles' },
      ...roles.map((role) => ({ value: role, label: formatContext(role) })),
    ],
    [roles]
  );

  const loadRatings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/super/platform-ratings');
      const data = response.data?.data || {};
      setSettings(data.settings || null);
      setRatings(data.ratings || []);
      setRules(data.rules || []);
      setStates(data.states || []);
      setContexts(data.contexts || []);
      setRoles(data.roles || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load platform ratings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRatings();
  }, []);

  const updateSetting = (name, value) => {
    setSettings((prev) => ({ ...(prev || {}), [name]: value }));
  };

  const saveSettings = async () => {
    if (!settings) return;
    try {
      setSavingSettings(true);
      const response = await api.patch('/super/platform-ratings/settings', settings);
      setSettings(response.data?.data || settings);
      toast.success('Rating settings updated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update rating settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const moderateRating = async (ratingId, status) => {
    try {
      await api.patch(`/super/platform-ratings/${ratingId}/moderate`, { status });
      toast.success(`Rating ${status}`);
      await loadRatings();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to moderate rating');
    }
  };

  const handleRuleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setRuleForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const submitRule = async (event) => {
    event.preventDefault();
    try {
      setSavingRule(true);
      await api.post('/super/platform-ratings/rules', ruleForm);
      setRuleForm(emptyRuleForm);
      toast.success('Location rule added');
      await loadRatings();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add location rule');
    } finally {
      setSavingRule(false);
    }
  };

  const deleteRule = async (ruleId) => {
    if (!window.confirm('Delete this rating location rule?')) return;
    try {
      await api.delete(`/super/platform-ratings/rules/${ruleId}`);
      toast.success('Location rule deleted');
      await loadRatings();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete location rule');
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <section className="rounded-xl2 border border-soft bg-white p-5 shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Verified Service Ratings</h3>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              Approve real tenant and landlord ratings, control live fly-ins, and apply location rules before ratings appear publicly.
            </p>
          </div>
          <button
            type="button"
            onClick={loadRatings}
            className="btn btn-secondary w-full justify-center sm:w-auto"
          >
            <FaSync className="mr-2 text-xs" />
            Refresh
          </button>
        </div>
      </section>

      {settings && (
        <section className="rounded-xl2 border border-soft bg-white p-5 shadow-card">
          <div className="mb-4">
            <h4 className="font-semibold text-gray-900">Display Controls</h4>
            <p className="text-sm text-gray-500">
              These controls affect the public fly-in notifications and user rating prompts.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3 text-sm font-medium text-gray-700">
              Live fly-ins
              <input
                type="checkbox"
                checked={settings.flyins_enabled === true}
                onChange={(event) => updateSetting('flyins_enabled', event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3 text-sm font-medium text-gray-700">
              Rating prompts
              <input
                type="checkbox"
                checked={settings.submissions_enabled === true}
                onChange={(event) => updateSetting('submissions_enabled', event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3 text-sm font-medium text-gray-700">
              Approved user images
              <input
                type="checkbox"
                checked={settings.show_user_images === true}
                onChange={(event) => updateSetting('show_user_images', event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600"
              />
            </label>

            <label className="text-sm font-medium text-gray-700">
              Public display name
              <select
                value={settings.display_name_mode || 'first_name'}
                onChange={(event) => updateSetting('display_name_mode', event.target.value)}
                className="input mt-1"
              >
                <option value="first_name">First name</option>
                <option value="initials">Initials</option>
                <option value="role_location">Role + location</option>
              </select>
            </label>

            <label className="text-sm font-medium text-gray-700">
              Fly-in frequency
              <input
                type="number"
                min="15"
                max="600"
                value={settings.flyin_frequency_seconds || 45}
                onChange={(event) => updateSetting('flyin_frequency_seconds', Number(event.target.value))}
                className="input mt-1"
              />
              <span className="mt-1 block text-xs font-normal text-gray-500">Seconds between cards.</span>
            </label>

            <label className="text-sm font-medium text-gray-700">
              Minimum public stars
              <select
                value={settings.min_stars_for_public || 4}
                onChange={(event) => updateSetting('min_stars_for_public', Number(event.target.value))}
                className="input mt-1"
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <option key={star} value={star}>
                    {star}+ stars
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={saveSettings}
              disabled={savingSettings}
              className="btn btn-primary w-full justify-center sm:w-auto"
            >
              {savingSettings ? 'Saving...' : 'Save Controls'}
            </button>
          </div>
        </section>
      )}

      <section className="rounded-xl2 border border-soft bg-white p-5 shadow-card">
        <div className="mb-4">
          <h4 className="font-semibold text-gray-900">Location Rules</h4>
          <p className="text-sm text-gray-500">
            Leave state, LGA, role, or category as all to create broader controls. More specific rules win.
          </p>
        </div>

        <form onSubmit={submitRule} className="grid gap-4 lg:grid-cols-4">
          <label className="text-sm font-medium text-gray-700">
            State
            <select name="state_id" value={ruleForm.state_id} onChange={handleRuleChange} className="input mt-1">
              <option value="">All states</option>
              {states.map((state) => (
                <option key={state.id} value={state.id}>
                  {state.state_name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-gray-700">
            LGA
            <input
              name="lga_name"
              value={ruleForm.lga_name}
              onChange={handleRuleChange}
              className="input mt-1"
              placeholder="All LGAs"
            />
          </label>

          <label className="text-sm font-medium text-gray-700">
            Role
            <select name="user_role" value={ruleForm.user_role} onChange={handleRuleChange} className="input mt-1">
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-gray-700">
            Category
            <select
              name="rating_context"
              value={ruleForm.rating_context}
              onChange={handleRuleChange}
              className="input mt-1"
            >
              {contextOptions.map((context) => (
                <option key={context.value} value={context.value}>
                  {context.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              name="submissions_enabled"
              type="checkbox"
              checked={ruleForm.submissions_enabled}
              onChange={handleRuleChange}
              className="h-4 w-4 rounded border-gray-300 text-primary-600"
            />
            Allow rating prompts
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              name="flyins_enabled"
              type="checkbox"
              checked={ruleForm.flyins_enabled}
              onChange={handleRuleChange}
              className="h-4 w-4 rounded border-gray-300 text-primary-600"
            />
            Allow fly-ins
          </label>

          <label className="text-sm font-medium text-gray-700 lg:col-span-2">
            Note
            <input
              name="notes"
              value={ruleForm.notes}
              onChange={handleRuleChange}
              className="input mt-1"
              placeholder="Optional admin note"
            />
          </label>

          <div className="lg:col-span-4">
            <button type="submit" disabled={savingRule} className="btn btn-primary w-full justify-center sm:w-auto">
              <FaMapMarkerAlt className="mr-2 text-xs" />
              {savingRule ? 'Adding...' : 'Add Location Rule'}
            </button>
          </div>
        </form>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {rules.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 p-5 text-center text-sm text-gray-500 lg:col-span-2">
              No rating location rules yet. Ratings are allowed everywhere unless you add a rule.
            </p>
          ) : (
            rules.map((rule) => (
              <article key={rule.id} className="rounded-lg border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {[rule.lga_name, rule.state_name].filter(Boolean).join(', ') || 'All locations'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {rule.user_role ? formatContext(rule.user_role) : 'All roles'} |{' '}
                      {rule.rating_context ? formatContext(rule.rating_context) : 'All categories'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteRule(rule.id)}
                    className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                    aria-label="Delete rating location rule"
                  >
                    <FaTrash />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className={`rounded-full px-2 py-1 ${rule.submissions_enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    Prompts {rule.submissions_enabled ? 'On' : 'Off'}
                  </span>
                  <span className={`rounded-full px-2 py-1 ${rule.flyins_enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    Fly-ins {rule.flyins_enabled ? 'On' : 'Off'}
                  </span>
                </div>

                {rule.notes && <p className="mt-2 text-sm text-gray-500">{rule.notes}</p>}
              </article>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl2 border border-soft bg-white p-5 shadow-card">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="font-semibold text-gray-900">Ratings Queue</h4>
            <p className="text-sm text-gray-500">
              Public fly-ins only use approved ratings that also pass your location rules.
            </p>
          </div>
          {loading && <span className="text-sm text-gray-500">Loading...</span>}
        </div>

        <div className="grid gap-4">
          {ratings.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
              No platform service ratings submitted yet.
            </p>
          ) : (
            ratings.map((rating) => (
              <article key={rating.id} className="rounded-xl border border-gray-100 p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusStyles[rating.status] || statusStyles.pending}`}>
                        {formatContext(rating.status)}
                      </span>
                      <span className="rounded-full bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-700">
                        {formatContext(rating.rating_context)}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                        {rating.passport_photo_url && rating.allow_public_image ? (
                          <img src={rating.passport_photo_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          String(rating.full_name || 'RH').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{rating.full_name}</p>
                        <p className="text-xs text-gray-500">{rating.email}</p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <Stars value={rating.stars} />
                      <p className="mt-2 text-sm text-gray-700">{rating.comment || 'No comment provided.'}</p>
                      <p className="mt-2 text-xs text-gray-500">
                        {rating.source_title || formatContext(rating.source_type)} |{' '}
                        {[rating.lga_name, rating.city, rating.state_name].filter(Boolean).join(', ') || 'No location'}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        Submitted {formatDate(rating.created_at)} | Reviewed {formatDate(rating.reviewed_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <button
                      type="button"
                      onClick={() => moderateRating(rating.id, 'approved')}
                      className="btn btn-secondary px-3 py-2 text-xs"
                    >
                      <FaCheck className="mr-2 text-green-600" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => moderateRating(rating.id, 'hidden')}
                      className="btn btn-secondary px-3 py-2 text-xs"
                    >
                      <FaEyeSlash className="mr-2 text-gray-600" />
                      Hide
                    </button>
                    <button
                      type="button"
                      onClick={() => moderateRating(rating.id, 'rejected')}
                      className="btn btn-danger px-3 py-2 text-xs"
                    >
                      <FaTimes className="mr-2" />
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default PlatformRatingsTab;
