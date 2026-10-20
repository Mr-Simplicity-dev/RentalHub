const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';

// The deployed Android build, as the server sees it.
const BUILD_INFO = path.resolve(__dirname, '..', 'uploads', 'version.json');
const originalBuildInfo = fs.existsSync(BUILD_INFO) ? fs.readFileSync(BUILD_INFO, 'utf8') : null;

const startServer = () => {
  const express = require('express');
  const app = express();
  app.use('/mobile', require('../routes/mobileDiagnostics'));
  const server = app.listen(0);
  return { server, port: server.address().port };
};

const getVersion = async (port, query) => {
  const res = await fetch(`http://127.0.0.1:${port}/mobile/app-version?${query}`);
  return res.json();
};

test('iOS is compared against the iOS track, not the Android build', async (t) => {
  // Simulate an Android release being deployed.
  fs.mkdirSync(path.dirname(BUILD_INFO), { recursive: true });
  fs.writeFileSync(BUILD_INFO, JSON.stringify({ version: '1.0.39', buildNumber: '50' }));

  const { server, port } = startServer();
  t.after(() => {
    server.close();
    if (originalBuildInfo === null) fs.rmSync(BUILD_INFO, { force: true });
    else fs.writeFileSync(BUILD_INFO, originalBuildInfo);
  });

  const ios = await getVersion(port, 'platform=ios&version=1.0.3');
  assert.equal(ios.data.latest_version, '1.0.3', 'iOS compares against the iOS version');
  assert.equal(ios.data.update_available, false, 'a shipped iOS build is not told to update');
  assert.equal(ios.data.update_required, false);
  assert.equal(ios.data.apk_url, '', 'iOS is never handed an APK');

  const android = await getVersion(port, 'platform=android&version=1.0.38');
  assert.equal(android.data.latest_version, '1.0.39', 'Android still follows version.json');
  assert.equal(android.data.update_available, true, 'the older Android build is offered the update');
});
