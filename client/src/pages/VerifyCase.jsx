import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useSearchParams } from "react-router-dom";

export default function VerifyCase() {

  const [searchParams] = useSearchParams();
  const disputeFromUrl = searchParams.get("dispute");

  const [disputeId, setDisputeId] = useState(disputeFromUrl || "");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const verifyCase = useCallback(async (id) => {

    const targetId = id || disputeId;

    if (!targetId) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {

      const res = await axios.get(
        `/evidence/verify/dispute/${targetId}`
      );

      setResult(res.data.verification);

    } catch (err) {

      console.error(err);
      setError("Verification failed. Dispute may not exist.");

    } finally {
      setLoading(false);
    }

  }, [disputeId]);

  useEffect(() => {
    if (disputeFromUrl) {
      verifyCase(disputeFromUrl);
    }
  }, [disputeFromUrl, verifyCase]);

  return (

    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">

      <div className="w-full max-w-3xl bg-white border border-soft rounded-xl2 shadow-card p-8 space-y-6 animate-fadeIn">

        {/* HEADER */}

        <div className="text-center">

          <h1 className="text-2xl font-semibold">
            Digital Evidence Verification
          </h1>

          <p className="text-gray-500 text-sm mt-1">
            Verify the integrity of dispute evidence here
          </p>

        </div>


        {/* SEARCH BAR */}

        <div className="flex gap-3">

          <input
            type="text"
            value={disputeId}
            onChange={(e) => setDisputeId(e.target.value)}
            placeholder="Enter Dispute ID"
            className="flex-1 border border-soft rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />

          <button
            onClick={() => verifyCase()}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 transition"
          >
            Verify
          </button>

        </div>


        {/* LOADING */}

        {loading && (
          <div className="text-center text-sm text-gray-500">
            Verifying evidence integrity...
          </div>
        )}


        {/* ERROR */}

        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}


        {/* RESULT */}

        {result && (

          <div className="space-y-6 border-t border-soft pt-6">

            <h2 className="text-lg font-semibold">
              Verification Result
            </h2>

            {/* MERKLE ROOT */}

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
                  {result.merkleValid ? "VALID ✓" : "INVALID ✗"}
                </span>

              </div>

            </div>


            {/* FILE VERIFICATION */}

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
                      {file.valid ? "VERIFIED ✓" : "TAMPERED ✗"}
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