const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');
const MOBILE_PKG_PATH = path.resolve(__dirname, '..', 'RentalHubMobile', 'package.json');
const BUILD_INFO_PATH = path.resolve(UPLOADS_DIR, 'version.json');

const getBuildInfo = () => {
  try {
    const pkg = JSON.parse(fs.readFileSync(MOBILE_PKG_PATH, 'utf8'));
    const buildInfo = {
      version: pkg.version || '1.0.0',
      buildNumber: '1',
      lastUpdated: new Date().toISOString(),
    };

    if (fs.existsSync(BUILD_INFO_PATH)) {
      const saved = JSON.parse(fs.readFileSync(BUILD_INFO_PATH, 'utf8'));
      buildInfo.buildNumber = saved.buildNumber || '1';
      buildInfo.lastUpdated = saved.lastUpdated || buildInfo.lastUpdated;
    }

    return buildInfo;
  } catch {
    return { version: '1.0.0', buildNumber: '1', lastUpdated: new Date().toISOString() };
  }
};

router.get('/app', (req, res) => {
  const apkPath = path.resolve(UPLOADS_DIR, 'app.apk');

  res.download(apkPath, 'RentalHub.apk', (err) => {
    if (err) {
      if (!res.headersSent) {
        res.status(404).json({ success: false, message: 'APK not found' });
      }
    }
  });
});

router.get('/version', (req, res) => {
  const info = getBuildInfo();
  res.json({
    success: true,
    data: {
      android: {
        version: info.version,
        buildNumber: info.buildNumber,
        downloadUrl: '/api/downloads/app',
        lastUpdated: info.lastUpdated,
      },
      ios: {
        version: info.version,
        buildNumber: info.buildNumber,
        downloadUrl: null,
        lastUpdated: info.lastUpdated,
      },
    },
  });
});

module.exports = router;
module.exports.getBuildInfo = getBuildInfo;
