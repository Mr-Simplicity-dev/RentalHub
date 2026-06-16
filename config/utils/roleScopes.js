const {
  ROLE_GROUPS,
  SUPER_SCOPED_ROLES,
  roleIn,
} = require('./roleHierarchy');

const isStateFinancialAdmin = (userType) =>
  roleIn(userType, ['state_financial_admin', 'state_admin']);

const isSuperFinancialAdmin = (userType) =>
  roleIn(userType, ['super_financial_admin', 'financial_admin']);

const isSuperAdminOrSuperFinancialAdmin = (userType) =>
  roleIn(userType, ['super_admin', 'super_financial_admin', 'financial_admin']);

const isLgaAdmin = (userType) =>
  roleIn(userType, ROLE_GROUPS.lgaOperations);

const isLgaFinancialAdmin = (userType) =>
  roleIn(userType, ROLE_GROUPS.lgaFinance);

const isLgaSupportAdmin = (userType) =>
  roleIn(userType, ROLE_GROUPS.lgaSupport);

const isStateAdmin = (userType) =>
  roleIn(userType, [
    ...ROLE_GROUPS.stateOperations,
    ...ROLE_GROUPS.stateFinance,
    ...ROLE_GROUPS.stateSupport,
    ...ROLE_GROUPS.stateTransportation,
    ...ROLE_GROUPS.stateFumigation,
  ]);

const isSuperAdmin = (userType) =>
  roleIn(userType, SUPER_SCOPED_ROLES);

const canMonitorLgaAdmins = (userType) =>
  roleIn(userType, [
    ...ROLE_GROUPS.stateOperations,
    ...ROLE_GROUPS.stateFinance,
    ...ROLE_GROUPS.stateSupport,
    ...ROLE_GROUPS.stateTransportation,
    ...ROLE_GROUPS.stateFumigation,
    ...SUPER_SCOPED_ROLES,
  ]);

module.exports = {
  isStateFinancialAdmin,
  isSuperFinancialAdmin,
  isSuperAdminOrSuperFinancialAdmin,
  isLgaAdmin,
  isStateAdmin,
  isSuperAdmin,
  canMonitorLgaAdmins,
  isLgaFinancialAdmin,
  isLgaSupportAdmin,
};
