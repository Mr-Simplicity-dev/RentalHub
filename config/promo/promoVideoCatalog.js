const path = require('path');

const PROMO_LANGUAGES = Object.freeze([
  Object.freeze({ code: 'en', label: 'English', nativeLabel: 'English' }),
  Object.freeze({ code: 'ha', label: 'Hausa', nativeLabel: 'Hausa' }),
  Object.freeze({ code: 'ig', label: 'Igbo', nativeLabel: 'Igbo' }),
  Object.freeze({ code: 'yo', label: 'Yoruba', nativeLabel: 'Yoruba' }),
]);

const PROMO_EDITIONS = Object.freeze([
  Object.freeze({ id: 'flagship', label: 'Flagship App Tour', shortLabel: 'Flagship' }),
  Object.freeze({ id: 'tenant', label: 'Tenant Edition', shortLabel: 'Tenant' }),
  Object.freeze({ id: 'landlord', label: 'Landlord & Agent Edition', shortLabel: 'Landlord & Agent' }),
  Object.freeze({ id: 'protection', label: 'Property Protection Edition', shortLabel: 'Protection' }),
]);

const PROMO_FORMATS = Object.freeze([
  Object.freeze({ id: 'vertical', aspect: '9:16', resolution: '1080x1920' }),
  Object.freeze({ id: 'landscape', aspect: '16:9', resolution: '1280x720' }),
]);

// Source of truth for promo video assets. Only English assets are currently shipped.
// ha/ig/yo entries are intentionally unavailable until approved native-speaker audio
// and human-reviewed localized videos are produced.
const PROMO_VIDEO_ASSETS = Object.freeze({
  flagship: Object.freeze({
    vertical: Object.freeze({
      en: Object.freeze({ file: 'amana-app-tour-commercial.mp4', downloadName: 'amana-app-tour-9x16-en.mp4', available: true }),
      ha: Object.freeze({ file: null, downloadName: 'amana-app-tour-9x16-ha.mp4', available: false }),
      ig: Object.freeze({ file: null, downloadName: 'amana-app-tour-9x16-ig.mp4', available: false }),
      yo: Object.freeze({ file: null, downloadName: 'amana-app-tour-9x16-yo.mp4', available: false }),
    }),
    landscape: Object.freeze({
      en: Object.freeze({ file: 'amana-app-tour-landscape.mp4', downloadName: 'amana-app-tour-16x9-en.mp4', available: true }),
      ha: Object.freeze({ file: null, downloadName: 'amana-app-tour-16x9-ha.mp4', available: false }),
      ig: Object.freeze({ file: null, downloadName: 'amana-app-tour-16x9-ig.mp4', available: false }),
      yo: Object.freeze({ file: null, downloadName: 'amana-app-tour-16x9-yo.mp4', available: false }),
    }),
  }),
  tenant: Object.freeze({
    vertical: Object.freeze({
      en: Object.freeze({ file: 'amana-tenant-commercial-9x16.mp4', downloadName: 'amana-tenant-edition-9x16-en.mp4', available: true }),
      ha: Object.freeze({ file: null, downloadName: 'amana-tenant-edition-9x16-ha.mp4', available: false }),
      ig: Object.freeze({ file: null, downloadName: 'amana-tenant-edition-9x16-ig.mp4', available: false }),
      yo: Object.freeze({ file: null, downloadName: 'amana-tenant-edition-9x16-yo.mp4', available: false }),
    }),
    landscape: Object.freeze({
      en: Object.freeze({ file: 'amana-tenant-commercial-16x9.mp4', downloadName: 'amana-tenant-edition-16x9-en.mp4', available: true }),
      ha: Object.freeze({ file: null, downloadName: 'amana-tenant-edition-16x9-ha.mp4', available: false }),
      ig: Object.freeze({ file: null, downloadName: 'amana-tenant-edition-16x9-ig.mp4', available: false }),
      yo: Object.freeze({ file: null, downloadName: 'amana-tenant-edition-16x9-yo.mp4', available: false }),
    }),
  }),
  landlord: Object.freeze({
    vertical: Object.freeze({
      en: Object.freeze({ file: 'amana-landlord-commercial-9x16.mp4', downloadName: 'amana-landlord-agent-9x16-en.mp4', available: true }),
      ha: Object.freeze({ file: null, downloadName: 'amana-landlord-agent-9x16-ha.mp4', available: false }),
      ig: Object.freeze({ file: null, downloadName: 'amana-landlord-agent-9x16-ig.mp4', available: false }),
      yo: Object.freeze({ file: null, downloadName: 'amana-landlord-agent-9x16-yo.mp4', available: false }),
    }),
    landscape: Object.freeze({
      en: Object.freeze({ file: 'amana-landlord-commercial-16x9.mp4', downloadName: 'amana-landlord-agent-16x9-en.mp4', available: true }),
      ha: Object.freeze({ file: null, downloadName: 'amana-landlord-agent-16x9-ha.mp4', available: false }),
      ig: Object.freeze({ file: null, downloadName: 'amana-landlord-agent-16x9-ig.mp4', available: false }),
      yo: Object.freeze({ file: null, downloadName: 'amana-landlord-agent-16x9-yo.mp4', available: false }),
    }),
  }),
  protection: Object.freeze({
    vertical: Object.freeze({
      en: Object.freeze({ file: 'amana-protection-commercial-9x16.mp4', downloadName: 'amana-property-protection-9x16-en.mp4', available: true }),
      ha: Object.freeze({ file: null, downloadName: 'amana-property-protection-9x16-ha.mp4', available: false }),
      ig: Object.freeze({ file: null, downloadName: 'amana-property-protection-9x16-ig.mp4', available: false }),
      yo: Object.freeze({ file: null, downloadName: 'amana-property-protection-9x16-yo.mp4', available: false }),
    }),
    landscape: Object.freeze({
      en: Object.freeze({ file: 'amana-protection-commercial-16x9.mp4', downloadName: 'amana-property-protection-16x9-en.mp4', available: true }),
      ha: Object.freeze({ file: null, downloadName: 'amana-property-protection-16x9-ha.mp4', available: false }),
      ig: Object.freeze({ file: null, downloadName: 'amana-property-protection-16x9-ig.mp4', available: false }),
      yo: Object.freeze({ file: null, downloadName: 'amana-property-protection-16x9-yo.mp4', available: false }),
    }),
  }),
});

