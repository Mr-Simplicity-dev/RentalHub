const db = require('../config/middleware/database');
const { logAction } = require('../utils/auditLogger');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { buildMerkleRoot } = require('../services/merkleEvidence.service');
const { anchorEvidence } = require('../services/evidenceAnchor.service');

// Create dispute
exports.createDispute = async (req, res) => {
  try {
    const { property_id, against_user, title, description, priority = 'normal' } = req.body;
    const openedBy = req.user.id;

    if (!property_id || !against_user || !title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    const result = await db.query(
      `INSERT INTO disputes 
       (property_id, opened_by, against_user, title, description, priority)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [property_id, openedBy, against_user, title, description, priority]
    );

    // Audit log
    await logAction({
      actorId: openedBy,
      action: 'Created dispute',
      targetType: 'dispute',
      targetId: result.rows[0].id,
      ip: req.ip
    });

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Create dispute error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create dispute'
    });
  }
};

// Get disputes for property
exports.getDisputes = async (req, res) => {
  try {
    const { propertyId } = req.params;

    const result = await db.query(
      `SELECT d.*, 
              u1.full_name as opened_by_name,
              u2.full_name as against_name
       FROM disputes d
       JOIN users u1 ON d.opened_by = u1.id
       JOIN users u2 ON d.against_user = u2.id
       WHERE d.property_id = $1
       ORDER BY d.created_at DESC`,
      [propertyId]
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Get disputes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch disputes'
    });
  }
};

// Add message to dispute
exports.addDisputeMessage = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { message } = req.body;
    const senderId = req.user.id;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // 🔒 Check if dispute exists and if it is legally sealed
    const disputeCheck = await db.query(
      `SELECT is_legally_sealed FROM disputes WHERE id = $1`,
      [disputeId]
    );

    if (disputeCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dispute not found'
      });
    }

    if (disputeCheck.rows[0].is_legally_sealed) {
      return res.status(403).json({
        success: false,
        message: 'This dispute is legally sealed and cannot be modified'
      });
    }

    const result = await db.query(
      `INSERT INTO dispute_messages (dispute_id, sender_id, message)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [disputeId, senderId, message]
    );

    await logAction({
      actorId: senderId,
      action: 'Added dispute message',
      targetType: 'dispute',
      targetId: disputeId,
      ip: req.ip
    });

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Add dispute message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add message'
    });
  }
};

// Resolve dispute (Admin only)
exports.resolveDispute = async (req, res) => {
  try {
    const { disputeId } = req.params;

    // Prevent resolving a legally sealed dispute
            const result = await db.query(
            `UPDATE disputes
            SET status = 'resolved',
                resolved_at = CURRENT_TIMESTAMP
            WHERE id = $1
            AND is_legally_sealed = FALSE
            RETURNING *`,
            [disputeId]
            );

            if (result.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Dispute not found or it is legally sealed and cannot be modified'
            });
            }

    

    await logAction({
      actorId: req.user.id,
      action: 'Resolved dispute',
      targetType: 'dispute',
      targetId: disputeId,
      ip: req.ip
    });

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Resolve dispute error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve dispute'
    });
  }
};

exports.uploadEvidence = async (req, res) => {
  try {
    const { disputeId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'File required'
      });
    }

    // 🔒 Check if dispute exists and is not legally sealed
    const disputeCheck = await db.query(
      `SELECT id, is_legally_sealed FROM disputes WHERE id = $1`,
      [disputeId]
    );

    if (disputeCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dispute not found'
      });
    }

    if (disputeCheck.rows[0].is_legally_sealed) {
      return res.status(403).json({
        success: false,
        message: 'This dispute is legally sealed. Evidence cannot be added.'
      });
    }

    // Generate SHA256 hash
    const fileBuffer = fs.readFileSync(req.file.path);

    const hash = crypto
      .createHash('sha256')
      .update(fileBuffer)
      .digest('hex');

    const result = await db.query(
      `INSERT INTO dispute_evidence
       (dispute_id, uploaded_by, file_name, file_path, mime_type, file_size, file_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        disputeId,
        req.user.id,
        req.file.originalname,
        req.file.path,
        req.file.mimetype,
        req.file.size,
        hash
      ]
    );

    // Audit log
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id)
       VALUES ($1,$2,$3,$4)`,
      [req.user.id, 'Uploaded dispute evidence (hashed)', 'dispute', disputeId]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Evidence upload error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to upload evidence'
    });
  }
};

