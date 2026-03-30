const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
let failures = 0;

const resolvePath = (relativePath) => path.join(rootDir, relativePath);

const logCheck = (label, passed, details = '') => {
  const mark = passed ? 'OK' : 'FAIL';
  const suffix = details ? ` ${details}` : '';
  console.log(`  [${mark}] ${label}${suffix}`);
  if (!passed) failures += 1;
};

const fileExists = (relativePath) => fs.existsSync(resolvePath(relativePath));

const readFile = (relativePath) => {
  const absolutePath = resolvePath(relativePath);
  if (!fs.existsSync(absolutePath)) return '';
  return fs.readFileSync(absolutePath, 'utf8');
};

const hasPattern = (content, pattern) => {
  if (pattern instanceof RegExp) {
    return pattern.test(content);
  }
  return content.includes(pattern);
};

const checkPatterns = (file, checks) => {
  const content = readFile(file);

  console.log(`\nChecking ${file}:`);
  if (!content) {
    logCheck(file, false, '(missing or empty)');
    return;
  }

  checks.forEach(({ label, pattern }) => {
    logCheck(label, hasPattern(content, pattern));
  });
};

console.log('Testing Admin Route Structure...\n');

const requiredFiles = [
  'routes/financialAdmin.js',
  'routes/stateAdmin.js',
  'controllers/financialAdminController.js',
  'controllers/stateAdminController.js',
  'config/middleware/requireFinancialAdmin.js',
  'config/middleware/requireStateAdmin.js',
  'services/commissionService.js',
  'migrations/012_state_admin_system.sql',
  'client/src/pages/admin/FinancialAdminDashboard.jsx',
  'client/src/pages/admin/StateAdminDashboard.jsx',
  'client/src/pages/admin/AdminLayout.jsx',
  'client/src/pages/App.jsx',
];

console.log('Checking required files:');
requiredFiles.forEach((file) => {
  logCheck(file, fileExists(file));
});

const serverContent = readFile('server.js');
console.log('\nChecking server.js route registrations:');
logCheck(
  "financial admin route registration",
  hasPattern(serverContent, /app\.use\(\s*['"]\/api\/financial-admin['"]\s*,\s*financialAdminRoutes\s*\)/)
);
logCheck(
  "state admin route registration",
  hasPattern(serverContent, /app\.use\(\s*['"]\/api\/state-admin['"]\s*,\s*stateAdminRoutes\s*\)/)
);

checkPatterns('routes/financialAdmin.js', [
  { label: 'GET /transactions', pattern: /router\.get\(\s*['"]\/transactions['"]/ },
  { label: 'GET /stats/realtime', pattern: /router\.get\(\s*['"]\/stats\/realtime['"]/ },
  { label: 'GET /performance/state-admins', pattern: /router\.get\(\s*['"]\/performance\/state-admins['"]/ },
  { label: 'GET /funds/frozen', pattern: /router\.get\(\s*['"]\/funds\/frozen['"]/ },
  { label: 'POST /funds/freeze', pattern: /router\.post\(\s*['"]\/funds\/freeze['"]/ },
]);

checkPatterns('routes/stateAdmin.js', [
  { label: 'GET /dashboard', pattern: /router\.get\(\s*['"]\/dashboard['"]/ },
  { label: 'GET /transactions', pattern: /router\.get\(\s*['"]\/transactions['"]/ },
  { label: 'GET /managed-users', pattern: /router\.get\(\s*['"]\/managed-users['"]/ },
  { label: 'GET /withdrawals', pattern: /router\.get\(\s*['"]\/withdrawals['"]/ },
  { label: 'POST /withdraw', pattern: /router\.post\(\s*['"]\/withdraw['"]/ },
]);

checkPatterns('services/commissionService.js', [
  { label: 'exports.calculateCommission', pattern: /exports\.calculateCommission\s*=/ },
  { label: 'exports.processPaymentCommission', pattern: /exports\.processPaymentCommission\s*=/ },
  { label: 'exports.processAdminWithdrawal', pattern: /exports\.processAdminWithdrawal\s*=/ },
  { label: 'exports.getAdminCommissionSummary', pattern: /exports\.getAdminCommissionSummary\s*=/ },
]);

checkPatterns('client/src/pages/App.jsx', [
  {
    label: 'FinancialAdminDashboard imported or referenced',
    pattern: /FinancialAdminDashboard/,
  },
  {
    label: 'StateAdminDashboard imported or referenced',
    pattern: /StateAdminDashboard/,
  },
]);

console.log('\n=== Summary ===');
if (failures === 0) {
  console.log('All admin route checks passed.');
  console.log('Next steps:');
  console.log('1. Run migrations if they are not already applied.');
  console.log('2. Start the server.');
  console.log('3. Log in with financial_admin and state_admin accounts to test the dashboards.');
} else {
  console.log(`Completed with ${failures} failing check(s). Review the FAIL lines above.`);
  process.exitCode = 1;
}
