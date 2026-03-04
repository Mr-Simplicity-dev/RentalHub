import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';

export default function VerifyCase() {

  const [searchParams] = useSearchParams();
  const disputeFromUrl = searchParams.get('dispute');

  const [disputeId, setDisputeId] = useState(disputeFromUrl || '');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const verifyCase = useCallback(async (id) => {

    const targetId = id || disputeId;

    if (!targetId) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {

      const res = await axios.get(
        `/evidence/verify/dispute/${targetId}`
      );

      setResult(res.data.verification);

    } catch (err) {

      console.error(err);
      setError('Verification failed. Dispute may not exist.');

    } finally {
      setLoading(false);
    }

  }, [disputeId]);

  // Auto verify if QR code opened the page
  useEffect(() => {

    if (disputeFromUrl) {
      verifyCase(disputeFromUrl);
    }

  }, [disputeFromUrl, verifyCase]);

  return (
    <div style={{ padding: 40 }}>

      <h2>Digital Evidence Verification</h2>

      <p>Enter Dispute ID to verify evidence integrity</p>

      <input
        type="text"
        value={disputeId}
        onChange={(e) => setDisputeId(e.target.value)}
        placeholder="Dispute ID"
        style={{ marginRight: 10 }}
      />

      <button onClick={() => verifyCase()}>
        Verify
      </button>

      {loading && <p>Verifying evidence...</p>}

      {error && (
        <p style={{ color: 'red' }}>
          {error}
        </p>
      )}

      {result && (

        <div style={{ marginTop: 30 }}>

          <h3>Verification Result</h3>

          <p>
            <strong>Merkle Root:</strong> {result.merkleRoot}
          </p>

          <p>
            <strong>Merkle Root Valid:</strong>{' '}
            {result.merkleValid ? 'YES ✓' : 'NO ✗'}
          </p>

          <h4>Evidence Files</h4>

          {result.files.map((file, i) => (

            <div key={i}>
              <strong>{file.file}</strong>
              <br />

              Integrity:{' '}
              {file.valid
                ? 'VERIFIED ✓'
                : 'TAMPERED ✗'}

              <hr />
            </div>

          ))}

        </div>

      )}

    </div>
  );

}