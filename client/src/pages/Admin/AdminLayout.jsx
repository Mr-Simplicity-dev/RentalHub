import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  FaTachometerAlt,
  FaUsers,
  FaHome,
  FaFileAlt,
  FaCheckCircle,
  FaSignOutAlt,
} from 'react-icons/fa';

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItem = ({ isActive }) =>
    `flex items-center px-4 py-3 rounded-lg transition-colors ${
      isActive
        ? 'bg-primary-600 text-white'
        : 'text-gray-700 hover:bg-gray-100'
    }`;

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-lg flex flex-col">
        <div className="px-6 py-5 border-b">
          <h2 className="text-xl font-bold text-primary-600">Admin Panel</h2>
          <p className="text-xs text-gray-500 mt-1">
            {user?.full_name || 'Administrator'}
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <NavLink to="/admin" end className={navItem}>
            <FaTachometerAlt className="mr-3" />
            Dashboard
          </NavLink>

          <NavLink to="/admin/users" className={navItem}>
            <FaUsers className="mr-3" />
            Users
          </NavLink>

          <NavLink to="/admin/verifications" className={navItem}>
            <FaCheckCircle className="mr-3" />
            NIN/Passport Verification
          </NavLink>

          <NavLink to="/admin/properties" className={navItem}>
            <FaHome className="mr-3" />
            Properties
          </NavLink>

          <NavLink to="/admin/applications" className={navItem}>
            <FaFileAlt className="mr-3" />
            Applications
          </NavLink>
        </nav>

        <div className="p-4 border-t">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
          >
            <FaSignOutAlt className="mr-2" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
