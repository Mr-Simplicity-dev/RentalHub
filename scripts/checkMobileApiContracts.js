const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const mobile = path.resolve(__dirname, '../RentalHubMobile');
if (!fs.existsSync(path.join(mobile, 'src')) || !fs.existsSync(path.join(mobile, 'index.js'))) {
  console.log('Mobile submodule is not checked out. Run this check with RentalHubMobile present.');
  process.exit(0);
}
const checker = path.join(mobile, 'scripts/audit-platform-contracts.cjs');
if (!fs.existsSync(checker)) { console.error('Update the mobile submodule before running the route audit.'); process.exit(1); }
const result = spawnSync(process.execPath, [checker, ...process.argv.slice(2)], { cwd: mobile, stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
