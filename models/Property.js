const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema(
  {},
  {
    strict: false,
    collection: 'properties',
  }
);

module.exports =
  mongoose.models.Property || mongoose.model('Property', propertySchema);
