const test = require('node:test');
const assert = require('node:assert/strict');

const { SUPPORTED_LANGUAGES, UI_COPY } = require('../RentalHubMobile/src/i18n/catalog.cjs');

test('mobile app exposes Hausa, Yoruba and Igbo alongside the core locales', () => {
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
