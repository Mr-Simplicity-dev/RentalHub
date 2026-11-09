const express = require('express');

const {
  getAreaPage,
  getLocationPage,
  getNigeriaDirectory,
} = require('../../controllers/locationController');

const router = express.Router();

router.get('/nigeria', getNigeriaDirectory);
router.get('/nigeria/:stateSlug/:lgaSlug', getLocationPage);
router.get('/nigeria/:stateSlug', getLocationPage);
router.get('/areas/:stateSlug/:citySlug/:areaSlug', getAreaPage);

module.exports = router;
