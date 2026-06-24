const express = require('express');
const adCtrl = require('../controllers/adController');

const router = express.Router();

router.get('/', adCtrl.listPublicAds);
router.post('/:id/impression', adCtrl.recordAdImpression);
router.post('/:id/click', adCtrl.recordAdClick);

module.exports = router;
