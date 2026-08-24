const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema({
  state: String,
  displayName: String,
  lga: String,
  slug: String,
  stateSlug: String,
  lgaSlug: String,
  fullSlug: String
});

module.exports = mongoose.model("Location", locationSchema);
