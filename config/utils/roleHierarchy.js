const ROLE_GROUPS = {
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

const all = (...groups) => groups.flat();

const unique = (items) => [...new Set(items)];

const LGA_SCOPED_ROLES = unique(all(
  ROLE_GROUPS.lgaOperations,
  ROLE_GROUPS.lgaSupport,
  ROLE_GROUPS.lgaFinance,
  ROLE_GROUPS.lgaLegal,
  ROLE_GROUPS.lgaFumigation,
  ROLE_GROUPS.lgaTransportation
));

const STATE_SCOPED_ROLES = unique(all(
  LGA_SCOPED_ROLES,
  ROLE_GROUPS.stateOperations,
  ROLE_GROUPS.stateSupport,
  ROLE_GROUPS.stateFinance,
  ROLE_GROUPS.stateLegal,
  ROLE_GROUPS.stateFumigation,
  ROLE_GROUPS.stateTransportation
));

const SUPER_SCOPED_ROLES = unique(all(
  ROLE_GROUPS.superOperations,
  ROLE_GROUPS.superSupport,
  ROLE_GROUPS.superFinance,
  ROLE_GROUPS.superLegal,
  ROLE_GROUPS.superFumigation,
  ROLE_GROUPS.superTransportation
));

const ADMIN_ROLES = unique(all(
  LGA_SCOPED_ROLES,
  STATE_SCOPED_ROLES,
  SUPER_SCOPED_ROLES,
  ROLE_GROUPS.platformFinance,
  ROLE_GROUPS.recruitment
));

const ALL_USER_TYPES = unique([
  'tenant',
  'landlord',
  'agent',
  ...ADMIN_ROLES,
]);

const normalizeRole = (role) => String(role || '').trim().toLowerCase();
const roleIn = (role, roles) => roles.includes(normalizeRole(role));

module.exports = {
  ROLE_GROUPS,
  LGA_SCOPED_ROLES,
  STATE_SCOPED_ROLES,
  SUPER_SCOPED_ROLES,
  ADMIN_ROLES,
  ALL_USER_TYPES,
  normalizeRole,
  roleIn,
};
