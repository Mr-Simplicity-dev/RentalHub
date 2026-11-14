const express = require('express');
const {
  createStore
} = require('../services/seo/core');
const db = createStore(require('../config/middleware/database'));
const {
  ACTIVE_PROPERTY_FILTER
} = require('../config/utils/seoPageService');
const {
  isSearchCrawler,
  renderPageHtml,
  escapeHtml
} = require('../config/utils/seoHtmlRenderer');
const {
  safeJson
} = require('../config/utils/seoPolicy');
const {
  getFrontendUrl
} = require('../config/utils/frontendUrl');
const router = express.Router();
router.get('/properties/:id(\\d+)', async (req, res, next) => {
  if (!isSearchCrawler(req.get('user-agent'))) return next();
  res.vary('User-Agent');
  try {
    const property = (await db.query(`SELECT p.id,p.title,p.city,p.area,p.rent_amount,p.payment_frequency,p.updated_at,s.state_name FROM properties p JOIN states s ON s.id=p.state_id WHERE p.id=$1 AND ${ACTIVE_PROPERTY_FILTER}`, [req.params.id])).rows[0];
    if (!property) {
      res.set('X-Robots-Tag', 'noindex, follow');
      return res.status(404).type('html').send('<!doctype html><html lang="en"><head><meta name="robots" content="noindex,follow"><title>Property unavailable</title></head><body><h1>This property is not currently available</h1><a href="/properties">Browse current listings</a></body></html>');
    }
    const canonical = getFrontendUrl() + '/properties/' + property.id,
      title = property.title + ' | Amana RentalHub NG',
      description = `View this current verified rental listing in ${property.city || property.state_name}. Check the listing for full features, rent terms and availability.`;
    const rent = property.rent_amount!=null && Number.isFinite(Number(property.rent_amount)) && Number(property.rent_amount)>0 ? '₦'+Number(property.rent_amount).toLocaleString('en-NG') : 'Not specified';
    const body = '<h1>' + escapeHtml(property.title) + '</h1><p>' + escapeHtml(property.city || property.state_name) + '</p><p>' + escapeHtml(description) + '</p><p>Asking rent: ' + escapeHtml(rent) + ' / ' + escapeHtml(property.payment_frequency || 'specified period') + '</p><p><a href="' + escapeHtml(canonical) + '">Open this property</a> · <a href="/properties">Browse rental homes</a></p>';
    const jsonLd = safeJson({
      '@context': 'https://schema.org',
      '@type': 'RealEstateListing',
      name: property.title,
      url: canonical,
      description
    });
    const html = renderPageHtml({
      title,
      description,
      canonical,
      body,
      jsonLd
    }).replace(/<script\s/g, `<script nonce="${res.locals?.cspNonce || ''}" `);
    res.type('html').send(html);
  } catch (e) {
    req.logger?.error('Public property metadata unavailable', {
      code: e.code
    });
    res.set('X-Robots-Tag', 'noindex');
    res.status(503).send('Property data is temporarily unavailable.');
  }
});
module.exports = router;
