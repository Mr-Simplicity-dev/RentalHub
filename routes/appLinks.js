const express = require('express');

const router = express.Router();

const IOS_BUNDLE_ID = 'com.rentalhubng';
const ANDROID_PACKAGE_NAME = 'com.rentalhubng';

const parseCsv = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const buildIosAppIds = () => {
  const explicitAppIds = parseCsv(process.env.APPLE_APP_LINK_APP_IDS);
  if (explicitAppIds.length > 0) {
    return explicitAppIds;
  }

  const teamId = String(process.env.APPLE_TEAM_ID || '').trim();
  return teamId ? [`${teamId}.${IOS_BUNDLE_ID}`] : [];
};

const buildAndroidFingerprints = () =>
  parseCsv(process.env.ANDROID_APP_LINK_SHA256_FINGERPRINTS);

router.get('/assetlinks.json', (req, res) => {
  const fingerprints = buildAndroidFingerprints();

  const statements =
    fingerprints.length > 0
      ? [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: ANDROID_PACKAGE_NAME,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : [];

  res.type('application/json').json(statements);
});

router.get('/apple-app-site-association', (req, res) => {
  const appIDs = buildIosAppIds();

  res.type('application/json').json({
    applinks: {
      apps: [],
      details:
        appIDs.length > 0
          ? [
              {
                appIDs,
                components: [
                  { '/': '/properties/*' },
                  { '/': '/lawyer/accept-invite' },
                  { '/': '/register' },
                  { '/': '/dispute/*' },
                  { '/': '/verify-case' },
                  { '/': '/property-request' },
                ],
              },
            ]
          : [],
    },
  });
});

module.exports = router;
