import React, { useEffect, useState } from "react";
import api from "../../services/api";

export default function UsersTab() {

  const [users, setUsers] = useState([]);

  useEffect(() => {

    loadUsers();

  }, []);

  const loadUsers = async () => {

    try {

      const res = await api.get("/super/users");

      setUsers(res.data.users || []);

    } catch (err) {

      console.error(err);

    }

  };

  return (

    <div className="card overflow-x-auto">

      <table className="w-full text-sm">

        <thead>

          <tr className="border-b">

            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>

          </tr>

        </thead>

        <tbody>

          {users.map((u) => (

            <tr key={u.id} className="border-b">

              <td>{u.full_name}</td>
              <td>{u.email}</td>
              <td>{u.user_type}</td>
              <td>{u.is_active ? "Active" : "Inactive"}</td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  );
}