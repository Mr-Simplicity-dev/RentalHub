const UsersTab = ({
  users,
  selectedUsers,
  setSelectedUsers,
  bulkUsers,
  verifyIdentity,
  promoteUser,
  banUser,
}) => {
  return (
    <>
      {selectedUsers.length > 0 && (
        <div className="mb-3 flex gap-2">
          <button onClick={() => bulkUsers("ban")} className="btn btn-sm btn-danger">
            Ban Selected
          </button>

          <button onClick={() => bulkUsers("verify")} className="btn btn-sm">
            Verify Selected
          </button>

          <button onClick={() => bulkUsers("promote")} className="btn btn-sm">
            Make Admin
          </button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th></th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Active</th>
              <th>Verified</th>
              <th>Verified By</th>
              <th>Work Count</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b">
                <td>
                  <input
                    type="checkbox"
                    disabled={u.user_type === "super_admin"}
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

                <td>{u.full_name}</td>
                <td>{u.email}</td>
                <td className="capitalize">{u.user_type}</td>
                <td>{u.is_active ? "Active" : "Inactive"}</td>
                <td>{u.identity_verified ? "Yes" : "No"}</td>
                <td>{u.identity_verified_by_name || "-"}</td>
                <td>{u.credentials_verified_count ?? 0}</td>

                <td className="space-x-2">
                  {!u.identity_verified && u.user_type !== "super_admin" && (
                    <button onClick={() => verifyIdentity(u.id)} className="btn btn-xs">
                      Verify
                    </button>
                  )}

                  {!["admin", "super_admin"].includes(u.user_type) && (
                    <button onClick={() => promoteUser(u.id)} className="btn btn-xs">
                      Make Admin
                    </button>
                  )}

                  {u.user_type !== "super_admin" && (
                    <button onClick={() => banUser(u.id)} className="btn btn-xs btn-danger">
                      Ban
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default UsersTab;