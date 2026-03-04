const axios = require('axios');
const db = require('../config/middleware/database');

exports.anchorEvidence = async (disputeId, merkleRoot) => {

  try {

    const response = await axios.post(
      'https://api.opentimestamps.org/api/v1/timestamp',
      merkleRoot,
      {
        headers: {
          'Content-Type': 'application/octet-stream'
        }
      }
    );

    const timestampProof = response.data.toString('hex');

    await db.query(
      `UPDATE disputes
       SET evidence_anchor = $1,
           evidence_anchor_created_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [timestampProof, disputeId]
    );

    return timestampProof;

  } catch (error) {

    console.error('Evidence anchoring failed:', error.message);
    return null;

  }

};