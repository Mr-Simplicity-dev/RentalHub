import React, { useEffect, useState } from "react";
import api from "../../services/api";

export default function UsersTab() {

  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await api.get("/super/users");
      setUsers(res.data.users || []);
    } catch (err) {
      console.error("Failed to load users", err);
    }
  };

  const verifyIdentity = async (id) => {
    await api.patch(`/super/verifications/${id}/approve`);
    loadUsers();
  };

  const promoteUser = async (id) => {
    await api.patch(`/super/users/${id}/promote`);
    loadUsers();
  };

  const banUser = async (id) => {
    await api.patch(`/super/users/${id}/ban`);
    loadUsers();
  };

  return (

    <div className="bg-white shadow rounded-lg overflow-x-auto">

      <table className="min-w-full text-sm">

        <thead className="bg-gray-100">

          <tr className="border-b">

            <th className="p-3">
              <input
                type="checkbox"
                onChange={(e) =>
                  setSelectedUsers(
                    e.target.checked
                      ? users.map((u) => u.id)
                      : []
                  )
                }
              />
            </th>

            <th className="p-3 text-left">Name</th>
            <th className="p-3 text-left">Email</th>
            <th className="p-3 text-left">Role</th>
            <th className="p-3 text-left">Active</th>
            <th className="p-3 text-left">Verified</th>
            <th className="p-3 text-left">Verified By</th>
            <th className="p-3 text-left">Work Count</th>
            <th className="p-3 text-left">Actions</th>

          </tr>

        </thead>

        <tbody>

          {users.map((u) => (

            <tr key={u.id} className="border-b hover:bg-gray-50">

              <td className="p-3">
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(u.id)}
                  onChange={(e) =>
                    setSelectedUsers((prev) =>
                      e.target.checked
                        ? [...prev, u.id]
                        : prev.filter((id) => id !== u.id)
                    )
                  }
                />
              </td>

              <td className="p-3">{u.full_name}</td>
              <td className="p-3">{u.email}</td>
              <td className="p-3 capitalize">{u.user_type}</td>

              <td className="p-3">
                {u.is_active ? "Active" : "Inactive"}
              </td>

              <td className="p-3">
                {u.identity_verified ? "Yes" : "No"}
              </td>

              <td className="p-3">
                {u.identity_verified_by_name || "-"}
              </td>

              <td className="p-3">
                {u.credentials_verified_count ?? 0}
              </td>

              <td className="p-3 space-x-2">

                {!u.identity_verified && (
                  <button
                    onClick={() => verifyIdentity(u.id)}
                    className="px-2 py-1 text-xs bg-green-600 text-white rounded"
                  >
                    Verify
                  </button>
                )}

                {!["admin", "super_admin"].includes(u.user_type) && (
                  <button
                    onClick={() => promoteUser(u.id)}
                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded"
                  >
                    Make Admin
                  </button>
                )}

                {u.user_type !== "super_admin" && (
                  <button
                    onClick={() => banUser(u.id)}
                    className="px-2 py-1 text-xs bg-red-600 text-white rounded"
                  >
                    Ban
                  </button>
                )}

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  );
}