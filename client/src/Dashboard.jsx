import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import api from '../services/api';
import {
  FaHome,
  FaEnvelope,
  FaFileAlt,
  FaHeart,
  FaCheckCircle,
  FaClock,
  FaTimesCircle,
} from 'react-icons/fa';
import Loader from '../components/common/Loader';
import { formatCurrency, formatDate, getTimeAgo } from '../utils/helpers';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
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
  };

  if (loading) {
    return <Loader fullScreen />;
  }

  return (
    <div className="bg-gray-50 min-h-screen py-8">
      <div className="container mx-auto px-4">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.full_name}!
          </h1>
          <p className="text-gray-600 mt-1">
            {user?.user_type === 'tenant'
              ? 'Find your perfect home'
              : 'Manage your properties'}
          </p>
        </div>

        {/* Verification Alert */}
        {!user?.identity_verified && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <FaClock className="text-yellow-600 mt-1 mr-3" />
              <div>
                <h3 className="font-semibold text-yellow-800">
                  Complete Your Verification
                </h3>
                <p className="text-sm text-yellow-700 mt-1">
                  Please complete your identity verification to access all features.
                </p>
                <button
                  onClick={() => navigate('/profile')}
                  className="mt-2 text-sm font-semibold text-yellow-800 hover:text-yellow-900"
                >
                  Complete Verification →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Subscription Alert (for tenants) */}
        {user?.user_type === 'tenant' && !user?.subscription_active && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <FaCheckCircle className="text-blue-600 mt-1 mr-3" />
              <div>
                <h3 className="font-semibold text-blue-800">Subscribe to Access Properties</h3>
                <p className="text-sm text-blue-700 mt-1">
                  Subscribe to view full property details and contact landlords.
                </p>
                <button
                  onClick={() => navigate('/subscribe')}
                  className="mt-2 btn btn-primary text-sm"
                >
                  View Plans
                </button>
              </div>
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
                icon={<FaFileAlt className="text-blue-500" />}
                title="Total Applications"
                value={stats?.total_applications || 0}
                onClick={() => navigate('/applications')}
              />
              <StatCard
                icon={<FaClock className="text-yellow-500" />}
                title="Pending Applications"
                value={stats?.pending_applications || 0}
                onClick={() => navigate('/applications?status=pending')}
              />
              <StatCard
                icon={<FaCheckCircle className="text-green-500" />}
                title="Approved Applications"
                value={stats?.approved_applications || 0}
                onClick={() => navigate('/applications?status=approved')}
              />
            </>
          ) : (
            <>
              <StatCard
                icon={<FaHome className="text-blue-500" />}
                title="Total Properties"
                value={stats?.total_properties || 0}
                onClick={() => navigate('/my-properties')}
              />
              <StatCard
                icon={<FaCheckCircle className="text-green-500" />}
                title="Available Properties"
                value={stats?.available_properties || 0}
                onClick={() => navigate('/my-properties?status=available')}
              />
              <StatCard
                icon={<FaFileAlt className="text-yellow-500" />}
                title="Pending Applications"
                value={stats?.pending_applications || 0}
                onClick={() => navigate('/applications?status=pending')}
              />
              <StatCard
                icon={<FaEnvelope className="text-purple-500" />}
                title="Unread Messages"
                value={stats?.unread_messages || 0}
                onClick={() => navigate('/messages')}
              />
            </>
          )}
        </div>

        {/* Recent Activities */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Recent Activities</h2>
          {recentActivities.length === 0 ? (
            <p className="text-gray-600 text-center py-8">No recent activities</p>
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
                title="Browse Properties"
                description="Find your perfect home"
                icon={<FaHome />}
                onClick={() => navigate('/properties')}
              />
              <QuickActionCard
                title="My Applications"
                description="Track your applications"
                icon={<FaFileAlt />}
                onClick={() => navigate('/applications')}
              />
              <QuickActionCard
                title="Messages"
                description="Chat with landlords"
                icon={<FaEnvelope />}
                onClick={() => navigate('/messages')}
              />
            </>
          ) : (
            <>
              <QuickActionCard
                title="Add Property"
                description="List a new property"
                icon={<FaHome />}
                onClick={() => navigate('/add-property')}
              />
              <QuickActionCard
                title="My Properties"
                description="Manage your listings"
                icon={<FaHome />}
                onClick={() => navigate('/my-properties')}
              />
              <QuickActionCard
                title="Applications"
                description="Review tenant applications"
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
    className="card hover:shadow-lg transition-shadow cursor-pointer"
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
  const getActivityIcon = () => {
    switch (activity.type) {
      case 'application':
        return <FaFileAlt className="text-blue-500" />;
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
        return `Application ${activity.status} for ${activity.property_title}`;
      case 'message':
        return `Message from ${activity.user_name || 'User'}`;
      case 'review':
        return `New review (${activity.status} stars) for ${activity.property_title}`;
      default:
        return 'Activity';
    }
  };

  return (
    <div className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
      <div className="mt-1">{getActivityIcon()}</div>
      <div className="flex-1">
        <p className="text-gray-900">{getActivityText()}</p>
        <p className="text-sm text-gray-500">{getTimeAgo(activity.activity_date)}</p>
      </div>
    </div>
  );
};

// Quick Action Card Component
const QuickActionCard = ({ title, description, icon, onClick }) => (
  <div
    onClick={onClick}
    className="card hover:shadow-lg transition-shadow cursor-pointer text-center"
  >
    <div className="text-4xl text-primary-600 mb-3">{icon}</div>
    <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
    <p className="text-sm text-gray-600">{description}</p>
  </div>
);

export default Dashboard;