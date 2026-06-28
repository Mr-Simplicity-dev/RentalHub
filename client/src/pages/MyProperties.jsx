import React, { useCallback, useEffect, useState } from 'react';
import { FaGavel } from 'react-icons/fa';
import { propertyService } from '../services/propertyService';
import Loader from '../components/common/Loader';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../hooks/useAuth';
import BackToDashboard from '../components/common/BackToDashboard';
import { useTranslation } from 'react-i18next';
import AppealModal from '../components/common/AppealModal';

const MyProperties = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [appealProperty, setAppealProperty] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await propertyService.getMyProperties();
      if (res.success) setItems(res.data);
    } catch {
      toast.error(t('my_properties.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Loader />;

  const isAgent = user?.user_type === 'agent';

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold">
          {isAgent ? t('my_properties.managed_title') : t('my_properties.title')}
        </h1>
        <div className="flex flex-col gap-2 sm:flex-row">
          <BackToDashboard />
          <Link to="/add-property" className="btn btn-primary">{t('my_properties.add_property')}</Link>
        </div>
      </div>

      <div className="space-y-4">
        {items.map(p => {
          const isRejected = p.status === 'rejected';
          return (
            <div key={p.id} className="card flex flex-wrap justify-between items-center gap-3">
              <div>
                <div className="font-semibold">{p.title}</div>
                <div className="text-sm text-gray-600">{p.city}, {p.state_name}</div>
                {isRejected && p.rejection_reason && (
                  <p className="mt-1 text-xs text-red-600">Reason: {p.rejection_reason}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm capitalize ${isRejected ? 'text-red-600 font-medium' : ''}`}>
                  {isRejected
                    ? 'Rejected'
                    : p.is_verified
                      ? (p.is_available ? t('my_properties.available') : t('my_properties.unavailable'))
                      : t('my_properties.pending_verification')}
                </span>
                {isRejected && (
                  <button
                    onClick={() => setAppealProperty(p)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
                  >
                    <FaGavel size={11} /> Appeal
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="card text-center py-10 text-gray-500">
            {isAgent
              ? t('my_properties.empty_agent')
              : t('my_properties.empty')}
          </div>
        )}
      </div>

      {appealProperty && (
        <AppealModal
          appealType="property"
          targetId={appealProperty.id}
          onClose={() => setAppealProperty(null)}
          onSuccess={() => load()}
        />
      )}
    </div>
  );
};

export default MyProperties;
