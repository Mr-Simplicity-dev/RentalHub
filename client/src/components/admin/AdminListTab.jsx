import React, { useEffect, useState } from "react";
import api from "../../services/api";

const AdminListTab = () => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const suspendAdmin = async (id) => {
    await api.patch(`/super/users/${id}/ban`);
    fetchAdmins();
  };

  const deleteAdmin = async (id) => {
    await api.delete(`/super/users/${id}`);
    fetchAdmins();
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-xl font-semibold text-gray-900">
          System Admins
        </h3>
        <p className="text-sm text-gray-500">
          Manage administrator accounts only
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl2 border border-soft bg-white shadow-card transition hover:shadow-cardHover">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Role</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Verified Cases</th>
              <th className="p-3 text-left">Joined</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>

          <tbody>
            {!loading && admins.length === 0 && (
              <tr>
                <td colSpan="7" className="py-10 text-center text-gray-500">
                  No admins found
                </td>
              </tr>
            )}

            {admins.map((admin) => (
              <tr
                key={admin.id}
                className="border-t border-soft transition hover:bg-gray-50"
              >
                <td className="p-3 font-medium">{admin.full_name}</td>
                <td className="p-3 text-gray-600">{admin.email}</td>
                <td className="p-3 capitalize">admin</td>
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
                </td>
                <td className="p-3">{admin.credentials_verified_count ?? 0}</td>
                <td className="p-3 text-gray-500">
                  {admin.created_at
                    ? new Date(admin.created_at).toLocaleDateString()
                    : "-"}
                </td>
                <td className="p-3">
                  <div className="flex justify-center gap-2">
                    {admin.is_active && (
                      <button
                        onClick={() => suspendAdmin(admin.id)}
                        className="rounded-lg bg-red-600 px-3 py-1 text-xs text-white transition-colors hover:bg-red-700"
                      >
                        Suspend
                      </button>
                    )}

                    <button
                      onClick={() => deleteAdmin(admin.id)}
                      className="rounded-lg bg-gray-700 px-3 py-1 text-xs text-white transition-colors hover:bg-gray-800"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminListTab;
