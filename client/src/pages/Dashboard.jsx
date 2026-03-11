import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  FaHome,
  FaEnvelope,
  FaFileAlt,
  FaHeart,
  FaCheckCircle,
  FaClock,
} from 'react-icons/fa';
import Loader from '../components/common/Loader';
import { getTimeAgo } from '../utils/helpers';
import { useTranslation } from 'react-i18next';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [stats, setStats] = useState(null);
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const hasSubmittedVerification = !!user?.passport_photo_url;

  const loadDashboardData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const endpoint =
        user.user_type === 'tenant'
          ? '/dashboard/tenant/stats'
          : '/dashboard/landlord/stats';

      const activitiesEndpoint =
        user.user_type === 'tenant'
          ? '/dashboard/tenant/recent-activities'
          : '/dashboard/landlord/recent-activities';

      const [statsResponse, activitiesResponse] = await Promise.all([
        api.get(endpoint),
        api.get(activitiesEndpoint),
      ]);

      if (statsResponse.data.success) {
        setStats(statsResponse.data.data);
      }

      if (activitiesResponse.data.success) {
        setRecentActivities(activitiesResponse.data.data);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    if (user.user_type === 'super_admin') {
      navigate('/super-admin', { replace: true });
      return;
    }

    loadDashboardData();
  }, [user, navigate, loadDashboardData]);

  const getTenantSubscriptionValue = () => {
    if (!stats?.subscription_expires_at) {
      return 'Inactive';
    }

    const expiresAt = new Date(stats.subscription_expires_at);

    if (Number.isNaN(expiresAt.getTime())) {
      return 'Inactive';
    }

    const now = new Date();

    if (expiresAt <= now) {
      return 'Expired';
    }

    const daysLeft = Math.max(
      1,
      Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    );

    return `${daysLeft}d left`;
  };

  if (!user) {
    return <Loader fullScreen />;
  }

  if (loading) {
    return <Loader fullScreen />;
  }

  return (
    <div className="bg-gray-50 min-h-screen py-8">
      <div className="container mx-auto px-4">
        {/* Welcome Section */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.full_name || 'User'}
          </h1>
          <p className="text-gray-600 mt-1">
            Manage your properties
          </p>
        </div>

                
                {/* Verification Alert */}
                {!user?.identity_verified && !hasSubmittedVerification && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6 text-center">

                    <div className="flex flex-col items-center">

                      <FaClock className="text-yellow-600 text-2xl mb-3" />

                      <h3 className="font-semibold text-yellow-800">
                        {t('dashboard.verify_title')}
                      </h3>

                      <p className="text-sm text-yellow-700 mt-2">
                        {t('dashboard.verify_text')}
                      </p>

                      <button
                        onClick={() => navigate('/profile')}
                        className="mt-3 text-sm font-semibold text-yellow-800 hover:text-yellow-900"
                      >
                        {t('dashboard.verify_action')} →
                      </button>

                    </div>

                  </div>
                )}

                {!user?.identity_verified && hasSubmittedVerification && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6 text-center">

                    <div className="flex flex-col items-center">

                      <FaClock className="text-blue-600 text-2xl mb-3" />

                      <h3 className="font-semibold text-blue-800">
                        Verification Submitted
                      </h3>

                      <p className="text-sm text-blue-700 mt-2">
                        Your passport was submitted. It is pending admin review.
                      </p>

                      <button
                        onClick={() => navigate('/profile')}
                        className="mt-3 text-sm font-semibold text-blue-800 hover:text-blue-900"
                      >
                        View Verification Status →
                      </button>

                    </div>

                  </div>
                )}
                        {/* Tenant Unlock Alert */}
        {user?.user_type === 'tenant' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6 text-center">

            <div className="flex flex-col items-center">

              <FaCheckCircle className="text-blue-600 text-2xl mb-3" />

              <h3 className="font-semibold text-blue-800">
                Pay Per Property Details
              </h3>

              <p className="text-sm text-blue-700 mt-2 text-center">
                Save properties first, then pay to unlock each property's full details and landlord contact.
              </p>

              <button
                onClick={() => navigate('/properties')}
                className="mt-4 btn btn-primary text-sm"
              >
                Browse Properties
              </button>

            </div>

          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {user?.user_type === 'tenant' ? (
            <>
              <StatCard
                icon={<FaHeart className="text-red-500" />}
                title="Saved Properties"
                value={stats?.saved_properties_count || 0}
                onClick={() => navigate('/saved-properties')}
              />
              <StatCard
                icon={<FaCheckCircle className="text-blue-500" />}
                title="Unlocked Details"
                value={stats?.unlocked_properties_count || 0}
                onClick={() => navigate('/properties')}
              />
              <StatCard
                icon={<FaEnvelope className="text-green-500" />}
                title="Unread Messages"
                value={stats?.unread_messages || 0}
                onClick={() => navigate('/messages')}
              />
              <StatCard
                icon={<FaClock className="text-yellow-500" />}
                title="Subscription"
                value={getTenantSubscriptionValue()}
                onClick={() => navigate('/subscribe')}
              />
            </>
          ) : (
            <>
              <StatCard
                icon={<FaHome className="text-blue-500" />}
                title={t('dashboard.total_props')}
                value={stats?.total_properties || 0}
                onClick={() => navigate('/my-properties')}
              />
              <StatCard
                icon={<FaCheckCircle className="text-green-500" />}
                title={t('dashboard.available_props')}
                value={stats?.available_properties || 0}
                onClick={() => navigate('/my-properties?status=available')}
              />
              <StatCard
                icon={<FaFileAlt className="text-yellow-500" />}
                title={t('dashboard.pending_apps')}
                value={stats?.pending_applications || 0}
                onClick={() => navigate('/applications?status=pending')}
              />
              <StatCard
                icon={<FaEnvelope className="text-purple-500" />}
                title={t('dashboard.unread')}
                value={stats?.unread_messages || 0}
                onClick={() => navigate('/messages')}
              />
            </>
          )}
        </div>

        {/* Recent Activities */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4 text-center">{t('dashboard.recent')}</h2>
          {recentActivities.length === 0 ? (
            <p className="text-gray-600 text-center py-8">
              {t('dashboard.no_recent')}
            </p>
          ) : (
            <div className="space-y-4">
              {recentActivities.map((activity, index) => (
                <ActivityItem key={index} activity={activity} />
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {user?.user_type === 'tenant' ? (
            <>
              <QuickActionCard
                title={t('dashboard.qa_browse')}
                description={t('dashboard.qa_browse_desc')}
                icon={<FaHome />}
                onClick={() => navigate('/properties')}
              />
              <QuickActionCard
                title="Saved Properties"
                description="Check properties you saved for shortlist"
                icon={<FaHeart />}
                onClick={() => navigate('/saved-properties')}
              />
              <QuickActionCard
                title="Payment History"
                description="Track your property detail unlock payments"
                icon={<FaFileAlt />}
                onClick={() => navigate('/profile')}
              />
            </>
          ) : (
            <>
              <QuickActionCard
                title={t('dashboard.qa_add')}
                description={t('dashboard.qa_add_desc')}
                icon={<FaHome />}
                onClick={() => navigate('/add-property')}
              />
              <QuickActionCard
                title={t('dashboard.qa_my_props')}
                description={t('dashboard.qa_my_props_desc')}
                icon={<FaHome />}
                onClick={() => navigate('/my-properties')}
              />
              <QuickActionCard
                title={t('dashboard.qa_apps_landlord')}
                description={t('dashboard.qa_apps_landlord_desc')}
                icon={<FaFileAlt />}
                onClick={() => navigate('/applications')}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard = ({ icon, title, value, onClick }) => (
  <div
    onClick={onClick}
    className="card cursor-pointer"
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-gray-600 text-sm mb-1">{title}</p>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
      </div>
      <div className="text-4xl">{icon}</div>
    </div>
  </div>
);

// Activity Item Component
const ActivityItem = ({ activity }) => {
  const { t } = useTranslation();

  const getActivityIcon = () => {
    switch (activity.type) {
      case 'application':
        return <FaFileAlt className="text-blue-500" />;
      case 'unlock':
        return <FaCheckCircle className="text-green-500" />;
      case 'message':
        return <FaEnvelope className="text-purple-500" />;
      case 'review':
        return <FaCheckCircle className="text-green-500" />;
      default:
        return <FaCheckCircle className="text-gray-500" />;
    }
  };

  const getActivityText = () => {
    switch (activity.type) {
      case 'application':
        return t('dashboard.activity_application', {
          status: activity.status,
          title: activity.property_title,
        });
      case 'unlock':
        return `You unlocked full details for ${activity.property_title}`;
      case 'message':
        return t('dashboard.activity_message', {
          name: activity.user_name || t('dashboard.user'),
        });
      case 'review':
        return t('dashboard.activity_review', {
          stars: activity.status,
          title: activity.property_title,
        });
      default:
        return t('dashboard.activity_generic');
    }
  };

  return (
    <div className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
      <div className="mt-1">{getActivityIcon()}</div>
      <div className="flex-1">
        <p className="text-gray-900">{getActivityText()}</p>
        <p className="text-sm text-gray-500">
          {getTimeAgo(activity.activity_date)}
        </p>
      </div>
    </div>
  );
};

// Quick Action Card Component
const QuickActionCard = ({ title, description, icon, onClick }) => (
  <div
    onClick={onClick}
    className="card cursor-pointer text-center"
  >
    <div className="text-4xl text-primary-600 mb-3">{icon}</div>
    <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
    <p className="text-sm text-gray-600">{description}</p>
  </div>
);

export default Dashboard;

