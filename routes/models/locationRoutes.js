const express = require('express');

const {
  getAreaPage,
  getLocationPage,
  getNigeriaDirectory,
} = require('../../controllers/locationController');

const router = express.Router();
const { hidePropertyContacts } = require('../../config/utils/propertyContactPrivacy');

router.get('/nigeria', hidePropertyContacts, getNigeriaDirectory);
router.get('/nigeria/:stateSlug/:lgaSlug', hidePropertyContacts, getLocationPage);
router.get('/nigeria/:stateSlug', hidePropertyContacts, getLocationPage);
router.get('/areas/:stateSlug/:citySlug/:areaSlug', hidePropertyContacts, getAreaPage);

module.exports = router;
