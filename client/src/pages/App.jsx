import React, { Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { FaArrowLeft, FaChevronDown } from 'react-icons/fa';

import i18n from '../i18n';

import ErrorBoundary from '../components/common/ErrorBoundary';
import Loader from '../components/common/Loader';
import { AuthProvider } from '../context/AuthContext';
import { SocketProvider } from '../context/SocketContext';
import { TourProvider } from '../context/TourContext';
import { useAuth } from '../hooks/useAuth';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import TourManager from '../components/tour/TourManager';
import LiveRatingFlyIn from '../components/ratings/LiveRatingFlyIn';
import PlatformRatingPrompt from '../components/ratings/PlatformRatingPrompt';


import Home from './Home';
import Login from './Login';
import Register from './Register';
import NotFound from './NotFound';

const Properties = React.lazy(() => import('./Properties'));
const PropertyDetail = React.lazy(() => import('./PropertyDetail'));
const Dashboard = React.lazy(() => import('./Dashboard'));
const TransportationBooking = React.lazy(() => import('./TransportationBooking'));
const TransportationPayment = React.lazy(() => import('./TransportationPayment'));
const TransportationBookings = React.lazy(() => import('./TransportationBookings'));
const TransportationBookingDetails = React.lazy(() => import('./TransportationBookingDetails'));
const FumigationCleaningBooking = React.lazy(() => import('./FumigationCleaningBooking'));
const FumigationCleaningPayment = React.lazy(() => import('./FumigationCleaningPayment'));
const FumigationCleaningCatalog = React.lazy(() => import('../components/fumigation/FumigationCleaningCatalog'));
const FumigationCleaningBookings = React.lazy(() => import('./FumigationCleaningBookings'));
const FumigationCleaningBookingDetails = React.lazy(() => import('./FumigationCleaningBookingDetails'));
const AdminDashboard = React.lazy(() => import('./admin/AdminDashboard'));
const AdminLayout = React.lazy(() => import('./admin/AdminLayout'));
const AdminUsers = React.lazy(() => import('./admin/AdminUsers'));
const AdminProperties = React.lazy(() => import('./admin/AdminProperties'));
const AdminApplications = React.lazy(() => import('./admin/AdminApplications'));
const AdminInspections = React.lazy(() => import('./admin/AdminInspections'));
const AdminEvidenceVerifications = React.lazy(() => import('./admin/AdminEvidenceVerifications'));
const AdminLedger = React.lazy(() => import('./admin/AdminLedger'));
const AdminVerifications = React.lazy(() => import('./admin/AdminVerifications'));
const AdminLawyerInvites = React.lazy(() => import('./admin/AdminLawyerInvites'));
const Profile = React.lazy(() => import('./Profile'));
const Applications = React.lazy(() => import('./Applications'));
const SavedProperties = React.lazy(() => import('./SavedProperties'));
const Messages = React.lazy(() => import('./Messages'));
const MyProperties = React.lazy(() => import('./MyProperties'));
const AddProperty = React.lazy(() => import('./AddProperty'));
const Subscribe = React.lazy(() => import('./Subscribe'));
const PaymentHistory = React.lazy(() => import('./PaymentHistory'));
const ForgotPassword = React.lazy(() => import('./ForgotPassword'));
const ResetPassword = React.lazy(() => import('./ResetPassword'));
const Terms = React.lazy(() => import('./Terms'));
const Privacy = React.lazy(() => import('./Privacy'));
const Faq = React.lazy(() => import('./Faq'));
const HowItWorks = React.lazy(() => import('./HowItWorks'));
const AboutUs = React.lazy(() => import('./AboutUs'));
const ListProperty = React.lazy(() => import('./ListProperty'));
const Pricing = React.lazy(() => import('./Pricing'));
const Careers = React.lazy(() => import('./Careers'));
const LandlordGuide = React.lazy(() => import('./LandlordGuide'));
const VerifyEmail = React.lazy(() => import('./VerifyEmail'));
const VerifyEmailToken = VerifyEmail;
const VerifyPhone = React.lazy(() => import('./VerifyPhone'));
const SuperAdminDashboard = React.lazy(() => import('./SuperAdminDashboard'));
const AdminUserDetail = React.lazy(() => import('./admin/AdminUserDetail'));
const AdminPropertyDetail = React.lazy(() => import('./admin/AdminPropertyDetail'));
const AdminApplicationDetail = React.lazy(() => import('./admin/AdminApplicationDetail'));
const AdminCompliance = React.lazy(() => import('./admin/AdminCompliance'));
const SeoDashboard = React.lazy(() => import('./SeoDashboard'));
const AppLanding = React.lazy(() => import('./AppLanding'));
const QrCodePage = React.lazy(() => import('./QrCodePage'));
const SupportGovernancePanel = React.lazy(() => import('../components/admin/SupportGovernancePanel'));
const LawyerDashboard = React.lazy(() => import('./lawyer/LawyerDashboard'));
const LawyerLayout = React.lazy(() => import('./lawyer/LawyerLayout'));
const StateLawyerDashboard = React.lazy(() => import('./lawyer/StateLawyerDashboard'));
const SuperLawyerDashboard = React.lazy(() => import('./lawyer/SuperLawyerDashboard'));
const AgentDashboard = React.lazy(() => import('./agent/AgentDashboard'));
const VerifyCase = React.lazy(() => import('./VerifyCase'));
const DisputeDetails = React.lazy(() => import('./DisputeDetails'));
const MyDisputes = React.lazy(() => import('./MyDisputes'));
const MyDamageReports = React.lazy(() => import('./MyDamageReports'));
const SubscribedProperties = React.lazy(() => import('./SubscribedProperties'));
const Support = React.lazy(() => import('./Support'));
const AcceptLawyerInvite = React.lazy(() => import('./AcceptLawyerInvite'));
const AcceptAgentInvite = React.lazy(() => import('./AcceptAgentInvite'));
const LocationPage = React.lazy(() => import('./LocationPage'));
const NigeriaPage = React.lazy(() => import('./NigeriaPage'));
const AreaPage = React.lazy(() => import('./AreaPage'));
const LegalSupport = React.lazy(() => import('./LawyersDirectory'));
const MobileAppPage = React.lazy(() => import('./MobileAppPage'));
const AgentEarningsPage = React.lazy(() => import('./agent/AgentEarningsPage'));
const AdminAgentManagement = React.lazy(() => import('./admin/AdminAgentManagement'));
const AgentWithdrawalPage = React.lazy(() => import('./agent/AgentWithdrawalPage'));
const VerificationStatus = React.lazy(() => import('./VerificationStatus'));
const TransportationAdminDashboard = React.lazy(() => import('./admin/TransportationAdminDashboard'));
const TransportationAdminStateDashboard = React.lazy(() => import('./admin/TransportationAdminStateDashboard'));
const TransportationSuperAdminDashboard = React.lazy(() => import('./admin/TransportationSuperAdminDashboard'));
const FumigationOversightPanel = React.lazy(() => import('../components/admin/FumigationOversightPanel'));
const LgaFumigationAdminDashboard = React.lazy(() => import('./admin/LgaFumigationAdminDashboard'));
const LgaSupportAdminDashboard = React.lazy(() => import('./admin/LgaSupportAdminDashboard'));
const StateFumigationAdminDashboard = React.lazy(() => import('./admin/StateFumigationAdminDashboard'));
const FinancialAdminDashboard = React.lazy(() => import('./admin/FinancialAdminDashboard'));
const SuperFinancialAdminDashboard = React.lazy(() => import('./admin/SuperFinancialAdminDashboard'));
const StateAdminDashboard = React.lazy(() => import('./admin/StateAdminDashboard'));
const StateSupportAdminDashboard = React.lazy(() => import('./admin/StateSupportAdminDashboard'));
const SuperSupportAdminDashboard = React.lazy(() => import('./admin/SuperSupportAdminDashboard'));
const RecruitmentAdminDashboard = React.lazy(() => import('./admin/RecruitmentAdminDashboard'));

const queryClient = new QueryClient();
const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
  { value: 'fr', label: 'Français' },
  { value: 'ar', label: 'العربية' },
  { value: 'zh', label: '中文' },
];