exports.getEvidence = async (req, res) => {
  const { evidenceId } = req.params;

  const result = await db.query(
    `SELECT * FROM dispute_evidence WHERE id = $1`,
    [evidenceId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false });
  }

  const evidence = result.rows[0];

  res.sendFile(require('path').resolve(evidence.file_path));
};


exports.verifyEvidenceIntegrity = async (req, res) => {
  try {
    const { evidenceId } = req.params;

    const result = await db.query(
      `SELECT * FROM dispute_evidence WHERE id = $1`,
      [evidenceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false });
    }

    const evidence = result.rows[0];

    const fileBuffer = fs.readFileSync(evidence.file_path);
    const currentHash = crypto
      .createHash('sha256')
      .update(fileBuffer)
      .digest('hex');

    const integrityValid = currentHash === evidence.file_hash;

    res.json({
      success: true,
      integrityValid,
      storedHash: evidence.file_hash,
      currentHash
    });

  } catch (error) {
    console.error('Integrity check error:', error);
    res.status(500).json({
      success: false,
      message: 'Integrity verification failed'
    });
  }
};

exports.verifySignature = async ({ signatureId }) => {
  const record = await DocumentSignature.findById(signatureId)
    .populate('signerId');

  const userKey = await UserKey.findOne({ userId: record.signerId._id });

  const verify = crypto.createVerify('SHA256');
  verify.update(record.signedHash);
  verify.end();

  const isValid = verify.verify(userKey.publicKey, record.signature, 'hex');

  return isValid;
};

exports.sealDispute = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const actorId = req.user.id;

    // Check dispute exists
    const disputeCheck = await db.query(
      `SELECT id, is_legally_sealed, status
       FROM disputes
       WHERE id = $1`,
      [disputeId]
    );

    if (disputeCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dispute not found'
      });
    }

    const dispute = disputeCheck.rows[0];

    // Already sealed
    if (dispute.is_legally_sealed) {
      return res.status(400).json({
        success: false,
        message: 'Dispute already sealed'
      });
    }

    // Only resolved disputes should be sealed
    if (dispute.status !== 'resolved') {
      return res.status(400).json({
        success: false,
        message: 'Only resolved disputes can be sealed'
      });
    }

    
                // =============================
            // Build Evidence Merkle Root
            // =============================

            const evidenceResult = await db.query(
            `SELECT file_hash FROM dispute_evidence WHERE dispute_id = $1`,
            [disputeId]
            );

            const evidenceHashes = evidenceResult.rows.map(e => e.file_hash);

            const merkleRoot = buildMerkleRoot(evidenceHashes);

            // =============================
            // Seal Dispute
            // =============================

            const result = await db.query(
            `UPDATE disputes
            SET is_legally_sealed = TRUE,
                sealed_at = CURRENT_TIMESTAMP,
                sealed_by = $1,
                evidence_merkle_root = $2
            WHERE id = $3
            RETURNING *`,
            [actorId, merkleRoot, disputeId]
            );

        // =============================
        // Public Timestamp Anchor
        // =============================

        await anchorEvidence(disputeId, merkleRoot);

            // Audit log
            await db.query(
            `INSERT INTO audit_logs (actor_id, action, target_type, target_id)
            VALUES ($1,$2,$3,$4)`,
            [
                actorId,
                'Legally sealed dispute',
                'dispute',
                disputeId
            ]
            );

            res.json({
            success: true,
            message: 'Dispute sealed successfully',
            data: result.rows[0]
            });

        } catch (error) {
            console.error('Seal dispute error:', error);

        res.status(500).json({
        success: false,
        message: 'Failed to seal dispute'
        });
  }
};