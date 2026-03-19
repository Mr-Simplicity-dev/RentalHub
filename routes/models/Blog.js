const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema({
  title: String,
  slug: String,
  content: String,
  keywords: [String],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Blog", blogSchema);