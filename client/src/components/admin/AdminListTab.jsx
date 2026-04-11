import React, { useEffect, useState } from "react";
import api from "../../services/api";

const getRoleBadgeClass = (role) => {
  switch (role) {
    case 'super_admin':
      return 'bg-amber-100 text-amber-800';
    case 'super_financial_admin':
    case 'super_support_admin':
    case 'super_lawyer':
      return 'bg-red-100 text-red-700';
    case 'state_admin':
    case 'state_financial_admin':
    case 'state_support_admin':
    case 'state_lawyer':
      return 'bg-blue-100 text-blue-700';
    case 'financial_admin':
      return 'bg-emerald-100 text-emerald-700';
    case 'lawyer':
      return 'bg-violet-100 text-violet-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

const formatRoleLabel = (role) => String(role || 'admin').replace(/_/g, ' ');

const AdminListTab = () => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedAdminId, setExpandedAdminId] = useState(null);
  const [stateUsersByAdmin, setStateUsersByAdmin] = useState({});
  const [stateUsersLoadingByAdmin, setStateUsersLoadingByAdmin] = useState({});

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      const res = await api.get("/super/admins/performance");
      setAdmins(res.data.data || []);
    } catch (err) {
      console.error("Failed to load admins:", err);
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const suspendAdmin = async (admin) => {
    const reason = window.prompt(
      `Suspend ${admin.full_name}? Enter a reason (this will be shown at login):`,
      ''
    );

    if (reason === null) return;

    const normalizedReason = String(reason || '').trim();
    if (!normalizedReason) {
      window.alert('Suspension reason is required.');
      return;
    }

    await api.patch(`/super/users/${admin.id}/ban`, { reason: normalizedReason });
    fetchAdmins();
  };

  const deleteAdmin = async (admin) => {
    const ok = window.confirm(
      `Delete ${admin.full_name}? This will deactivate the account and block login.`
    );
    if (!ok) return;

    try {
      await api.delete(`/super/users/${admin.id}`);
      fetchAdmins();
    } catch (err) {
      window.alert(err.response?.data?.message || 'Failed to delete admin');
    }
  };

  const unsuspendAdmin = async (admin) => {
    if (!window.confirm(`Unsuspend ${admin.full_name}? Their account will be restored.`)) return;
    await api.patch(`/super/users/${admin.id}/unban`);
    fetchAdmins();
  };

  const isStateScopedRole = (role) => String(role || '').startsWith('state_');

  const isJurisdictionRole = (role) => {
    const value = String(role || '');
    return value === 'admin' || value.startsWith('state_') || value === 'lawyer';
  };

  const editJurisdiction = async (admin) => {
    try {
      const stateInput = window.prompt('Assigned State', admin.assigned_state || '');
      if (stateInput === null) return;

      const normalizedState = String(stateInput || '').trim();
      if (isJurisdictionRole(admin.user_type) && !normalizedState) {
        window.alert('Assigned state is required for this role.');
        return;
      }

      let normalizedCity = '';
      if (admin.user_type === 'admin') {
        const lgaInput = window.prompt('Assigned Local Government (LGA)', admin.assigned_city || '');
        if (lgaInput === null) return;
        normalizedCity = String(lgaInput || '').trim();

        if (!normalizedCity) {
          window.alert('Assigned local government is required for admin role.');
          return;
        }
      }

      await api.patch(`/super/admins/${admin.id}/jurisdiction`, {
        assigned_state: normalizedState,
        assigned_city: normalizedCity,
      });

      fetchAdmins();
    } catch (err) {
      window.alert(err.response?.data?.message || 'Failed to update admin jurisdiction');
    }
  };

  const loadStateUsers = async (adminId) => {
    setStateUsersLoadingByAdmin((prev) => ({ ...prev, [adminId]: true }));
    try {
      const res = await api.get(`/super/admins/${adminId}/state-users`);
      if (res.data?.success) {
        setStateUsersByAdmin((prev) => ({ ...prev, [adminId]: res.data.data }));
      }
    } catch (err) {
      console.error('Failed to load state users:', err);
      setStateUsersByAdmin((prev) => ({ ...prev, [adminId]: { users: [], summary: { total: 0, tenants: 0, landlords: 0 } } }));
    } finally {
      setStateUsersLoadingByAdmin((prev) => ({ ...prev, [adminId]: false }));
    }
  };

  const handleToggleStateUsers = async (admin) => {
    if (expandedAdminId === admin.id) {
      setExpandedAdminId(null);
      return;
    }

    setExpandedAdminId(admin.id);
    if (!stateUsersByAdmin[admin.id]) {
      await loadStateUsers(admin.id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-xl font-semibold text-gray-900">
          Manage Admins
        </h3>
        <p className="text-sm text-gray-500">
          View and manage all admin-tier roles (including state, support, financial, and lawyer admins)
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl2 border border-soft bg-white shadow-card transition hover:shadow-cardHover">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Role</th>
              <th className="p-3 text-left">Assigned State</th>
              <th className="p-3 text-left">Assigned LGA</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Verified Cases</th>
              <th className="p-3 text-left">Joined</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>

          <tbody>
            {!loading && admins.length === 0 && (
              <tr>
                <td colSpan="9" className="py-10 text-center text-gray-500">
                  No admins found
                </td>
              </tr>
            )}

            {admins.map((admin) => (
              <React.Fragment key={admin.id}>
                <tr className="border-t border-soft transition hover:bg-gray-50">
                  <td className="p-3 font-medium">{admin.full_name}</td>
                  <td className="p-3 text-gray-600">{admin.email}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${getRoleBadgeClass(admin.user_type)}`}
                    >
                      {formatRoleLabel(admin.user_type)}
                    </span>
                  </td>
                  <td className="p-3">{admin.assigned_state || '-'}</td>
                  <td className="p-3">{admin.assigned_city || '-'}</td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        admin.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {admin.is_active ? "Active" : "Suspended"}
                    </span>
                    {!admin.is_active && admin.account_suspended_reason && (
                      <p className="mt-1 max-w-[220px] truncate text-xs text-gray-500" title={admin.account_suspended_reason}>
                        {admin.account_suspended_reason}
                      </p>
                    )}
                  </td>
                  <td className="p-3">{admin.credentials_verified_count ?? 0}</td>
                  <td className="p-3 text-gray-500">
                    {admin.created_at
                      ? new Date(admin.created_at).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-center gap-2 flex-wrap">
                      {isStateScopedRole(admin.user_type) && admin.assigned_state && (
                        <button
                          onClick={() => handleToggleStateUsers(admin)}
                          className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white transition-colors hover:bg-blue-700"
                        >
                          {expandedAdminId === admin.id ? 'Hide State Users' : 'View State Users'}
                        </button>
                      )}

                      {admin.is_active && admin.user_type !== 'super_admin' && (
                        <button
                          onClick={() => suspendAdmin(admin)}
                          className="rounded-lg bg-red-600 px-3 py-1 text-xs text-white transition-colors hover:bg-red-700"
                        >
                          Suspend
                        </button>
                      )}

                      {!admin.is_active && admin.user_type !== 'super_admin' && (
                        <button
                          onClick={() => unsuspendAdmin(admin)}
                          className="rounded-lg bg-green-600 px-3 py-1 text-xs text-white transition-colors hover:bg-green-700"
                        >
                          Unsuspend
                        </button>
                      )}

                      {admin.user_type !== 'super_admin' && (
                        <button
                          onClick={() => editJurisdiction(admin)}
                          className="rounded-lg bg-indigo-600 px-3 py-1 text-xs text-white transition-colors hover:bg-indigo-700"
                        >
                          Edit Jurisdiction
                        </button>
                      )}

                      {admin.user_type !== 'super_admin' ? (
                        <button
                          onClick={() => deleteAdmin(admin)}
                          className="rounded-lg bg-gray-700 px-3 py-1 text-xs text-white transition-colors hover:bg-gray-800"
                        >
                          Delete
                        </button>
                      ) : (
                        <span className="rounded-lg bg-amber-50 px-3 py-1 text-xs text-amber-700 border border-amber-200">
                          Protected
                        </span>
                      )}
                    </div>
                  </td>
                </tr>

                {expandedAdminId === admin.id && (
                  <tr className="bg-blue-50/40 border-t border-blue-100">
                    <td colSpan="9" className="p-4">
                      {stateUsersLoadingByAdmin[admin.id] ? (
                        <div className="text-sm text-blue-700">Loading tenants and landlords for {admin.assigned_state}...</div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-blue-900">
                              {admin.assigned_state} Users ({stateUsersByAdmin[admin.id]?.summary?.total || 0})
                            </h4>
                            <p className="text-xs text-blue-800">
                              Tenants: {stateUsersByAdmin[admin.id]?.summary?.tenants || 0} | Landlords: {stateUsersByAdmin[admin.id]?.summary?.landlords || 0}
                            </p>
                          </div>

                          <div className="overflow-x-auto rounded-lg border border-blue-100 bg-white">
                            <table className="min-w-full text-xs">
                              <thead className="bg-blue-50 text-blue-900">
                                <tr>
                                  <th className="p-2 text-left">Name</th>
                                  <th className="p-2 text-left">Email</th>
                                  <th className="p-2 text-left">Phone</th>
                                  <th className="p-2 text-left">Type</th>
                                  <th className="p-2 text-left">Joined</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(stateUsersByAdmin[admin.id]?.users || []).length === 0 ? (
                                  <tr>
                                    <td colSpan="5" className="p-3 text-center text-gray-500">
                                      No tenant/landlord records found for this state.
                                    </td>
                                  </tr>
                                ) : (
                                  (stateUsersByAdmin[admin.id]?.users || []).map((u) => (
                                    <tr key={u.id} className="border-t border-blue-50">
                                      <td className="p-2 font-medium">{u.full_name}</td>
                                      <td className="p-2">{u.email}</td>
                                      <td className="p-2">{u.phone || '-'}</td>
                                      <td className="p-2 capitalize">{u.user_type}</td>
                                      <td className="p-2">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminListTab;
