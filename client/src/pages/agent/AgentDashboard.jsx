import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaClipboardList, FaHome, FaShieldAlt, FaUserTie } from 'react-icons/fa';
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

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      try {
        const res = await api.get('/auth/me');
        if (res.data?.success) {
          setProfile(res.data.data);
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
              <PermissionBadge enabled={assignment.can_manage_damage_reports} label="Manage damage reports" />
              <PermissionBadge enabled={assignment.can_manage_disputes} label="Manage disputes" />
              <PermissionBadge enabled={assignment.can_manage_legal} label="Manage legal tasks" />
              <PermissionBadge enabled={assignment.can_manage_finances} label="Manage finances" />
            </div>

            <p className="mt-4 text-sm text-gray-600">
              You can help with the harder operational work, but account ownership and sensitive financial control remain with the landlord.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default AgentDashboard;
