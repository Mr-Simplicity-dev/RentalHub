import React, { useCallback, useEffect, useRef, useState } from "react";
import api from "../../services/api";
import { toast } from "react-toastify";

/**
 * Reusable admin commission withdrawal modal with bank auto-resolve.
 *
 * Props:
 *  - isOpen          {boolean}
 *  - onClose         {() => void}
 *  - onSubmit        {(form) => Promise<void>}  — receives { amount, bank_name, bank_code, account_number, account_name }
 *  - isLoading       {boolean}
 *  - withdrawable    {number}  optional — shown as "Available" hint
 *  - confirmLabel    {string}  button label override
 */
export default function AdminWithdrawalModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
  withdrawable = null,
  confirmLabel = "Submit Withdrawal",
}) {
  const [form, setForm] = useState({
    amount: "",
    bank_name: "",
    bank_code: "",
    account_number: "",
    account_name: "",
  });
  const [banks, setBanks] = useState([]);
  const [accountNameLoading, setAccountNameLoading] = useState(false);
  const [accountNameError, setAccountNameError] = useState("");
  const debounceRef = useRef(null);

  // Load banks once when the modal opens
  useEffect(() => {
    if (!isOpen) return;
    api.get("/payments/banks")
      .then((res) => { if (res.data?.success) setBanks(res.data.data || []); })
      .catch(() => {});
    // Reset form when opening
    setForm({ amount: "", bank_name: "", bank_code: "", account_number: "", account_name: "" });
    setAccountNameError("");
  }, [isOpen]);

  const resolveAccountName = useCallback(async (bankCode, accountNumber) => {
    if (!bankCode || !accountNumber || accountNumber.length !== 10) return;
    setAccountNameLoading(true);
    setAccountNameError("");
    try {
      const res = await api.post("/payments/verify-account", {
        bank_code: bankCode,
        account_number: accountNumber,
      });
      if (res.data?.success && res.data.data?.account_name) {
        setForm((prev) => ({ ...prev, account_name: res.data.data.account_name }));
      } else {
        setAccountNameError("Could not auto-resolve. Enter account name manually.");
      }
    } catch {
      setAccountNameError("Could not auto-resolve. Enter account name manually.");
    } finally {
      setAccountNameLoading(false);
    }
  }, []);

  const handleBankChange = (e) => {
    const selected = banks.find((b) => b.code === e.target.value);
    setForm((prev) => ({
      ...prev,
      bank_code: e.target.value,
      bank_name: selected?.name || "",
      account_name: "",
    }));
    setAccountNameError("");
    if (form.account_number.length === 10 && e.target.value) {
      resolveAccountName(e.target.value, form.account_number);
    }
  };

  const handleAccountNumberChange = (e) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 10);
    setForm((prev) => ({ ...prev, account_number: val, account_name: "" }));
    setAccountNameError("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length === 10 && form.bank_code) {
      debounceRef.current = setTimeout(() => {
        resolveAccountName(form.bank_code, val);
      }, 500);
    }
  };

  const handleSubmit = async () => {
    const { amount, bank_name, account_number, account_name } = form;
    if (!amount || !bank_name || !account_number || !account_name) {
      toast.error("All fields are required");
      return;
    }
    if (!/^\d{10}$/.test(account_number)) {
      toast.error("Account number must be 10 digits");
      return;
    }
    if (parseFloat(amount) < 1000) {
      toast.error("Minimum withdrawal is ₦1,000");
      return;
    }
    await onSubmit(form);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Personal Commission Withdrawal</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 text-xl font-bold disabled:opacity-50"
          >
            &times;
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {withdrawable !== null && (
            <p className="text-sm text-gray-500">
              Withdrawable balance:{" "}
              <span className="font-semibold text-gray-800">
                ₦{Number(withdrawable).toLocaleString()}
              </span>
            </p>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (NGN) *</label>
            <input
              type="number"
              min="1000"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              className="input w-full"
              placeholder="Minimum ₦1,000"
            />
          </div>

          {/* Bank */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bank *</label>
            <select
              value={form.bank_code}
              onChange={handleBankChange}
              className="input w-full"
            >
              <option value="">Select bank</option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Account number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Number *</label>
            <input
              type="text"
              maxLength={10}
              value={form.account_number}
              onChange={handleAccountNumberChange}
              className="input w-full"
              placeholder="10-digit account number"
            />
          </div>

          {/* Account name — auto-resolved */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Name *</label>
            <div className="relative">
              <input
                type="text"
                value={form.account_name}
                onChange={(e) => setForm((p) => ({ ...p, account_name: e.target.value }))}
                className="input w-full pr-24"
                placeholder={
                  accountNameLoading
                    ? "Verifying…"
                    : "Auto-filled after bank & account number"
                }
                readOnly={accountNameLoading}
              />
              {accountNameLoading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-500 animate-pulse">
                  Verifying…
                </span>
              )}
            </div>
            {accountNameError && (
              <p className="mt-1 text-xs text-amber-600">{accountNameError}</p>
            )}
            {form.account_name && !accountNameLoading && (
              <p className="mt-1 text-xs text-green-600">
                Verified: {form.account_name}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="btn w-full"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading || accountNameLoading}
              className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Submitting…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
