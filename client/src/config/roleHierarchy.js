export const ROLE_META = {
  tenant: {
    label: 'Tenant',
    department: 'Customer',
    tier: 'User',
  },
  landlord: {
    label: 'Landlord',
    department: 'Customer',
    tier: 'User',
  },
  agent: {
    label: 'Agent',
    department: 'Agency',
    tier: 'Field',
  },
  admin: {
    label: 'LGA Admin',
    department: 'Operations',
    tier: 'LGA',
    reportsTo: 'State Admin',
  },
  lga_admin: {
    label: 'LGA Admin',
    department: 'Operations',
    tier: 'LGA',
    reportsTo: 'State Admin',
  },
  state_admin: {
    label: 'State Admin',
    department: 'Operations',
    tier: 'State',
    reportsTo: 'Super Admin',
  },
  super_admin: {
    label: 'Super Admin',
    department: 'Platform Control',
    tier: 'Super',
    reportsTo: 'Platform Owner',
  },
  lga_support_admin: {
    label: 'LGA Support Admin',
    department: 'Support',
    tier: 'LGA',
    reportsTo: 'State Support Admin',
  },
  state_support_admin: {
    label: 'State Support Admin',
    department: 'Support',
    tier: 'State',
    reportsTo: 'Super Support Admin',
  },
  super_support_admin: {
    label: 'Super Support Admin',
    department: 'Support',
    tier: 'Super',
    reportsTo: 'Super Admin',
  },
  recruitment_admin: {
    label: 'Recruitment Admin',
    department: 'Recruitment',
    tier: 'Platform',
    reportsTo: 'Super Admin',
  },
  lga_financial_admin: {
    label: 'LGA Financial Admin',
    department: 'Finance',
    tier: 'LGA',
    reportsTo: 'State Financial Admin',
  },
  financial_admin: {
    label: 'Financial Admin',
    department: 'Finance',
    tier: 'Platform',
    reportsTo: 'Super Financial Admin',
  },
  state_financial_admin: {
    label: 'State Financial Admin',
    department: 'Finance',
    tier: 'State',
    reportsTo: 'Super Financial Admin',
  },
  super_financial_admin: {
    label: 'Super Financial Admin',
    department: 'Finance',
    tier: 'Super',
    reportsTo: 'Super Admin',
  },
  lawyer: {
    label: 'LGA Lawyer',
    department: 'Legal',
    tier: 'LGA',
    reportsTo: 'State Lawyer',
  },
  state_lawyer: {
    label: 'State Lawyer',
    department: 'Legal',
    tier: 'State',
    reportsTo: 'Super Lawyer',
  },
  super_lawyer: {
    label: 'Super Lawyer',
    department: 'Legal',
    tier: 'Super',
    reportsTo: 'Super Admin',
  },
  fumigation_admin: {
    label: 'LGA Fumigation Admin',
    department: 'Fumigation',
    tier: 'LGA',
    reportsTo: 'State Fumigation Admin',
  },
  lga_fumigation_admin: {
    label: 'LGA Fumigation Admin',
    department: 'Fumigation',
    tier: 'LGA',
    reportsTo: 'State Fumigation Admin',
  },
  state_fumigation_admin: {
    label: 'State Fumigation Admin',
    department: 'Fumigation',
    tier: 'State',
    reportsTo: 'Super Fumigation Admin',
  },
  super_fumigation_admin: {
    label: 'Super Fumigation Admin',
    department: 'Fumigation',
    tier: 'Super',
    reportsTo: 'Super Admin',
  },
  transportation_admin: {
    label: 'LGA Transportation Admin',
    department: 'Transportation',
    tier: 'LGA',
    reportsTo: 'State Transportation Admin',
  },
  lga_transportation_admin: {
    label: 'LGA Transportation Admin',
    department: 'Transportation',
    tier: 'LGA',
    reportsTo: 'State Transportation Admin',
  },
  state_transportation_admin: {
    label: 'State Transportation Admin',
    department: 'Transportation',
    tier: 'State',
    reportsTo: 'Super Transportation Admin',
  },
  super_transportation_admin: {
    label: 'Super Transportation Admin',
    department: 'Transportation',
    tier: 'Super',
    reportsTo: 'Super Admin',
  },
};

export const ROLE_GROUPS = {
  lgaOperations: ['admin', 'lga_admin'],
  stateOperations: ['state_admin'],
  superOperations: ['super_admin'],
  lgaSupport: ['lga_support_admin'],
  stateSupport: ['state_support_admin'],
  superSupport: ['super_support_admin'],
  recruitment: ['recruitment_admin'],
  lgaFinance: ['lga_financial_admin'],
  platformFinance: ['financial_admin'],
  stateFinance: ['state_financial_admin'],
  superFinance: ['super_financial_admin'],
  lgaLegal: ['lawyer'],
  stateLegal: ['state_lawyer'],
  superLegal: ['super_lawyer'],
  lgaFumigation: ['fumigation_admin', 'lga_fumigation_admin'],
  stateFumigation: ['state_fumigation_admin'],
  superFumigation: ['super_fumigation_admin'],
  lgaTransportation: ['transportation_admin', 'lga_transportation_admin'],
  stateTransportation: ['state_transportation_admin'],
  superTransportation: ['super_transportation_admin'],
};

export const LGA_SCOPED_ROLES = [
  ...ROLE_GROUPS.lgaOperations,
  ...ROLE_GROUPS.lgaSupport,
  ...ROLE_GROUPS.lgaFinance,
  ...ROLE_GROUPS.lgaLegal,
  ...ROLE_GROUPS.lgaFumigation,
  ...ROLE_GROUPS.lgaTransportation,
];

export const STATE_SCOPED_ROLES = [
  ...LGA_SCOPED_ROLES,
  ...ROLE_GROUPS.stateOperations,
  ...ROLE_GROUPS.stateSupport,
  ...ROLE_GROUPS.stateFinance,
  ...ROLE_GROUPS.stateLegal,
  ...ROLE_GROUPS.stateFumigation,
  ...ROLE_GROUPS.stateTransportation,
];

export const ADMIN_SHELL_ROLES = [
  ...ROLE_GROUPS.lgaOperations,
  ...ROLE_GROUPS.stateOperations,
  ...ROLE_GROUPS.superOperations,
  ...ROLE_GROUPS.lgaSupport,
  ...ROLE_GROUPS.stateSupport,
  ...ROLE_GROUPS.superSupport,
  ...ROLE_GROUPS.recruitment,
  ...ROLE_GROUPS.lgaFinance,
  ...ROLE_GROUPS.platformFinance,
  ...ROLE_GROUPS.stateFinance,
  ...ROLE_GROUPS.superFinance,
  ...ROLE_GROUPS.lgaFumigation,
  ...ROLE_GROUPS.stateFumigation,
  ...ROLE_GROUPS.superFumigation,
  ...ROLE_GROUPS.lgaTransportation,
  ...ROLE_GROUPS.stateTransportation,
  ...ROLE_GROUPS.superTransportation,
];

export const getRoleMeta = (role) => {
  const key = String(role || '').trim().toLowerCase();
  return ROLE_META[key] || {
    label: key ? key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Unknown',
    department: 'Administration',
    tier: 'Custom',
    reportsTo: 'Super Admin',
  };
};

export const getRoleLabel = (role) => getRoleMeta(role).label;

export const isRoleIn = (role, roles) => roles.includes(String(role || '').trim().toLowerCase());