const FINANCIAL_ADMIN_ROLES = ['financial_admin', 'lga_financial_admin'];
const SUPER_FINANCIAL_ADMIN_ROLES = ['super_financial_admin'];
const STATE_ADMIN_ROLES = ['state_admin', 'state_financial_admin'];
const LGA_SUPPORT_ADMIN_ROLES = ['lga_support_admin'];
const STATE_SUPPORT_ADMIN_ROLES = ['state_support_admin'];
const SUPER_SUPPORT_ADMIN_ROLES = ['super_support_admin'];
const RECRUITMENT_ADMIN_ROLES = ['recruitment_admin'];
const SUPER_ADMIN_ROLES = ['super_admin'];
const FUMIGATION_ADMIN_ROLES = ['fumigation_admin', 'lga_fumigation_admin', 'state_fumigation_admin', 'super_fumigation_admin'];
const TRANSPORTATION_ADMIN_ROLES = ['transportation_admin', 'lga_transportation_admin', 'state_transportation_admin', 'super_transportation_admin'];
const LGA_TRANSPORTATION_ADMIN_ROLES = ['admin', 'lga_admin', 'transportation_admin', 'lga_transportation_admin'];
const STATE_TRANSPORTATION_ADMIN_ROLES = ['state_admin', 'state_financial_admin', 'state_support_admin', 'state_transportation_admin'];
const SUPER_TRANSPORTATION_ADMIN_ROLES = ['super_admin', 'super_financial_admin', 'super_support_admin', 'super_transportation_admin'];
const LGA_FUMIGATION_ADMIN_ROLES = ['admin', 'lga_admin', 'fumigation_admin', 'lga_fumigation_admin'];
const STATE_FUMIGATION_ADMIN_ROLES = ['state_admin', 'state_financial_admin', 'state_fumigation_admin'];
const SUPER_FUMIGATION_ADMIN_ROLES = ['super_admin', 'super_fumigation_admin'];
const isRecruitmentAdminUser = (user) =>
  RECRUITMENT_ADMIN_ROLES.includes(user?.user_type) || user?.is_recruitment_admin === true;
