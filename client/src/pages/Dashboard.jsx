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
  FaTruck,
  FaSprayCan,
} from 'react-icons/fa';
import Loader from '../components/common/Loader';
import { getTimeAgo } from '../utils/helpers';
import { useTranslation } from 'react-i18next';
import ApprovalTimeline from '../components/common/ApprovalTimeline';
import WalletFundModal from '../components/dashboard/WalletFundModal';
import WalletWithdrawModal from '../components/dashboard/WalletWithdrawModal';
import RentSavingsModal from '../components/dashboard/RentSavingsModal';

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

  // Transportation state
  const [transportStats, setTransportStats] = useState(null);
  const [upcomingTransportBookings, setUpcomingTransportBookings] = useState([]);
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [transportLoading, setTransportLoading] = useState(false);

  // ── Refund state ──────────────────────────────────────────────────────────
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundView, setRefundView] = useState('form');        // 'form' | 'history' | 'success'
  const [eligiblePayments, setEligiblePayments] = useState([]);
  const [myRefundRequests, setMyRefundRequests] = useState([]);
  const [refundForm, setRefundForm] = useState({ payment_id: '', reason: '', details: '' });
  const [refundLoading, setRefundLoading] = useState(false);

  // ── Withdrawal state (tenant + landlord) ──────────────────────────────────
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);
  const [landlordWallet, setLandlordWallet] = useState(null);
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', bank_name: '', account_number: '', account_name: '' });
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawHistory, setWithdrawHistory] = useState([]);
  const [fundLoading, setFundLoading] = useState(false);
  
  // ── Bank verification states ──────────────────────────────────────────────
  const [accountNameLoading, setAccountNameLoading] = useState(false);
  const [accountNameError, setAccountNameError] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [banks, setBanks] = useState([]);
  const [banksLoading, setBanksLoading] = useState(false);

   // Rent Savings state (tenant only)
  const [showRentSavingsModal, setShowRentSavingsModal] = useState(false);
  const [tenantProperties, setTenantProperties] = useState([]);
  const [rentSavingsStats, setRentSavingsStats] = useState(null);


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

    // ── Combined dashboard loader (stats + activities + optional transport/rent) ──
  const loadDashboardData = useCallback(async (showLoading = true) => {
    if (!user) return;

    if (showLoading) setLoading(true);
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
      } else {
        setStats(null);
      }

      if (activitiesResponse.data.success) {
        setRecentActivities(activitiesResponse.data.data);
      } else {
        setRecentActivities([]);
      }

      // Load additional tenant-specific data
      if (user.user_type === 'tenant') {
        await loadTransportationData();
        await loadRentSavingsData();
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      if (showLoading) {
        toast.error(error?.response?.data?.message || error?.message || 'Could not load dashboard');
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [user]);

  // Load transportation data for tenant
  const loadTransportationData = useCallback(async () => {
    if (user?.user_type !== 'tenant') return;

    setTransportLoading(true);
    try {
      const [statsRes, upcomingRes] = await Promise.all([
        api.get('/transportation/stats'),
        api.get('/transportation/upcoming?limit=3')
      ]);

      if (statsRes.data?.success) {
        setTransportStats(statsRes.data.data);
      }

      if (upcomingRes.data?.success) {
        setUpcomingTransportBookings(upcomingRes.data.data);
      }
    } catch (error) {
      console.error('Error loading transportation data:', error);
      // Don't show error toast for transportation data - it's optional
    } finally {
      setTransportLoading(false);
    }
  }, [user]);

  // Load rent savings data for tenants
  const loadRentSavingsData = useCallback(async () => {
    if (user?.user_type !== 'tenant') return;

    try {
      const [summaryRes, propertiesRes] = await Promise.all([
        api.get('/rent-savings/summary'),
        api.get('/properties/tenant'),
      ]);

      if (summaryRes.data?.success) {
        setRentSavingsStats(summaryRes.data.data);
      }

      if (propertiesRes.data?.success) {
        setTenantProperties(propertiesRes.data.data || []);
      } else if (Array.isArray(propertiesRes.data)) {
        setTenantProperties(propertiesRes.data);
      }
    } catch (error) {
      console.error('Error loading rent savings data:', error);
      // Don't show error toast - it's optional
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    if (user.user_type === 'super_admin') {
      navigate('/super-admin', { replace: true });
      return;
    }

    if (user.user_type === 'super_financial_admin') {
      navigate('/admin/super-financial-dashboard', { replace: true });
      return;
    }

    if (user.user_type === 'financial_admin') {
      navigate('/admin/financial-dashboard', { replace: true });
      return;
    }

    if (user.user_type === 'super_support_admin') {
      navigate('/admin/super-support-dashboard', { replace: true });
      return;
    }

    if (user.user_type === 'state_support_admin') {
      navigate('/admin/state-support-dashboard', { replace: true });
      return;
    }

    if (['state_admin', 'state_financial_admin'].includes(user.user_type)) {
      navigate('/admin', { replace: true });
      return;
    }

    if (user.user_type === 'super_lawyer') {
      navigate('/lawyer/super', { replace: true });
      return;
    }

    if (user.user_type === 'state_lawyer') {
      navigate('/lawyer/state', { replace: true });
      return;
    }

    if (user.user_type === 'lawyer') {
      navigate('/lawyer', { replace: true });
      return;
    }

    loadDashboardData(true);
  }, [user, navigate, loadDashboardData]);

  // Silent background refresh (no loading spinner) every 60 seconds + on window focus
  useEffect(() => {
    if (!user) return undefined;

    const intervalId = setInterval(() => {
      loadDashboardData(false); // false = no loading circle, no error toast
    }, 60000);

    const handleWindowFocus = () => {
      loadDashboardData(false); // silent refresh on focus too
    };

    window.addEventListener('focus', handleWindowFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [user, loadDashboardData]);

  // ── Bank account verification function ───────────────────────────────────
  const fetchAccountName = async (bankName, accountNumber) => {
    if (!bankName || !accountNumber || accountNumber.length !== 10) {
      setAccountNameError('');
      return;
    }
    
    setAccountNameLoading(true);
    setAccountNameError('');
    
    try {
      const res = await api.post('/payments/verify-account', {
        bank_name: bankName,
        account_number: accountNumber
      });
      
      if (res.data?.success && res.data.data?.account_name) {
        setWithdrawForm(prev => ({ ...prev, account_name: res.data.data.account_name }));
        setAccountNameError('');
      } else {
        setAccountNameError('Unable to fetch account name. Please enter manually.');
      }
    } catch (err) {
      console.error('Error fetching account name:', err);
      setAccountNameError(err.response?.data?.message || 'Failed to verify account. Please enter manually.');
    } finally {
      setAccountNameLoading(false);
    }
  };

  
  // Fetch banks list on component mount
  useEffect(() => {
    const fetchBanks = async () => {
      try {
        setBanksLoading(true);
        const res = await api.get('/payments/banks');
        if (res.data?.success) {
          setBanks(res.data.data);
        }
      } catch (err) {
        console.error('Error fetching banks:', err);
        // Fallback to hardcoded banks if API fails
        setBanks(NIGERIAN_BANKS.map(name => ({ name, code: '', slug: '' })));
      } finally {
        setBanksLoading(false);
      }
    };

    fetchBanks();
  }, []);

  // ── Account number change handler with debounce ──────────────────────────
  const handleAccountNumberChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 10);
    setWithdrawForm(prev => ({ ...prev, account_number: value }));
    
    // Clear previous account name when account number changes
    if (withdrawForm.account_name) {
      setWithdrawForm(prev => ({ ...prev, account_name: '' }));
    }
    
    // Fetch account name when we have both bank and valid account number
    if (value.length === 10 && withdrawForm.bank_name) {
      const timeoutId = setTimeout(() => {
        fetchAccountName(withdrawForm.bank_name, value);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  };

  // ── Bank change handler ──────────────────────────────────────────────────
  const handleBankChange = (e) => {
    const bankName = e.target.value;
    setWithdrawForm(prev => ({ ...prev, bank_name: bankName, account_name: '' }));
    
    // If we already have a valid account number, fetch new account name
    if (withdrawForm.account_number.length === 10 && bankName) {
      fetchAccountName(bankName, withdrawForm.account_number);
    }
  };

  // ── Withdrawal helpers ───────────────────────────────────────────────────
  const openWithdrawModal = async () => {
    setWithdrawForm({ amount: '', bank_name: '', account_number: '', account_name: '' });
    setConsentChecked(false);
    setAccountNameError('');
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

  const openFundModal = async () => {
    setShowFundModal(true);
    try {
      if (user.user_type === 'tenant') {
        const res = await api.get('/payments/wallet/balance');
        if (res.data?.success) setWalletBalance(res.data.data.balance);
      } else {
        const res = await api.get('/payments/wallet/landlord-balance');
        if (res.data?.success) setLandlordWallet(res.data.data);
      }
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
    if (!consentChecked) {
      toast.error('Please confirm that your account details are correct');
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

  const handleFundWallet = async (amountInput) => {
    if (!amountInput || Number(amountInput) < 100) {
      toast.error('Minimum funding amount is ₦100');
      return;
    }
    setFundLoading(true);
    try {
      const res = await api.post('/payments/wallet/fund', { amount: amountInput });
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

  const getRentSavingsValue = () => {
    if (!rentSavingsStats) {
      return '0 plans';
    }

    const activePlans = Number(rentSavingsStats.active_plans || 0);
    const totalSaved = Number(rentSavingsStats.total_saved_across_plans || 0);

    if (totalSaved > 0) {
      return `NGN ${totalSaved.toLocaleString()}`;
    }

    return `${activePlans} ${activePlans === 1 ? 'plan' : 'plans'}`;
  };

  const closeRentSavingsModal = () => {
    setShowRentSavingsModal(false);
    loadRentSavingsData();
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
                onClick={() => navigate('/verification-status')}
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
                onClick={() => navigate('/verification-status')}
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
                onClick={() => navigate('/verification-status')}
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
               {/* Transportation Booking Card */}
              <StatCard
                title="Transport Bookings"
                value={transportStats?.total_bookings || 0}
                icon={<FaTruck className="text-sky-500" />}
                onClick={() => setShowTransportModal(true)}
              />
              <StatCard
                icon={<FaPiggyBank className="text-emerald-500" />}
                title="Rent Savings"
                value={getRentSavingsValue()}
                onClick={() => setShowRentSavingsModal(true)}
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
                title="Fumigation & Cleaning"
                description="Browse certified fumigation and cleaning services for your property"
                icon={<FaSprayCan />}
                onClick={() => navigate('/fumigation-cleaning/catalog')}
              />
              <QuickActionCard
                title="Request a Refund"
                description="Request a refund on any rent payment you made to a landlord"
                icon={<FaUndo />}
                onClick={openRefundModal}
              />
              <QuickActionCard
                title="Withdraw Funds"
                description="Withdraw approved refunds to your bank"
                icon={<FaUniversity />}
                onClick={openWithdrawModal}
              />
              <QuickActionCard
                title="Fund Wallet"
                description="Add money to your wallet via Paystack"
                icon={<FaWallet />}
                onClick={openFundModal}
              />
              <QuickActionCard
                title="Rent Savings"
                description="Save toward rent, contribute monthly, and manage withdrawals"
                icon={<FaPiggyBank />}
                onClick={() => setShowRentSavingsModal(true)}
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
              <QuickActionCard
                title="Fund Wallet"
                description="Top up your wallet balance"
                icon={<FaWallet />}
                onClick={openFundModal}
              />
            </>
          )}
        </div>
      </div>

      {/* REFUND REQUEST MODAL (tenant only) */}
      {showRefundModal && user?.user_type === 'tenant' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
              <div className="flex items-center gap-3">
                <FaMoneyBillWave className="text-orange-500 text-2xl" />
                <h2 className="text-lg font-bold text-gray-800">
                  {refundView === 'history' ? 'My Refund Requests' : 'Request a Refund'}
                </h2>
              </div>
              <div className="flex items-center gap-3">
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
              {refundView === 'success' && (
                <div className="text-center py-6 space-y-4">
                  <FaCheckCircle className="text-green-500 text-5xl mx-auto" />
                  <h3 className="text-xl font-bold text-gray-800">Refund Request Submitted!</h3>
                  <p className="text-gray-600 text-sm">
                    Your request has been sent to the landlord for review. You will be notified once
                    they approve or reject it. Approved refunds are processed within 3–5 business days.
                  </p>
                  <div className="flex gap-3 mt-4">
                    <button onClick={() => setRefundView('history')} className="btn w-full">View My Requests</button>
                    <button onClick={() => setShowRefundModal(false)} className="btn btn-primary w-full">Close</button>
                  </div>
                </div>
              )}
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
                        <ApprovalTimeline
                          steps={[
                            { key: 'requested', label: 'Requested' },
                            { key: 'landlord_review', label: 'Landlord Review' },
                            { key: 'processed', label: 'Processed' },
                          ]}
                          currentStepKey={
                            rr.status === 'pending'
                              ? 'landlord_review'
                              : rr.status === 'approved' || rr.status === 'refunded'
                                ? 'processed'
                                : 'landlord_review'
                          }
                          finalStatus={rr.status}
                        />
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
              {refundView === 'form' && (
                <form onSubmit={handleRefundSubmit} className="space-y-5">
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
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Select Rent Payment *</label>
                        <select
                          required
                          value={refundForm.payment_id}
                          onChange={(e) => setRefundForm(p => ({ ...p, payment_id: e.target.value }))}
                          className="input w-full"
                        >
                          <option value="">-- Choose a rent payment --</option>
                          {eligiblePayments.map((ep) => (
                            <option key={ep.payment_id} value={ep.payment_id}>
                              {ep.property_title} — ₦{Number(ep.amount).toLocaleString()} ({new Date(ep.paid_at).toLocaleDateString()})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Refund *</label>
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
                      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
                        <FaExclamationTriangle className="mt-0.5 shrink-0" />
                        <span>
                          Your refund request will be sent to the landlord for approval.
                          Once approved, the refund is processed back to your original payment method within 3–5 business days.
                        </span>
                      </div>
                      <div className="flex gap-3 pt-1">
                        <button type="button" onClick={() => setShowRefundModal(false)} className="btn w-full">Cancel</button>
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

      {/* Transportation Booking Modal */}
      {showTransportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">Transportation Services</h3>
                <button
                  onClick={() => setShowTransportModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  &times;
                </button>
              </div>
              
              <div className="mb-6">
                <p className="text-gray-600 mb-4">
                  Book transportation to move your items after paying tenancy. Available services include vans, trucks, and full moving services.
                </p>
                
                {transportLoading ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  </div>
                ) : (
                  <>
                    {transportStats && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                        <h4 className="font-semibold text-blue-800 mb-2">Your Transportation Stats</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="text-sm">
                            <span className="text-gray-600">Total Bookings:</span>
                            <span className="font-semibold ml-2">{transportStats.total_bookings || 0}</span>
                          </div>
                          <div className="text-sm">
                            <span className="text-gray-600">Completed:</span>
                            <span className="font-semibold ml-2">{transportStats.completed_bookings || 0}</span>
                          </div>
                          <div className="text-sm">
                            <span className="text-gray-600">Total Spent:</span>
                            <span className="font-semibold ml-2">₦{(transportStats.total_spent || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {upcomingTransportBookings.length > 0 && (
                      <div className="mb-4">
                        <h4 className="font-semibold text-gray-800 mb-2">Upcoming Bookings</h4>
                        <div className="space-y-2">
                          {upcomingTransportBookings.slice(0, 2).map((booking) => (
                            <div key={booking.id} className="bg-gray-50 border border-gray-200 rounded p-3">
                              <div className="flex justify-between">
                                <span className="font-medium">{booking.service_name}</span>
                                <span className="text-blue-600 font-semibold">₦{booking.total_price?.toLocaleString()}</span>
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                {new Date(booking.booking_date).toLocaleDateString()} at {booking.booking_time}
                              </div>
                              <div className="text-xs mt-1">
                                <span className={`px-2 py-1 rounded ${
                                  booking.booking_status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                  booking.booking_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {booking.booking_status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                
                <div className="flex flex-col space-y-3">
                  <button
                    onClick={() => {
                      setShowTransportModal(false);
                      navigate('/transportation/book');
                    }}
                    className="btn btn-primary w-full py-3"
                  >
                    <FaTruck className="inline mr-2" />
                    Book Transportation Now
                  </button>
                  
                  <button
                    onClick={() => {
                      setShowTransportModal(false);
                      navigate('/transportation/bookings');
                    }}
                    className="btn btn-outline w-full py-3"
                  >
                    View All Bookings
                  </button>
                  
                  <button
                    onClick={() => setShowTransportModal(false)}
                    className="btn btn-gray w-full py-3"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <WalletFundModal
        isOpen={showFundModal}
        onClose={() => setShowFundModal(false)}
        onSubmit={handleFundWallet}
        isLoading={fundLoading}
        userType={user?.user_type}
        walletBalance={walletBalance}
        landlordWallet={landlordWallet}
        onSwitchToWithdraw={() => {
          setShowFundModal(false);
          openWithdrawModal();
        }}
      />

      <WalletWithdrawModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        onSubmit={handleWithdrawSubmit}
        isLoading={withdrawLoading}
        userType={user?.user_type}
        walletBalance={walletBalance}
        landlordWallet={landlordWallet}
        withdrawForm={withdrawForm}
        setWithdrawForm={setWithdrawForm}
        handleBankChange={handleBankChange}
        handleAccountNumberChange={handleAccountNumberChange}
        banks={banks}
        banksLoading={banksLoading}
        accountNameLoading={accountNameLoading}
        accountNameError={accountNameError}
        consentChecked={consentChecked}
        setConsentChecked={setConsentChecked}
        withdrawHistory={withdrawHistory}
        withdrawStatusBadge={withdrawStatusBadge}
        onSwitchToFund={() => {
          setShowWithdrawModal(false);
          openFundModal();
        }}
      />

      <RentSavingsModal
        isOpen={showRentSavingsModal}
        onClose={closeRentSavingsModal}
        user={user}
        properties={tenantProperties}
      />

      {/* LANDLORD REFUND MANAGEMENT MODAL */}
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
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-800">{rr.property_title}</p>
                        <p className="text-xs text-gray-500">{rr.property_address}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Tenant: <strong>{rr.tenant_name}</strong> · {rr.tenant_phone}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize shrink-0 ${refundStatusBadge(rr.status)}`}>{rr.status}</span>
                    </div>

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

                    {rr.status === 'pending' && (
                      <>
                        {selectedRefund === rr.id ? (
                          <div className="border-t pt-3 space-y-3">
                            <p className="text-sm font-semibold text-gray-700">How much would you like to refund?</p>
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
                            {approveForm.refund_type === 'full' && (
                              <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-sm text-indigo-700">
                                Full rent amount of <strong>₦{Number(rr.amount).toLocaleString()}</strong> will be refunded to the tenant's wallet.
                              </div>
                            )}
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
  <div onClick={onClick} className="card cursor-pointer">
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
  <div onClick={onClick} className="card cursor-pointer text-center">
    <div className="text-4xl text-primary-600 mb-3">{icon}</div>
    <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
    <p className="text-sm text-gray-600">{description}</p>
  </div>
);

export default Dashboard;
