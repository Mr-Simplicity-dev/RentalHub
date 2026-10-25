const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin } = require('../config/middleware/auth');
const uploadTourMusic = require('../config/middleware/tourMusicUpload');
const ctrl = require('../controllers/propertyTourMusicController');

router.get('/tracks', authenticate, requireSuperAdmin, ctrl.listTracks);
router.get('/settings', authenticate, requireSuperAdmin, ctrl.getSettings);
router.put('/settings', authenticate, requireSuperAdmin, ctrl.updateSettings);
router.post('/upload', authenticate, requireSuperAdmin, uploadTourMusic, ctrl.uploadTrack);
router.put('/tracks/:id', authenticate, requireSuperAdmin, ctrl.updateTrack);
router.delete('/tracks/:id', authenticate, requireSuperAdmin, ctrl.deleteTrack);

module.exports = router;
