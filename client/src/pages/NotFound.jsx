import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { FaHome } from 'react-icons/fa';

const NotFound = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-primary-600">404</h1>
        <h2 className="text-3xl font-semibold text-gray-900 mt-4">{t('not_found.title')}</h2>
        <p className="text-gray-600 mt-2 mb-8">
          {t('not_found.message')}
        </p>
        <Link to="/" className="btn btn-primary">
          <FaHome className="inline mr-2" />
          {t('not_found.go_home')}
        </Link>
        <button
          onClick={() => navigate('/dashboard')}
          className="btn btn-outline mt-4"
        >
          {t('not_found.back')}
        </button>
      </div>
    </div>
  );
};

export default NotFound;