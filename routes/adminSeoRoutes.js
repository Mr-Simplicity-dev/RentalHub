const express = require("express");
const router = express.Router();

const Ranking = require("../models/Ranking");
const Blog = require("../models/Blog");

router.get("/admin/seo", async (req, res) => {
  const rankings = await Ranking.find().limit(50);
  const blogs = await Blog.countDocuments();

  res.json({
    totalBlogs: blogs,
    rankings
  });
});

module.exports = router;