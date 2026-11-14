const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema({
  title: String,
  slug: String,
  content: String,
  keywords: [String],
  status: { type: String, enum: ["draft", "published"], default: "draft" },
  approvedBy: Number,
  publishedAt: Date,
  contentPlanId: { type: String, index: { unique: true, sparse: true } },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } });

module.exports = mongoose.model("Blog", blogSchema);