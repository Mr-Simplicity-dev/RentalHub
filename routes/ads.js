const express = require('express');
const { param } = require('express-validator');
const adCtrl = require('../controllers/adController');
const validateRequest = require('../config/middleware/validateRequest');

const router = express.Router();

router.get('/', adCtrl.listPublicAds);
router.post('/:id/impression', [param('id').isInt()], validateRequest, adCtrl.recordAdImpression);
router.post('/:id/click', [param('id').isInt()], validateRequest, adCtrl.recordAdClick);

module.exports = router;
