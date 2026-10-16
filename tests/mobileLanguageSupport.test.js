const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// The mobile i18n catalog lives in the RentalHubMobile git submodule, which is
// not checked out in CI. Skip gracefully rather than failing the whole suite.
const catalogPath = path.join(__dirname, '..', 'RentalHubMobile', 'src', 'i18n', 'catalog.cjs');
const catalog = fs.existsSync(catalogPath) ? require(catalogPath) : null;

test('mobile app exposes Hausa, Yoruba and Igbo alongside the core locales', { skip: !catalog }, () => {
  const { SUPPORTED_LANGUAGES, UI_COPY } = catalog;

  const codes = SUPPORTED_LANGUAGES.map(({ code }) => code);

  assert.ok(codes.includes('ha'));
  assert.ok(codes.includes('yo'));
  assert.ok(codes.includes('ig'));

  for (const code of ['ha', 'yo', 'ig']) {
    assert.ok(UI_COPY[code]);
    assert.ok(UI_COPY[code]['settings.languageLabel']);
    assert.ok(UI_COPY[code]['tour.welcomeAnnouncement']);
  }
});
