import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { FaBell, FaUser, FaSignOutAlt, FaEnvelope } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

const Header = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { t } = useTranslation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="bg-white shadow-md sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-3">
                <img
                  src="/logo192.png"
                  alt="RentalHub NG"
                  className="h-12 md:h-14 lg:h-16 object-contain"
                />
                <span className="text-xl md:text-2xl font-bold text-gray-900">
                  RentalHub NG
                </span>
              </Link>


          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <Link to="/properties" className="text-gray-700 hover:text-primary-600">
              {t('header.browse')}
            </Link>

            {isAuthenticated && user?.user_type === 'landlord' && (
              <Link to="/my-properties" className="text-gray-700 hover:text-primary-600">
                {t('header.my_properties')}
              </Link>
            )}

            {isAuthenticated && user?.user_type === 'tenant' && (
              <Link to="/saved-properties" className="text-gray-700 hover:text-primary-600">
                {t('header.saved')}
              </Link>
            )}
          </nav>

          {/* Right side */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                {/* Messages */}
                <Link to="/messages" className="relative text-gray-700 hover:text-primary-600">
                  <FaEnvelope className="text-xl" />
                </Link>

                {/* Notifications */}
                <Link to="/notifications" className="relative text-gray-700 hover:text-primary-600">
                  <FaBell className="text-xl" />
                </Link>

                {/* User Menu */}
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center space-x-2 text-gray-700 hover:text-primary-600"
                  >
                    <FaUser className="text-xl" />
                    <span className="hidden md:block">{user?.full_name}</span>
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2">
                      <Link
                        to={user?.user_type === 'tenant' ? '/tenant/dashboard' : '/dashboard'}
                        className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                        onClick={() => setShowUserMenu(false)}
                      >
                        {t('header.dashboard')}
                      </Link>

                      <Link
                        to="/profile"
                        className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                        onClick={() => setShowUserMenu(false)}
                      >
                        {t('header.profile')}
                      </Link>

                      <Link
                        to="/applications"
                        className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                        onClick={() => setShowUserMenu(false)}
                      >
                        {t('header.applications')}
                      </Link>

                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-red-600 hover:bg-gray-100 flex items-center space-x-2"
                      >
                        <FaSignOutAlt />
                        <span>{t('header.logout')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-4">
                <Link to="/login" className="text-gray-700 hover:text-primary-600">
                  {t('header.login')}
                </Link>
                <Link to="/register" className="btn btn-primary">
                  {t('header.register')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
