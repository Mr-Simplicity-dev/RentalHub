// controllers/disputeSignature.controller.js
const Dispute = require('../models/Dispute');
const { signDocument } = require('../services/signature.service');
const AuditLog = require('../models/AuditLog');

exports.signDisputeResolution = async (req, res) => {
  const { disputeId } = req.params;
  const userId = req.user.id;

  const dispute = await Dispute.findById(disputeId);
  if (!dispute || !dispute.resolution)
    return res.status(400).json({ message: 'Resolution not ready' });

  if (dispute.isLegallySealed)
    return res.status(400).json({ message: 'Dispute already sealed' });

  const buffer = Buffer.from(JSON.stringify(dispute.resolution));

  const { hash, signature } = await signDocument({
    userId,
    documentId: dispute._id,
    documentType: 'dispute_resolution',
    documentBuffer: buffer
  });

  dispute.legalSignatures.push(signature._id);

  // If two signatures exist → seal
  if (dispute.legalSignatures.length >= 2) {
    dispute.isLegallySealed = true;
    dispute.sealedAt = new Date();
  }

  await dispute.save();

  // 🔗 Add to audit hash chain
  await AuditLog.createHashChainEntry({
    action: 'DISPUTE_SIGNED',
    userId,
    entityId: dispute._id,
    metadata: { hash }
  });

  res.json({ message: 'Dispute signed successfully' });
};