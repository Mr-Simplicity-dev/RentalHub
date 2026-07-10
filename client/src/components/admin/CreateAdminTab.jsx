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
  'lga_admin',
  'lga_support_admin',
  'lga_financial_admin',
  'lawyer',
  'lga_transportation_admin',
  'lga_fumigation_admin',
  'state_admin',
  'state_financial_admin',
  'state_support_admin',
  'state_lawyer',
  'state_transportation_admin',
  'state_fumigation_admin',
]);

const SUPPORT_ROLES = new Set([
  'lga_support_admin',
  'state_support_admin',
  'super_support_admin',
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
    is_lead: false,
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

      const response = await api.post(
        "/admin/create-admin",
        {
          ...formData,
          assigned_state: STATE_BOUND_ROLES.has(formData.user_type)
            ? formData.assigned_state
            : null,
          assigned_city: ['admin', 'lga_admin', 'lga_support_admin', 'lga_financial_admin', 'lawyer', 'lga_transportation_admin', 'lga_fumigation_admin'].includes(formData.user_type)
            ? String(formData.assigned_city || '').trim()
            : null,
          lawyer_client_scope: LAWYER_ROLES.has(formData.user_type)
            ? formData.lawyer_client_scope
            : null,
          is_lead: SUPPORT_ROLES.has(formData.user_type) ? formData.is_lead : false,
        }
      );

      const createdRoleLabel = String(formData.user_type || '')
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

      setMessage(`Success: ${response.data?.message || `${createdRoleLabel} created successfully`}`);

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
        err.response?.data?.message || "Failed to create admin"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-card">
      <h2>Create Admin</h2>

      <p className="mb-3 text-sm text-gray-600">
        LGA roles require state and local government. State roles require selecting assigned state.
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
          <optgroup label="Operations">
            <option value="admin">LGA Admin</option>
            <option value="state_admin">State Admin</option>
          </optgroup>
          <optgroup label="Support">
            <option value="lga_support_admin">LGA Support Admin</option>
            <option value="state_support_admin">State Support Admin</option>
            <option value="super_support_admin">Super Support Admin</option>
          </optgroup>
          <optgroup label="Recruitment">
            <option value="recruitment_admin">Recruitment Admin</option>
          </optgroup>
          <optgroup label="Finance">
            <option value="lga_financial_admin">LGA Financial Admin</option>
            <option value="state_financial_admin">State Financial Admin</option>
            <option value="super_financial_admin">Super Financial Admin</option>
          </optgroup>
          <optgroup label="Legal">
            <option value="lawyer">LGA Lawyer</option>
            <option value="state_lawyer">State Lawyer</option>
            <option value="super_lawyer">Super Lawyer</option>
          </optgroup>
          <optgroup label="Transportation">
            <option value="lga_transportation_admin">LGA Transportation Admin</option>
            <option value="state_transportation_admin">State Transportation Admin</option>
            <option value="super_transportation_admin">Super Transportation Admin</option>
          </optgroup>
          <optgroup label="Fumigation">
            <option value="lga_fumigation_admin">LGA Fumigation Admin</option>
            <option value="state_fumigation_admin">State Fumigation Admin</option>
            <option value="super_fumigation_admin">Super Fumigation Admin</option>
          </optgroup>
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

            {['admin', 'lga_admin', 'lga_support_admin', 'lga_financial_admin', 'lawyer', 'lga_transportation_admin', 'lga_fumigation_admin'].includes(formData.user_type) && (
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

            {SUPPORT_ROLES.has(formData.user_type) && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  name="is_lead"
                  checked={formData.is_lead}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_lead: e.target.checked }))}
                  className="w-4 h-4"
                />
                Mark as Lead Admin (first point of contact for this location)
              </label>
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
