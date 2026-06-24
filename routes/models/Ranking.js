const mongoose = require("mongoose");

const rankingSchema = new mongoose.Schema({
  keyword: String,
  url: String,
  position: Number,
  checkedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Ranking", rankingSchema);