import React, { useEffect, useState } from 'react';
import { propertyService } from '../services/propertyService';
import Loader from '../components/common/Loader';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../hooks/useAuth';
import BackToDashboard from '../components/common/BackToDashboard';
import { useTranslation } from 'react-i18next';

const MyProperties = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await propertyService.getMyProperties();
      if (res.success) setItems(res.data);
    } catch {
      toast.error(t('my_properties.load_failed'));
    } finally {
      setLoading(false);
    }
  };

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
        {items.map(p => (
          <div key={p.id} className="card flex justify-between items-center">
            <div>
              <div className="font-semibold">{p.title}</div>
              <div className="text-sm text-gray-600">{p.city}, {p.state_name}</div>
            </div>
            <span className="text-sm capitalize">
              {p.is_verified
                ? (p.is_available ? t('my_properties.available') : t('my_properties.unavailable'))
                : t('my_properties.pending_verification')}
            </span>
          </div>
        ))}
        {items.length === 0 && (
          <div className="card text-center py-10 text-gray-500">
            {isAgent
              ? t('my_properties.empty_agent')
              : t('my_properties.empty')}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyProperties;
