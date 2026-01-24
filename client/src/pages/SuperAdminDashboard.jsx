import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

const SuperAdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [logs, setLogs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [reports, setReports] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [flags, setFlags] = useState([]);
  const [fraud, setFraud] = useState([]);

  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedProps, setSelectedProps] = useState([]);

  const [broadcastForm, setBroadcastForm] = useState({
    title: '',
    message: '',
    target_role: ''
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') {
      navigate('/dashboard');
      return;
    }
    loadUsers();
  }, [user]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/super/users');
      setUsers(res.data.users || []);
      setSelectedUsers([]);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const loadProperties = async () => {
    setLoading(true);
    try {
      const res = await api.get('/super/properties');
      setProperties(res.data.properties || []);
      setSelectedProps([]);
    } catch {
      toast.error('Failed to load properties');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/super/logs');
      setLogs(res.data.logs || []);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const res = await api.get('/super/analytics');
      setAnalytics(res.data.data);
    } finally {
      setLoading(false);
    }
  };

  const loadReports = async () => {
    setLoading(true);
    try {
      const res = await api.get('/super/reports');
      setReports(res.data.reports || []);
    } finally {
      setLoading(false);
    }
  };

  const loadBroadcasts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/super/broadcasts');
      setBroadcasts(res.data.broadcasts || []);
    } finally {
      setLoading(false);
    }
  };

  const loadFlags = async () => {
    setLoading(true);
    try {
      const res = await api.get('/super/flags');
      setFlags(res.data.flags || []);
    } finally {
      setLoading(false);
    }
  };

  const loadFraud = async () => {
    setLoading(true);
    try {
      const res = await api.get('/super/fraud');
      setFraud(res.data.flags || []);
    } finally {
      setLoading(false);
    }
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
  };

  const verifyUser = async (id) => {
    await api.patch(`/super/verify/${id}`);
    toast.success('User verified');
    loadUsers();
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

  const switchTab = (t) => {
    setTab(t);
    if (t === 'users') loadUsers();
    if (t === 'properties') loadProperties();
    if (t === 'logs') loadLogs();
    if (t === 'analytics') loadAnalytics();
    if (t === 'reports') loadReports();
    if (t === 'broadcast') loadBroadcasts();
    if (t === 'flags') loadFlags();
    if (t === 'fraud') loadFraud();
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Super Admin Control Center</h1>

      <div className="flex flex-wrap gap-2 mb-6">
        {['users', 'properties', 'analytics', 'reports', 'logs', 'broadcast', 'flags', 'fraud'].map(t => (
          <button
            key={t}
            className={`btn ${tab === t ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => switchTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading && <p>Loading...</p>}

    {tab === 'flags' && (
      <div className="card">
        <h3 className="font-semibold mb-3">Platform Controls</h3>
        <ul className="space-y-3">
          {flags.map(f => (
            <li key={f.key} className="flex justify-between items-center">
              <div>
                <strong>{f.key}</strong>
                <div className="text-xs text-gray-500">{f.description}</div>
              </div>
              <input
                type="checkbox"
                checked={f.enabled}
                onChange={() => toggleFlag(f.key, !f.enabled)}
              />
            </li>
          ))}
        </ul>
      </div>
    )}

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
                <th>
                  <input
                    type="checkbox"
                    onChange={(e) =>
                      setSelectedUsers(e.target.checked ? users.map(u => u.id) : [])
                    }
                  />
                </th>
                <th>Name</th><th>Email</th><th>Role</th><th>Verified</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b">
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(u.id)}
                      onChange={(e) => {
                        setSelectedUsers(prev =>
                          e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id)
                        );
                      }}
                    />
                  </td>
                  <td>{u.full_name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>{u.identity_verified ? 'Yes' : 'No'}</td>
                  <td className="space-x-2">
                    {!u.identity_verified && <button onClick={() => verifyUser(u.id)} className="btn btn-xs">Verify</button>}
                    {u.role !== 'admin' && <button onClick={() => promoteUser(u.id)} className="btn btn-xs">Make Admin</button>}
                    <button onClick={() => banUser(u.id)} className="btn btn-xs btn-danger">Ban</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )}

    {tab === 'properties' && (
      <>
        {selectedProps.length > 0 && (
          <div className="mb-3">
            <button onClick={bulkProps} className="btn btn-sm btn-danger">
              Unlist Selected
            </button>
          </div>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th>
                  <input
                    type="checkbox"
                    onChange={(e) =>
                      setSelectedProps(e.target.checked ? properties.map(p => p.id) : [])
                    }
                  />
                </th>
                <th>Title</th><th>Landlord</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {properties.map(p => (
                <tr key={p.id} className="border-b">
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedProps.includes(p.id)}
                      onChange={(e) => {
                        setSelectedProps(prev =>
                          e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id)
                        );
                      }}
                    />
                  </td>
                  <td>{p.title}</td>
                  <td>{p.landlord_name}</td>
                  <td>{p.is_active ? 'Active' : 'Unlisted'}</td>
                  <td>
                    {p.is_active && (
                      <button onClick={() => unlistProperty(p.id)} className="btn btn-xs btn-danger">
                        Unlist
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )}

    {tab === 'logs' && (
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th>Actor</th><th>Action</th><th>Target</th><th>Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id} className="border-b">
                <td>{l.actor_name || 'System'}</td>
                <td>{l.action}</td>
                <td>{l.target_type} #{l.target_id}</td>
                <td>{new Date(l.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    {tab === 'analytics' && analytics && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card"><h3>Total Properties</h3><p className="text-2xl">{analytics.totalProperties}</p></div>
        <div className="card"><h3>Applications</h3><p className="text-2xl">{analytics.totalApplications}</p></div>
        <div className="card"><h3>Verified Users</h3><p className="text-2xl">{analytics.verifiedUsers}</p></div>

        <div className="card col-span-full">
          <h3 className="font-semibold mb-2">Users by Role</h3>
          {analytics.usersByRole.map(r => (
            <div key={r.role}>{r.role}: {r.count}</div>
          ))}
        </div>

        <div className="card col-span-full">
          <h3 className="font-semibold mb-2">Properties by State</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            {analytics.propertiesByState.map(s => (
              <div key={s.state}>{s.state}: {s.count}</div>
            ))}
          </div>
        </div>
      </div>
    )}

    {tab === 'reports' && (
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th>Reporter</th><th>Target</th><th>Reason</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id} className="border-b">
                <td>{r.reporter_name || 'Anonymous'}</td>
                <td>{r.target_type} #{r.target_id}</td>
                <td className="max-w-xs truncate">{r.reason}</td>
                <td>{r.status}</td>
                <td className="space-x-2">
                  {r.status !== 'resolved' && (
                    <button onClick={() => updateReport(r.id, 'resolved')} className="btn btn-xs">
                      Resolve
                    </button>
                  )}
                  {r.status !== 'dismissed' && (
                    <button onClick={() => updateReport(r.id, 'dismissed')} className="btn btn-xs">
                      Dismiss
                    </button>
                  )}
                </td>
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
          <input
            className="input mb-2 w-full"
            placeholder="Title"
            value={broadcastForm.title}
            onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
          />
          <textarea
            className="input mb-2 w-full h-24"
            placeholder="Message"
            value={broadcastForm.message}
            onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
          />
          <select
            className="input mb-3 w-full"
            value={broadcastForm.target_role}
            onChange={(e) => setBroadcastForm({ ...broadcastForm, target_role: e.target.value })}
          >
            <option value="">Everyone</option>
            <option value="tenant">Tenants</option>
            <option value="landlord">Landlords</option>
            <option value="admin">Admins</option>
          </select>
          <button onClick={sendBroadcast} className="btn btn-primary">Send</button>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-3">Previous Broadcasts</h3>
          <ul className="space-y-3 text-sm">
            {broadcasts.map(b => (
              <li key={b.id} className="border-b pb-2">
                <strong>{b.title}</strong>
                <div className="text-gray-600">{b.message}</div>
                <div className="text-xs text-gray-400">
                  To: {b.target_role || 'Everyone'} • By {b.sender_name} • {new Date(b.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )}

    {tab === 'fraud' && (
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th>Type</th>
              <th>ID</th>
              <th>Rule</th>
              <th>Score</th>
              <th>Time</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {fraud.map(f => (
              <tr key={f.id} className="border-b">
                <td>{f.entity_type}</td>
                <td>{f.entity_id}</td>
                <td>{f.rule}</td>
                <td>{f.score}</td>
                <td>{new Date(f.created_at).toLocaleString()}</td>
                <td>
                  <button
                    onClick={() => api.patch(`/super/fraud/${f.id}/resolve`).then(loadFraud)}
                    className="btn btn-xs"
                  >
                    Resolve
                  </button>
                </td>
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

