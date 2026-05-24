import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { FaChevronDown } from 'react-icons/fa';

import i18n from '../i18n';

import { AuthProvider } from '../context/AuthContext';
import { SocketProvider } from '../context/SocketContext';
import { useAuth } from '../hooks/useAuth';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import LiveRatingFlyIn from '../components/ratings/LiveRatingFlyIn';
import PlatformRatingPrompt from '../components/ratings/PlatformRatingPrompt';

import Home from './Home';
import Login from './Login';
import Register from './Register';
import Properties from './Properties';
import PropertyDetail from './PropertyDetail';
import Dashboard from './Dashboard';
import NotFound from './NotFound';
import TransportationBooking from './TransportationBooking';
import TransportationPayment from './TransportationPayment';
import TransportationBookings from './TransportationBookings';
import TransportationBookingDetails from './TransportationBookingDetails';
import FumigationCleaningBooking from './FumigationCleaningBooking';
import FumigationCleaningPayment from './FumigationCleaningPayment';
import FumigationCleaningCatalog from '../components/fumigation/FumigationCleaningCatalog';
import FumigationCleaningBookings from './FumigationCleaningBookings';
import FumigationCleaningBookingDetails from './FumigationCleaningBookingDetails';

import AdminDashboard from './admin/AdminDashboard';
import AdminLayout from './admin/AdminLayout';
import AdminUsers from './admin/AdminUsers';
import AdminProperties from './admin/AdminProperties';
import AdminApplications from './admin/AdminApplications';
import AdminVerifications from './admin/AdminVerifications';
import AdminLawyerInvites from './admin/AdminLawyerInvites';

import Profile from './Profile';
import Applications from './Applications';
import SavedProperties from './SavedProperties';
import Messages from './Messages';
import MyProperties from './MyProperties';
import AddProperty from './AddProperty';
import Subscribe from './Subscribe';
import PaymentHistory from './PaymentHistory';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import Terms from './Terms';
import Privacy from './Privacy';
import Faq from './Faq';
import HowItWorks from './HowItWorks';
import AboutUs from './AboutUs';
import ListProperty from './ListProperty';
import Pricing from './Pricing';
import LandlordGuide from './LandlordGuide';
import VerifyEmail from './VerifyEmail';
import VerifyPhone from './VerifyPhone';
import VerifyEmailToken from './VerifyEmail';
import SuperAdminDashboard from './SuperAdminDashboard';
import AdminUserDetail from './admin/AdminUserDetail';
import AdminPropertyDetail from './admin/AdminPropertyDetail';
import AdminApplicationDetail from './admin/AdminApplicationDetail';
import AdminCompliance from './admin/AdminCompliance';
import TransportationAdminDashboard from './admin/TransportationAdminDashboard';
import TransporationAdminStateDashboard from './admin/TransporationAdminStateDashboard';
import TransportationSuperAdminDashboard from './admin/TransportationSuperAdminDashboard';
import LgaFumigationAdminDashboard from './admin/LgaFumigationAdminDashboard';
import StateFumigationAdminDashboard from './admin/StateFumigationAdminDashboard';
import SuperFumigationAdminDashboard from './admin/SuperFumigationAdminDashboard';
import LawyerDashboard from './lawyer/LawyerDashboard';
import LawyerLayout from './lawyer/LawyerLayout';
import StateLawyerDashboard from './lawyer/StateLawyerDashboard';
import SuperLawyerDashboard from './lawyer/SuperLawyerDashboard';
import AgentDashboard from './agent/AgentDashboard';
import VerifyCase from './VerifyCase';
import DisputeDetails from "./DisputeDetails";
import AcceptLawyerInvite from './AcceptLawyerInvite';
import AcceptAgentInvite from './AcceptAgentInvite';
import LocationPage from './LocationPage';
import NigeriaPage from './NigeriaPage';
import AreaPage from './AreaPage';
import LawyersDirectory from './LawyersDirectory';
import FinancialAdminDashboard from './admin/FinancialAdminDashboard'; // ADD THIS LINE
import SuperFinancialAdminDashboard from './admin/SuperFinancialAdminDashboard';
import StateAdminDashboard from './admin/StateAdminDashboard';
import StateSupportAdminDashboard from './admin/StateSupportAdminDashboard';
import SuperSupportAdminDashboard from './admin/SuperSupportAdminDashboard';
import AgentEarningsPage from './agent/AgentEarningsPage';

import AdminAgentManagement from './admin/AdminAgentManagement';
import AgentWithdrawalPage from './agent/AgentWithdrawalPage';
import VerificationStatus from './VerificationStatus';

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
const SUPER_ADMIN_ROLES = ['super_admin'];
const FUMIGATION_ADMIN_ROLES = ['fumigation_admin', 'lga_fumigation_admin', 'state_fumigation_admin', 'super_fumigation_admin'];
const TRANSPORTATION_ADMIN_ROLES = ['transportation_admin', 'lga_transportation_admin', 'state_transportation_admin', 'super_transportation_admin'];
const LGA_TRANSPORTATION_ADMIN_ROLES = ['admin', 'lga_admin', 'transportation_admin', 'lga_transportation_admin'];
const STATE_TRANSPORTATION_ADMIN_ROLES = ['state_admin', 'state_financial_admin', 'state_support_admin', 'state_transportation_admin'];
const SUPER_TRANSPORTATION_ADMIN_ROLES = ['super_admin', 'super_financial_admin', 'super_support_admin', 'super_transportation_admin'];
const LGA_FUMIGATION_ADMIN_ROLES = ['admin', 'lga_admin', 'fumigation_admin', 'lga_fumigation_admin'];
const STATE_FUMIGATION_ADMIN_ROLES = ['state_admin', 'state_financial_admin', 'state_fumigation_admin'];
const SUPER_FUMIGATION_ADMIN_ROLES = ['super_admin', 'super_fumigation_admin'];
const ADMIN_SHELL_ROLES = [
  'admin',
  'lga_admin',
  ...FINANCIAL_ADMIN_ROLES,
  ...SUPER_FINANCIAL_ADMIN_ROLES,
  ...STATE_ADMIN_ROLES,
  ...LGA_SUPPORT_ADMIN_ROLES,
  ...STATE_SUPPORT_ADMIN_ROLES,
  ...SUPER_SUPPORT_ADMIN_ROLES,
  ...FUMIGATION_ADMIN_ROLES,
  ...TRANSPORTATION_ADMIN_ROLES,
];

