import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { applicationService } from '../services/applicationService';
import Loader from '../components/common/Loader';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';

const Applications = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    setLoading(true);
    try {
      const res =
        user?.user_type === 'tenant'
          ? await applicationService.getMyApplications()
          : await applicationService.getReceivedApplications();

      if (res.success) {
        setApps(res.data);
      }
    } catch (err) {
      toast.error(t('applications.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">
        {user?.user_type === 'tenant'
          ? t('applications.my_title')
          : t('applications.landlord_title')}
      </h1>

      <div className="space-y-4">
        {apps.map((a) => (
          <div key={a.id} className="card">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-semibold">{a.property_title}</div>
                <div className="text-sm text-gray-600">
                  {user?.user_type === 'tenant'
                    ? `${t('applications.landlord')}: ${a.landlord_name}`
                    : `${t('applications.tenant')}: ${a.tenant_name}`}
                </div>
              </div>
              <span
                className={`px-2 py-1 rounded-full text-xs font-semibold ${
                  a.status === 'approved'
                    ? 'bg-green-100 text-green-700'
                    : a.status === 'rejected'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}
              >
                {t(`applications.status.${a.status}`)}
              </span>
            </div>

            {a.message && (
              <p className="text-sm text-gray-700 mt-3 border-t pt-3">
                {a.message}
              </p>
            )}
          </div>
        ))}

        {apps.length === 0 && (
          <div className="card text-center py-10 text-gray-500">
            {t('applications.none')}
          </div>
        )}
      </div>
    </div>
  );
};

export default Applications;
