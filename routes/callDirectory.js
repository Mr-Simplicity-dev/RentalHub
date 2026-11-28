'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/middleware/database');
const { authenticate } = require('../config/middleware/auth');
const realtimeSocket = require('../config/utils/realtimeSocket');
const {
  getCallerPolicy,
  getCallDirectory,
  getCallHistory,
  markIncomingMissedCallsAsViewed,
} = require('../services/callDirectoryService');

router.get('/policy', authenticate, async (req, res) => {
  try {
    const policy = getCallerPolicy(req.user);
    return res.json({ success: true, data: policy });
  } catch (error) {
    req.logger?.error?.('Call policy lookup failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to load call policy' });
  }
});

router.get('/directory', authenticate, async (req, res) => {
  try {
    const data = await getCallDirectory(
      req.user,
      {
        q: req.query.q,
        role: req.query.role,
        state: req.query.state,
        onlineOnly: req.query.onlineOnly,
        limit: req.query.limit,
      },
      db,
      realtimeSocket.isUserOnline
    );
    return res.json({ success: true, data });
  } catch (error) {
    req.logger?.error?.('Call directory lookup failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to load call directory' });
  }
});

router.get('/history', authenticate, async (req, res) => {
  try {
    const data = await getCallHistory(
      req.user,
      {
        filter: req.query.filter,
        limit: req.query.limit,
      },
      db,
      realtimeSocket.isUserOnline
    );
    return res.json({ success: true, data });
  } catch (error) {
    req.logger?.error?.('Call history lookup failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to load call records' });
  }
});

router.patch('/history/viewed', authenticate, async (req, res) => {
  try {
    const updatedCount = await markIncomingMissedCallsAsViewed(req.user?.id, db);
    return res.json({ success: true, data: { updated_count: updatedCount } });
  } catch (error) {
    req.logger?.error?.('Mark missed calls viewed failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to update missed calls' });
  }
});

module.exports = router;
