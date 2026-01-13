import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { FaUsers, FaHome, FaFileAlt, FaCheckCircle } from 'react-icons/fa';

const AdminDashboard = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Admin Dashboard
          </h1>
          <p className="text-gray-600 mt-1">
            Welcome, {user?.full_name || 'Administrator'}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <StatCard
            title="Total Users"
            value="—"
            icon={<FaUsers className="text-blue-500" />}
          />
          <StatCard
            title="Total Properties"
            value="—"
            icon={<FaHome className="text-green-500" />}
          />
          <StatCard
            title="Applications"
            value="—"
            icon={<FaFileAlt className="text-purple-500" />}
          />
          <StatCard
            title="Pending Verifications"
            value="—"
            icon={<FaCheckCircle className="text-yellow-500" />}
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <QuickCard title="Manage Users" href="/admin/users" />
          <QuickCard title="Verify Identities" href="/admin/verifications" />
          <QuickCard title="View Properties" href="/admin/properties" />
          <QuickCard title="View Applications" href="/admin/applications" />
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon }) => (
  <div className="card">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-600 mb-1">{title}</p>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
      </div>
      <div className="text-4xl">{icon}</div>
    </div>
  </div>
);

const QuickCard = ({ title, href }) => (
  <a
    href={href}
    className="card hover:shadow-lg transition-shadow block text-center"
  >
    <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
    <p className="text-sm text-gray-600 mt-1">Open →</p>
  </a>
);

export default AdminDashboard;
