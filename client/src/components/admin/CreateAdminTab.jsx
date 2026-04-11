import React, { useEffect, useMemo, useState } from "react";
import api from "../../services/api";

const NIGERIAN_STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta',
  'Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi',
  'Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto',
  'Taraba','Yobe','Zamfara'
];

const STATE_BOUND_ROLES = new Set([
  'admin',
  'state_admin',
  'state_financial_admin',
  'state_support_admin',
  'state_lawyer',
  'lawyer',
]);

const LAWYER_ROLES = new Set([
  'lawyer',
  'state_lawyer',
  'super_lawyer',
]);

const CreateAdminTab = () => {
  const [formData, setFormData] = useState({
    email: "",
    phone: "",
    full_name: "",
    nin: "",
    password: "",
    user_type: "state_admin",
    assigned_state: "",
    assigned_city: "",
    lawyer_client_scope: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [locationOptions, setLocationOptions] = useState([]);

  useEffect(() => {
    let active = true;

    const loadLocationOptions = async () => {
      try {
        const response = await api.get('/property-utils/location-options');
        if (active && response.data?.success) {
          setLocationOptions(response.data.data || []);
        }
      } catch (error) {
        console.error('Failed to load location options', error);
        if (active) {
          setLocationOptions([]);
        }
      }
    };

    loadLocationOptions();

    return () => {
      active = false;
    };
  }, []);

  const availableStates = useMemo(() => {
    if (locationOptions.length > 0) {
      return locationOptions
        .map((item) => item.state_name)
        .filter(Boolean);
    }

    return NIGERIAN_STATES;
  }, [locationOptions]);

  const selectedStateOption = useMemo(() => {
    const selectedState = String(formData.assigned_state || '').trim().toLowerCase();
    return locationOptions.find(
      (state) => String(state.state_name || '').trim().toLowerCase() === selectedState
    );
  }, [locationOptions, formData.assigned_state]);

  const availableLgas = selectedStateOption?.lgas || [];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
      ...(name === 'assigned_state' ? { assigned_city: '' } : {})
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      setMessage("");

      await api.post(
        "/admin/create-admin",
        {
          ...formData,
          assigned_state: STATE_BOUND_ROLES.has(formData.user_type)
            ? formData.assigned_state
            : null,
          assigned_city: formData.user_type === 'admin'
            ? String(formData.assigned_city || '').trim()
            : null,
          lawyer_client_scope: LAWYER_ROLES.has(formData.user_type)
            ? formData.lawyer_client_scope
            : null,
        }
      );

      setMessage("✅ Admin created successfully");

      setFormData({
        email: "",
        phone: "",
        full_name: "",
        nin: "",
        password: "",
        user_type: "state_admin",
        assigned_state: "",
        assigned_city: "",
        lawyer_client_scope: "",
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

      <p className="mb-3 text-sm text-gray-600">
        Admin requires state and local government. State roles require selecting assigned state.
      </p>

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
          <option value="state_admin">State Admin</option>
          <option value="state_financial_admin">State Financial Admin</option>
          <option value="state_support_admin">State Support Admin</option>
          <option value="state_lawyer">State Lawyer Admin</option>
          <option value="super_financial_admin">Super Financial Admin</option>
          <option value="super_support_admin">Super Support Admin</option>
          <option value="super_lawyer">Super Lawyer Admin</option>
          <option value="lawyer">Lawyer</option>
        </select>
                                                                                                                                                                     
        {STATE_BOUND_ROLES.has(formData.user_type) && (
          <>
            <select
              name="assigned_state"
              value={formData.assigned_state}
              onChange={handleChange}
              required
            >
              <option value="">Select Assigned State</option>
              {availableStates.map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>

            {formData.user_type === 'admin' && (
              <select
                name="assigned_city"
                value={formData.assigned_city}
                onChange={handleChange}
                disabled={!formData.assigned_state}
                required
              >
                <option value="">Select Assigned Local Government</option>
                {availableLgas.map((lga) => (
                  <option key={lga} value={lga}>{lga}</option>
                ))}
              </select>
            )}
          </>
        )}

        {LAWYER_ROLES.has(formData.user_type) && (
          <select
            name="lawyer_client_scope"
            value={formData.lawyer_client_scope}
            onChange={handleChange}
            required
          >
            <option value="">Lawyer For Which Client Type?</option>
            <option value="tenant">Tenant Lawyer</option>
            <option value="landlord">Landlord Lawyer</option>
          </select>
        )}

        <button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Admin"}
        </button>

      </form>
    </div>
  );
};

export default CreateAdminTab;
