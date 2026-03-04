import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

const tabs = ['users', 'verifications', 'properties', 'analytics', 'reports', 'logs', 'broadcast', 'flags', 'fraud'];

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
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', target_role: '' });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          limit: 50,
        },
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

  const verifyIdentity = async (id) => {
    await api.patch(`/super/verifications/${id}/approve`);
    toast.success('Identity verified');
    loadVerifications();
    loadUsers();
    loadAdminPerformance();
  };

  const rejectIdentity = async (id) => {
    if (!window.confirm('Reject this verification?')) return;
    await api.patch(`/super/verifications/${id}/reject`);
    toast.success('Identity rejected');
    loadVerifications();
    loadAdminPerformance();
  };

  const banUser = async (id) => {
    if (!window.confirm('Ban this user?')) return;
    await api.patch(`/super/users/${id}/ban`);
    toast.success('User banned');
    loadUsers();
  };

  const promoteUser = async (id) => {
    await api.patch(`/super/users/${id}/promote`);
    toast.success('User promoted to admin');
    loadUsers();
    loadAdminPerformance();
  };

  const unlistProperty = async (id) => {
    if (!window.confirm('Unlist this property?')) return;
    await api.patch(`/super/properties/${id}/unlist`);
    toast.success('Property unlisted');
    loadProperties();
  };

  const bulkUsers = async (action) => {
    if (!selectedUsers.length) return;
    await api.post('/super/users/bulk', { ids: selectedUsers, action });
    toast.success('Bulk action completed');
    loadUsers();
    loadAdminPerformance();
  };

  const bulkProps = async () => {
    if (!selectedProps.length) return;
    await api.post('/super/properties/bulk', { ids: selectedProps, action: 'unlist' });
    toast.success('Bulk unlist completed');
    loadProperties();
  };

  const updateReport = async (id, status) => {
    await api.patch(`/super/reports/${id}`, { status });
    loadReports();
  };

  const sendBroadcast = async () => {
    if (!broadcastForm.title || !broadcastForm.message) {
      toast.error('Title and message required');
      return;
    }
    await api.post('/super/broadcasts', broadcastForm);
    toast.success('Broadcast sent');
    setBroadcastForm({ title: '', message: '', target_role: '' });
    loadBroadcasts();
  };

  const toggleFlag = async (key, enabled) => {
    await api.patch(`/super/flags/${key}`, { enabled });
    loadFlags();
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Super Admin Control Center</h1>

      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((name) => (
          <button
            key={name}
            className={`btn ${tab === name ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => loadTab(name)}
          >
            {name.charAt(0).toUpperCase() + name.slice(1)}
          </button>
        ))}
      </div>

      {loading && <p>Loading...</p>}

      {tab === 'users' && (
        <>
          {selectedUsers.length > 0 && (
            <div className="mb-3 flex gap-2">
              <button onClick={() => bulkUsers('ban')} className="btn btn-sm btn-danger">Ban Selected</button>
              <button onClick={() => bulkUsers('verify')} className="btn btn-sm">Verify Selected</button>
              <button onClick={() => bulkUsers('promote')} className="btn btn-sm">Make Admin</button>
            </div>
          )}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th><input type="checkbox" onChange={(e) => setSelectedUsers(e.target.checked ? users.filter((u) => u.user_type !== 'super_admin').map((u) => u.id) : [])} /></th>
                  <th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Verified</th><th>Verified By</th><th>Work Count</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b">
                    <td><input type="checkbox" disabled={u.user_type === 'super_admin'} checked={selectedUsers.includes(u.id)} onChange={(e) => setSelectedUsers((prev) => e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id))} /></td>
                    <td>{u.full_name}</td>
                    <td>{u.email}</td>
                    <td className="capitalize">{u.user_type}</td>
                    <td>{u.is_active ? 'Active' : 'Inactive'}</td>
                    <td>{u.identity_verified ? 'Yes' : 'No'}</td>
                    <td>{u.identity_verified_by_name || '-'}</td>
                    <td>{u.credentials_verified_count ?? 0}</td>
                    <td className="space-x-2">
                      {!u.identity_verified && u.user_type !== 'super_admin' && <button onClick={() => verifyIdentity(u.id)} className="btn btn-xs">Verify</button>}
                      {!['admin', 'super_admin'].includes(u.user_type) && <button onClick={() => promoteUser(u.id)} className="btn btn-xs">Make Admin</button>}
                      {u.user_type !== 'super_admin' && <button onClick={() => banUser(u.id)} className="btn btn-xs btn-danger">Ban</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'verifications' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="font-semibold mb-3">NIN / International Passport Verification</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
              <input className="input" placeholder="Search name, email, NIN, passport" value={verificationSearch} onChange={(e) => setVerificationSearch(e.target.value)} />
              <select className="input" value={verificationStatus} onChange={(e) => setVerificationStatus(e.target.value)}>
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="all">All</option>
              </select>
              <select className="input" value={verificationUserType} onChange={(e) => setVerificationUserType(e.target.value)}>
                <option value="all">All Roles</option>
                <option value="admin">Admins</option>
                <option value="landlord">Landlords</option>
                <option value="tenant">Tenants</option>
              </select>
              <button className="btn btn-primary" onClick={loadVerifications}>Apply Filters</button>
            </div>
            <div className="text-sm text-gray-600 mb-2">{verificationPagination.total} records</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th>Name</th><th>Email</th><th>Role</th><th>Doc Type</th><th>Number</th><th>Verified</th><th>Verified By</th><th>Verified At</th><th>Passport Photo</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {verifications.map((v) => {
                    const docType = (v.identity_document_type || 'nin').toLowerCase();
                    const docNumber = docType === 'passport' ? v.international_passport_number : v.nin;
                    return (
                      <tr key={v.id} className="border-b">
                        <td>{v.full_name}</td>
                        <td>{v.email}</td>
                        <td className="capitalize">{v.user_type}</td>
                        <td>{docType.toUpperCase()}</td>
                        <td>{docNumber || '-'}</td>
                        <td>{v.identity_verified ? 'Yes' : 'No'}</td>
                        <td>{v.identity_verified_by_name || '-'}</td>
                        <td>{v.identity_verified_at ? new Date(v.identity_verified_at).toLocaleString() : '-'}</td>
                        <td>{v.passport_photo_url ? <a href={v.passport_photo_url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">View</a> : '-'}</td>
                        <td className="space-x-2">
                          {!v.identity_verified && <button onClick={() => verifyIdentity(v.id)} className="btn btn-xs">Approve</button>}
                          {!v.identity_verified && <button onClick={() => rejectIdentity(v.id)} className="btn btn-xs btn-danger">Reject</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card overflow-x-auto">
            <h3 className="font-semibold mb-3">Admin Performance</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th>Admin</th><th>Email</th><th>Status</th><th>Total Verified</th><th>Last Verification</th>
                </tr>
              </thead>
              <tbody>
                {adminPerformance.map((a) => (
                  <tr key={a.id} className="border-b">
                    <td>{a.full_name}</td>
                    <td>{a.email}</td>
                    <td>{a.is_active ? 'Active' : 'Inactive'}</td>
                    <td>{a.credentials_verified_count ?? 0}</td>
                    <td>{a.last_verification_at ? new Date(a.last_verification_at).toLocaleString() : 'No activity'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'properties' && (
        <div className="card overflow-x-auto">
          {selectedProps.length > 0 && <div className="mb-3"><button onClick={bulkProps} className="btn btn-sm btn-danger">Unlist Selected</button></div>}
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th><input type="checkbox" onChange={(e) => setSelectedProps(e.target.checked ? properties.map((p) => p.id) : [])} /></th><th>Title</th><th>Landlord</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id} className="border-b">
                  <td><input type="checkbox" checked={selectedProps.includes(p.id)} onChange={(e) => setSelectedProps((prev) => e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id))} /></td>
                  <td>{p.title}</td><td>{p.landlord_name}</td><td>{p.is_active ? 'Active' : 'Unlisted'}</td>
                  <td>{p.is_active && <button onClick={() => unlistProperty(p.id)} className="btn btn-xs btn-danger">Unlist</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'logs' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th>Actor</th><th>Action</th><th>Target</th><th>Time</th></tr></thead>
            <tbody>{logs.map((l) => <tr key={l.id} className="border-b"><td>{l.actor_name || 'System'}</td><td>{l.action}</td><td>{l.target_type} #{l.target_id}</td><td>{new Date(l.created_at).toLocaleString()}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {tab === 'analytics' && analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card"><h3>Total Properties</h3><p className="text-2xl">{analytics.totalProperties}</p></div>
          <div className="card"><h3>Applications</h3><p className="text-2xl">{analytics.totalApplications}</p></div>
          <div className="card"><h3>Verified Users</h3><p className="text-2xl">{analytics.verifiedUsers}</p></div>
          <div className="card col-span-full"><h3 className="font-semibold mb-2">Users by Role</h3>{(analytics.usersByRole || []).map((r) => <div key={r.role}>{r.role}: {r.count}</div>)}</div>
        </div>
      )}

      {tab === 'reports' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th>Reporter</th><th>Target</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b">
                  <td>{r.reporter_name || 'Anonymous'}</td><td>{r.target_type} #{r.target_id}</td><td className="max-w-xs truncate">{r.reason}</td><td>{r.status}</td>
                  <td className="space-x-2">{r.status !== 'resolved' && <button onClick={() => updateReport(r.id, 'resolved')} className="btn btn-xs">Resolve</button>}{r.status !== 'dismissed' && <button onClick={() => updateReport(r.id, 'dismissed')} className="btn btn-xs">Dismiss</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'broadcast' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="font-semibold mb-3">Send Broadcast</h3>
            <input className="input mb-2 w-full" placeholder="Title" value={broadcastForm.title} onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })} />
            <textarea className="input mb-2 w-full h-24" placeholder="Message" value={broadcastForm.message} onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })} />
            <select className="input mb-3 w-full" value={broadcastForm.target_role} onChange={(e) => setBroadcastForm({ ...broadcastForm, target_role: e.target.value })}>
              <option value="">Everyone</option><option value="tenant">Tenants</option><option value="landlord">Landlords</option><option value="admin">Admins</option>
            </select>
            <button onClick={sendBroadcast} className="btn btn-primary">Send</button>
          </div>
          <div className="card"><h3 className="font-semibold mb-3">Previous Broadcasts</h3><ul className="space-y-3 text-sm">{broadcasts.map((b) => <li key={b.id} className="border-b pb-2"><strong>{b.title}</strong><div className="text-gray-600">{b.message}</div><div className="text-xs text-gray-400">To: {b.target_role || 'Everyone'} | By {b.sender_name} | {new Date(b.created_at).toLocaleString()}</div></li>)}</ul></div>
        </div>
      )}

      {tab === 'flags' && (
        <div className="card">
          <h3 className="font-semibold mb-3">Platform Controls</h3>
          <ul className="space-y-3">{flags.map((f) => <li key={f.key} className="flex justify-between items-center"><div><strong>{f.key}</strong><div className="text-xs text-gray-500">{f.description}</div></div><input type="checkbox" checked={f.enabled} onChange={() => toggleFlag(f.key, !f.enabled)} /></li>)}</ul>
        </div>
      )}

      {tab === 'fraud' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th>Type</th><th>ID</th><th>Rule</th><th>Score</th><th>Time</th><th>Action</th></tr></thead>
            <tbody>
              {fraud.map((f) => (
                <tr key={f.id} className="border-b">
                  <td>{f.entity_type}</td><td>{f.entity_id}</td><td>{f.rule}</td><td>{f.score}</td><td>{new Date(f.created_at).toLocaleString()}</td>
                  <td><button onClick={() => api.patch(`/super/fraud/${f.id}/resolve`).then(loadFraud)} className="btn btn-xs">Resolve</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
