import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  FaUsers,
  FaHome,
  FaFileAlt,
  FaCheckCircle,
  FaEnvelope,
} from 'react-icons/fa';

const AdminDashboard = () => {
  const { user } = useAuth();

  const [stats, setStats] = useState({
    totalUsers: '-',
    totalProperties: '-',
    applications: '-',
    pendingVerifications: '-',
  });

  useEffect(() => {
    const loadStats = async () => {
      try {
        const res = await fetch('/api/admin/stats', {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });

        const data = await res.json();

        if (data.success) {
          setStats({
            totalUsers: data.data.totalUsers,
            totalProperties: data.data.totalProperties,
            applications: data.data.applications,
            pendingVerifications: data.data.pendingVerifications,
          });
        }
      } catch (err) {
        console.error('Failed to load admin stats', err);
      }
    };

    loadStats();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Admin Dashboard
          </h1>
          <p className="mt-1 text-gray-600">
            Welcome, {user?.full_name || 'Administrator'}
          </p>
        </div>

        <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Users"
            value={stats.totalUsers}
            icon={<FaUsers className="text-blue-500" />}
          />
          <StatCard
            title="Total Properties"
            value={stats.totalProperties}
            icon={<FaHome className="text-green-500" />}
          />
          <StatCard
            title="Applications"
            value={stats.applications}
            icon={<FaFileAlt className="text-purple-500" />}
          />
          <StatCard
            title="Pending Verifications"
            value={stats.pendingVerifications}
            icon={<FaCheckCircle className="text-yellow-500" />}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
          <QuickCard title="Manage Users" href="/admin/users" />
          <QuickCard title="Verify NIN/Passport" href="/admin/verifications" />
          <QuickCard title="View Properties" href="/admin/properties" />
          <QuickCard title="View Applications" href="/admin/applications" />
          <QuickCard
            title="Lawyer Invites"
            href="/admin/lawyer-invites"
            icon={<FaEnvelope className="text-sky-500" />}
          />
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon }) => (
  <div className="card">
    <div className="flex items-center justify-between">
      <div>
        <p className="mb-1 text-sm text-gray-600">{title}</p>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
      </div>
      <div className="text-4xl">{icon}</div>
    </div>
  </div>
);

const QuickCard = ({ title, href, icon = null }) => (
  <a href={href} className="card block text-center">
    {icon && <div className="mb-2 flex justify-center text-2xl">{icon}</div>}
    <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
    <p className="mt-1 text-sm text-gray-600">Open</p>
  </a>
);

export default AdminDashboard;
