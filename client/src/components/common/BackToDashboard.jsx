import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { useAuth } from '../../hooks/useAuth';

const dashboardPathByRole = {
  tenant: '/tenant/dashboard',
  landlord: '/dashboard',
  agent: '/agent/dashboard',
  super_admin: '/super-admin',
  state_admin: '/admin',
  state_financial_admin: '/admin',
  financial_admin: '/admin/financial-dashboard',
  super_financial_admin: '/admin/super-financial-dashboard',
  state_support_admin: '/admin/state-support-dashboard',
  super_support_admin: '/admin/super-support-dashboard',
  lawyer: '/lawyer',
  state_lawyer: '/lawyer/state',
  super_lawyer: '/lawyer/super',
};

const BackToDashboard = ({ className = '', label = 'Back to Dashboard', to }) => {
  const { user } = useAuth();
  const dashboardPath = to || dashboardPathByRole[user?.user_type] || '/dashboard';

  return (
    <Link
      to={dashboardPath}
      className={`btn btn-outline inline-flex items-center justify-center gap-2 whitespace-nowrap ${className}`}
    >
      <FaArrowLeft className="text-sm" />
      {label}
    </Link>
  );
};

export default BackToDashboard;
