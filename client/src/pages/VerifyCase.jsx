import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useSearchParams } from "react-router-dom";
import BackToDashboard from "../components/common/BackToDashboard";
import { useTranslation } from 'react-i18next';

const VERIFICATION_FEE_LABEL = "N20,000";

export default function VerifyCase() {
  const { t } = useTranslation();
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
          `/api/evidence/verify/dispute/${targetId}`,
          {
            params: { reference },
          }
        );

        setResult(res.data.verification);
      } catch (err) {
        console.error(err);
        setError(
          err.response?.data?.message ||
            t("verify_case.verification_failed_confirm")
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
      setError(t("verify_case.enter_dispute_id"));
      return;
    }

    if (!payerEmail.trim()) {
      setError(t("verify_case.enter_email_pay"));
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await axios.post(
        `/api/evidence/verify/dispute/${targetId}/pay`,
        {
          payer_email: payerEmail,
          payer_name: payerName,
        }
      );

      if (res.data?.data?.authorization_url) {
        window.location.href = res.data.data.authorization_url;
        return;
      }

      setError(t("verify_case.unable_to_start_payment"));
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.message ||
          t("verify_case.init_payment_failed")
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="text-center sm:text-left">
            <h1 className="text-2xl font-semibold">
              {t("verify_case.title")}
            </h1>

            <p className="text-gray-500 text-sm mt-1">
              {t("verify_case.desc", { fee: VERIFICATION_FEE_LABEL })}
            </p>
          </div>

          <BackToDashboard />
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
          <p className="font-medium">{t("verify_case.fee_label", { fee: VERIFICATION_FEE_LABEL })}</p>
          <p className="mt-1">
            {t("verify_case.payment_notice")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            value={disputeId}
            onChange={(e) => setDisputeId(e.target.value)}
            placeholder={t("verify_case.dispute_id_placeholder")}
            className="border border-soft rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />

          <input
            type="email"
            value={payerEmail}
            onChange={(e) => setPayerEmail(e.target.value)}
            placeholder={t("verify_case.email_placeholder")}
            className="border border-soft rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <input
          type="text"
          value={payerName}
          onChange={(e) => setPayerName(e.target.value)}
          placeholder={t("verify_case.name_placeholder")}
          className="w-full border border-soft rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />

        <div className="flex gap-3">
          <button
            onClick={startVerification}
            disabled={loading}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 transition disabled:opacity-70"
          >
            {loading ? t("verify_case.processing") : t("verify_case.pay_btn", { fee: VERIFICATION_FEE_LABEL })}
          </button>
        </div>

        {loading && (
          <div className="text-center text-sm text-gray-500">
            {verificationReference
              ? t("verify_case.confirming")
              : t("verify_case.redirecting")}
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
              {t("verify_case.result_title")}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-soft rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">
                  {t("verify_case.merkle_root")}
                </p>

                <p className="text-sm break-all">
                  {result.merkleRoot}
                </p>
              </div>

              <div className="border border-soft rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">
                  {t("verify_case.root_integrity")}
                </p>

                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    result.merkleValid
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {result.merkleValid ? t("verify_case.valid") : t("verify_case.invalid")}
                </span>
              </div>
            </div>

            <div>
              <h3 className="text-md font-semibold mb-3">
                {t("verify_case.evidence_files")}
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
                        {t("verify_case.file_integrity")}
                      </p>
                    </div>

                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        file.valid
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {file.valid ? t("verify_case.verified") : t("verify_case.tampered")}
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
