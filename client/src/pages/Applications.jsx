import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { applicationService } from '../services/applicationService';
import Loader from '../components/common/Loader';
import Modal from '../components/common/Modal';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../utils/helpers';

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

const actionLabels = {
  tenant_offer: 'Tenant offer',
  landlord_counter: 'Landlord counter-offer',
  landlord_accept_offer: 'Landlord accepted offer',
  tenant_accept_counter: 'Tenant accepted counter-offer',
  tenant_reject_counter: 'Tenant rejected counter-offer',
};

const formatDateTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

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
      toast.error(error.response?.data?.message || 'Failed to load application details');
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
      toast.error(error.response?.data?.message || 'Action failed');
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
      <h1 className="mb-3 text-center text-2xl font-bold">
        {user?.user_type === 'tenant' ? t('applications.my_title') : t('applications.landlord_title')}
      </h1>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
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

      <div className="space-y-4">
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
                    {(app.negotiation_status || 'none').replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="mt-3 text-sm text-gray-700">
                  Listed rent: {formatCurrency(app.rent_amount || 0)}
                  {app.proposed_rent ? ` • Tenant offer: ${formatCurrency(app.proposed_rent)}` : ''}
                  {app.counter_offer_rent ? ` • Landlord counter: ${formatCurrency(app.counter_offer_rent)}` : ''}
                  {app.agreed_rent ? ` • Agreed: ${formatCurrency(app.agreed_rent)}` : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() => openDetails(app)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Open negotiation
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
                <Link to="/saved-properties" className="btn btn-primary">Open Saved Properties</Link>
                <Link to="/properties" className="btn btn-secondary">Browse Properties</Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title="Application Negotiation"
        size="large"
      >
        {detailLoading || !selectedApp ? (
          <div className="py-10 text-center text-gray-500">Loading application details...</div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Property</p>
                <p className="mt-2 font-semibold text-gray-900">{selectedApp.property_title}</p>
                <p className="mt-2 text-sm text-gray-600">Listed rent: {formatCurrency(selectedApp.rent_amount || 0)}</p>
                <p className="text-sm text-gray-600">Current working rent: {formatCurrency(currentRent || selectedApp.rent_amount || 0)}</p>
              </div>
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Application Status</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusStyles[selectedApp.status] || statusStyles.pending}`}>
                    {selectedApp.status}
                  </span>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${negotiationStyles[selectedApp.negotiation_status || 'none']}`}>
                    {(selectedApp.negotiation_status || 'none').replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="mt-3 text-sm text-gray-600">
                  {user?.user_type === 'tenant'
                    ? `Landlord: ${selectedApp.landlord_name || '-'}`
                    : `Tenant: ${selectedApp.tenant_name || '-'}`}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <h3 className="text-base font-semibold text-gray-900">Negotiation History</h3>
              {selectedApp.negotiation_history?.length ? (
                <div className="mt-3 space-y-3">
                  {selectedApp.negotiation_history.map((entry) => (
                    <div key={entry.id} className="rounded-lg bg-gray-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-gray-900">{actionLabels[entry.action_type] || entry.action_type}</p>
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
                <p className="mt-3 text-sm text-gray-500">No negotiation events yet.</p>
              )}
            </div>

            {selectedApp.status === 'pending' ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {user?.user_type === 'tenant' ? (
                  <>
                    <div className="rounded-xl border border-gray-200 p-4">
                      <h3 className="text-base font-semibold text-gray-900">Send or Update Offer</h3>
                      <input
                        type="number"
                        min="1"
                        value={tenantOfferDraft}
                        onChange={(event) => setTenantOfferDraft(event.target.value)}
                        className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder="Enter your proposed rent"
                      />
                      <textarea
                        value={tenantOfferNote}
                        onChange={(event) => setTenantOfferNote(event.target.value)}
                        rows={3}
                        className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder="Optional note to landlord"
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
                          'Offer sent to landlord'
                        )}
                        className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {actionLoading === 'tenant-offer' ? 'Sending...' : 'Send Offer'}
                      </button>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4">
                      <h3 className="text-base font-semibold text-gray-900">Respond to Landlord Counter</h3>
                      {selectedApp.negotiation_status === 'landlord_countered' && selectedApp.counter_offer_rent ? (
                        <>
                          <p className="mt-3 text-sm text-gray-700">
                            Current counter-offer: <strong>{formatCurrency(selectedApp.counter_offer_rent)}</strong>
                          </p>
                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              type="button"
                              disabled={actionLoading === 'tenant-accept'}
                              onClick={() => runAction(
                                'tenant-accept',
                                () => applicationService.respondToCounterOffer(selectedApp.id, { action: 'accept' }),
                                'Counter-offer accepted'
                              )}
                              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                            >
                              {actionLoading === 'tenant-accept' ? 'Saving...' : 'Accept Counter'}
                            </button>
                            <button
                              type="button"
                              disabled={actionLoading === 'tenant-reject'}
                              onClick={() => runAction(
                                'tenant-reject',
                                () => applicationService.respondToCounterOffer(selectedApp.id, { action: 'reject' }),
                                'Counter-offer rejected'
                              )}
                              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                            >
                              {actionLoading === 'tenant-reject' ? 'Saving...' : 'Reject Counter'}
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="mt-3 text-sm text-gray-500">No landlord counter-offer is waiting for your response.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-gray-200 p-4">
                      <h3 className="text-base font-semibold text-gray-900">Landlord Actions</h3>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={actionLoading === 'approve'}
                          onClick={() => runAction(
                            'approve',
                            () => applicationService.approveApplication(selectedApp.id),
                            'Application approved'
                          )}
                          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {actionLoading === 'approve' ? 'Approving...' : 'Approve Application'}
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading === 'reject'}
                          onClick={() => runAction(
                            'reject',
                            () => applicationService.rejectApplication(selectedApp.id, rejectReason),
                            'Application rejected'
                          )}
                          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {actionLoading === 'reject' ? 'Rejecting...' : 'Reject Application'}
                        </button>
                      </div>
                      <textarea
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                        rows={3}
                        className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder="Optional rejection note"
                      />
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4">
                      <h3 className="text-base font-semibold text-gray-900">Offer Control</h3>
                      {selectedApp.proposed_rent ? (
                        <p className="mt-3 text-sm text-gray-700">
                          Tenant proposed: <strong>{formatCurrency(selectedApp.proposed_rent)}</strong>
                        </p>
                      ) : (
                        <p className="mt-3 text-sm text-gray-500">The tenant has not submitted a rent offer yet.</p>
                      )}
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={actionLoading === 'accept-offer' || !selectedApp.proposed_rent}
                          onClick={() => runAction(
                            'accept-offer',
                            () => applicationService.acceptTenantOffer(selectedApp.id),
                            'Tenant offer accepted'
                          )}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {actionLoading === 'accept-offer' ? 'Saving...' : 'Accept Tenant Offer'}
                        </button>
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={counterOfferDraft}
                        onChange={(event) => setCounterOfferDraft(event.target.value)}
                        className="mt-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder="Enter counter-offer rent"
                      />
                      <textarea
                        value={counterOfferNote}
                        onChange={(event) => setCounterOfferNote(event.target.value)}
                        rows={3}
                        className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder="Optional note to tenant"
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
                          'Counter-offer sent'
                        )}
                        className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {actionLoading === 'counter-offer' ? 'Sending...' : 'Send Counter-Offer'}
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
