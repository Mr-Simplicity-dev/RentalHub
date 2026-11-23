const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const {
  PROMO_LANGUAGES,
  PROMO_EDITIONS,
  PROMO_FORMATS,
  getPromoAsset,
  resolvePromoAssetFile,
  getPublicPromoManifest,
} = require('../config/promo/promoVideoCatalog');

const router = express.Router();

const promoDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 120 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many promo download requests. Please try again later.' },
});

const isKnown = (value, allowed) => allowed.includes(String(value || ''));

router.get('/manifest', (_req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
    Pragma: 'no-cache',
    Expires: '0',
  });
  res.json({
    success: true,
    data: getPublicPromoManifest(),
  });
});

router.get('/download/:edition/:format/:lang', promoDownloadLimiter, (req, res) => {
  const edition = String(req.params.edition || '').trim();
  const format = String(req.params.format || '').trim();
  const lang = String(req.params.lang || '').trim().toLowerCase();

  const editionIds = PROMO_EDITIONS.map((e) => e.id);
  const formatIds = PROMO_FORMATS.map((f) => f.id);
  const langIds = PROMO_LANGUAGES.map((l) => l.code);

  if (!isKnown(edition, editionIds) || !isKnown(format, formatIds) || !isKnown(lang, langIds)) {
    return res.status(400).json({ success: false, message: 'Invalid promo video selection.' });
  }

  const asset = getPromoAsset(edition, format, lang);
  if (!asset || !asset.available) {
    return res.status(404).json({
      success: false,
      message: 'This language version is not available yet.',
      code: 'PROMO_LANGUAGE_UNAVAILABLE',
    });
  }

  const resolved = resolvePromoAssetFile(edition, format, lang);
  if (!resolved || !fs.existsSync(resolved.absPath)) {
    return res.status(404).json({
      success: false,
      message: 'Promo video file is not available.',
      code: 'PROMO_FILE_MISSING',
    });
  }

  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Content-Type-Options': 'nosniff',
  });

  const downloadName = /^[a-zA-Z0-9._-]+\.mp4$/i.test(String(asset.downloadName || ''))
    ? asset.downloadName
    : path.basename(resolved.file);

  return res.download(resolved.absPath, downloadName, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ success: false, message: 'Promo video file is not available.' });
    }
  });
});

module.exports = router;
