import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaClipboardList, FaHome, FaShieldAlt, FaUserTie, FaCoins } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';
import Loader from '../../components/common/Loader';

const PermissionBadge = ({ enabled, label }) => (
  <span
    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
      enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}
  >
    {label}
  </span>
);

const AgentDashboard = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [migrationRequests, setMigrationRequests] = useState([]);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationForm, setMigrationForm] = useState({ to_state: '', reason: '' });

  const STATES = [
    'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta',
    'Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi',
    'Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto',
    'Taraba','Yobe','Zamfara'
  ];

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      try {
        const [res, migrationRes] = await Promise.all([
          api.get('/auth/me'),
          api.get('/state-migrations/my').catch(() => ({ data: { data: [] } })),
        ]);
        if (res.data?.success) {
          setProfile(res.data.data);
          setMigrationRequests(migrationRes.data?.data || []);
        } else {
          toast.error('Failed to load agent dashboard');
        }
      } catch (error) {
        console.error('Failed to load agent dashboard:', error);
        toast.error(error.response?.data?.message || 'Failed to load agent dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const submitMigrationRequest = async () => {
    if (!migrationForm.to_state || !migrationForm.reason.trim()) {
      toast.error('Please select target state and provide reason');
      return;
    }

    try {
      setMigrationLoading(true);
      const res = await api.post('/state-migrations/request', {
        to_state: migrationForm.to_state,
        reason: migrationForm.reason,
      });

      toast.success(res.data?.message || 'Migration request submitted');
      setMigrationForm({ to_state: '', reason: '' });
      const myRes = await api.get('/state-migrations/my');
      setMigrationRequests(myRes.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit migration request');
    } finally {
      setMigrationLoading(false);
    }
  };

  if (loading) return <Loader />;

  const assignment = profile?.agent_assignment;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-700 p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-white/80">Agent Workspace</p>
            <h1 className="mt-2 text-3xl font-bold">
              Welcome, {profile?.full_name || 'Agent'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/85">
              This dashboard is for the landlord tasks that were delegated to you. Financial ownership stays with the landlord account.
            </p>
          </div>
          <div className="rounded-xl bg-white/10 p-4">
            <FaUserTie className="text-3xl" />
          </div>
        </div>
      </div>

      {!assignment ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
          <h2 className="text-lg font-semibold">No active landlord assignment yet</h2>
          <p className="mt-2 text-sm">
            Your account is active, but no landlord is currently assigned to you. Once a landlord or admin links you to a landlord account, your property-management tools will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">State Migration Request</h2>
            <p className="mt-1 text-sm text-gray-500">
              Your current assigned state: <span className="font-semibold text-gray-800">{profile?.assigned_state || 'Not configured'}</span>
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Agents are state-locked and can only operate in their assigned state.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <select
                value={migrationForm.to_state}
                onChange={(e) => setMigrationForm((prev) => ({ ...prev, to_state: e.target.value }))}
                className="input"
              >
                <option value="">Select target state</option>
                {STATES.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
              <input
                value={migrationForm.reason}
                onChange={(e) => setMigrationForm((prev) => ({ ...prev, reason: e.target.value }))}
                className="input md:col-span-2"
                placeholder="Reason for migration request"
              />
            </div>

            <div className="mt-3">
              <button type="button" className="btn btn-primary" onClick={submitMigrationRequest} disabled={migrationLoading}>
                {migrationLoading ? 'Submitting...' : 'Apply for State Migration'}
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {migrationRequests.slice(0, 3).map((request) => (
                <div key={request.id} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                  <p className="font-medium text-gray-800">
                    {request.from_state} → {request.to_state}
                    <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs capitalize">{request.status}</span>
                  </p>
                  <p className="text-xs text-gray-600">{request.reason}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border bg-white p-6 shadow-sm lg:col-span-2">
              <div className="flex items-center gap-3">
                <FaHome className="text-2xl text-indigo-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Assigned Landlord</h2>
                  <p className="text-sm text-gray-500">You are currently supporting this landlord account.</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Landlord</p>
                  <p className="mt-1 font-semibold text-gray-900">{assignment.landlord_name}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Email</p>
                  <p className="mt-1 font-medium text-gray-800">{assignment.landlord_email || 'N/A'}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Phone</p>
                  <p className="mt-1 font-medium text-gray-800">{assignment.landlord_phone || 'N/A'}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
                  <p className="mt-1 font-medium capitalize text-gray-800">{assignment.status || 'active'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <FaClipboardList className="text-2xl text-indigo-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
                  <p className="text-sm text-gray-500">Use the tools you were assigned.</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <Link to="/my-properties" className="btn btn-primary w-full">
                  Manage Properties
                </Link>
                <Link to="/add-property" className="btn w-full">
                  Add New Property
                </Link>
                <Link to="/agent/earnings" className="btn w-full">
                  <FaCoins className="mr-2" />
                  View Earnings
                </Link>
                <Link to="/agent/withdrawals" className="btn w-full">
                  Request Withdrawal
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <FaShieldAlt className="text-2xl text-indigo-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Delegated Responsibilities</h2>
                <p className="text-sm text-gray-500">These permissions come from the landlord or admin assignment.</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <PermissionBadge enabled={assignment.can_manage_properties} label="Manage properties" />
              <PermissionBadge enabled={assignment.can_manage_damage_reports} label="Manage Property Maintenance Assessments" />
              <PermissionBadge enabled={assignment.can_manage_disputes} label="Manage disputes" />
              <PermissionBadge enabled={assignment.can_manage_legal} label="Manage legal tasks" />
              <PermissionBadge enabled={assignment.can_manage_finances} label="Manage finances" />
            </div>

            <p className="mt-4 text-sm text-gray-600">
              You can help with the harder operational work, but account ownership and sensitive financial control remain with the landlord.
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Task Areas</h2>
            <p className="mt-1 text-sm text-gray-500">
              Use these dedicated paths for your assignment workflow.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <Link to="/my-properties" className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-100">
                Assigned/Managed Properties
              </Link>
              <Link to="/add-property" className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-100">
                Property Maintenance Assessment Tasks
              </Link>
              <Link to="/messages" className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-100">
                Dispute and Evidence Tasks
              </Link>
              <Link to="/lawyer" className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-100">
                Legal and Lawyer Operations
              </Link>
              <Link to="/agent/earnings" className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-100">
                Commission Ledger and Earnings
              </Link>
              <Link to="/agent/withdrawals" className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-100">
                Withdrawal Request Flow
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AgentDashboard;