const PROMO_VIDEOS_DIR = path.resolve(__dirname, '..', '..', 'client', 'public', 'promo-videos');

const getPromoAsset = (edition, format, language) => {
  const editionAssets = PROMO_VIDEO_ASSETS[edition];
  if (!editionAssets) return null;
  const formatAssets = editionAssets[format];
  if (!formatAssets) return null;
  return formatAssets[language] || null;
};

const resolvePromoAssetFile = (edition, format, language) => {
  const asset = getPromoAsset(edition, format, language);
  if (!asset || !asset.available || !asset.file) return null;
  const safeName = path.basename(asset.file);
  if (safeName !== asset.file || !/^[a-zA-Z0-9._-]+\.mp4$/i.test(safeName)) return null;
  const absPath = path.resolve(PROMO_VIDEOS_DIR, safeName);
  if (!absPath.startsWith(PROMO_VIDEOS_DIR + path.sep)) return null;
  return { ...asset, file: safeName, absPath };
};

const getPublicPromoManifest = () => ({
  languages: PROMO_LANGUAGES.map((l) => ({ ...l })),
  editions: PROMO_EDITIONS.map((e) => ({ ...e })),
  formats: PROMO_FORMATS.map((f) => ({ ...f })),
  assets: Object.fromEntries(
    Object.entries(PROMO_VIDEO_ASSETS).map(([editionId, formats]) => [
      editionId,
      Object.fromEntries(
        Object.entries(formats).map(([formatId, langs]) => [
          formatId,
          Object.fromEntries(
            Object.entries(langs).map(([lang, asset]) => [
              lang,
              {
                available: Boolean(asset.available && asset.file),
                downloadName: asset.downloadName,
                // Public URL for the currently available asset; null when unavailable.
                src: asset.available && asset.file ? `/promo-videos/${path.basename(asset.file)}` : null,
              },
            ])
          ),
        ])
      ),
    ])
  ),
});

module.exports = {
  PROMO_LANGUAGES,
  PROMO_EDITIONS,
  PROMO_FORMATS,
  PROMO_VIDEO_ASSETS,
  PROMO_VIDEOS_DIR,
  getPromoAsset,
  resolvePromoAssetFile,
  getPublicPromoManifest,
};
