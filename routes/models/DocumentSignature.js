// models/DocumentSignature.js
const mongoose = require('mongoose');

const documentSignatureSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  documentType: { type: String, required: true },
  signerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  signature: { type: String, required: true },
  signedHash: { type: String, required: true },
  algorithm: { type: String, default: 'RSA-2048' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DocumentSignature', documentSignatureSchema);