import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useSearchParams } from "react-router-dom";

const VERIFICATION_FEE_LABEL = "N20,000";

export default function VerifyCase() {
  const [searchParams] = useSearchParams();
  const disputeFromUrl = searchParams.get("dispute");
  const verificationReference =
    searchParams.get("verify_ref") ||
    searchParams.get("reference") ||
    searchParams.get("trxref");

  const [disputeId, setDisputeId] = useState(disputeFromUrl || "");
  const [payerEmail, setPayerEmail] = useState("");
  const [payerName, setPayerName] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadPaidVerification = useCallback(
    async (id, reference) => {
      const targetId = id || disputeId;

      if (!targetId || !reference) {
        return;
      }

      setLoading(true);
      setError("");
      setResult(null);

      try {
        const res = await axios.get(
          `/evidence/verify/dispute/${targetId}`,
          {
            params: { reference },
          }
        );

        setResult(res.data.verification);
      } catch (err) {
        console.error(err);
        setError(
          err.response?.data?.message ||
            "Verification failed. Confirm payment and try again."
        );
      } finally {
        setLoading(false);
      }
    },
    [disputeId]
  );

  const startVerification = useCallback(async () => {
    const targetId = disputeId.trim();

    if (!targetId) {
      setError("Enter a dispute ID to continue.");
      return;
    }

    if (!payerEmail.trim()) {
      setError("Enter your email to pay for verification.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await axios.post(
        `/evidence/verify/dispute/${targetId}/pay`,
        {
          payer_email: payerEmail,
          payer_name: payerName,
        }
      );

      if (res.data?.data?.authorization_url) {
        window.location.href = res.data.data.authorization_url;
        return;
      }

      setError("Unable to start payment. Try again.");
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.message ||
          "Failed to initialize verification payment."
      );
      setLoading(false);
    }
  }, [disputeId, payerEmail, payerName]);

  useEffect(() => {
    if (disputeFromUrl) {
      setDisputeId(disputeFromUrl);
    }
  }, [disputeFromUrl]);

  useEffect(() => {
    if (disputeFromUrl && verificationReference) {
      loadPaidVerification(disputeFromUrl, verificationReference);
    }
  }, [disputeFromUrl, verificationReference, loadPaidVerification]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-3xl bg-white border border-soft rounded-xl2 shadow-card p-8 space-y-6 animate-fadeIn">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">
            Digital Evidence Verification
          </h1>

          <p className="text-gray-500 text-sm mt-1">
            Pay {VERIFICATION_FEE_LABEL} to verify the integrity of dispute
            evidence
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
          <p className="font-medium">Verification fee: {VERIFICATION_FEE_LABEL}</p>
          <p className="mt-1">
            Payment is required before any evidence verification result is
            shown.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            value={disputeId}
            onChange={(e) => setDisputeId(e.target.value)}
            placeholder="Enter Dispute ID"
            className="border border-soft rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />

          <input
            type="email"
            value={payerEmail}
            onChange={(e) => setPayerEmail(e.target.value)}
            placeholder="Enter your email"
            className="border border-soft rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <input
          type="text"
          value={payerName}
          onChange={(e) => setPayerName(e.target.value)}
          placeholder="Enter your name (optional)"
          className="w-full border border-soft rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />

        <div className="flex gap-3">
          <button
            onClick={startVerification}
            disabled={loading}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 transition disabled:opacity-70"
          >
            {loading ? "Processing..." : `Pay ${VERIFICATION_FEE_LABEL} to Verify`}
          </button>
        </div>

        {loading && (
          <div className="text-center text-sm text-gray-500">
            {verificationReference
              ? "Confirming payment and verifying evidence..."
              : "Redirecting to secure payment..."}
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-6 border-t border-soft pt-6">
            <h2 className="text-lg font-semibold">
              Verification Result
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-soft rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">
                  Merkle Root
                </p>

                <p className="text-sm break-all">
                  {result.merkleRoot}
                </p>
              </div>

              <div className="border border-soft rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">
                  Root Integrity
                </p>

                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    result.merkleValid
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {result.merkleValid ? "VALID" : "INVALID"}
                </span>
              </div>
            </div>

            <div>
              <h3 className="text-md font-semibold mb-3">
                Evidence Files
              </h3>

              <div className="space-y-3">
                {result.files.map((file, i) => (
                  <div
                    key={i}
                    className="border border-soft rounded-lg p-4 flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium text-sm">
                        {file.file}
                      </p>

                      <p className="text-xs text-gray-500">
                        File integrity verification
                      </p>
                    </div>

                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        file.valid
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {file.valid ? "VERIFIED" : "TAMPERED"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
