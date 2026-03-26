import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import {
  FaHome,
  FaEnvelope,
  FaFileAlt,
  FaHeart,
  FaCheckCircle,
  FaClock,
  FaMoneyBillWave,
  FaUndo,
  FaTimes,
  FaExclamationTriangle,
  FaWallet,
  FaPiggyBank,
  FaUniversity,
  FaThumbsUp,
  FaThumbsDown,
} from 'react-icons/fa';
import Loader from '../components/common/Loader';
import { getTimeAgo } from '../utils/helpers';
import { useTranslation } from 'react-i18next';

const NIGERIAN_BANKS = [
  'Access Bank',
  'Citibank Nigeria',
  'Ecobank Nigeria',
  'Fidelity Bank',
  'First Bank of Nigeria',
  'First City Monument Bank (FCMB)',
  'Globus Bank',
  'Guaranty Trust Bank (GTBank)',
  'Heritage Bank',
  'Keystone Bank',
  'Kuda Bank',
  'Moniepoint Microfinance Bank',
  'OPay',
  'PalmPay',
  'Parallex Bank',
  'Polaris Bank',
  'Providus Bank',
  'Stanbic IBTC Bank',
  'Standard Chartered Bank',
  'Sterling Bank',
  'SunTrust Bank',
  'Taj Bank',
  'Titan Trust Bank',
  'Union Bank of Nigeria',
  'United Bank for Africa (UBA)',
  'Unity Bank',
  'VFD Microfinance Bank',
  'Wema Bank',
  'Zenith Bank',
];

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [stats, setStats] = useState(null);
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Refund state ──────────────────────────────────────────────────────────
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundView, setRefundView] = useState('form');        // 'form' | 'history' | 'success'
  const [eligiblePayments, setEligiblePayments] = useState([]);
  const [myRefundRequests, setMyRefundRequests] = useState([]);
  const [refundForm, setRefundForm] = useState({ payment_id: '', reason: '', details: '' });
  const [refundLoading, setRefundLoading] = useState(false);

  // ── Withdrawal state (tenant + landlord) ──────────────────────────────────
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);
  const [landlordWallet, setLandlordWallet] = useState(null);
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', bank_name: '', account_number: '', account_name: '' });
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawHistory, setWithdrawHistory] = useState([]);
  const [walletView, setWalletView] = useState('withdraw'); // 'withdraw' | 'fund'
  const [fundAmount, setFundAmount] = useState('');
  const [fundLoading, setFundLoading] = useState(false);

  // ── Landlord refund management state ─────────────────────────────────────
  const [showLandlordRefundModal, setShowLandlordRefundModal] = useState(false);
  const [landlordRefunds, setLandlordRefunds] = useState([]);
  const [landlordRefundFilter, setLandlordRefundFilter] = useState('pending');
  const [selectedRefund, setSelectedRefund] = useState(null);
  const [approveForm, setApproveForm] = useState({ refund_type: 'full', refund_months: '', approved_amount: '', landlord_note: '' });
  const [rejectNote, setRejectNote] = useState('');
  const [refundActionLoading, setRefundActionLoading] = useState(false);
  const hasSubmittedVerification = !!user?.passport_photo_url;
  const verificationReviewStatus =
    user?.identity_verification_status ||
    (user?.identity_verified
      ? 'verified'
      : hasSubmittedVerification
        ? 'pending'
        : 'not_submitted');

  const loadDashboardData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const endpoint =
        user.user_type === 'tenant'
          ? '/dashboard/tenant/stats'
          : '/dashboard/landlord/stats';

      const activitiesEndpoint =
        user.user_type === 'tenant'
          ? '/dashboard/tenant/recent-activities'
          : '/dashboard/landlord/recent-activities';

      const [statsResponse, activitiesResponse] = await Promise.all([
        api.get(endpoint),
        api.get(activitiesEndpoint),
      ]);

      if (statsResponse.data.success) {
        setStats(statsResponse.data.data);
      }

      if (activitiesResponse.data.success) {
        setRecentActivities(activitiesResponse.data.data);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    if (user.user_type === 'super_admin') {
      navigate('/super-admin', { replace: true });
      return;
    }

    loadDashboardData();
  }, [user, navigate, loadDashboardData]);

  useEffect(() => {
    if (!user) return undefined;

    const intervalId = setInterval(() => {
      loadDashboardData();
    }, 30000);

    const handleWindowFocus = () => {
      loadDashboardData();
    };

    window.addEventListener('focus', handleWindowFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [user, loadDashboardData]);

  // ── Withdrawal helpers ───────────────────────────────────────────────────
  const openWithdrawModal = async () => {
    setWithdrawForm({ amount: '', bank_name: '', account_number: '', account_name: '' });
    setWalletView('withdraw');
    setFundAmount('');
    setShowWithdrawModal(true);
    try {
      if (user.user_type === 'tenant') {
        const res = await api.get('/payments/wallet/balance');
        if (res.data?.success) setWalletBalance(res.data.data.balance);
      } else {
        const res = await api.get('/payments/wallet/landlord-balance');
        if (res.data?.success) setLandlordWallet(res.data.data);
      }
      const histRes = await api.get('/payments/wallet/withdrawals');
      if (histRes.data?.success) setWithdrawHistory(histRes.data.data || []);
    } catch (err) {
      console.error('Failed to load wallet data', err);
    }
  };

  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    if (!withdrawForm.amount || !withdrawForm.bank_name || !withdrawForm.account_number || !withdrawForm.account_name) {
      toast.error('All fields are required');
      return;
    }
    setWithdrawLoading(true);
    try {
      const res = await api.post('/payments/wallet/withdraw', withdrawForm);
      if (res.data?.success) {
        toast.success('Withdrawal request submitted successfully');
        setShowWithdrawModal(false);
        loadDashboardData();
      } else {
        toast.error(res.data?.message || 'Failed to submit withdrawal');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit withdrawal');
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleFundWallet = async (e) => {
    e.preventDefault();
    if (!fundAmount || Number(fundAmount) < 100) {
      toast.error('Minimum funding amount is ₦100');
      return;
    }
    setFundLoading(true);
    try {
      const res = await api.post('/payments/wallet/fund', { amount: fundAmount });
      if (res.data?.success && res.data.data?.authorization_url) {
        // Redirect to Paystack
        window.location.href = res.data.data.authorization_url;
      } else {
        toast.error(res.data?.message || 'Failed to initialize payment');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to initialize payment');
    } finally {
      setFundLoading(false);
    }
  };

  const withdrawStatusBadge = (status) => {
    const map = {
      pending:   'bg-yellow-100 text-yellow-800',
      approved:  'bg-blue-100 text-blue-800',
      rejected:  'bg-red-100 text-red-800',
      processed: 'bg-green-100 text-green-800',
    };
    return map[status] || 'bg-gray-100 text-gray-700';
  };

  // ── Landlord refund management helpers ───────────────────────────────────
  const openLandlordRefundModal = async (filter = 'pending') => {
    setLandlordRefundFilter(filter);
    setSelectedRefund(null);
    setShowLandlordRefundModal(true);
    try {
      const res = await api.get(`/payments/refund/landlord?status=${filter}`);
      if (res.data?.success) setLandlordRefunds(res.data.data || []);
    } catch (err) {
      console.error('Failed to load landlord refunds', err);
    }
  };

  const handleApproveRefund = async (refundId) => {
    if (!approveForm.refund_type) return toast.error('Select refund type');
    if (approveForm.refund_type === 'partial_months' && !approveForm.refund_months) {
      return toast.error('Enter number of months to refund');
    }
    if (approveForm.refund_type === 'partial_custom' && !approveForm.approved_amount) {
      return toast.error('Enter custom refund amount');
    }
    setRefundActionLoading(true);
    try {
      const res = await api.put(`/payments/refund/${refundId}/approve`, {
        refund_type:     approveForm.refund_type,
        refund_months:   approveForm.refund_months || undefined,
        approved_amount: approveForm.approved_amount || undefined,
        landlord_note:   approveForm.landlord_note,
      });
      if (res.data?.success) {
        toast.success(res.data.message);
        setSelectedRefund(null);
        openLandlordRefundModal(landlordRefundFilter);
        loadDashboardData();
      } else {
        toast.error(res.data?.message || 'Failed to approve refund');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve refund');
    } finally {
      setRefundActionLoading(false);
    }
  };

  const handleRejectRefund = async (refundId) => {
    if (!rejectNote.trim()) return toast.error('A rejection reason is required');
    setRefundActionLoading(true);
    try {
      const res = await api.put(`/payments/refund/${refundId}/reject`, { landlord_note: rejectNote });
      if (res.data?.success) {
        toast.success('Refund request rejected');
        setSelectedRefund(null);
        setRejectNote('');
        openLandlordRefundModal(landlordRefundFilter);
        loadDashboardData();
      } else {
        toast.error(res.data?.message || 'Failed to reject refund');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject refund');
    } finally {
      setRefundActionLoading(false);
    }
  };

  // ── Refund helpers ────────────────────────────────────────────────────────
  const openRefundModal = async () => {
    setRefundForm({ payment_id: '', reason: '', details: '' });
    setRefundView('form');
    setShowRefundModal(true);
    try {
      const [eligibleRes, historyRes] = await Promise.all([
        api.get('/payments/refund/eligible'),
        api.get('/payments/refund/my-requests'),
      ]);
      if (eligibleRes.data?.success) setEligiblePayments(eligibleRes.data.data || []);
      if (historyRes.data?.success) setMyRefundRequests(historyRes.data.data || []);
    } catch (err) {
      console.error('Failed to load refund data', err);
    }
  };

  const handleRefundSubmit = async (e) => {
    e.preventDefault();
    if (!refundForm.payment_id || !refundForm.reason) return;
    setRefundLoading(true);
    try {
      const res = await api.post('/payments/refund/request', {
        payment_id: refundForm.payment_id,
        reason: refundForm.reason,
        details: refundForm.details,
      });
      if (res.data?.success) {
        setRefundView('success');
        loadDashboardData();
      } else {
        toast.error(res.data?.message || 'Failed to submit refund request');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to submit refund request';
      toast.error(msg);
    } finally {
      setRefundLoading(false);
    }
  };

  const refundStatusBadge = (status) => {
    const map = {
      pending:  'bg-yellow-100 text-yellow-800',
      approved: 'bg-blue-100 text-blue-800',
      rejected: 'bg-red-100 text-red-800',
      refunded: 'bg-green-100 text-green-800',
    };
    return map[status] || 'bg-gray-100 text-gray-700';
  };

  const getTenantSubscriptionValue = () => {
    if (!stats?.subscription_expires_at) {
      return 'Inactive';
    }

    const expiresAt = new Date(stats.subscription_expires_at);

    if (Number.isNaN(expiresAt.getTime())) {
      return 'Inactive';
    }

    const now = new Date();

    if (expiresAt <= now) {
      return 'Expired';
    }

    const daysLeft = Math.max(
      1,
      Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    );

    return `${daysLeft}d left`;
  };

  const getLawyerInviteSummary = () => {
    const rawStatus = stats?.lawyer_invite_status || 'not_sent';
    const lawyerEmail = stats?.lawyer_email;
    const acceptedAt = stats?.lawyer_invite_accepted_at
      ? new Date(stats.lawyer_invite_accepted_at)
      : null;
    const expiresAt = stats?.lawyer_invite_expires_at
      ? new Date(stats.lawyer_invite_expires_at)
      : null;

    const hasAnyInviteRecord = !!lawyerEmail || !!stats?.lawyer_invite_accepted_at || !!stats?.lawyer_invite_expires_at;
    const status = rawStatus === 'not_sent' && hasAnyInviteRecord
      ? acceptedAt
        ? 'accepted'
        : 'pending'
      : rawStatus;

    if (status === 'accepted') {
      return {
        containerClass: 'bg-green-50 border-green-200',
        icon: <FaCheckCircle className="text-green-600 text-2xl mb-3" />,
        titleClass: 'text-green-800',
        textClass: 'text-green-700',
        title: 'Lawyer invitation accepted',
        description: lawyerEmail
          ? `${lawyerEmail} accepted the invitation${acceptedAt && !Number.isNaN(acceptedAt.getTime()) ? ` on ${acceptedAt.toLocaleDateString()}` : ''}.`
          : 'Your lawyer has accepted the invitation.',
      };
    }

    if (status === 'pending') {
      return {
        containerClass: 'bg-amber-50 border-amber-200',
        icon: <FaClock className="text-amber-600 text-2xl mb-3" />,
        titleClass: 'text-amber-800',
        textClass: 'text-amber-700',
        title: 'Lawyer invitation pending',
        description: lawyerEmail
          ? `${lawyerEmail} has not accepted the invitation yet${expiresAt && !Number.isNaN(expiresAt.getTime()) ? `. It expires on ${expiresAt.toLocaleDateString()}` : '.'}`
          : 'The invited lawyer has not accepted the invitation yet.',
      };
    }

    if (status === 'not_accepted') {
      return {
        containerClass: 'bg-red-50 border-red-200',
        icon: <FaClock className="text-red-600 text-2xl mb-3" />,
        titleClass: 'text-red-800',
        textClass: 'text-red-700',
        title: 'Lawyer invitation not accepted',
        description: lawyerEmail
          ? `${lawyerEmail} did not accept the invitation before it expired.`
          : 'The lawyer invitation expired without being accepted.',
      };
    }

    return {
      containerClass: 'bg-gray-50 border-gray-200',
      icon: <FaFileAlt className="text-gray-600 text-2xl mb-3" />,
      titleClass: 'text-gray-800',
      textClass: 'text-gray-700',
      title: 'Lawyer invitation unavailable',
      description: 'No lawyer invitation record is available for this account yet.',
    };
  };

  if (!user) {
    return <Loader fullScreen />;
  }

  if (loading) {
    return <Loader fullScreen />;
  }

  const lawyerInviteSummary = getLawyerInviteSummary();

  return (
    <div className="bg-gray-50 min-h-screen py-8">
      <div className="container mx-auto px-4">
        {/* Welcome Section */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.full_name || 'User'}
          </h1>
          <p className="text-gray-600 mt-1">
            Manage your properties
          </p>
        </div>

                
                {/* Verification Alert */}
                {!user?.identity_verified && verificationReviewStatus === 'not_submitted' && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6 text-center">

                    <div className="flex flex-col items-center">

                      <FaClock className="text-yellow-600 text-2xl mb-3" />

                      <h3 className="font-semibold text-yellow-800">
                        {t('dashboard.verify_title')}
                      </h3>

                      <p className="text-sm text-yellow-700 mt-2">
                        {t('dashboard.verify_text')}
                      </p>

                      <button
                        onClick={() => navigate('/profile')}
                        className="mt-3 text-sm font-semibold text-yellow-800 hover:text-yellow-900"
                      >
                        {t('dashboard.verify_action')} →
                      </button>

                    </div>

                  </div>
                )}

                {!user?.identity_verified && verificationReviewStatus === 'pending' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6 text-center">

                    <div className="flex flex-col items-center">

                      <FaClock className="text-blue-600 text-2xl mb-3" />

                      <h3 className="font-semibold text-blue-800">
                        Verification Submitted
                      </h3>

                      <p className="text-sm text-blue-700 mt-2">
                        Your passport was submitted. It is pending admin review.
                      </p>

                      <button
                        onClick={() => navigate('/profile')}
                        className="mt-3 text-sm font-semibold text-blue-800 hover:text-blue-900"
                      >
                        View Verification Status →
                      </button>

                    </div>

                  </div>
                )}

                {!user?.identity_verified && verificationReviewStatus === 'rejected' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6 text-center">

                    <div className="flex flex-col items-center">

                      <FaClock className="text-red-600 text-2xl mb-3" />

                      <h3 className="font-semibold text-red-800">
                        Verification Rejected
                      </h3>

                      <p className="text-sm text-red-700 mt-2">
                        Your verification was rejected. Review your details and upload a new live passport photo.
                      </p>

                      <button
                        onClick={() => navigate('/profile')}
                        className="mt-3 text-sm font-semibold text-red-800 hover:text-red-900"
                      >
                        Fix Verification {'>'}
                      </button>

                    </div>

                  </div>
                )}

                <div className={`${lawyerInviteSummary.containerClass} border rounded-lg p-6 mb-6 text-center`}>

                  <div className="flex flex-col items-center">

                    {lawyerInviteSummary.icon}

                    <h3 className={`font-semibold ${lawyerInviteSummary.titleClass}`}>
                      {lawyerInviteSummary.title}
                    </h3>

                    <p className={`text-sm mt-2 ${lawyerInviteSummary.textClass}`}>
                      {lawyerInviteSummary.description}
                    </p>

                  </div>

                </div>

                        {/* Tenant Unlock Alert */}
        {user?.user_type === 'tenant' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6 text-center">

            <div className="flex flex-col items-center">

              <FaCheckCircle className="text-blue-600 text-2xl mb-3" />

              <h3 className="font-semibold text-blue-800">
                Pay Per Property Details
              </h3>

              <p className="text-sm text-blue-700 mt-2 text-center">
                Save properties first, then pay to unlock each property's full details and landlord contact.
              </p>

              <button
                onClick={() => navigate('/properties')}
                className="mt-4 btn btn-primary text-sm"
              >
                Browse Properties
              </button>

            </div>

          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {user?.user_type === 'tenant' ? (
            <>
              <StatCard
                icon={<FaHeart className="text-red-500" />}
                title="Saved Properties"
                value={stats?.saved_properties_count || 0}
                onClick={() => navigate('/saved-properties')}
              />
              <StatCard
                icon={<FaCheckCircle className="text-blue-500" />}
                title="Unlocked Details"
                value={stats?.unlocked_properties_count || 0}
                onClick={() => navigate('/properties')}
              />
              <StatCard
                icon={<FaEnvelope className="text-green-500" />}
                title="Unread Messages"
                value={stats?.unread_messages || 0}
                onClick={() => navigate('/messages')}
              />
              <StatCard
                icon={<FaClock className="text-yellow-500" />}
                title="Subscription"
                value={getTenantSubscriptionValue()}
                onClick={() => navigate('/subscribe')}
              />
              <StatCard
                icon={<FaMoneyBillWave className="text-orange-500" />}
                title="Refund Requests"
                value={stats?.refund_requests_count || 0}
                onClick={openRefundModal}
              />
              <StatCard
                icon={<FaWallet className="text-teal-500" />}
                title="Wallet Balance"
                value={walletBalance !== null ? `₦${Number(walletBalance).toLocaleString()}` : '—'}
                onClick={openWithdrawModal}
              />
            </>
          ) : (
            <>
              <StatCard
                icon={<FaHome className="text-blue-500" />}
                title={t('dashboard.total_props')}
                value={stats?.total_properties || 0}
                onClick={() => navigate('/my-properties')}
              />
              <StatCard
                icon={<FaCheckCircle className="text-green-500" />}
                title={t('dashboard.available_props')}
                value={stats?.available_properties || 0}
                onClick={() => navigate('/my-properties?status=available')}
              />
              <StatCard
                icon={<FaFileAlt className="text-yellow-500" />}
                title={t('dashboard.pending_apps')}
                value={stats?.pending_applications || 0}
                onClick={() => navigate('/applications?status=pending')}
              />
              <StatCard
                icon={<FaEnvelope className="text-purple-500" />}
                title={t('dashboard.unread')}
                value={stats?.unread_messages || 0}
                onClick={() => navigate('/messages')}
              />
              <StatCard
                icon={<FaUndo className="text-orange-500" />}
                title="Refund Requests"
                value={stats?.pending_refunds_count || 0}
                onClick={() => openLandlordRefundModal('pending')}
              />
              <StatCard
                icon={<FaPiggyBank className="text-teal-500" />}
                title="Available to Withdraw"
                value={landlordWallet ? `₦${Number(landlordWallet.available_to_withdraw).toLocaleString()}` : '—'}
                onClick={openWithdrawModal}
              />
            </>
          )}
        </div>

        {/* Landlord — 14 working days withdrawal notice */}
        {user?.user_type === 'landlord' && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-5 py-4 mb-8 flex items-start gap-3">
            <FaMoneyBillWave className="text-green-600 text-xl mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-800 text-sm">Rent Payment Withdrawals</p>
              <p className="text-green-700 text-sm mt-1">
                Rent payments collected through the platform are held for <strong>14 working days</strong> before
                they are released to your account. This period allows time for any tenant refund requests to be
                reviewed and resolved. Payments with no active refund dispute after 14 working days are
                automatically cleared for withdrawal.
              </p>
            </div>
          </div>
        )}

        {/* Recent Activities */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4 text-center">{t('dashboard.recent')}</h2>
          {recentActivities.length === 0 ? (
            <p className="text-gray-600 text-center py-8">
              {t('dashboard.no_recent')}
            </p>
          ) : (
            <div className="space-y-4">
              {recentActivities.map((activity, index) => (
                <ActivityItem key={index} activity={activity} />
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {user?.user_type === 'tenant' ? (
            <>
              <QuickActionCard
                title={t('dashboard.qa_browse')}
                description={t('dashboard.qa_browse_desc')}
                icon={<FaHome />}
                onClick={() => navigate('/properties')}
              />
              <QuickActionCard
                title="Saved Properties"
                description="Check properties you saved for shortlist"
                icon={<FaHeart />}
                onClick={() => navigate('/saved-properties')}
              />
              <QuickActionCard
                title="Payment History"
                description="Track your property detail unlock payments"
                icon={<FaFileAlt />}
                onClick={() => navigate('/payment-history')}
              />
              <QuickActionCard
                title="Request a Refund"
                description="Request a refund on any rent payment you made to a landlord"
                icon={<FaUndo />}
                onClick={openRefundModal}
              />
              <QuickActionCard
                title="Withdraw Funds"
                description="Withdraw approved refunds from your wallet to your bank"
                icon={<FaUniversity />}
                onClick={openWithdrawModal}
              />
            </>
          ) : (
            <>
              <QuickActionCard
                title={t('dashboard.qa_add')}
                description={t('dashboard.qa_add_desc')}
                icon={<FaHome />}
                onClick={() => navigate('/add-property')}
              />
              <QuickActionCard
                title={t('dashboard.qa_my_props')}
                description={t('dashboard.qa_my_props_desc')}
                icon={<FaHome />}
                onClick={() => navigate('/my-properties')}
              />
              <QuickActionCard
                title={t('dashboard.qa_apps_landlord')}
                description={t('dashboard.qa_apps_landlord_desc')}
                icon={<FaFileAlt />}
                onClick={() => navigate('/applications')}
              />
              <QuickActionCard
                title="Refund Requests"
                description="Review and approve or reject tenant refund requests"
                icon={<FaUndo />}
                onClick={() => openLandlordRefundModal('pending')}
              />
              <QuickActionCard
                title="Withdraw Funds"
                description="Withdraw cleared rent payments to your bank account"
                icon={<FaUniversity />}
                onClick={openWithdrawModal}
              />
            </>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
           REFUND REQUEST MODAL  (tenant only)
          ════════════════════════════════════════════════════════════ */}
      {showRefundModal && user?.user_type === 'tenant' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

            {/* ── Modal header ── */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
              <div className="flex items-center gap-3">
                <FaMoneyBillWave className="text-orange-500 text-2xl" />
                <h2 className="text-lg font-bold text-gray-800">
                  {refundView === 'history' ? 'My Refund Requests' : 'Request a Refund'}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {/* Toggle between form and history */}
                {refundView !== 'success' && (
                  <button
                    onClick={() => setRefundView(v => v === 'history' ? 'form' : 'history')}
                    className="text-sm text-indigo-600 hover:underline"
                  >
                    {refundView === 'history' ? 'New Request' : 'View History'}
                  </button>
                )}
                <button onClick={() => setShowRefundModal(false)} className="text-gray-400 hover:text-gray-600">
                  <FaTimes className="text-xl" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5">

              {/* ── SUCCESS STATE ── */}
              {refundView === 'success' && (
                <div className="text-center py-6 space-y-4">
                  <FaCheckCircle className="text-green-500 text-5xl mx-auto" />
                  <h3 className="text-xl font-bold text-gray-800">Refund Request Submitted!</h3>
                  <p className="text-gray-600 text-sm">
                    Your request has been sent to the landlord for review. You will be notified once
                    they approve or reject it. Approved refunds are processed within 3–5 business days.
                  </p>
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => setRefundView('history')}
                      className="btn w-full"
                    >
                      View My Requests
                    </button>
                    <button
                      onClick={() => setShowRefundModal(false)}
                      className="btn btn-primary w-full"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}

              {/* ── HISTORY VIEW ── */}
              {refundView === 'history' && (
                <div className="space-y-3">
                  {myRefundRequests.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">You have no refund requests yet.</p>
                  ) : (
                    myRefundRequests.map((rr) => (
                      <div key={rr.id} className="border rounded-xl p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-800 text-sm">{rr.property_title}</p>
                            <p className="text-xs text-gray-500">{rr.property_address}</p>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${refundStatusBadge(rr.status)}`}>
                            {rr.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Amount</span>
                          <span className="font-bold text-gray-800">₦{Number(rr.amount).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Reason</span>
                          <span className="text-gray-700 capitalize">{rr.reason.replace(/_/g, ' ')}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Requested</span>
                          <span className="text-gray-700">{new Date(rr.requested_at).toLocaleDateString()}</span>
                        </div>
                        {rr.landlord_note && (
                          <div className={`mt-2 text-xs rounded-lg px-3 py-2 ${rr.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                            <strong>Landlord note:</strong> {rr.landlord_note}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ── FORM VIEW ── */}
              {refundView === 'form' && (
                <form onSubmit={handleRefundSubmit} className="space-y-5">

                  {/* No eligible payments */}
                  {eligiblePayments.length === 0 ? (
                    <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-4 text-sm text-yellow-800">
                      <FaExclamationTriangle className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold">No eligible payments found</p>
                        <p className="mt-1">
                          You can only request a refund for completed rent payments that have not
                          already been refunded or have a pending request.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Select payment */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Select Rent Payment *
                        </label>
                        <select
                          required
                          value={refundForm.payment_id}
                          onChange={(e) => setRefundForm(p => ({ ...p, payment_id: e.target.value }))}
                          className="input w-full"
                        >
                          <option value="">-- Choose a rent payment --</option>
                          {eligiblePayments.map((ep) => (
                            <option key={ep.payment_id} value={ep.payment_id}>
                              {ep.property_title} — ₦{Number(ep.amount).toLocaleString()} &nbsp;
                              ({new Date(ep.paid_at).toLocaleDateString()})
                            </option>
                          ))}
                        </select>
                        {refundForm.payment_id && (() => {
                          const sel = eligiblePayments.find(p => String(p.payment_id) === String(refundForm.payment_id));
                          return sel ? (
                            <p className="text-xs text-gray-500 mt-1">
                              Paid to: <strong>{sel.landlord_name}</strong> &nbsp;|&nbsp; {sel.property_address}
                            </p>
                          ) : null;
                        })()}
                      </div>

                      {/* Reason */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Reason for Refund *
                        </label>
                        <select
                          required
                          value={refundForm.reason}
                          onChange={(e) => setRefundForm(p => ({ ...p, reason: e.target.value }))}
                          className="input w-full"
                        >
                          <option value="">-- Select a reason --</option>
                          <option value="property_not_as_described">Property was not as described</option>
                          <option value="landlord_cancelled_agreement">Landlord cancelled the agreement</option>
                          <option value="property_uninhabitable">Property found to be uninhabitable</option>
                          <option value="duplicate_payment">I was charged twice</option>
                          <option value="moved_out_early_agreement">Moved out early by mutual agreement</option>
                          <option value="landlord_unresponsive">Landlord became unresponsive</option>
                          <option value="other">Other</option>
                        </select>
                      </div>

                      {/* Details */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Additional Details <span className="text-gray-400">(optional)</span>
                        </label>
                        <textarea
                          rows={3}
                          value={refundForm.details}
                          onChange={(e) => setRefundForm(p => ({ ...p, details: e.target.value }))}
                          className="input w-full resize-none"
                          placeholder="Provide any extra information to support your request..."
                        />
                      </div>

                      {/* Notice */}
                      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
                        <FaExclamationTriangle className="mt-0.5 shrink-0" />
                        <span>
                          Your refund request will be sent to the landlord for approval.
                          Once approved, the refund is processed back to your original payment method within 3–5 business days.
                        </span>
                      </div>

                      <div className="flex gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowRefundModal(false)}
                          className="btn w-full"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={refundLoading || !refundForm.payment_id || !refundForm.reason}
                          className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {refundLoading ? 'Submitting...' : 'Submit Request'}
                        </button>
                      </div>
                    </>
                  )}
                </form>
              )}

            </div>
          </div>
        </div>
      )}

    

      {/* ════════════════════════════════════════════════════════════
           WITHDRAWAL MODAL  (tenant + landlord)
          ════════════════════════════════════════════════════════════ */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 pt-6 pb-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <FaWallet className="text-teal-500 text-2xl" />
                  <h2 className="text-lg font-bold text-gray-800">My Wallet</h2>
                </div>
                <button onClick={() => setShowWithdrawModal(false)} className="text-gray-400 hover:text-gray-600">
                  <FaTimes className="text-xl" />
                </button>
              </div>
              {/* Tab switcher */}
              <div className="flex border-b">
                <button
                  type="button"
                  onClick={() => setWalletView('fund')}
                  className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${walletView === 'fund' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  💳 Fund Wallet
                </button>
                <button
                  type="button"
                  onClick={() => setWalletView('withdraw')}
                  className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${walletView === 'withdraw' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  🏦 Withdraw Funds
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* ══════════════════════════════════
                   FUND WALLET TAB
                  ══════════════════════════════════ */}
              {walletView === 'fund' && (
                <div className="space-y-5">

                  {/* Balance summary */}
                  {user?.user_type === 'tenant' && walletBalance !== null && (
                    <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-teal-600">Current Wallet Balance</p>
                        <p className="text-2xl font-bold text-teal-800">₦{Number(walletBalance).toLocaleString()}</p>
                      </div>
                      <FaWallet className="text-teal-400 text-3xl" />
                    </div>
                  )}

                  {user?.user_type === 'landlord' && landlordWallet && (
                    <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-teal-600">Available Balance</p>
                        <p className="text-2xl font-bold text-teal-800">₦{Number(landlordWallet.available_to_withdraw || 0).toLocaleString()}</p>
                      </div>
                      <FaWallet className="text-teal-400 text-3xl" />
                    </div>
                  )}

                  {/* Quick amount buttons */}
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Select or enter amount</p>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {[1000, 2000, 5000, 10000].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setFundAmount(String(amt))}
                          className={`py-2 rounded-lg text-sm font-medium border transition-colors ${Number(fundAmount) === amt ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:border-teal-300'}`}
                        >
                          ₦{amt.toLocaleString()}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {[20000, 50000, 100000, 200000].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setFundAmount(String(amt))}
                          className={`py-2 rounded-lg text-sm font-medium border transition-colors ${Number(fundAmount) === amt ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:border-teal-300'}`}
                        >
                          ₦{amt >= 1000 ? `${amt/1000}k` : amt.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom amount input */}
                  <form onSubmit={handleFundWallet} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Custom Amount (₦)</label>
                      <input
                        type="number"
                        min="100"
                        value={fundAmount}
                        onChange={e => setFundAmount(e.target.value)}
                        className="input w-full text-lg font-semibold"
                        placeholder="Enter amount e.g. 15000"
                      />
                      {fundAmount && Number(fundAmount) >= 100 && (
                        <p className="text-xs text-teal-600 mt-1">
                          You will be charged <strong>₦{Number(fundAmount).toLocaleString()}</strong> via Paystack
                        </p>
                      )}
                    </div>

                    <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-xs text-green-700">
                      <FaCheckCircle className="mt-0.5 shrink-0 text-green-500" />
                      <span>Payment is processed securely via Paystack. Your wallet will be credited immediately after a successful payment.</span>
                    </div>

                    <div className="flex gap-3">
                      <button type="button" onClick={() => setShowWithdrawModal(false)} className="btn w-full">Cancel</button>
                      <button
                        type="submit"
                        disabled={fundLoading || !fundAmount || Number(fundAmount) < 100}
                        className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {fundLoading ? 'Redirecting...' : `Pay ₦${fundAmount ? Number(fundAmount).toLocaleString() : '0'} via Paystack`}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ══════════════════════════════════
                   WITHDRAW FUNDS TAB
                  ══════════════════════════════════ */}
              {walletView === 'withdraw' && (
              <div className="space-y-5">

              {/* ── TENANT: wallet balance + how it's funded ── */}
              {user?.user_type === 'tenant' && (
                <>
                  <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-teal-600">Available Wallet Balance</p>
                      <p className="text-2xl font-bold text-teal-800">
                        {walletBalance !== null ? `₦${Number(walletBalance).toLocaleString()}` : '—'}
                      </p>
                    </div>
                    <FaWallet className="text-teal-400 text-3xl" />
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 space-y-1">
                    <p className="font-semibold text-blue-800">How is my wallet funded?</p>
                    <p>Your wallet is automatically credited when a landlord <strong>approves your refund request</strong>. The approved refund amount is added to your wallet balance.</p>
                    <p>Once your wallet has a balance, you can withdraw it to your bank account using the form below.</p>
                    <p className="text-blue-500 italic">To get funds in your wallet, submit a refund request from the "Request a Refund" section on your dashboard.</p>
                  </div>
                </>
              )}

              {/* ── LANDLORD: wallet breakdown + how it's funded ── */}
              {user?.user_type === 'landlord' && (
                <>
                  {landlordWallet ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                        <p className="text-xs text-green-600">Available to Withdraw</p>
                        <p className="text-xl font-bold text-green-800">₦{Number(landlordWallet.available_to_withdraw).toLocaleString()}</p>
                      </div>
                      <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                        <p className="text-xs text-yellow-600">Pending (14-day hold)</p>
                        <p className="text-xl font-bold text-yellow-800">₦{Number(landlordWallet.pending_balance).toLocaleString()}</p>
                      </div>
                      <div className="col-span-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2">
                        <p className="text-xs text-gray-500">Total Withdrawn to Date: <strong>₦{Number(landlordWallet.withdrawn_total || 0).toLocaleString()}</strong></p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500 text-center">Loading wallet...</div>
                  )}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 space-y-1">
                    <p className="font-semibold text-blue-800">How is my wallet funded?</p>
                    <p>Your wallet balance comes from <strong>rent payments made by tenants</strong> through the platform.</p>
                    <p>Rent payments are held for <strong>14 working days</strong> before they are cleared and added to your available balance. This holding period allows time for any refund disputes to be resolved.</p>
                    <p>Payments older than 14 working days with <strong>no active refund dispute</strong> are automatically cleared for withdrawal.</p>
                    <p className="text-blue-500 italic">Pending balance = rent received within the last 14 working days or with an active refund dispute.</p>
                  </div>
                </>
              )}

              {/* ── Withdrawal form ── */}
              <form onSubmit={handleWithdrawSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₦) *</label>
                  <input
                    type="number"
                    required
                    min="100"
                    value={withdrawForm.amount}
                    onChange={e => setWithdrawForm(p => ({ ...p, amount: e.target.value }))}
                    className="input w-full"
                    placeholder="Enter amount to withdraw"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name *</label>
                  <select
                    required
                    value={withdrawForm.bank_name}
                    onChange={e => setWithdrawForm(p => ({ ...p, bank_name: e.target.value }))}
                    className="input w-full"
                  >
                    <option value="">-- Select your bank --</option>
                    {NIGERIAN_BANKS.map(bank => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Number *</label>
                  <input
                    required
                    maxLength={10}
                    value={withdrawForm.account_number}
                    onChange={e => setWithdrawForm(p => ({ ...p, account_number: e.target.value.replace(/\D/g, '') }))}
                    className="input w-full"
                    placeholder="10-digit account number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Name *</label>
                  <input
                    required
                    value={withdrawForm.account_name}
                    onChange={e => setWithdrawForm(p => ({ ...p, account_name: e.target.value }))}
                    className="input w-full"
                    placeholder="Name as it appears on your bank account"
                  />
                </div>

                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                  <FaExclamationTriangle className="mt-0.5 shrink-0" />
                  <span>Withdrawals are processed within 1–3 business days. Double-check your account details — incorrect details may result in failed transfers.</span>
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowWithdrawModal(false)} className="btn w-full">Cancel</button>
                  <button
                    type="submit"
                    disabled={
                      withdrawLoading ||
                      !withdrawForm.amount ||
                      !withdrawForm.bank_name ||
                      !withdrawForm.account_number ||
                      !withdrawForm.account_name
                    }
                    className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {withdrawLoading ? 'Submitting...' : 'Request Withdrawal'}
                  </button>
                </div>
              </form>

              {/* Withdrawal history */}
              {withdrawHistory.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-sm font-semibold text-gray-700 border-t pt-3">Recent Withdrawals</p>
                  {withdrawHistory.slice(0, 5).map(w => (
                    <div key={w.id} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
                      <div>
                        <p className="font-medium text-gray-800">₦{Number(w.amount).toLocaleString()}</p>
                        <p className="text-xs text-gray-500">{w.bank_name} · {w.account_number}</p>
                        <p className="text-xs text-gray-400">{new Date(w.requested_at).toLocaleDateString()}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${withdrawStatusBadge(w.status)}`}>{w.status}</span>
                    </div>
                  ))}
                </div>
              )}

              </div> {/* end withdraw tab */}
              )} {/* end walletView === 'withdraw' */}

            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
           LANDLORD REFUND MANAGEMENT MODAL
          ════════════════════════════════════════════════════════════ */}
      {showLandlordRefundModal && user?.user_type === 'landlord' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
              <div className="flex items-center gap-3">
                <FaUndo className="text-orange-500 text-2xl" />
                <h2 className="text-lg font-bold text-gray-800">Refund Requests</h2>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={landlordRefundFilter}
                  onChange={e => { setLandlordRefundFilter(e.target.value); openLandlordRefundModal(e.target.value); }}
                  className="input text-sm py-1"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="refunded">Refunded</option>
                </select>
                <button onClick={() => { setShowLandlordRefundModal(false); setSelectedRefund(null); }} className="text-gray-400 hover:text-gray-600">
                  <FaTimes className="text-xl" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              {landlordRefunds.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No {landlordRefundFilter} refund requests.</p>
              ) : (
                landlordRefunds.map(rr => (
                  <div key={rr.id} className="border rounded-xl p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-800">{rr.property_title}</p>
                        <p className="text-xs text-gray-500">{rr.property_address}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Tenant: <strong>{rr.tenant_name}</strong> · {rr.tenant_phone}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize shrink-0 ${refundStatusBadge(rr.status)}`}>{rr.status}</span>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-gray-50 rounded-lg px-3 py-2">
                        <p className="text-xs text-gray-500">Rent Paid</p>
                        <p className="font-bold text-gray-800">₦{Number(rr.amount).toLocaleString()}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg px-3 py-2">
                        <p className="text-xs text-gray-500">Payment Date</p>
                        <p className="font-medium text-gray-700">{new Date(rr.payment_date).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="text-sm">
                      <p className="text-gray-600"><strong>Reason:</strong> {rr.reason.replace(/_/g, ' ')}</p>
                      {rr.details && <p className="text-gray-500 mt-1 text-xs">{rr.details}</p>}
                    </div>

                    {/* Approved amount if already reviewed */}
                    {rr.approved_amount && (
                      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
                        <p className="text-green-700">Approved: <strong>₦{Number(rr.approved_amount).toLocaleString()}</strong>
                          {rr.refund_type === 'partial_months' && rr.refund_months && ` (${rr.refund_months} months)`}
                          {rr.refund_type === 'full' && ' (full refund)'}
                        </p>
                        {rr.landlord_note && <p className="text-green-600 text-xs mt-1">{rr.landlord_note}</p>}
                      </div>
                    )}
                    {rr.status === 'rejected' && rr.landlord_note && (
                      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                        <strong>Rejection reason:</strong> {rr.landlord_note}
                      </div>
                    )}

                    {/* Action panel for pending requests */}
                    {rr.status === 'pending' && (
                      <>
                        {selectedRefund === rr.id ? (
                          <div className="border-t pt-3 space-y-3">
                            <p className="text-sm font-semibold text-gray-700">How much would you like to refund?</p>

                            {/* Refund type */}
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { value: 'full', label: 'Full Refund' },
                                { value: 'partial_months', label: 'By Months' },
                                { value: 'partial_custom', label: 'Custom Amount' },
                              ].map(opt => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => setApproveForm(p => ({ ...p, refund_type: opt.value }))}
                                  className={`p-2 border rounded-lg text-xs font-medium transition-colors ${approveForm.refund_type === opt.value ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-indigo-300'}`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>

                            {/* Full refund info */}
                            {approveForm.refund_type === 'full' && (
                              <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-sm text-indigo-700">
                                Full rent amount of <strong>₦{Number(rr.amount).toLocaleString()}</strong> will be refunded to the tenant's wallet.
                              </div>
                            )}

                            {/* Months selector */}
                            {approveForm.refund_type === 'partial_months' && (
                              <div className="space-y-2">
                                <p className="text-xs text-gray-500">Select number of months to refund</p>
                                <div className="flex gap-2 flex-wrap">
                                  {[1, 2, 3, 6, 9, 12].map(m => (
                                    <button
                                      key={m}
                                      type="button"
                                      onClick={() => setApproveForm(p => ({ ...p, refund_months: m }))}
                                      className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors ${Number(approveForm.refund_months) === m ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-indigo-300'}`}
                                    >
                                      {m} {m === 1 ? 'month' : 'months'}
                                    </button>
                                  ))}
                                </div>
                                <input
                                  type="number"
                                  min="1"
                                  value={approveForm.refund_months}
                                  onChange={e => setApproveForm(p => ({ ...p, refund_months: e.target.value }))}
                                  className="input w-full text-sm"
                                  placeholder="Or type exact months..."
                                />
                                {approveForm.refund_months && (
                                  <p className="text-xs text-indigo-600">
                                    Estimated refund: <strong>₦{(Number(rr.amount) / 12 * Number(approveForm.refund_months)).toLocaleString()}</strong>
                                    <span className="text-gray-400"> (based on yearly rent ÷ 12)</span>
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Custom amount */}
                            {approveForm.refund_type === 'partial_custom' && (
                              <div>
                                <input
                                  type="number"
                                  min="1"
                                  max={rr.amount}
                                  value={approveForm.approved_amount}
                                  onChange={e => setApproveForm(p => ({ ...p, approved_amount: e.target.value }))}
                                  className="input w-full text-sm"
                                  placeholder={`Max ₦${Number(rr.amount).toLocaleString()}`}
                                />
                              </div>
                            )}

                            {/* Landlord note */}
                            <textarea
                              rows={2}
                              value={approveForm.landlord_note}
                              onChange={e => setApproveForm(p => ({ ...p, landlord_note: e.target.value }))}
                              className="input w-full resize-none text-sm"
                              placeholder="Optional note to tenant (e.g. reason for partial refund)..."
                            />

                            <div className="flex gap-2">
                              <button type="button" onClick={() => setSelectedRefund(null)} className="btn w-full text-sm">Cancel</button>
                              <button
                                type="button"
                                onClick={() => handleApproveRefund(rr.id)}
                                disabled={refundActionLoading}
                                className="btn btn-primary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                              >
                                <FaThumbsUp /> {refundActionLoading ? 'Processing...' : 'Approve Refund'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => { setSelectedRefund(rr.id); setApproveForm({ refund_type: 'full', refund_months: '', approved_amount: '', landlord_note: '' }); }}
                              className="flex-1 flex items-center justify-center gap-2 bg-green-50 border border-green-300 text-green-700 rounded-lg py-2 text-sm font-medium hover:bg-green-100 transition"
                            >
                              <FaThumbsUp /> Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedRefund(`reject_${rr.id}`)}
                              className="flex-1 flex items-center justify-center gap-2 bg-red-50 border border-red-300 text-red-700 rounded-lg py-2 text-sm font-medium hover:bg-red-100 transition"
                            >
                              <FaThumbsDown /> Reject
                            </button>
                          </div>
                        )}

                        {/* Reject panel */}
                        {selectedRefund === `reject_${rr.id}` && (
                          <div className="border-t pt-3 space-y-2">
                            <p className="text-sm font-semibold text-red-700">Reason for rejection *</p>
                            <textarea
                              rows={2}
                              value={rejectNote}
                              onChange={e => setRejectNote(e.target.value)}
                              className="input w-full resize-none text-sm border-red-300"
                              placeholder="Explain why you are rejecting this refund request..."
                            />
                            <div className="flex gap-2">
                              <button type="button" onClick={() => { setSelectedRefund(null); setRejectNote(''); }} className="btn w-full text-sm">Cancel</button>
                              <button
                                type="button"
                                onClick={() => handleRejectRefund(rr.id)}
                                disabled={refundActionLoading}
                                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 text-sm font-medium transition disabled:opacity-50"
                              >
                                <FaThumbsDown /> {refundActionLoading ? 'Processing...' : 'Confirm Reject'}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};


// Stat Card Component
const StatCard = ({ icon, title, value, onClick }) => (
  <div
    onClick={onClick}
    className="card cursor-pointer"
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-gray-600 text-sm mb-1">{title}</p>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
      </div>
      <div className="text-4xl">{icon}</div>
    </div>
  </div>
);

// Activity Item Component
const ActivityItem = ({ activity }) => {
  const { t } = useTranslation();

  const getActivityIcon = () => {
    switch (activity.type) {
      case 'application':
        return <FaFileAlt className="text-blue-500" />;
      case 'unlock':
        return <FaCheckCircle className="text-green-500" />;
      case 'message':
        return <FaEnvelope className="text-purple-500" />;
      case 'review':
        return <FaCheckCircle className="text-green-500" />;
      default:
        return <FaCheckCircle className="text-gray-500" />;
    }
  };

  const getActivityText = () => {
    switch (activity.type) {
      case 'application':
        return t('dashboard.activity_application', {
          status: t(`applications.status.${activity.status}`, {
            defaultValue: activity.status,
          }),
          title: activity.property_title,
        });
      case 'unlock':
        return `You unlocked full details for ${activity.property_title}`;
      case 'message':
        return t('dashboard.activity_message', {
          name: activity.user_name || t('dashboard.user'),
        });
      case 'review':
        return t('dashboard.activity_review', {
          stars: activity.status,
          title: activity.property_title,
        });
      default:
        return t('dashboard.activity_generic');
    }
  };

  return (
    <div className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
      <div className="mt-1">{getActivityIcon()}</div>
      <div className="flex-1">
        <p className="text-gray-900">{getActivityText()}</p>
        <p className="text-sm text-gray-500">
          {getTimeAgo(activity.activity_date)}
        </p>
      </div>
    </div>
  );
};

// Quick Action Card Component
const QuickActionCard = ({ title, description, icon, onClick }) => (
  <div
    onClick={onClick}
    className="card cursor-pointer text-center"
  >
    <div className="text-4xl text-primary-600 mb-3">{icon}</div>
    <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
    <p className="text-sm text-gray-600">{description}</p>
  </div>
);

export default Dashboard;