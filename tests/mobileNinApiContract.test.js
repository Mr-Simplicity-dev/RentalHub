const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('Android NIN POST targets the registered and proxied production endpoint', () => {
  const mobileApi = read('RentalHubMobile', 'src', 'services', 'api.js');
  const userService = read('RentalHubMobile', 'src', 'services', 'userService.js');
  const easConfig = JSON.parse(read('RentalHubMobile', 'eas.json'));
  const server = read('server.js');
  const userRoutes = read('routes', 'users.js');
  const nginx = read('deploy', 'nginx.conf');

  const deployedBaseUrl = 'https://rentalhub.com.ng/api';
  const requestPath = '/users/identity/nin';

  assert.match(mobileApi, /process\.env\.EXPO_PUBLIC_API_BASE_URL/);
  assert.equal(easConfig.build.preview.env.EXPO_PUBLIC_API_BASE_URL, deployedBaseUrl);
  assert.equal(easConfig.build.production.env.EXPO_PUBLIC_API_BASE_URL, deployedBaseUrl);
  assert.match(userService, /api\.post\(\s*['"]\/users\/identity\/nin['"]/);
  assert.equal(`${deployedBaseUrl}${requestPath}`, 'https://rentalhub.com.ng/api/users/identity/nin');
  assert.match(server, /app\.use\(\s*['"]\/api\/users['"]\s*,\s*generalOpsLimiter\s*,\s*userRoutes\s*\)/);
  assert.match(userRoutes, /router\.post\(\s*['"]\/identity\/nin['"]/);
  assert.match(nginx, /location\s+\/api\/\s*\{[\s\S]*?proxy_pass\s+http:\/\/rentalhub_backend\s*;/);
});

test('NIN provider failures return a safe actionable error without logging request data', () => {
  const userRoutes = read('routes', 'users.js');

  assert.match(userRoutes, /if\s*\(\s*\['service_error',\s*'wallet_error'\]\.includes\(verification\.status\)\s*\)\s*\{\s*return res\.status\(503\)\.json/);
  assert.match(userRoutes, /Identity verification provider is temporarily unavailable\. Please try again later\./);
  assert.ok(userRoutes.includes("req.logger.error('Add NIN verification request failed'"));
  assert.ok(userRoutes.includes("typeof error?.code === 'string' && /^[a-z0-9_-]{1,64}$/i.test(error.code)"));
  assert.ok(userRoutes.includes('upstream_status: Number.isInteger(error?.response?.status)'));
  assert.ok(!userRoutes.includes("req.logger.error('Add NIN verification request failed', error"));
  assert.match(userRoutes, /NIN verification could not be completed\. Please try again later\./);
});
