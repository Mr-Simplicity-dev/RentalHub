import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

const tabs = [
  'users',
  'verifications',
  'properties',
  'analytics',
  'reports',
  'logs',
  'broadcast',
  'flags',
  'fraud'
];

const SuperAdminDashboard = () => {

  const { user } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('users');
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [logs, setLogs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [reports, setReports] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [flags, setFlags] = useState([]);
  const [fraud, setFraud] = useState([]);

  const [verifications, setVerifications] = useState([]);
  const [verificationSearch, setVerificationSearch] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('pending');
  const [verificationUserType, setVerificationUserType] = useState('all');
  const [verificationPagination, setVerificationPagination] = useState({ total: 0, pages: 1 });
  const [adminPerformance, setAdminPerformance] = useState([]);

  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedProps, setSelectedProps] = useState([]);

  const [broadcastForm, setBroadcastForm] = useState({
    title: '',
    message: '',
    target_role: ''
  });

  useEffect(() => {

    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    if (user.user_type !== 'super_admin') {
      navigate('/dashboard', { replace: true });
    }

  }, [user, navigate]);

  useEffect(() => {

    if (user?.user_type === 'super_admin') {
      loadTab('users');
    }

  }, [user]);

  const guardedLoad = async (fn, errorText) => {

    setLoading(true);

    try {
      await fn();
    } catch (err) {
      console.error(err);
      toast.error(errorText);
    } finally {
      setLoading(false);
    }

  };

  const loadUsers = () =>
    guardedLoad(async () => {

      const res = await api.get('/super/users');

      setUsers(res.data.users || []);
      setSelectedUsers([]);

    }, 'Failed to load users');

  const loadProperties = () =>
    guardedLoad(async () => {

      const res = await api.get('/super/properties');

      setProperties(res.data.properties || []);
      setSelectedProps([]);

    }, 'Failed to load properties');

  const loadLogs = () =>
    guardedLoad(async () => {

      const res = await api.get('/super/logs');

      setLogs(res.data.logs || []);

    }, 'Failed to load logs');

  const loadAnalytics = () =>
    guardedLoad(async () => {

      const res = await api.get('/super/analytics');

      setAnalytics(res.data.data || null);

    }, 'Failed to load analytics');

  const loadReports = () =>
    guardedLoad(async () => {

      const res = await api.get('/super/reports');

      setReports(res.data.reports || []);

    }, 'Failed to load reports');

  const loadBroadcasts = () =>
    guardedLoad(async () => {

      const res = await api.get('/super/broadcasts');

      setBroadcasts(res.data.broadcasts || []);

    }, 'Failed to load broadcasts');

  const loadFlags = () =>
    guardedLoad(async () => {

      const res = await api.get('/super/flags');

      setFlags(res.data.flags || []);

    }, 'Failed to load flags');

  const loadFraud = () =>
    guardedLoad(async () => {

      const res = await api.get('/super/fraud');

      setFraud(res.data.flags || []);

    }, 'Failed to load fraud flags');

  const loadVerifications = () =>
    guardedLoad(async () => {

      const res = await api.get('/super/verifications', {
        params: {
          search: verificationSearch,
          status: verificationStatus,
          user_type: verificationUserType,
          page: 1,
          limit: 50
        }
      });

      setVerifications(res.data.data || []);
      setVerificationPagination(res.data.pagination || { total: 0, pages: 1 });

    }, 'Failed to load verifications');

  const loadAdminPerformance = async () => {

    try {

      const res = await api.get('/super/admins/performance');

      setAdminPerformance(res.data.data || []);

    } catch (err) {

      console.error(err);
      toast.error('Failed to load admin performance');

    }

  };

  const loadTab = (name) => {

    setTab(name);

    if (name === 'users') loadUsers();
    if (name === 'properties') loadProperties();
    if (name === 'logs') loadLogs();
    if (name === 'analytics') loadAnalytics();
    if (name === 'reports') loadReports();
    if (name === 'broadcast') loadBroadcasts();
    if (name === 'flags') loadFlags();
    if (name === 'fraud') loadFraud();

    if (name === 'verifications') {
      loadVerifications();
      loadAdminPerformance();
    }

  };

  return (

    <div className="max-w-7xl mx-auto px-4 py-8">

      <h1 className="text-2xl font-bold mb-6">
        Super Admin Control Center
      </h1>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">

        {tabs.map((name) => (

          <button
            key={name}
            className={`px-4 py-2 rounded-lg text-sm ${
              tab === name
                ? 'bg-blue-600 text-white'
                : 'border border-gray-300'
            }`}
            onClick={() => loadTab(name)}
          >

            {name.charAt(0).toUpperCase() + name.slice(1)}

          </button>

        ))}

      </div>

      {loading && (
        <div className="text-gray-500 mb-4">
          Loading data...
        </div>
      )}

      {/* USERS */}
      {tab === 'users' && (

        <div className="bg-white shadow rounded-lg overflow-hidden">

          <div className="overflow-x-auto">

            <table className="min-w-full text-sm">

              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 text-left">Name</th>
                  <th className="p-3 text-left">Email</th>
                  <th className="p-3 text-left">Role</th>
                  <th className="p-3 text-left">Active</th>
                  <th className="p-3 text-left">Actions</th>
                </tr>
              </thead>

              <tbody>

                {users.map((u) => (

                  <tr key={u.id} className="border-t">

                    <td className="p-3">{u.full_name}</td>
                    <td className="p-3">{u.email}</td>
                    <td className="p-3 capitalize">{u.user_type}</td>
                    <td className="p-3">
                      {u.is_active ? 'Active' : 'Inactive'}
                    </td>

                    <td className="p-3 space-x-2">

                      <button
                        onClick={() => toast.info('Action')}
                        className="text-blue-600 text-xs"
                      >
                        Manage
                      </button>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        </div>

      )}

    </div>

  );

};

export default SuperAdminDashboard;