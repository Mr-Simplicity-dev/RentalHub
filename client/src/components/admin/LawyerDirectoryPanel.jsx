import { useEffect, useState } from 'react';
import { FaGavel, FaUserTie, FaCheckCircle, FaHourglassHalf } from 'react-icons/fa';
import api from '../../services/api';
import { toast } from 'react-toastify';

const tierLabel = (userType) => {
  if (userType === 'super_lawyer') return 'National';
  if (userType === 'zonal_lawyer') return 'Zonal';
  if (userType === 'state_lawyer') return 'State';
  return 'LGA';
};

const LawyerDirectoryPanel = () => {
  const [lawyers, setLawyers] = useState([]);
  const [scope, setScope] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/legal/lawyer-directory');
      setLawyers(res.data?.data || []);
      setScope(res.data?.scope || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load lawyer directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Lawyer Directory</h2>
          <p className="text-sm text-gray-500">Internal roster of legal professionals and their assigned cases.</p>
        </div>
        <button onClick={load} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Refresh
        </button>
      </div>

      {scope && (
        <div className="mt-3 inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 capitalize">
          Scope: {scope.level}
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Loading…</p>
      ) : lawyers.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">No lawyers found in your jurisdiction.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {lawyers.map((lawyer) => (
            <div key={lawyer.id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                  <FaUserTie />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{lawyer.full_name}</p>
                  <p className="text-xs text-gray-500">
                    {[tierLabel(lawyer.user_type), lawyer.assigned_state, lawyer.assigned_city, lawyer.assigned_zone].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">{tierLabel(lawyer.user_type)}</span>
              </div>

              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cases ({lawyer.cases?.length || 0})</p>
                {lawyer.cases?.length ? (
                  <div className="mt-2 space-y-2">
                    {lawyer.cases.map((c) => (
                      <div key={c.dispute_id || Math.random()} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                        {c.status === 'resolved' ? (
                          <FaCheckCircle className="text-green-500" />
                        ) : (
                          <FaHourglassHalf className="text-amber-500" />
                        )}
                        <span className="flex-1 text-gray-700">{c.title || `Case #${c.dispute_id}`}</span>
                        <span className="text-xs capitalize text-gray-500">{c.status || 'active'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">No assigned cases.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LawyerDirectoryPanel;