const ADMIN_SHELL_ROLES = [
  ...SUPER_ADMIN_ROLES,
  'admin',
  'lga_admin',
  ...FINANCIAL_ADMIN_ROLES,
  ...SUPER_FINANCIAL_ADMIN_ROLES,
  ...STATE_ADMIN_ROLES,
  ...LGA_SUPPORT_ADMIN_ROLES,
  ...STATE_SUPPORT_ADMIN_ROLES,
  ...SUPER_SUPPORT_ADMIN_ROLES,
  ...RECRUITMENT_ADMIN_ROLES,
  ...FUMIGATION_ADMIN_ROLES,
  ...TRANSPORTATION_ADMIN_ROLES,
];

const getFumigationDashboardPath = (role) => {
  if (role === 'super_fumigation_admin') return '/super-admin/fumigation-cleaning';
  if (role === 'state_fumigation_admin') return '/admin/fumigation-cleaning/state';
  return '/admin/fumigation-cleaning';
};

const getTransportationDashboardPath = (role) => {
  if (role === 'super_transportation_admin') return '/super-admin/transportation';
  if (role === 'state_transportation_admin') return '/admin/transportation/state';
  return '/admin/transportation';
};

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  return isAuthenticated ? children : <Navigate to="/login" />;
};

const FinancialAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!FINANCIAL_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" />;

  return children;
};

const SuperFinancialAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!SUPER_FINANCIAL_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" />;

  return children;
};

const StateAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!STATE_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" />;

  return children;
};

const LgaSupportAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!LGA_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" />;

  return children;
};

const StateSupportAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!STATE_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" />;

  return children;
};

const SuperSupportAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (
    ![...SUPER_ADMIN_ROLES, ...SUPER_SUPPORT_ADMIN_ROLES].includes(user?.user_type)
  ) {
    return <Navigate to="/admin" />;
  }

  return children;
};

const RecruitmentAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!isRecruitmentAdminUser(user)) return <Navigate to="/admin" />;

  return children;
};

const SuperAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!SUPER_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/dashboard" />;

  return children;
};

const TenantRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.user_type !== 'tenant') return <Navigate to="/dashboard" />;

  return children;
};

const LandlordRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;

  if (user?.user_type !== 'landlord') {
    if (user?.user_type === 'tenant') return <Navigate to="/tenant/dashboard" />;
    if (user?.user_type === 'agent') return <Navigate to="/agent/dashboard" />;
    if (user?.user_type === 'lawyer') return <Navigate to="/lawyer" />;
    if (user?.user_type === 'state_lawyer') return <Navigate to="/lawyer/state" />;
    if (user?.user_type === 'super_lawyer') return <Navigate to="/lawyer/super" />;
    if (user?.user_type === 'admin' || user?.user_type === 'lga_admin') return <Navigate to="/admin" />;
    if (FINANCIAL_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin/financial-dashboard" />;
    if (SUPER_FINANCIAL_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin/super-financial-dashboard" />;
    if (STATE_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" />;
    if (LGA_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin/lga-support-dashboard" />;
    if (STATE_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin/state-support-dashboard" />;
    if (SUPER_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin/super-support-dashboard" />;
    if (isRecruitmentAdminUser(user)) return <Navigate to="/admin/recruitment" />;
    if (FUMIGATION_ADMIN_ROLES.includes(user?.user_type)) {
      return <Navigate to={getFumigationDashboardPath(user?.user_type)} />;
    }
    if (TRANSPORTATION_ADMIN_ROLES.includes(user?.user_type)) {
      return <Navigate to={getTransportationDashboardPath(user?.user_type)} />;
    }
    if (user?.user_type === 'super_admin') return <Navigate to="/super-admin" />;
    return <Navigate to="/login" />;
  }

  return children;
};

const AgentRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.user_type !== 'agent') return <Navigate to="/dashboard" />;

  return children;
};

const BaseLawyerRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.user_type !== 'lawyer') return <Navigate to="/dashboard" />;

  return children;
};

const StateLawyerRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.user_type !== 'state_lawyer') return <Navigate to="/dashboard" />;

  return children;
};

const SuperLawyerRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.user_type !== 'super_lawyer') return <Navigate to="/dashboard" />;

  return children;
};

const AdminShellRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!ADMIN_SHELL_ROLES.includes(user?.user_type) && !isRecruitmentAdminUser(user)) return <Navigate to="/dashboard" />;

  return children;
};

const TransportationCoreAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!LGA_TRANSPORTATION_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" replace />;

  return children;
};

const TransportationStateAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!STATE_TRANSPORTATION_ADMIN_ROLES.includes(user?.user_type)) {
    return <Navigate to="/admin" replace />;
  }

  return children;
};

const TransportationSuperAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!SUPER_TRANSPORTATION_ADMIN_ROLES.includes(user?.user_type)) {
    return <Navigate to="/admin" replace />;
  }

  return children;
};

const LgaFumigationAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!LGA_FUMIGATION_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" replace />;

  return children;
};

const StateFumigationAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!STATE_FUMIGATION_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" replace />;

  return children;
};

const SuperFumigationAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!SUPER_FUMIGATION_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" replace />;

  return children;
};

const PropertyManagerRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">{i18n.t('app.loading')}</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!['landlord', 'agent'].includes(user?.user_type)) {
    return <Navigate to="/dashboard" />;
  }

  return children;
};

const AdminHomeRoute = () => {
  const { user } = useAuth();

  if (SUPER_FINANCIAL_ADMIN_ROLES.includes(user?.user_type)) {
    return <Navigate to="/admin/super-financial-dashboard" replace />;
  }

  if (FINANCIAL_ADMIN_ROLES.includes(user?.user_type)) {
    return <Navigate to="/admin/financial-dashboard" replace />;
  }

  if (STATE_ADMIN_ROLES.includes(user?.user_type)) {
    return (
      <StateAdminRoute>
        <StateAdminDashboard />
      </StateAdminRoute>
    );
  }

  if (LGA_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) {
    return <Navigate to="/admin/lga-support-dashboard" replace />;
  }

  if (STATE_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) {
    return <Navigate to="/admin/state-support-dashboard" replace />;
  }

  if (SUPER_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) {
    return <Navigate to="/admin/super-support-dashboard" replace />;
  }

  if (isRecruitmentAdminUser(user)) {
    return <Navigate to="/admin/recruitment" replace />;
  }

  if (FUMIGATION_ADMIN_ROLES.includes(user?.user_type)) {
    return <Navigate to={getFumigationDashboardPath(user?.user_type)} replace />;
  }

  if (TRANSPORTATION_ADMIN_ROLES.includes(user?.user_type)) {
    return <Navigate to={getTransportationDashboardPath(user?.user_type)} replace />;
  }

  return <AdminDashboard />;
};

const AdminWithdrawalsRoute = () => {
  const { user } = useAuth();

  if (STATE_ADMIN_ROLES.includes(user?.user_type)) {
    return (
      <StateAdminRoute>
        <StateAdminDashboard initialTab="withdrawals" />
      </StateAdminRoute>
    );
  }

  if (LGA_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) {
    return <Navigate to="/admin/lga-support-dashboard" replace />;
  }

  if (FINANCIAL_ADMIN_ROLES.includes(user?.user_type)) {
    return <Navigate to="/admin/financial-dashboard" replace />;
  }

  if (SUPER_FINANCIAL_ADMIN_ROLES.includes(user?.user_type)) {
    return <Navigate to="/admin/super-financial-dashboard" replace />;
  }

  if (STATE_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) {
    return <Navigate to="/admin/state-support-dashboard" replace />;
  }

  if (SUPER_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) {
    return <Navigate to="/admin/super-support-dashboard" replace />;
  }

  return <Navigate to="/admin" replace />;
};

