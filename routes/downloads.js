const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const ROOT_DIR = path.resolve(__dirname, '..');
const UPLOADS_DIR = path.resolve(ROOT_DIR, 'uploads');
const MOBILE_DIR = path.resolve(ROOT_DIR, 'RentalHubMobile');
const MOBILE_APP_JSON_PATH = path.resolve(MOBILE_DIR, 'app.json');
const MOBILE_PKG_PATH = path.resolve(MOBILE_DIR, 'package.json');
const BUILD_INFO_PATH = path.resolve(UPLOADS_DIR, 'version.json');

// The brand name is part of the downloaded file name users see on their device.
const DOWNLOAD_BASENAME = 'Amana RentalHub NG';

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};

// Version is read from what was actually shipped (uploads/version.json written by the
// release step), then falls back to the mobile app metadata so a stale version file
// never mislabels a fresh build.
const getBuildInfo = () => {
  const saved = readJson(BUILD_INFO_PATH) || {};
  const appJson = readJson(MOBILE_APP_JSON_PATH) || {};
  const pkg = readJson(MOBILE_PKG_PATH) || {};
  const expo = appJson.expo || {};

  return {
    version: saved.version || expo.version || pkg.version || '1.0.0',
    buildNumber: String(
      saved.buildNumber || (expo.android && expo.android.versionCode) || '1'
    ),
    lastUpdated: saved.lastUpdated || new Date().toISOString(),
  };
};

// The release APK is written to uploads/app.apk by the release step, but operators
// sometimes drop a renamed file there instead. Serve whichever APK is present
// (newest first) so a branding rename can never 404 the download again.
const findApk = () => {
  const preferred = path.resolve(UPLOADS_DIR, 'app.apk');
  if (fs.existsSync(preferred)) return preferred;

  try {
    const candidates = fs
      .readdirSync(UPLOADS_DIR)
      .filter((name) => /\.apk$/i.test(name))
      .map((name) => path.resolve(UPLOADS_DIR, name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return candidates[0] || null;
  } catch {
    return null;
  }
};

router.get('/app', (req, res) => {
  // The APK lives at one fixed path and is overwritten on every deploy, so it must
  // never be cached by a browser, proxy or CDN — otherwise an older build keeps
  // being handed out. The versioned filename also stops devices reusing a stale
  // "Amana RentalHub NG.apk" they already downloaded.
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
  });

  const apkPath = findApk();

  if (!apkPath) {
    return res.status(404).json({
      success: false,
      message: 'APK not found',
      hint: 'Place the built release APK at uploads/app.apk on the server (see docs/release-runbook.md).',
    });
  }

  const { version } = getBuildInfo();
  res.download(apkPath, `${DOWNLOAD_BASENAME}-${version}.apk`, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ success: false, message: 'APK not found' });
    }
  });
});

router.get('/version', (req, res) => {
  const info = getBuildInfo();
  const apkAvailable = Boolean(findApk());
  res.json({
    success: true,
    data: {
      android: {
        version: info.version,
        buildNumber: info.buildNumber,
        downloadUrl: `/api/downloads/app?v=${encodeURIComponent(info.version)}`,
        fileName: `${DOWNLOAD_BASENAME}-${info.version}.apk`,
        apkAvailable,
        lastUpdated: info.lastUpdated,
      },
      // iOS is on its own release track; mirroring the Android build here would
      // advertise an iOS update that no App Store build can satisfy.
      ios: {
        version: process.env.MOBILE_IOS_LATEST_VERSION || '1.0.3',
        buildNumber: String(process.env.MOBILE_IOS_BUILD_NUMBER || '13'),
        downloadUrl: null,
        lastUpdated: info.lastUpdated,
      },
    },
  });
});

module.exports = router;
module.exports.getBuildInfo = getBuildInfo;
module.exports.findApk = findApk;
