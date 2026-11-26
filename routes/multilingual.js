const express = require('express');
const router = express.Router();
const { getPublicMultilingualConfig } = require('../config/utils/multilingualConfig');

router.get('/config', (req, res) => {
  res.json({ success: true, data: getPublicMultilingualConfig() });
});

module.exports = router;
