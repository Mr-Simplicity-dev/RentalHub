const express = require('express');
const router = express.Router();
const virtualAccountService = require('../services/virtualAccountService');
const { authenticate, requireSuperAdmin } = require('../config/middleware/auth');

router.get('/accounts', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const result = await virtualAccountService.listVirtualAccounts({
      status: req.query.status,
      kind: req.query.kind,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    (req.logger || console).error('List virtual accounts error:', error.message);
    res.status(500).json({ success: false, message: 'Could not load virtual accounts' });
  }
});

router.get('/events', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const result = await virtualAccountService.listEvents({
      processed: req.query.processed,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    (req.logger || console).error('List virtual account events error:', error.message);
    res.status(500).json({ success: false, message: 'Could not load payment events' });
  }
});

module.exports = router;
