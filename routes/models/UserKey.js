// models/UserKey.js
const mongoose = require('mongoose');

const userKeySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  publicKey: { type: String, required: true },
  privateKeyEncrypted: { type: String, required: true },
  algorithm: { type: String, default: 'RSA-2048' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('UserKey', userKeySchema);