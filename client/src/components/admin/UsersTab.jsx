import React from "react";

const UsersTab = ({
  users,
  selectedUsers,
  setSelectedUsers,
  bulkUsers,
  verifyIdentity,
  promoteUser,
  banUser,
  unbanUser,
  deleteUser,
}) => {
  const visibleUsers = users.filter((u) =>
    ["tenant", "landlord"].includes(u.user_type)
  );

  const toggleUser = (id) => {
    setSelectedUsers((prev) =>
      prev.includes(id)
        ? prev.filter((i) => i !== id)
        : [...prev, id]
    );
  };

  const toggleAll = (checked) => {
    if (checked) {
      const ids = visibleUsers
        .map((u) => u.id);

      setSelectedUsers(ids);
    } else {
      setSelectedUsers([]);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* BULK ACTION BAR */}

      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3 rounded-xl2 border border-soft bg-white p-3 shadow-card transition hover:shadow-cardHover">

          <span className="text-sm text-gray-600">
            {selectedUsers.length} selected
          </span>

          <button
            onClick={() => bulkUsers("ban")}
            className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white transition-colors hover:bg-red-700"
          >
            Ban
          </button>

          <button
            onClick={() => bulkUsers("verify")}
            className="rounded-lg bg-green-600 px-3 py-1 text-sm text-white transition-colors hover:bg-green-700"
          >
            Verify
          </button>

          <button
            onClick={() => bulkUsers("promote")}
            className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white transition-colors hover:bg-blue-700"
          >
            Make Admin
          </button>

        </div>
      )}

      {/* TABLE */}

      <div className="rounded-xl2 border border-soft bg-white shadow-card transition hover:shadow-cardHover overflow-x-auto">

        <table className="min-w-full text-sm">

          <thead className="bg-gray-50 text-gray-700">

            <tr>

              <th className="p-3 w-10">
                <input
                  type="checkbox"
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>

              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Role</th>
              <th className="p-3 text-left">Active</th>
              <th className="p-3 text-left">Verified</th>
              <th className="p-3 text-left">Verified By</th>
              <th className="p-3 text-left">Work Count</th>

              <th className="p-3 text-center w-56">
                Actions
              </th>

            </tr>

          </thead>

          <tbody>

            {visibleUsers.length === 0 && (
              <tr>
                <td
                  colSpan="9"
                  className="text-center py-10 text-gray-500"
                >
                  No users found
                </td>
              </tr>
            )}

            {visibleUsers.map((u) => (

              <tr
                key={u.id}
                className="border-t border-soft hover:bg-gray-50 transition"
              >

                <td className="p-3">
                  <input
                    type="checkbox"
                    disabled={u.user_type === "super_admin"}
                    checked={selectedUsers.includes(u.id)}
                    onChange={() => toggleUser(u.id)}
                  />
                </td>

                <td className="p-3 font-medium">
                  {u.full_name}
                </td>

                <td className="p-3 text-gray-600">
                  {u.email}
                </td>

                <td className="p-3 capitalize">
                  {u.user_type}
                </td>

                <td className="p-3">

                  <span
                    className={`px-2 py-1 text-xs rounded-full
                      ${
                        u.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-200 text-gray-600"
                      }`}
                  >
                    {u.is_active ? "Active" : "Inactive"}
                  </span>

                </td>

                <td className="p-3">

                  <span
                    className={`px-2 py-1 text-xs rounded-full
                      ${
                        u.identity_verified
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                  >
                    {u.identity_verified ? "Verified" : "Pending"}
                  </span>

                </td>

                <td className="p-3 text-gray-600">
                  {u.identity_verified_by_name || "-"}
                </td>

                <td className="p-3">
                  {u.credentials_verified_count ?? 0}
                </td>

                {/* ACTIONS */}

                <td className="p-3">

                  <div className="flex justify-center flex-wrap gap-2">

                    {!u.identity_verified &&
                      u.user_type !== "super_admin" && (
                        <button
                          onClick={() => verifyIdentity(u.id)}
                          className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white transition-colors hover:bg-green-700"
                        >
                          Verify
                        </button>
                      )}

                    {!["admin", "super_admin"].includes(
                      u.user_type
                    ) && (
                      <button
                        onClick={() => promoteUser(u.id)}
                        className="rounded-lg bg-blue-600 px-2 py-1 text-xs text-white transition-colors hover:bg-blue-700"
                      >
                        Promote
                      </button>
                    )}

                    {u.user_type !== "super_admin" && u.is_active && (
                      <button
                        onClick={() => banUser(u.id)}
                        className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white transition-colors hover:bg-red-700"
                      >
                        Ban
                      </button>
                    )}

                    {!u.is_active && u.user_type !== "super_admin" && (
                      <button
                        onClick={() => unbanUser(u.id)}
                        className="rounded-lg bg-indigo-600 px-2 py-1 text-xs text-white transition-colors hover:bg-indigo-700"
                      >
                        Unban
                      </button>
                    )}

                    {u.user_type !== "super_admin" && (
                      <button
                        onClick={() => deleteUser(u.id)}
                        className="rounded-lg bg-gray-700 px-2 py-1 text-xs text-white transition-colors hover:bg-gray-800"
                      >
                        Delete
                      </button>
                    )}

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

export default UsersTab;
