import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

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
import AdminDashboard from '../AdminDashboard';
import AdminLayout from './AdminLayout';
import AdminUsers from '../AdminUsers';
import AdminProperties from '../AdminProperties';
import AdminApplications from '../AdminApplications';
import AdminVerifications from '../AdminVerifications';

import Profile from './pages/Profile';
import Applications from './pages/Applications';
import SavedProperties from './pages/SavedProperties';
import Messages from './pages/Messages';
import MyProperties from './pages/MyProperties';
import AddProperty from './pages/AddProperty';
import Subscribe from './pages/Subscribe';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';





const queryClient = new QueryClient();

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" />;
};

const AdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (user?.user_type !== 'admin') {
    return <Navigate to="/dashboard" />;
  }

  return children;
};


function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-grow">
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/properties" element={<Properties />} />
                <Route path="/properties/:id" element={<PropertyDetail />} />

                {/* Protected Routes */}
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
                    
                    <Route
                      path="/profile"
                      element={
                        <ProtectedRoute>
                          <Profile />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/applications"
                      element={
                        <ProtectedRoute>
                          <Applications />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/saved-properties"
                      element={
                        <ProtectedRoute>
                          <SavedProperties />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/messages"
                      element={
                        <ProtectedRoute>
                          <Messages />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/my-properties"
                      element={
                        <ProtectedRoute>
                          <MyProperties />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/add-property"
                      element={
                        <ProtectedRoute>
                          <AddProperty />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/subscribe"
                      element={
                        <ProtectedRoute>
                          <Subscribe />
                        </ProtectedRoute>
                      }
                    />

                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password/:token" element={<ResetPassword />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route path="/privacy" element={<Privacy />} />


                {/* 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
            <Footer />
          </div>
          <ToastContainer
            position="top-right"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
          />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;