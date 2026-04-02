const crypto = require('crypto');
const fs = require('fs');
const db = require('../config/middleware/database');
const { buildMerkleRoot } = require('./merkleEvidence.service');
const { logAction } = require('../config/utils/auditLogger');
const { ensureEvidenceIntegritySchema } = require('../config/utils/legalSchema');

const HASH_ALGORITHM = 'sha256';

const hashFile = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash(HASH_ALGORITHM).update(buffer).digest('hex');
};

const resolveIssueType = ({ fileMissing, hashMismatch, merkleMismatch, errorMessage }) => {
  if (errorMessage) return 'scan_error';
  if (fileMissing) return 'file_missing';
  if (hashMismatch && merkleMismatch) return 'hash_and_merkle_mismatch';
  if (hashMismatch) return 'hash_mismatch';
  if (merkleMismatch) return 'merkle_mismatch';
  return 'none';
};

const resolveStatus = ({ fileMissing, hashMismatch, merkleMismatch, errorMessage }) => {
  if (errorMessage) return 'error';
  if (fileMissing) return 'missing';
  if (hashMismatch || merkleMismatch) return 'tampered';
  return 'verified';
};

const upsertMonitorRow = async ({
  evidenceId,
  disputeId,
  fileName,
  storedHash,
  currentHash,
  storedMerkleRoot,
  currentMerkleRoot,
  status,
  issueType,
  errorMessage,
}) => {
  const existingResult = await db.query(
    `SELECT status, issue_type, consecutive_failures, tamper_detected_at
     FROM evidence_integrity_monitor
     WHERE evidence_id = $1`,
    [evidenceId]
  );

  const existing = existingResult.rows[0] || null;
  const statusChanged =
    !existing ||
    existing.status !== status ||
    existing.issue_type !== issueType;

  const result = await db.query(
    `INSERT INTO evidence_integrity_monitor (
       evidence_id,
       dispute_id,
       file_name,
       stored_hash,
       last_computed_hash,
       stored_merkle_root,
       last_computed_merkle_root,
       status,
       issue_type,
       last_error,
       consecutive_failures,
       tamper_detected_at,
       last_status_change_at,
       last_checked_at,
       updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       CASE WHEN $8 = 'verified' THEN 0 ELSE 1 END,
       CASE WHEN $8 IN ('tampered', 'missing', 'error') THEN CURRENT_TIMESTAMP ELSE NULL END,
       CASE WHEN $11 THEN CURRENT_TIMESTAMP ELSE NULL END,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
     )
     ON CONFLICT (evidence_id) DO UPDATE
     SET dispute_id = EXCLUDED.dispute_id,
         file_name = EXCLUDED.file_name,
         stored_hash = EXCLUDED.stored_hash,
         last_computed_hash = EXCLUDED.last_computed_hash,
         stored_merkle_root = EXCLUDED.stored_merkle_root,
         last_computed_merkle_root = EXCLUDED.last_computed_merkle_root,
         status = EXCLUDED.status,
         issue_type = EXCLUDED.issue_type,
         last_error = EXCLUDED.last_error,
         consecutive_failures = CASE
           WHEN EXCLUDED.status = 'verified' THEN 0
           ELSE evidence_integrity_monitor.consecutive_failures + 1
         END,
         tamper_detected_at = CASE
           WHEN EXCLUDED.status IN ('tampered', 'missing', 'error')
             THEN COALESCE(evidence_integrity_monitor.tamper_detected_at, CURRENT_TIMESTAMP)
           ELSE NULL
         END,
         last_status_change_at = CASE
           WHEN evidence_integrity_monitor.status IS DISTINCT FROM EXCLUDED.status
             OR evidence_integrity_monitor.issue_type IS DISTINCT FROM EXCLUDED.issue_type
             THEN CURRENT_TIMESTAMP
           ELSE evidence_integrity_monitor.last_status_change_at
         END,
         last_checked_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      evidenceId,
      disputeId,
      fileName,
      storedHash || null,
      currentHash || null,
      storedMerkleRoot || null,
      currentMerkleRoot || null,
      status,
      issueType,
      errorMessage || null,
      statusChanged,
    ]
  );

  return {
    row: result.rows[0],
    statusChanged,
    previousStatus: existing?.status || null,
    previousIssueType: existing?.issue_type || null,
  };
};

const fetchDisputesForIntegrityScan = async (limit = 200) => {
  const result = await db.query(
    `SELECT DISTINCT
       d.id,
       d.evidence_merkle_root
     FROM disputes d
     JOIN dispute_evidence e ON e.dispute_id = d.id
     ORDER BY d.id DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
};

const fetchDisputeEvidence = async (disputeId) => {
  const result = await db.query(
    `SELECT
       id,
       dispute_id,
       file_name,
       file_path,
       file_hash
     FROM dispute_evidence
     WHERE dispute_id = $1
     ORDER BY id ASC`,
    [disputeId]
  );

  return result.rows;
};

const runEvidenceIntegrityMonitor = async ({ limit = 200 } = {}) => {
  await ensureEvidenceIntegritySchema();

  const disputes = await fetchDisputesForIntegrityScan(limit);
  const summary = {
    checked_disputes: 0,
    checked_evidence: 0,
    verified: 0,
    tampered: 0,
    missing: 0,
    errors: 0,
  };

  for (const dispute of disputes) {
    const evidenceRows = await fetchDisputeEvidence(dispute.id);
    if (!evidenceRows.length) continue;

    summary.checked_disputes += 1;

    const recalculatedHashes = [];
    const computedByEvidenceId = new Map();

    for (const evidence of evidenceRows) {
      let currentHash = null;
      let fileMissing = false;
      let errorMessage = null;

      try {
        if (!evidence.file_path || !fs.existsSync(evidence.file_path)) {
          fileMissing = true;
        } else {
          currentHash = hashFile(evidence.file_path);
        }
      } catch (error) {
        errorMessage = error.message;
      }

      if (currentHash) {
        recalculatedHashes.push(currentHash);
      }

      computedByEvidenceId.set(evidence.id, {
        currentHash,
        fileMissing,
        errorMessage,
      });
    }

    const currentMerkleRoot = recalculatedHashes.length
      ? buildMerkleRoot(recalculatedHashes)
      : null;
    const merkleMismatch =
      Boolean(dispute.evidence_merkle_root) &&
      Boolean(currentMerkleRoot) &&
      currentMerkleRoot !== dispute.evidence_merkle_root;

    for (const evidence of evidenceRows) {
      const computed = computedByEvidenceId.get(evidence.id) || {};
      const hashMismatch =
        Boolean(computed.currentHash) &&
        Boolean(evidence.file_hash) &&
        computed.currentHash !== evidence.file_hash;

      const issueType = resolveIssueType({
        fileMissing: computed.fileMissing,
        hashMismatch,
        merkleMismatch,
        errorMessage: computed.errorMessage,
      });
      const status = resolveStatus({
        fileMissing: computed.fileMissing,
        hashMismatch,
        merkleMismatch,
        errorMessage: computed.errorMessage,
      });

      const monitorResult = await upsertMonitorRow({
        evidenceId: evidence.id,
        disputeId: dispute.id,
        fileName: evidence.file_name,
        storedHash: evidence.file_hash,
        currentHash: computed.currentHash,
        storedMerkleRoot: dispute.evidence_merkle_root,
        currentMerkleRoot,
        status,
        issueType,
        errorMessage: computed.errorMessage,
      });

      summary.checked_evidence += 1;
      if (status === 'verified') summary.verified += 1;
      if (status === 'tampered') summary.tampered += 1;
      if (status === 'missing') summary.missing += 1;
      if (status === 'error') summary.errors += 1;

      if (monitorResult.statusChanged && status !== 'verified') {
        await logAction({
          actorId: null,
          action: `EVIDENCE_INTEGRITY_${status.toUpperCase()}`,
          targetType: 'evidence',
          targetId: evidence.id,
        });
      }
    }
  }

  return summary;
};

module.exports = {
  runEvidenceIntegrityMonitor,
};
