const express = require("express");
const router = express.Router();
const { getBlog } = require("../controllers/blogController");

router.get("/blog/:slug", getBlog);

module.exports = router;