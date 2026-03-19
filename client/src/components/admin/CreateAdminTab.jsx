import React, { useState } from "react";
import axios from "axios";

const CreateAdminTab = () => {
  const [formData, setFormData] = useState({
    email: "",
    phone: "",
    full_name: "",
    nin: "",
    password: "",
    user_type: "admin"
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      setMessage("");

      const token = localStorage.getItem("token");

      await axios.post(
        "/api/admin/create-admin",
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setMessage("✅ Admin created successfully");

      setFormData({
        email: "",
        phone: "",
        full_name: "",
        nin: "",
        password: "",
        user_type: "admin"
      });

    } catch (err) {
      setMessage(
        err.response?.data?.message || "❌ Failed to create admin"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-card">
      <h2>Create Admin</h2>

      {message && <p>{message}</p>}

      <form onSubmit={handleSubmit}>

        <input
          type="text"
          name="full_name"
          placeholder="Full Name"
          value={formData.full_name}
          onChange={handleChange}
          required
        />

        <input
          type="email"
          name="email"
          placeholder="Email"
          value={formData.email}
          onChange={handleChange}
          required
        />

        <input
          type="text"
          name="phone"
          placeholder="Phone"
          value={formData.phone}
          onChange={handleChange}
          required
        />

        <input
          type="text"
          name="nin"
          placeholder="NIN"
          value={formData.nin}
          onChange={handleChange}
          required
        />

        <input
          type="password"
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          required
        />

        <select
          name="user_type"
          value={formData.user_type}
          onChange={handleChange}
        >
          <option value="admin">Admin</option>
          <option value="verification_admin">Verification Admin</option>
          <option value="support_admin">Support Admin</option>
          <option value="finance_admin">Finance Admin</option>
          <option value="moderator">Moderator</option>
        </select>

        <button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Admin"}
        </button>

      </form>
    </div>
  );
};

export default CreateAdminTab;
