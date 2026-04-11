const isStateFinancialAdmin = (userType) =>
  ['state_financial_admin', 'state_admin'].includes(userType);

const isSuperFinancialAdmin = (userType) =>
  ['super_financial_admin', 'financial_admin'].includes(userType);

const isSuperAdminOrSuperFinancialAdmin = (userType) =>
  ['super_admin', 'super_financial_admin', 'financial_admin'].includes(userType);

module.exports = {
  isStateFinancialAdmin,
  isSuperFinancialAdmin,
  isSuperAdminOrSuperFinancialAdmin,
};