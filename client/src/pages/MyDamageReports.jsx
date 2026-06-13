import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FaTools, FaSearch, FaCheckCircle, FaClock, FaExclamationTriangle, FaHome } from 'react-icons/fa';
import Loader from '../components/common/Loader';

const SEVERITY_COLORS = {
  minor: 'bg-green-100 text-green-800 border-green-200',
  moderate: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  severe: 'bg-red-100 text-red-800 border-red-200',
};

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600 border-gray-200',
  published: 'bg-green-100 text-green-800 border-green-200',
};

const MyDamageReports = () => {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await api.get('/damage-reports/my');
      setReports(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load damage reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const filtered = reports.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (r.property_title || '').toLowerCase().includes(q) ||
      (r.damage_type || '').toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q) ||
      (r.room_location || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Damage Reports</h1>
            <p className="mt-2 text-sm text-gray-600">
              {user?.user_type === 'landlord'
                ? 'Damage reports submitted for your properties'
                : 'Published damage reports for properties you rent'}
            </p>
          </div>
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reports..."
              className="w-64 rounded-xl border border-gray-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary-600"
            />
          </div>
        </div>

        {loading ? (
          <Loader />
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl bg-white p-12 text-center shadow-sm">
            <FaTools className="mx-auto text-5xl text-gray-300" />
            <h3 className="mt-4 text-xl font-semibold text-gray-900">No damage reports found</h3>
            <p className="mt-2 text-sm text-gray-600">
              {search ? 'Try adjusting your search' : 'No damage reports available yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((report) => (
              <div key={report.id} className="rounded-3xl bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {report.report_title || `${report.damage_type?.replace(/_/g, ' ')} in ${report.room_location || 'Unknown'}`}
                      </h3>
                      <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${SEVERITY_COLORS[report.severity] || 'bg-gray-100 text-gray-700'}`}>
                        {report.severity}
                      </span>
                      <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${STATUS_COLORS[report.status] || ''}`}>
                        {report.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">{report.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-500">
                      <span>
                        <FaHome className="mr-1 inline-block" />
                        {report.property_title || '-'}
                      </span>
                      <span>Location: {report.room_location || '-'}</span>
                      <span>Type: {report.damage_type?.replace(/_/g, ' ') || '-'}</span>
                      {report.depth_level && <span>Depth: {report.depth_level}</span>}
                      {report.created_at && (
                        <span>{new Date(report.created_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  <FaTools className="mt-1 text-2xl text-primary-600 shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyDamageReports;
