import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { applicationService } from '../services/applicationService';
import Loader from '../components/common/Loader';
import Modal from '../components/common/Modal';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../utils/helpers';
import BackToDashboard from '../components/common/BackToDashboard';

const statusStyles = {
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-700',
  pending: 'bg-yellow-100 text-yellow-700',
};

const negotiationStyles = {
  none: 'bg-gray-100 text-gray-700',
  tenant_offered: 'bg-blue-100 text-blue-700',
  landlord_countered: 'bg-orange-100 text-orange-700',
  agreed: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
};

const formatDateTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

const getActionTranslationKey = (actionType) => ({
  tenant_offer: 'action_tenant_offer',
  landlord_counter: 'action_landlord_counter',
  landlord_accept_offer: 'action_landlord_accept',
  tenant_accept_counter: 'action_tenant_accept',
  tenant_reject_counter: 'action_tenant_reject',
}[actionType] || 'action_success');

const Applications = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [tenantOfferDraft, setTenantOfferDraft] = useState('');
  const [tenantOfferNote, setTenantOfferNote] = useState('');
  const [counterOfferDraft, setCounterOfferDraft] = useState('');
  const [counterOfferNote, setCounterOfferNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const res = user?.user_type === 'tenant'
        ? await applicationService.getMyApplications()
        : await applicationService.getReceivedApplications();

      if (res.success) {
        setApps(res.data);
      }
    } catch {
      toast.error(t('applications.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const openDetails = async (app) => {
    setShowModal(true);
    setDetailLoading(true);
    try {
      const res = await applicationService.getApplicationById(app.id);
      const data = res.data;
      setSelectedApp(data);
      setTenantOfferDraft(data.proposed_rent || '');
      setCounterOfferDraft(data.counter_offer_rent || '');
      setTenantOfferNote('');
      setCounterOfferNote('');
      setRejectReason('');
    } catch (error) {
      toast.error(error.response?.data?.message || t('dashboardUx.action_failed'));
      setShowModal(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedApp(null);
    setActionLoading('');
  };

  const refreshSelected = async () => {
    if (!selectedApp?.id) return;
    const res = await applicationService.getApplicationById(selectedApp.id);
    setSelectedApp(res.data);
  };

  const runAction = async (key, handler, successMessage) => {
    try {
      setActionLoading(key);
      await handler();
      toast.success(successMessage);
      await Promise.all([refreshSelected(), loadApplications()]);
    } catch (error) {
      toast.error(error.response?.data?.message || t('dashboardUx.action_failed'));
    } finally {
      setActionLoading('');
    }
  };

  const totalApplications = apps.length;
  const pendingApplications = apps.filter((app) => app.status === 'pending').length;
  const approvedApplications = apps.filter((app) => app.status === 'approved').length;

  const currentRent = useMemo(() => {
    if (!selectedApp) return null;
    return selectedApp.agreed_rent || selectedApp.counter_offer_rent || selectedApp.proposed_rent || selectedApp.rent_amount;
  }, [selectedApp]);

  if (loading) return <Loader />;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">
          {user?.user_type === 'tenant' ? t('applications.my_title') : t('applications.landlord_title')}
        </h1>
        <BackToDashboard />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3" data-tour-id="applications-workflow">
        <div className="card text-center">
          <p className="mb-1 text-sm text-gray-600">{t('dashboard.total_apps')}</p>
          <p className="text-3xl font-bold text-gray-900">{totalApplications}</p>
        </div>
        <div className="card text-center">
          <p className="mb-1 text-sm text-gray-600">{t('dashboard.pending_apps')}</p>
          <p className="text-3xl font-bold text-yellow-600">{pendingApplications}</p>
        </div>
        <div className="card text-center">
          <p className="mb-1 text-sm text-gray-600">{t('dashboard.approved_apps')}</p>
          <p className="text-3xl font-bold text-green-600">{approvedApplications}</p>
        </div>
      </div>

      <div className="space-y-4" data-tour-id="applications-list-workflow">
        {apps.map((app) => (
          <div key={app.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="font-semibold">{app.property_title}</div>
                <div className="text-sm text-gray-600">
                  {user?.user_type === 'tenant'
                    ? `${t('applications.landlord')}: ${app.landlord_name}`
                    : `${t('applications.tenant')}: ${app.tenant_name}`}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className={`rounded-full px-2 py-1 font-semibold ${statusStyles[app.status] || statusStyles.pending}`}>
                    {t(`applications.status.${app.status}`)}
                  </span>
                  <span className={`rounded-full px-2 py-1 font-semibold ${negotiationStyles[app.negotiation_status || 'none']}`}>
                    {t(`dashboardUx.status_${app.negotiation_status || 'none'}`)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-gray-700">
                  {t('dashboardUx.listed_rent')}: {formatCurrency(app.rent_amount || 0)}
                  {app.proposed_rent ? ` • ${t('dashboardUx.tenant_proposed')}: ${formatCurrency(app.proposed_rent)}` : ''}
                  {app.counter_offer_rent ? ` • ${t('dashboardUx.current_counter')}: ${formatCurrency(app.counter_offer_rent)}` : ''}
                  {app.agreed_rent ? ` • ${t('dashboardUx.status_agreed')}: ${formatCurrency(app.agreed_rent)}` : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() => openDetails(app)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                {t('dashboardUx.open_negotiation')}
              </button>
            </div>

            {app.message ? (
              <p className="mt-3 border-t pt-3 text-sm text-gray-700">{app.message}</p>
            ) : null}
          </div>
        ))}

        {apps.length === 0 ? (
          <div className="card py-10 text-center text-gray-500">
            <p>{t('applications.none')}</p>
            {user?.user_type === 'tenant' ? (
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link to="/saved-properties" className="btn btn-primary">{t('dashboardUx.saved_properties')}</Link>
                <Link to="/properties" className="btn btn-secondary">{t('dashboardUx.browse_properties')}</Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={t('dashboardUx.negotiation')}
        size="large"
      >
        {detailLoading || !selectedApp ? (
          <div className="py-10 text-center text-gray-500">{t('dashboardUx.loading_details')}</div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">{t('dashboardUx.property')}</p>
                <p className="mt-2 font-semibold text-gray-900">{selectedApp.property_title}</p>
                <p className="mt-2 text-sm text-gray-600">{t('dashboardUx.listed_rent')}: {formatCurrency(selectedApp.rent_amount || 0)}</p>
                <p className="text-sm text-gray-600">{t('dashboardUx.current_rent')}: {formatCurrency(currentRent || selectedApp.rent_amount || 0)}</p>
              </div>
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">{t('dashboardUx.application_status')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusStyles[selectedApp.status] || statusStyles.pending}`}>
                    {selectedApp.status}
                  </span>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${negotiationStyles[selectedApp.negotiation_status || 'none']}`}>
                    {t(`dashboardUx.status_${selectedApp.negotiation_status || 'none'}`)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-gray-600">
                  {user?.user_type === 'tenant'
                    ? `${t('applications.landlord')}: ${selectedApp.landlord_name || '-'}`
                    : `${t('applications.tenant')}: ${selectedApp.tenant_name || '-'}`}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <h3 className="text-base font-semibold text-gray-900">{t('dashboardUx.negotiation_history')}</h3>
              {selectedApp.negotiation_history?.length ? (
                <div className="mt-3 space-y-3">
                  {selectedApp.negotiation_history.map((entry) => (
                    <div key={entry.id} className="rounded-lg bg-gray-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-gray-900">{t(`dashboardUx.${getActionTranslationKey(entry.action_type)}`, { defaultValue: entry.action_type })}</p>
                        <p className="text-xs text-gray-500">{formatDateTime(entry.created_at)}</p>
                      </div>
                      <p className="mt-1 text-sm text-gray-700">{entry.actor_name} • {entry.actor_role}</p>
                      {entry.offer_amount ? (
                        <p className="mt-1 text-sm font-medium text-gray-900">{formatCurrency(entry.offer_amount)}</p>
                      ) : null}
                      {entry.note ? <p className="mt-1 text-sm text-gray-600">{entry.note}</p> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-500">{t('dashboardUx.no_events')}</p>
              )}
            </div>

            {selectedApp.status === 'pending' ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {user?.user_type === 'tenant' ? (
                  <>
                    <div className="rounded-xl border border-gray-200 p-4">
                      <h3 className="text-base font-semibold text-gray-900">{t('dashboardUx.send_offer')}</h3>
                      <input
                        type="number"
                        min="1"
                        value={tenantOfferDraft}
                        onChange={(event) => setTenantOfferDraft(event.target.value)}
                        className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder={t('dashboardUx.counter_rent')}
                      />
                      <textarea
                        value={tenantOfferNote}
                        onChange={(event) => setTenantOfferNote(event.target.value)}
                        rows={3}
                        className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder={t('dashboardUx.optional_note')}
                      />
                      <button
                        type="button"
                        disabled={actionLoading === 'tenant-offer'}
                        onClick={() => runAction(
                          'tenant-offer',
                          () => applicationService.updateTenantOffer(selectedApp.id, {
                            proposed_rent: tenantOfferDraft,
                            note: tenantOfferNote,
                          }),
                          t('dashboardUx.offer_sent')
                        )}
                        className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {actionLoading === 'tenant-offer' ? t('dashboardUx.sending') : t('dashboardUx.send_offer')}
                      </button>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4">
                      <h3 className="text-base font-semibold text-gray-900">{t('dashboardUx.current_counter')}</h3>
                      {selectedApp.negotiation_status === 'landlord_countered' && selectedApp.counter_offer_rent ? (
                        <>
                          <p className="mt-3 text-sm text-gray-700">
                            {t('dashboardUx.current_counter')}: <strong>{formatCurrency(selectedApp.counter_offer_rent)}</strong>
                          </p>
                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              type="button"
                              disabled={actionLoading === 'tenant-accept'}
                              onClick={() => runAction(
                                'tenant-accept',
                                () => applicationService.respondToCounterOffer(selectedApp.id, { action: 'accept' }),
                                t('dashboardUx.counter_accepted')
                              )}
                              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                            >
                              {actionLoading === 'tenant-accept' ? t('dashboardUx.saving') : t('dashboardUx.accept_counter')}
                            </button>
                            <button
                              type="button"
                              disabled={actionLoading === 'tenant-reject'}
                              onClick={() => runAction(
                                'tenant-reject',
                                () => applicationService.respondToCounterOffer(selectedApp.id, { action: 'reject' }),
                                t('dashboardUx.counter_rejected')
                              )}
                              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                            >
                              {actionLoading === 'tenant-reject' ? t('dashboardUx.saving') : t('dashboardUx.reject_counter')}
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="mt-3 text-sm text-gray-500">{t('dashboardUx.no_counter')}</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-gray-200 p-4">
                      <h3 className="text-base font-semibold text-gray-900">{t('dashboardUx.landlord_actions')}</h3>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={actionLoading === 'approve'}
                          onClick={() => runAction(
                            'approve',
                            () => applicationService.approveApplication(selectedApp.id),
                            t('dashboardUx.application_approved')
                          )}
                          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {actionLoading === 'approve' ? t('dashboardUx.approving') : t('dashboardUx.approve_application')}
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading === 'reject'}
                          onClick={() => runAction(
                            'reject',
                            () => applicationService.rejectApplication(selectedApp.id, rejectReason),
                            t('dashboardUx.application_rejected')
                          )}
                          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {actionLoading === 'reject' ? t('dashboardUx.rejecting') : t('dashboardUx.reject_application')}
                        </button>
                      </div>
                      <textarea
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                        rows={3}
                        className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder={t('dashboardUx.optional_note')}
                      />
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4">
                      <h3 className="text-base font-semibold text-gray-900">{t('dashboardUx.offer_control')}</h3>
                      {selectedApp.proposed_rent ? (
                        <p className="mt-3 text-sm text-gray-700">
                          {t('dashboardUx.tenant_proposed')}: <strong>{formatCurrency(selectedApp.proposed_rent)}</strong>
                        </p>
                      ) : (
                        <p className="mt-3 text-sm text-gray-500">{t('dashboardUx.no_offer')}</p>
                      )}
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={actionLoading === 'accept-offer' || !selectedApp.proposed_rent}
                          onClick={() => runAction(
                            'accept-offer',
                            () => applicationService.acceptTenantOffer(selectedApp.id),
                            t('dashboardUx.tenant_offer_accepted')
                          )}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {actionLoading === 'accept-offer' ? t('dashboardUx.saving') : t('dashboardUx.accept_tenant_offer')}
                        </button>
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={counterOfferDraft}
                        onChange={(event) => setCounterOfferDraft(event.target.value)}
                        className="mt-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder={t('dashboardUx.counter_rent')}
                      />
                      <textarea
                        value={counterOfferNote}
                        onChange={(event) => setCounterOfferNote(event.target.value)}
                        rows={3}
                        className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder={t('dashboardUx.optional_note')}
                      />
                      <button
                        type="button"
                        disabled={actionLoading === 'counter-offer'}
                        onClick={() => runAction(
                          'counter-offer',
                          () => applicationService.sendCounterOffer(selectedApp.id, {
                            counter_offer_rent: counterOfferDraft,
                            note: counterOfferNote,
                          }),
                          t('dashboardUx.counter_sent')
                        )}
                        className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {actionLoading === 'counter-offer' ? t('dashboardUx.sending') : t('dashboardUx.send_counter')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Applications;
