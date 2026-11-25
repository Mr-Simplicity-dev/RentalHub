export const ALLOWED_POST_LOGIN_REDIRECT_PATHS = [
  '/dashboard',
  '/tenant/dashboard',
  '/agent/dashboard',
  '/marketing-agent/dashboard',
  '/admin',
  '/super-admin',
  '/lawyer',
  '/profile',
  '/applications',
  '/messages',
  '/saved-properties',
  '/payment-history',
  '/my-properties',
  '/verification-status',
  '/subscribe',
  '/my-disputes',
  '/my-damage-reports',
  '/subscribed-properties',
];

export const normalizeUserRole = (userOrRole) => {
  const raw =
    typeof userOrRole === 'string'
      ? userOrRole
      : userOrRole?.user_type || '';
  return String(raw).trim().toLowerCase();
};

export const isRecruitmentAdminUser = (user) =>
  normalizeUserRole(user) === 'recruitment_admin' ||
  user?.is_recruitment_admin === true;

export const getDashboardPathForUser = (user, fallback = '/tenant/dashboard') => {
  const role = normalizeUserRole(user);

  if (role === 'super_admin') return '/super-admin';
  if (role === 'super_support_admin') return '/admin/super-support-dashboard';
  if (isRecruitmentAdminUser(user)) return '/admin/recruitment';
  if (role === 'zonal_support_admin') return '/admin/zonal-support-dashboard';
  if (role === 'state_support_admin') return '/admin/state-support-dashboard';
  if (role === 'lga_support_admin') return '/admin/lga-support-dashboard';
  if (role === 'super_financial_admin') return '/admin/super-financial-dashboard';
  if (role === 'zonal_financial_admin') return '/admin/zonal-financial-dashboard';
  if (role === 'financial_admin' || role === 'lga_financial_admin') return '/admin/financial-dashboard';
  if (
    role === 'state_admin' ||
    role === 'state_financial_admin' ||
    role === 'admin' ||
    role === 'lga_admin' ||
    role === 'zonal_admin'
  ) {
    return '/admin';
  }
  if (role === 'super_fumigation_admin') return '/admin/fumigation-cleaning/super';
  if (role === 'zonal_fumigation_admin') return '/admin/fumigation-cleaning/zonal';
  if (role === 'state_fumigation_admin') return '/admin/fumigation-cleaning/state';
  if (role === 'fumigation_admin' || role === 'lga_fumigation_admin') {
    return '/admin/fumigation-cleaning';
  }
  if (role === 'super_transportation_admin') return '/super-admin/transportation';
  if (role === 'zonal_transportation_admin') return '/admin/transportation/zonal';
  if (role === 'state_transportation_admin') return '/admin/transportation/state';
  if (role === 'transportation_admin' || role === 'lga_transportation_admin') {
    return '/admin/transportation';
  }
  if (role === 'super_lawyer') return '/lawyer/super';
  if (role === 'zonal_lawyer') return '/lawyer/zonal';
  if (role === 'state_lawyer') return '/lawyer/state';
  if (role === 'lawyer') return '/lawyer';
  if (role === 'agent') return '/agent/dashboard';
  if (role === 'marketing_agent') return '/marketing-agent/dashboard';
  if (role === 'landlord') return '/dashboard';
  if (role === 'tenant' || role === 'user') return '/tenant/dashboard';

  return fallback;
};
