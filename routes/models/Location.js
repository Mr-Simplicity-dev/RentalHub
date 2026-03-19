const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema({
  state: String,
  lga: String,
  slug: String
});

module.exports = mongoose.model("Location", locationSchema);