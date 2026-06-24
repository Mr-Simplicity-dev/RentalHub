// models/Dispute.js
resolution: {
  summary: String,
  decision: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: Date
},

legalSignatures: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: 'DocumentSignature'
}],

isLegallySealed: {
  type: Boolean,
  default: false
},

sealedAt: Date