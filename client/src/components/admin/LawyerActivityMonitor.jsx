import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';

const TIME_RANGE_OPTIONS = [
  { value: '24h', label: '24 Hours' },
  { value: '7days', label: '7 Days' },
  { value: '30days', label: '30 Days' },
  { value: '90days', label: '90 Days' },
  { value: 'all', label: 'All Time' },
];

const formatDateTime = (value) => {
  if (!value) return 'No activity yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No activity yet';
  return date.toLocaleString();
};

const formatResponseTime = (minutes) => {
  if (!Number.isFinite(minutes) || minutes < 0) return 'N/A';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
};

const getActivityLevel = (lawyer) => {
  const total =
    Number(lawyer.total_verifications || 0) +
    Number(lawyer.total_resolutions || 0) +
    Number(lawyer.total_case_notes || 0);

  if (total >= 20) {
    return {
      label: 'High',
      className: 'bg-green-100 text-green-700',
    };
  }

  if (total >= 5) {
    return {
      label: 'Medium',
      className: 'bg-amber-100 text-amber-700',
    };
  }

  return {
    label: 'Low',
    className: 'bg-gray-100 text-gray-700',
  };
};

const StatCard = ({ label, value, helper }) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
      {label}
    </p>
    <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
    {helper ? <p className="mt-2 text-sm text-gray-500">{helper}</p> : null}
  </div>
);

const LawyerActivityMonitor = () => {
  const [lawyers, setLawyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7days');
  const [stats, setStats] = useState({
    totalLawyers: 0,
    activeLawyers: 0,
    totalVerifications: 0,
    totalResolutions: 0,
    avgResponseTime: 0,
  });

  useEffect(() => {
    let ignore = false;

    const loadLawyerActivities = async () => {
      try {
        setLoading(true);
        const res = await api.get('/super/lawyer-activities', {
          params: { time_range: timeRange },
        });

        if (!ignore && res.data.success) {
          setLawyers(res.data.data?.lawyers || []);
          setStats(
            res.data.data?.stats || {
              totalLawyers: 0,
              activeLawyers: 0,
              totalVerifications: 0,
              totalResolutions: 0,
              avgResponseTime: 0,
            }
          );
        }
      } catch (error) {
        if (!ignore) {
          toast.error('Failed to load lawyer activities');
          console.error('Lawyer activities error:', error);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadLawyerActivities();

    return () => {
      ignore = true;
    };
  }, [timeRange]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Lawyer Activity Monitor
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Review verification work, dispute resolutions, case notes, and recent
            lawyer responsiveness.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600" htmlFor="lawyer-activity-range">
            Time Range
          </label>
          <select
            id="lawyer-activity-range"
            value={timeRange}
            onChange={(event) => setTimeRange(event.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
          >
            {TIME_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total Lawyers"
          value={stats.totalLawyers || 0}
          helper="Registered lawyer accounts"
        />
        <StatCard
          label="Active Lawyers"
          value={stats.activeLawyers || 0}
          helper="Lawyers with recent actions"
        />
        <StatCard
          label="Evidence Verifications"
          value={stats.totalVerifications || 0}
          helper="Checks completed in range"
        />
        <StatCard
          label="Resolved Disputes"
          value={stats.totalResolutions || 0}
          helper="Disputes closed in range"
        />
        <StatCard
          label="Avg Response"
          value={formatResponseTime(stats.avgResponseTime)}
          helper="From assignment to first action"
        />
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            Loading lawyer activity...
          </div>
        ) : lawyers.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            No lawyer activity records found for this range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">
                    Lawyer
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">
                    Activity
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">
                    Assignments
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">
                    Response
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">
                    Last Activity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lawyers.map((lawyer) => {
                  const activity = getActivityLevel(lawyer);

                  return (
                    <tr key={lawyer.id} className="align-top">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-gray-900">
                          {lawyer.full_name}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {lawyer.email}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {lawyer.chamber_name || 'No chamber name'}
                        </div>
                        <div className="mt-2">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${activity.className}`}
                          >
                            {activity.label} Activity
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        <div>Verifications: {lawyer.total_verifications || 0}</div>
                        <div className="mt-1">
                          Resolutions: {lawyer.total_resolutions || 0}
                        </div>
                        <div className="mt-1">
                          Case notes: {lawyer.total_case_notes || 0}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        <div>
                          Active authorizations: {lawyer.active_authorizations || 0}
                        </div>
                        <div className="mt-1">
                          Active disputes: {lawyer.active_disputes || 0}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Identity verified:{' '}
                          {lawyer.identity_verified ? 'Yes' : 'No'}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {formatResponseTime(lawyer.avg_response_minutes)}
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {formatDateTime(lawyer.last_activity_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default LawyerActivityMonitor;