function Layout({ children }) {
  const location = useLocation();
  const previousPathRef = useRef('');
  const [activeLanguage, setActiveLanguage] = useState(i18n.language?.split('-')[0] || 'en');

  const isVerificationPage =
    location.pathname.startsWith('/verify-email') ||
    location.pathname.startsWith('/verify-phone');
  const isDashboardShell =
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/super-admin') ||
    location.pathname.startsWith('/lawyer');
  const isMobileAppPage = location.pathname === '/mobile-app';
  const isLandingPage = location.pathname === '/download';
  const showPublicHeaderFooter = !isVerificationPage && !isDashboardShell;

  useEffect(() => {
    const handleLanguageChange = (language = i18n.language) => {
      const normalizedLanguage = language?.split('-')[0] || 'en';
      setActiveLanguage(normalizedLanguage);
      document.documentElement.lang = normalizedLanguage;
      document.documentElement.dir = normalizedLanguage === 'ar' ? 'rtl' : 'ltr';
    };

    handleLanguageChange();
    i18n.on('languageChanged', handleLanguageChange);

    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const routeKey = `${location.pathname}${location.hash}`;
    if (previousPathRef.current === routeKey) return undefined;
    previousPathRef.current = routeKey;

    const timeoutId = window.setTimeout(() => {
      if (location.hash) {
        const targetId = decodeURIComponent(location.hash.slice(1));
        const target = document.getElementById(targetId);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }

      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [location.hash, location.pathname]);

  const handleLanguageSelect = (event) => {
    const nextLanguage = event.target.value;
    setActiveLanguage(nextLanguage);
    i18n.changeLanguage(nextLanguage);
  };

  return (
    <div className="flex flex-col min-h-screen">
      {showPublicHeaderFooter && <Header />}

      {/* Global Language Switcher */}
      {!isDashboardShell && (
        <div className={`flex items-center border-b bg-white px-3 py-1 sm:px-4 sm:py-2 ${isMobileAppPage || isLandingPage ? 'justify-between gap-3' : 'justify-end'}`}>
          {(isMobileAppPage || isLandingPage) && (
            <Link
              to="/"
              className="inline-flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-primary-700 sm:text-sm"
              aria-label="Back to RentalHub home"
            >
              <FaArrowLeft className="shrink-0 text-[11px] sm:text-xs" />
              <span className="truncate">Back to Home</span>
            </Link>
          )}
          <label className="relative block w-[8.25rem] sm:w-full sm:max-w-[12rem]" dir="ltr">
            <span className="sr-only">{i18n.t('language.select')}</span>
            <select
              onChange={handleLanguageSelect}
              value={activeLanguage}
              aria-label={i18n.t('language.select')}
              className="h-8 w-full appearance-none rounded-md border border-gray-300 bg-white py-1 pl-2.5 pr-7 text-xs leading-5 text-gray-700 shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200 sm:h-auto sm:rounded-lg sm:py-1.5 sm:pl-3 sm:pr-10 sm:text-sm"
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FaChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 sm:right-3 sm:text-xs"
              aria-hidden="true"
            />
          </label>
        </div>
      )}

      <main className="flex-grow animate-fadeIn">{children}</main>

      <LiveRatingFlyIn disabled={isDashboardShell} />
      <PlatformRatingPrompt disabled={isDashboardShell} />


      {showPublicHeaderFooter && <Footer />}
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TourProvider>
          <Router>
            <SocketProvider>
            <Layout>
              <Suspense fallback={<Loader />}>
              <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/lawyer/accept-invite" element={<AcceptLawyerInvite />} />
              <Route path="/agent/accept-invite" element={<AcceptAgentInvite />} />
              <Route path="/lawyers" element={<LegalSupport />} />
              <Route path="/legal-support" element={<LegalSupport />} />
              <Route path="/mobile-app" element={<MobileAppPage />} />
              <Route path="/download" element={<React.Suspense fallback={<div />}><AppLanding /></React.Suspense>} />
              <Route path="/qr-code" element={<React.Suspense fallback={<div />}><QrCodePage /></React.Suspense>} />
              <Route path="/properties" element={<Properties />} />
              <Route path="/properties/:id" element={<PropertyDetail />} />
              <Route path="/transportation/book" element={<TransportationBooking />} />
              <Route path="/transportation/payment/:bookingId" element={<TransportationPayment />} />
              <Route path="/transportation/bookings" element={<TransportationBookings />} />
              <Route path="/transportation/bookings/:bookingId" element={<TransportationBookingDetails />} />
              <Route path="/fumigation-cleaning/catalog" element={<FumigationCleaningCatalog />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/verify-email/:token" element={<VerifyEmailToken />} />
              <Route path="/auth/verify-email/:token" element={<VerifyEmailToken />} />
              <Route path="/verify-phone" element={<VerifyPhone />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password/:token" element={<ResetPassword />} />
              <Route path="/about" element={<AboutUs />} />
              <Route path="/about-us" element={<Navigate to="/about" replace />} />
              <Route path="/list-property" element={<ListProperty />} />
              <Route path="/list-your-property" element={<Navigate to="/list-property" replace />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="/faqs" element={<Navigate to="/faq" replace />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/pricing-plans" element={<Navigate to="/pricing" replace />} />
              <Route path="/careers" element={<Careers />} />
              <Route path="/career" element={<Navigate to="/careers" replace />} />
              <Route path="/landlord-guide" element={<LandlordGuide />} />
              <Route path="/landlordguide" element={<Navigate to="/landlord-guide" replace />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
                            <Route
                path="/super-admin"
                element={
                  <SuperAdminRoute>
                    <AdminLayout />
                  </SuperAdminRoute>
                }
              >
                <Route index element={<SuperAdminDashboard />} />
                <Route path="seo" element={<SeoDashboard />} />
                <Route path="support-governance" element={<SupportGovernancePanel />} />
                <Route path="transportation" element={<TransportationSuperAdminDashboard />} />
                <Route path="fumigation-cleaning" element={<FumigationOversightPanel />} />
              </Route>
              <Route
                path="/admin/seo"
                element={
                  <SuperAdminRoute>
                    <Navigate to="/super-admin/seo" replace />
                  </SuperAdminRoute>
                }
              />
              <Route path="/fumigation-cleaning/booking" element={<FumigationCleaningBooking />} />
<Route path="/fumigation-cleaning/payment/:bookingId" element={<FumigationCleaningPayment />} />
              <Route
                path="/lawyer"
                element={
                  <BaseLawyerRoute>
                    <LawyerLayout />
                  </BaseLawyerRoute>
                }
              >
                <Route index element={<LawyerDashboard />} />
              </Route>
              <Route
                path="/lawyer/state"
                element={
                  <StateLawyerRoute>
                    <LawyerLayout />
                  </StateLawyerRoute>
                }
              >
                <Route index element={<StateLawyerDashboard />} />
              </Route>
              <Route
                path="/lawyer/super"
                element={
                  <SuperLawyerRoute>
                    <LawyerLayout />
                  </SuperLawyerRoute>
                }
              >
                <Route index element={<SuperLawyerDashboard />} />
              </Route>
              <Route path="/agent/dashboard" element={<AgentRoute><AgentDashboard /></AgentRoute>} />
              <Route path="/agent/earnings" element={<AgentRoute><AgentEarningsPage /></AgentRoute>} />
                            <Route path="/agent/withdrawals" element={<AgentRoute><AgentWithdrawalPage /></AgentRoute>} />
              <Route path="/verify" element={<VerifyCase />} />
              <Route path="/verify-case" element={<VerifyCase />} />
              <Route path="/my-disputes" element={<MyDisputes />} />
              <Route path="/my-damage-reports" element={<MyDamageReports />} />
              <Route path="/subscribed-properties" element={<SubscribedProperties />} />
              <Route path="/support" element={<Support />} />
              <Route path="/dispute/:disputeId" element={<DisputeDetails />} />
              <Route path="/nigeria" element={<NigeriaPage />} />
              <Route path="/nigeria/:stateSlug" element={<LocationPage />} />
              <Route path="/nigeria/:stateSlug/:lgaSlug" element={<LocationPage />} />
              <Route path="/areas/:stateSlug/:citySlug/:areaSlug" element={<AreaPage />} />

              {/* Protected */}
              <Route
                path="/dashboard"
                element={
                  <LandlordRoute>
                    <Dashboard />
                  </LandlordRoute>
                }
              />
              <Route
                path="/tenant/dashboard"
                element={
                  <TenantRoute>
                    <Dashboard />
                  </TenantRoute>
                }
              />
                <Route path="/fumigation-cleaning/bookings" element={<TenantRoute><FumigationCleaningBookings /></TenantRoute>} />
<Route path="/fumigation-cleaning/bookings/:bookingId" element={<TenantRoute><FumigationCleaningBookingDetails /></TenantRoute>} />
   <Route
                path="/admin/*"
                element={
                  <AdminShellRoute>
                    <AdminLayout />
                  </AdminShellRoute>
                }
              >
                <Route index element={<AdminHomeRoute />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="verifications" element={<AdminVerifications />} />
                <Route path="lawyer-invites" element={<AdminLawyerInvites />} />
                <Route path="properties" element={<AdminProperties />} />
                <Route path="applications" element={<AdminApplications />} />
                <Route path="inspections" element={<AdminInspections />} />
                <Route path="evidence-verifications" element={<AdminEvidenceVerifications />} />
                <Route path="ledger" element={<AdminLedger />} />
                <Route path="compliance" element={<AdminCompliance />} />
                <Route
                  path="transportation"
                  element={
                    <TransportationCoreAdminRoute>
                      <TransportationAdminDashboard />
                    </TransportationCoreAdminRoute>
                  }
                />
                <Route
                  path="fumigation-cleaning"
                  element={
                    <LgaFumigationAdminRoute>
                      <LgaFumigationAdminDashboard />
                    </LgaFumigationAdminRoute>
                  }
                />
                <Route path="transportation/state"
                  element={
                    <TransportationStateAdminRoute>
                      <TransportationAdminStateDashboard />
                    </TransportationStateAdminRoute>
                  }
                />
                                <Route
                  path="fumigation-cleaning/state"
                  element={
                    <StateFumigationAdminRoute>
                      <StateFumigationAdminDashboard />
                    </StateFumigationAdminRoute>
                  }
                />
                                <Route path="agents" element={<AdminAgentManagement />} />
                <Route path="users/:id" element={<AdminUserDetail />} />
                                <Route path="properties/:id" element={<AdminPropertyDetail />} />
                <Route path="applications/:id" element={<AdminApplicationDetail />} />
                <Route path="super-financial-dashboard" element={<SuperFinancialAdminRoute><SuperFinancialAdminDashboard /></SuperFinancialAdminRoute>} />
                <Route path="financial-dashboard" element={<FinancialAdminRoute><FinancialAdminDashboard /></FinancialAdminRoute>} />
                <Route path="state-dashboard" element={<StateAdminRoute><Navigate to="/admin" replace /></StateAdminRoute>} />
                <Route path="withdrawals" element={<AdminWithdrawalsRoute />} />
                <Route path="lga-support-dashboard" element={<LgaSupportAdminRoute><LgaSupportAdminDashboard /></LgaSupportAdminRoute>} />
                <Route path="state-support-dashboard" element={<StateSupportAdminRoute><StateSupportAdminDashboard /></StateSupportAdminRoute>} />
                <Route path="super-support-dashboard" element={<SuperSupportAdminRoute><SuperSupportAdminDashboard /></SuperSupportAdminRoute>} />
                <Route path="recruitment" element={<RecruitmentAdminRoute><RecruitmentAdminDashboard /></RecruitmentAdminRoute>} />
              </Route>

              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/verification-status" element={<ProtectedRoute><VerificationStatus /></ProtectedRoute>} />
              <Route path="/applications" element={<ProtectedRoute><Applications /></ProtectedRoute>} />
              <Route path="/saved-properties" element={<ProtectedRoute><SavedProperties /></ProtectedRoute>} />
              <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
              <Route path="/payment-history" element={<ProtectedRoute><PaymentHistory /></ProtectedRoute>} />
              <Route path="/my-properties" element={<PropertyManagerRoute><MyProperties /></PropertyManagerRoute>} />
              <Route path="/add-property" element={<PropertyManagerRoute><AddProperty /></PropertyManagerRoute>} />
              <Route path="/subscribe" element={<ProtectedRoute><Subscribe /></ProtectedRoute>} />

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </Layout>

            <TourManager />

            <ToastContainer position="top-right" autoClose={3000} />
          </SocketProvider>
        </Router>
      </TourProvider>
    </AuthProvider>
  </QueryClientProvider>
  </ErrorBoundary>
  );
}

export default App;
