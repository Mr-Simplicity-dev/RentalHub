const express = require("express");
const router = express.Router();

const {
  getLocationPage
} = require("../controllers/locationController");

// 🔥 LGA route (must come FIRST)
router.get("/nigeria/:stateSlug/:lgaSlug", getLocationPage);

// 🔥 State route
router.get("/nigeria/:stateSlug", getLocationPage);

module.exports = router;