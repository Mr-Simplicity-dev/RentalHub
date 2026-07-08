import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FaTools, FaSearch, FaCheckCircle, FaClock, FaExclamationTriangle, FaHome } from 'react-icons/fa';
import Loader from '../components/common/Loader';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
      toast.error(t('my_damage_reports.load_failed'));
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
            <h1 className="text-3xl font-bold text-gray-900">{t('my_damage_reports.title')}</h1>
            <p className="mt-2 text-sm text-gray-600">
              {user?.user_type === 'landlord'
                ? t('my_damage_reports.landlord_desc')
                : t('my_damage_reports.tenant_desc')}
            </p>
          </div>
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('my_damage_reports.search_placeholder')}
              className="w-64 rounded-xl border border-gray-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary-600"
            />
          </div>
        </div>

        {loading ? (
          <Loader />
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl bg-white p-12 text-center shadow-sm">
            <FaTools className="mx-auto text-5xl text-gray-300" />
            <h3 className="mt-4 text-xl font-semibold text-gray-900">{t('my_damage_reports.no_reports_title')}</h3>
            <p className="mt-2 text-sm text-gray-600">
              {search ? t('my_damage_reports.no_reports_search') : t('my_damage_reports.no_reports_default')}
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
                        {report.report_title || `${report.damage_type?.replace(/_/g, ' ')} in ${report.room_location || t('my_damage_reports.unknown')}`}
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
                      <span>{t('my_damage_reports.location')}: {report.room_location || '-'}</span>
                      <span>{t('my_damage_reports.type')}: {report.damage_type?.replace(/_/g, ' ') || '-'}</span>
                      {report.depth_level && <span>{t('my_damage_reports.depth')}: {report.depth_level}</span>}
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
