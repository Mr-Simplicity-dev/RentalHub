import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import i18n from '../i18n';

import { AuthProvider } from '../context/AuthContext';
import { useAuth } from '../hooks/useAuth';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';

import Home from './Home';
import Login from './Login';
import Register from './Register';
import Properties from './Properties';
import PropertyDetail from './PropertyDetail';
import Dashboard from './Dashboard';
import NotFound from './NotFound';

import AdminDashboard from './admin/AdminDashboard';
import AdminLayout from './admin/AdminLayout';
import AdminUsers from './admin/AdminUsers';
import AdminProperties from './admin/AdminProperties';
import AdminApplications from './admin/AdminApplications';
import AdminVerifications from './admin/AdminVerifications';

import Profile from './Profile';
import Applications from './Applications';
import SavedProperties from './SavedProperties';
import Messages from './Messages';
import MyProperties from './MyProperties';
import AddProperty from './AddProperty';
import Subscribe from './Subscribe';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import Terms from './Terms';
import Privacy from './Privacy';
import Faq from './Faq';
import HowItWorks from './HowItWorks';
import Pricing from './Pricing';
import LandlordGuide from './LandlordGuide';
import VerifyEmail from './VerifyEmail';
import VerifyPhone from './VerifyPhone';

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return isAuthenticated ? children : <Navigate to="/login" />;
};

const AdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.user_type !== 'admin') return <Navigate to="/dashboard" />;

  return children;
};

function Layout({ children }) {
  const location = useLocation();

  const isVerificationPage =
    location.pathname.startsWith('/verify-email') ||
    location.pathname.startsWith('/verify-phone');

  // Handle RTL/LTR automatically
  useEffect(() => {
    document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      {!isVerificationPage && <Header />}

      {/* Global Language Switcher */}
      <div className="flex justify-end px-4 py-2 border-b bg-white">
        <select
          onChange={(e) => {
            i18n.changeLanguage(e.target.value);
            document.documentElement.dir = e.target.value === 'ar' ? 'rtl' : 'ltr';
          }}
          defaultValue={i18n.language || 'en'}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="en">English</option>
          <option value="ru">Russia</option>
          <option value="fr">Français</option>
          <option value="ar">العربية</option>
          <option value="zh">中文</option>
        </select>
      </div>

      <main className="flex-grow">{children}</main>

      {!isVerificationPage && <Footer />}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Layout>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/properties" element={<Properties />} />
              <Route path="/properties/:id" element={<PropertyDetail />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/verify-phone" element={<VerifyPhone />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password/:token" element={<ResetPassword />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/landlord-guide" element={<LandlordGuide />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />

              {/* Protected */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin/*"
                element={
                  <AdminRoute>
                    <AdminLayout />
                  </AdminRoute>
                }
              >
                <Route index element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="verifications" element={<AdminVerifications />} />
                <Route path="properties" element={<AdminProperties />} />
                <Route path="applications" element={<AdminApplications />} />
              </Route>

              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/applications" element={<ProtectedRoute><Applications /></ProtectedRoute>} />
              <Route path="/saved-properties" element={<ProtectedRoute><SavedProperties /></ProtectedRoute>} />
              <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
              <Route path="/my-properties" element={<ProtectedRoute><MyProperties /></ProtectedRoute>} />
              <Route path="/add-property" element={<ProtectedRoute><AddProperty /></ProtectedRoute>} />
              <Route path="/subscribe" element={<ProtectedRoute><Subscribe /></ProtectedRoute>} />

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>

          <ToastContainer position="top-right" autoClose={3000} />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
