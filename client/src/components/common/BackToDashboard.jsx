import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { useAuth } from '../../hooks/useAuth';

const dashboardPathByRole = {
  tenant: '/tenant/dashboard',
  landlord: '/dashboard',
  agent: '/agent/dashboard',
  super_admin: '/super-admin',
  lga_admin: '/admin',
  state_admin: '/admin',
  state_financial_admin: '/admin',
  lga_financial_admin: '/admin/financial-dashboard',
  financial_admin: '/admin/financial-dashboard',
  super_financial_admin: '/admin/super-financial-dashboard',
  lga_support_admin: '/admin?tab=property_requests',
  state_support_admin: '/admin/state-support-dashboard',
  super_support_admin: '/admin/super-support-dashboard',
  fumigation_admin: '/admin/fumigation-cleaning',
  lga_fumigation_admin: '/admin/fumigation-cleaning',
  state_fumigation_admin: '/admin/fumigation-cleaning/state',
  super_fumigation_admin: '/admin/fumigation-cleaning/super',
  transportation_admin: '/admin/transportation',
  lga_transportation_admin: '/admin/transportation',
  state_transportation_admin: '/admin/transportation/state',
  super_transportation_admin: '/admin/transportation/super',
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
