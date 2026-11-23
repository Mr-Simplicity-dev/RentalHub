const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  PROMO_LANGUAGES,
  PROMO_EDITIONS,
  PROMO_FORMATS,
  getPromoAsset,
  resolvePromoAssetFile,
  getPublicPromoManifest,
} = require('../config/promo/promoVideoCatalog');

test('promo catalog exposes 4 languages, 4 editions, 2 formats (32 combos)', () => {
  assert.deepEqual(PROMO_LANGUAGES.map((l) => l.code), ['en', 'ha', 'ig', 'yo']);
  assert.deepEqual(PROMO_EDITIONS.map((e) => e.id), ['flagship', 'tenant', 'landlord', 'protection']);
  assert.deepEqual(PROMO_FORMATS.map((f) => f.id), ['vertical', 'landscape']);
  assert.equal(PROMO_LANGUAGES.length * PROMO_EDITIONS.length * PROMO_FORMATS.length, 32);
});

test('English promo assets are available and map to existing files', () => {
  for (const edition of PROMO_EDITIONS) {
    for (const format of PROMO_FORMATS) {
      const asset = getPromoAsset(edition.id, format.id, 'en');
      assert.ok(asset, `missing asset ${edition.id}/${format.id}/en`);
      assert.equal(asset.available, true);
      assert.match(asset.file, /^[a-zA-Z0-9._-]+\.mp4$/);
      const resolved = resolvePromoAssetFile(edition.id, format.id, 'en');
      assert.ok(resolved, `unresolved ${edition.id}/${format.id}/en`);
      assert.equal(fs.existsSync(resolved.absPath), true, `missing file ${resolved.absPath}`);
      assert.equal(path.basename(resolved.absPath), resolved.file);
    }
  }
});

test('Hausa, Igbo, Yoruba promo assets are unavailable until approved assets exist', () => {
  for (const lang of ['ha', 'ig', 'yo']) {
    for (const edition of PROMO_EDITIONS) {
      for (const format of PROMO_FORMATS) {
        const asset = getPromoAsset(edition.id, format.id, lang);
        assert.ok(asset);
        assert.equal(asset.available, false, `${edition.id}/${format.id}/${lang} should be unavailable`);
        assert.equal(asset.file, null);
        assert.equal(resolvePromoAssetFile(edition.id, format.id, lang), null);
        assert.match(asset.downloadName, new RegExp(`-${lang}\\.mp4$`));
      }
    }
  }
});

test('public manifest exposes safe fields and no server paths', () => {
  const manifest = getPublicPromoManifest();
  assert.equal(Array.isArray(manifest.languages), true);
  assert.equal(Array.isArray(manifest.editions), true);
  assert.equal(Array.isArray(manifest.formats), true);
  assert.equal(manifest.assets.flagship.vertical.en.available, true);
  assert.equal(manifest.assets.flagship.vertical.ha.available, false);
  assert.equal(manifest.assets.flagship.vertical.ha.src, null);
  assert.match(manifest.assets.flagship.vertical.en.src, /^\/promo-videos\//);
  const json = JSON.stringify(manifest);
  assert.equal(json.includes('absPath'), false);
  assert.equal(json.includes('PROMO_VIDEOS_DIR'), false);
});

test('catalog rejects unknown selections', () => {
  assert.equal(getPromoAsset('unknown', 'vertical', 'en'), null);
  assert.equal(getPromoAsset('flagship', 'square', 'en'), null);
  assert.equal(getPromoAsset('flagship', 'vertical', 'fr'), null);
  assert.equal(resolvePromoAssetFile('flagship', 'vertical', 'fr'), null);
});
