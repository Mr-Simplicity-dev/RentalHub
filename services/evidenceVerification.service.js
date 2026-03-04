const crypto = require('crypto');
const fs = require('fs');
const db = require('../config/middleware/database');
const { buildMerkleRoot } = require('./merkleEvidence.service');

exports.verifyDisputeEvidence = async (disputeId) => {

  const evidence = await db.query(
    `SELECT file_name, file_path, file_hash
     FROM dispute_evidence
     WHERE dispute_id = $1`,
    [disputeId]
  );

  const dispute = await db.query(
    `SELECT evidence_merkle_root
     FROM disputes
     WHERE id = $1`,
    [disputeId]
  );

  const evidenceHashes = [];
  const results = [];

  for (const ev of evidence.rows) {

    const buffer = fs.readFileSync(ev.file_path);

    const recalculated = crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');

    const valid = recalculated === ev.file_hash;

    results.push({
      file: ev.file_name,
      storedHash: ev.file_hash,
      recalculatedHash: recalculated,
      valid
    });

    evidenceHashes.push(ev.file_hash);
  }

  const merkleRoot = buildMerkleRoot(evidenceHashes);

  const merkleValid =
    merkleRoot === dispute.rows[0].evidence_merkle_root;

  return {
    files: results,
    merkleRoot,
    merkleValid
  };

};