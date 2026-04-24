const isStateFinancialAdmin = (userType) =>
  ['state_financial_admin', 'state_admin'].includes(userType);

const isSuperFinancialAdmin = (userType) =>
  ['super_financial_admin', 'financial_admin'].includes(userType);

const isSuperAdminOrSuperFinancialAdmin = (userType) =>
  ['super_admin', 'super_financial_admin', 'financial_admin'].includes(userType);

const isLgaAdmin = (userType) =>
  ['lga_admin'].includes(userType);

const isStateAdmin = (userType) =>
  ['state_admin', 'state_financial_admin', 'state_support_admin'].includes(userType);

const isSuperAdmin = (userType) =>
  ['super_admin', 'super_financial_admin', 'super_support_admin'].includes(userType);

const canMonitorLgaAdmins = (userType) =>
  ['state_admin', 'state_financial_admin', 'state_support_admin', 'super_admin', 'super_financial_admin', 'super_support_admin'].includes(userType);

module.exports = {
  isStateFinancialAdmin,
  isSuperFinancialAdmin,
  isSuperAdminOrSuperFinancialAdmin,
  isLgaAdmin,
  isStateAdmin,
  isSuperAdmin,
  canMonitorLgaAdmins,
};