const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin } = require('../config/middleware/auth');
const { uploadPropertyMedia } = require('../config/middleware/upload');
const ctrl = require('../controllers/propertyTourMusicController');
const validateRequest = require('../config/middleware/validateRequest');

router.get('/tracks', authenticate, requireSuperAdmin, ctrl.listTracks);
router.get('/settings', authenticate, requireSuperAdmin, ctrl.getSettings);
router.put('/settings', authenticate, requireSuperAdmin, ctrl.updateSettings);
router.post('/upload', authenticate, requireSuperAdmin, uploadPropertyMedia.single('music'), ctrl.uploadTrack);
router.put('/tracks/:id', authenticate, requireSuperAdmin, ctrl.updateTrack);
router.delete('/tracks/:id', authenticate, requireSuperAdmin, ctrl.deleteTrack);

module.exports = router;
