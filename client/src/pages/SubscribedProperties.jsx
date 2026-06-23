import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FaHome, FaCheckCircle, FaTimesCircle, FaClock, FaExternalLinkAlt, FaKey } from 'react-icons/fa';
import Loader from '../components/common/Loader';

const SubscribedProperties = () => {
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statusRes, propsRes] = await Promise.all([
          api.get('/payments/subscription-status'),
          api.get('/payments/my-unlocked-properties'),
        ]);
        setSubscription(statusRes.data?.data?.multiple_property || null);
        setProperties(propsRes.data?.data || []);
      } catch (err) {
        toast.error('Failed to load subscription data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <Loader />;

  const isActive = subscription?.active;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Subscribed Properties</h1>
            <p className="mt-2 text-sm text-gray-600">
              Properties you have unlocked access to
            </p>
          </div>
        </div>

        <div className={`rounded-3xl p-6 shadow-sm ${isActive ? 'bg-green-50 border border-green-200' : 'bg-gray-100 border border-gray-200'}`}>
          <div className="flex flex-wrap items-center gap-4">
            <div className={`rounded-full p-3 ${isActive ? 'bg-green-200 text-green-700' : 'bg-gray-300 text-gray-600'}`}>
              {isActive ? <FaCheckCircle className="text-2xl" /> : <FaTimesCircle className="text-2xl" />}
            </div>
            <div className="flex-1">
              <p className={`text-lg font-semibold ${isActive ? 'text-green-900' : 'text-gray-700'}`}>
                {isActive ? 'Subscription Active' : 'No Active Subscription'}
              </p>
              {isActive && subscription.expires_at && (
                <p className="mt-1 text-sm text-green-700">
                  <FaClock className="mr-1 inline-block" />
                  Expires {new Date(subscription.expires_at).toLocaleDateString()}
                </p>
              )}
              {!isActive && (
                <p className="mt-1 text-sm text-gray-600">
                  Subscribe to unlock access to multiple properties
                </p>
              )}
            </div>
            <button
              onClick={() => navigate('/subscribe')}
              className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-medium text-white"
            >
              {isActive ? 'Renew' : 'Subscribe'}
            </button>
          </div>
        </div>

        {properties.length === 0 ? (
          <div className="rounded-3xl bg-white p-12 text-center shadow-sm">
            <FaKey className="mx-auto text-5xl text-gray-300" />
            <h3 className="mt-4 text-xl font-semibold text-gray-900">No unlocked properties</h3>
            <p className="mt-2 text-sm text-gray-600">
              Unlock a property to view its full details and photos
            </p>
            <button
              onClick={() => navigate('/properties')}
              className="mt-4 rounded-full bg-primary-600 px-5 py-2.5 text-sm font-medium text-white"
            >
              Browse Properties
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {properties.map((prop) => (
              <div
                key={prop.id}
                onClick={() => navigate(`/properties/${prop.property_id}`)}
                className="cursor-pointer rounded-3xl bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {prop.property_title || `Property #${prop.property_id}`}
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">
                      {[prop.city, prop.state].filter(Boolean).join(', ') || prop.full_address || '-'}
                    </p>
                  </div>
                  <FaHome className="shrink-0 text-2xl text-primary-600" />
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                  {prop.bedrooms && <span>{prop.bedrooms} bed</span>}
                  {prop.bathrooms && <span>{prop.bathrooms} bath</span>}
                  {prop.price && (
                    <span className="font-semibold text-gray-700">
                      ₦{Number(prop.price).toLocaleString()}{prop.price_frequency ? `/${prop.price_frequency}` : ''}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-xs text-gray-400">
                  Unlocked {new Date(prop.unlocked_at).toLocaleDateString()}
                </p>
                <div className="mt-3 flex items-center gap-1 text-xs text-primary-600">
                  <FaExternalLinkAlt />
                  View details
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscribedProperties;