const getFumigationDashboardPath = (role) => {
  if (role === 'super_fumigation_admin') return '/admin/fumigation-cleaning/super';
  if (role === 'state_fumigation_admin') return '/admin/fumigation-cleaning/state';
  return '/admin/fumigation-cleaning';
};

const getTransportationDashboardPath = (role) => {
  if (role === 'super_transportation_admin') return '/admin/transportation/super';
  if (role === 'state_transportation_admin') return '/admin/transportation/state';
  return '/admin/transportation';
};

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return isAuthenticated ? children : <Navigate to="/login" />;
};

const FinancialAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!FINANCIAL_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" />;

  return children;
};

const SuperFinancialAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!SUPER_FINANCIAL_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" />;

  return children;
};

const StateAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!STATE_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" />;

  return children;
};

const StateSupportAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!STATE_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" />;

  return children;
};

const SuperSupportAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!SUPER_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" />;

  return children;
};

const SuperAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!SUPER_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/dashboard" />;

  return children;
};

const TenantRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.user_type !== 'tenant') return <Navigate to="/dashboard" />;

  return children;
};

const LandlordRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
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
    if (LGA_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin?tab=property_requests" />;
    if (STATE_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin/state-support-dashboard" />;
    if (SUPER_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin/super-support-dashboard" />;
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
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.user_type !== 'agent') return <Navigate to="/dashboard" />;

  return children;
};

const BaseLawyerRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.user_type !== 'lawyer') return <Navigate to="/dashboard" />;

  return children;
};

const StateLawyerRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.user_type !== 'state_lawyer') return <Navigate to="/dashboard" />;

  return children;
};

const SuperLawyerRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.user_type !== 'super_lawyer') return <Navigate to="/dashboard" />;

  return children;
};

const AdminShellRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!ADMIN_SHELL_ROLES.includes(user?.user_type)) return <Navigate to="/dashboard" />;

  return children;
};

const TransportationCoreAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!LGA_TRANSPORTATION_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" replace />;

  return children;
};

const TransportationStateAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
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
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
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
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!LGA_FUMIGATION_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" replace />;

  return children;
};

const StateFumigationAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!STATE_FUMIGATION_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" replace />;

  return children;
};

const SuperFumigationAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!SUPER_FUMIGATION_ADMIN_ROLES.includes(user?.user_type)) return <Navigate to="/admin" replace />;

  return children;
};

const PropertyManagerRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
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
    return <Navigate to="/admin?tab=property_requests" replace />;
  }

  if (STATE_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) {
    return <Navigate to="/admin/state-support-dashboard" replace />;
  }

  if (SUPER_SUPPORT_ADMIN_ROLES.includes(user?.user_type)) {
    return <Navigate to="/admin/super-support-dashboard" replace />;
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
    return <Navigate to="/admin?tab=property_requests" replace />;
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
  const [activeLanguage, setActiveLanguage] = useState(i18n.language?.split('-')[0] || 'en');

  const isVerificationPage =
    location.pathname.startsWith('/verify-email') ||
    location.pathname.startsWith('/verify-phone');
  const isDashboardShell =
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/super-admin') ||
    location.pathname.startsWith('/lawyer');
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
        <div className="flex justify-end border-b bg-white px-3 py-1 sm:px-4 sm:py-2">
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
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <SocketProvider>
            <Layout>
              <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/lawyer/accept-invite" element={<AcceptLawyerInvite />} />
              <Route path="/agent/accept-invite" element={<AcceptAgentInvite />} />
              <Route path="/lawyers" element={<LawyersDirectory />} />
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
              <Route path="/list-property" element={<ListProperty />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/landlord-guide" element={<LandlordGuide />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route
                path="/super-admin/*"
                element={
                  <SuperAdminRoute>
                    <AdminLayout />
                  </SuperAdminRoute>
                }
              >
                <Route index element={<SuperAdminDashboard />} />
                <Route path="transportation" element={<TransportationSuperAdminDashboard />} />
                <Route path="fumigation-cleaning" element={<SuperFumigationAdminDashboard />} />
              </Route>
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
                      <TransporationAdminStateDashboard />
                    </TransportationStateAdminRoute>
                  }
                />
                <Route path="transportation/super"
                  element={
                    <TransportationSuperAdminRoute>
                      <TransportationSuperAdminDashboard />
                    </TransportationSuperAdminRoute>
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
                <Route
                  path="fumigation-cleaning/super"
                  element={
                    <SuperFumigationAdminRoute>
                      <SuperFumigationAdminDashboard />
                    </SuperFumigationAdminRoute>
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
                <Route path="state-support-dashboard" element={<StateSupportAdminRoute><StateSupportAdminDashboard /></StateSupportAdminRoute>} />
                <Route path="super-support-dashboard" element={<SuperSupportAdminRoute><SuperSupportAdminDashboard /></SuperSupportAdminRoute>} />
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
            </Layout>

            <ToastContainer position="top-right" autoClose={3000} />
          </SocketProvider>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
