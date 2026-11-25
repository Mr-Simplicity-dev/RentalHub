import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FaArrowLeft } from 'react-icons/fa';
import { useAuth } from '../../hooks/useAuth';
import { getDashboardPathForUser } from '../../utils/roleDashboard';

const BackToDashboard = ({ className = '', label, to }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const dashboardPath = to || getDashboardPathForUser(user, '/dashboard');
  const resolvedLabel = label || t('back_to_dashboard.label', 'Back to Dashboard');

  return (
    <Link
      to={dashboardPath}
      className={`btn btn-outline inline-flex items-center justify-center gap-2 whitespace-nowrap ${className}`}
    >
      <FaArrowLeft className="text-sm" />
      {resolvedLabel}
    </Link>
  );
};

export default BackToDashboard;
