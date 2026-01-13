import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import Loader from '../../components/common/Loader';
import { FaHome } from 'react-icons/fa';

const AdminProperties = () => {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProperties();
  }, []);

  const loadProperties = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/properties');
      if (res.data?.success) {
        setProperties(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load properties:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loader fullScreen />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All Properties</h1>
        <p className="text-gray-600">Monitor and moderate listed properties</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-3 px-4">Title</th>
              <th className="py-3 px-4">Owner</th>
              <th className="py-3 px-4">Location</th>
              <th className="py-3 px-4">Rent</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4 font-medium flex items-center">
                  <FaHome className="mr-2 text-primary-600" />
                  {p.title}
                </td>
                <td className="py-3 px-4">{p.landlord_name}</td>
                <td className="py-3 px-4">
                  {p.city}, {p.state_name}
                </td>
                <td className="py-3 px-4">
                  ₦{Number(p.rent_amount).toLocaleString()}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      p.status === 'available'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-gray-500">
                  {new Date(p.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}

            {properties.length === 0 && (
              <tr>
                <td colSpan="6" className="py-8 text-center text-gray-500">
                  No properties found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminProperties;
