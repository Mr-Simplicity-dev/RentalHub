import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import Loader from '../../components/common/Loader';
import { FaFileAlt } from 'react-icons/fa';

const AdminApplications = () => {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/applications');
      if (res.data?.success) {
        setApps(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load applications:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loader fullScreen />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
        <p className="text-gray-600">All rental applications on the platform</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-3 px-4">Tenant</th>
              <th className="py-3 px-4">Property</th>
              <th className="py-3 px-4">Landlord</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Date</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4 font-medium">{a.tenant_name}</td>
                <td className="py-3 px-4 flex items-center">
                  <FaFileAlt className="mr-2 text-primary-600" />
                  {a.property_title}
                </td>
                <td className="py-3 px-4">{a.landlord_name}</td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      a.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : a.status === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {a.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-gray-500">
                  {new Date(a.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}

            {apps.length === 0 && (
              <tr>
                <td colSpan="5" className="py-8 text-center text-gray-500">
                  No applications found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminApplications;
