import React, { useEffect, useState } from "react";
import axios from "axios";

const AdminListTab = () => {

  const [admins, setAdmins] = useState([]);

  const fetchAdmins = async () => {

    try {

      const token = localStorage.getItem("token");

      const res = await axios.get(
        "/api/admin/admins",
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setAdmins(res.data);

    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const suspendAdmin = async (id) => {

    const token = localStorage.getItem("token");

    await axios.put(
      `/api/admin/suspend/${id}`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    fetchAdmins();
  };

  const deleteAdmin = async (id) => {

    const token = localStorage.getItem("token");

    await axios.delete(
      `/api/admin/${id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    fetchAdmins();
  };

  return (
    <div>

      <h3>Admins</h3>

      <table border="1" width="100%">

        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>

          {admins.map(admin => (

            <tr key={admin.id}>

              <td>{admin.full_name}</td>
              <td>{admin.email}</td>
              <td>{admin.user_type}</td>

              <td>

                <button onClick={() => suspendAdmin(admin.id)}>
                  Suspend
                </button>

                <button onClick={() => deleteAdmin(admin.id)}>
                  Delete
                </button>

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>
  );
};

export default AdminListTab;