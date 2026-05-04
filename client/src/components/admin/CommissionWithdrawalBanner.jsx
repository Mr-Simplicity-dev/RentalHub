import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import api from "../../services/api";
import InputDialog from "../common/InputDialog";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(Number(value || 0));

/*
 * Module-level balance cache.
 *
 * Because CommissionWithdrawalBanner is mounted on many dashboard pages
 * simultaneously (e.g. when a user has multiple admin roles in the same
 * session), every instance used to fire its own GET to
 * /api/financial-admin/commissions/withdrawable.
 *
 * This shared promise cache ensures we only make ONE network request per
 * page load, regardless of how many <CommissionWithdrawalBanner /> are
 * rendered.  Once resolved, the promise is cleared so that a hard refresh
 * or a new page navigation will fetch again.
 */
let withdrawableBalancePromise = null;

/**
 * Returns a single shared promise that resolves to the withdrawable balance.
 * Subsequent calls within the same "session tick" receive the same in-flight
 * promise, preventing duplicate HTTP requests.
 */
function getWithdrawableBalance() {
  if (!withdrawableBalancePromise) {
    withdrawableBalancePromise = api
      .get("/api/financial-admin/commissions/withdrawable")
      .then((res) => res.data?.data || {})
      .catch((error) => {
        console.error("Failed to load withdrawable snapshot:", error);
        return null;
      })
      .finally(() => {
        // Clear the shared promise so the NEXT component mount (across pages)
        // will fetch fresh data instead of returning a stale resolved value.
        withdrawableBalancePromise = null;
      });
  }
  return withdrawableBalancePromise;
}

/**
 * CommissionWithdrawalBanner
 *
 * A reusable banner that shows "Withdrawable Commission" with a masked amount.
 * The user must enter their login password to unveil / reveal the commission amount.
 * Once unveiled, a "Withdraw" button opens a personal withdrawal modal (via AdminWithdrawalModal).
 *
 * Props:
 *   - className        {string}  Optional extra CSS classes.
 *   - compact          {boolean} If true, renders a compact inline banner (for space-constrained dashboards).
 */
export default function CommissionWithdrawalBanner({
  className = "",
  compact = false,
}) {
  const [withdrawableSnapshot, setWithdrawableSnapshot] = useState({
    withdrawable_amount: 0,
    total_earned: 0,
  });
  const [isWithdrawableVisible, setIsWithdrawableVisible] = useState(false);
  const [showRevealAmountDialog, setShowRevealAmountDialog] = useState(false);
  const [revealPasswordInput, setRevealPasswordInput] = useState({ password: "" });
  const [verifyingRevealPassword, setVerifyingRevealPassword] = useState(false);

  // Personal withdrawal modal state
  const [showPersonalWithdrawDialog, setShowPersonalWithdrawDialog] = useState(false);
  const [personalWithdrawForm, setPersonalWithdrawForm] = useState({
    amount: "",
    bank_name: "",
    bank_code: "",
    account_number: "",
    account_name: "",
  });
  const [submittingPersonalWithdraw, setSubmittingPersonalWithdraw] = useState(false);
  const [withdrawAccountNameLoading, setWithdrawAccountNameLoading] = useState(false);
  const [withdrawAccountNameError, setWithdrawAccountNameError] = useState("");
  const [banks, setBanks] = useState([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [banksError, setBanksError] = useState("");
  const withdrawAccountLookupTimerRef = useRef(null);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (withdrawAccountLookupTimerRef.current) {
        clearTimeout(withdrawAccountLookupTimerRef.current);
      }
    };
  }, []);

  // Load banks when the withdrawal modal opens
  useEffect(() => {
    if (!showPersonalWithdrawDialog) return;
    resetPersonalWithdrawalForm();
    loadBanks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPersonalWithdrawDialog]);

  const loadWithdrawableSnapshot = useCallback(async () => {
    const data = await getWithdrawableBalance();
    if (data) {
      setWithdrawableSnapshot({
        withdrawable_amount: Number(data.withdrawable_amount || 0),
        total_earned: Number(data.total_earned || 0),
      });
    }
  }, []);

  useEffect(() => {
    loadWithdrawableSnapshot();
  }, [loadWithdrawableSnapshot]);

  const revealWithdrawableAmount = async (inputs) => {
    try {
      setVerifyingRevealPassword(true);
      setRevealPasswordInput(inputs);

      await api.post("/api/users/verify-password", {
        password: String(inputs.password || ""),
      });

      setIsWithdrawableVisible(true);
      setShowRevealAmountDialog(false);
      setRevealPasswordInput({ password: "" });
      toast.success("Withdrawable amount unlocked");
    } catch (error) {
      toast.error(error.response?.data?.message || "Password verification failed");
    } finally {
      setVerifyingRevealPassword(false);
    }
  };

  const resetPersonalWithdrawalForm = useCallback(() => {
    setPersonalWithdrawForm({
      amount: "",
      bank_name: "",
      bank_code: "",
      account_number: "",
      account_name: "",
    });
    setWithdrawAccountNameError("");
  }, []);

  const loadBanks = useCallback(async () => {
    try {
      setBanksLoading(true);
      setBanksError("");
      const res = await api.get("/payments/banks");
      if (res.data?.success) {
        const normalizedBanks = (res.data.data || [])
          .filter((bank) => bank?.name && bank?.code)
          .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        setBanks(normalizedBanks);
        return;
      }
      throw new Error("Bank list is unavailable right now.");
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        "Failed to load bank list. Check your connection and retry.";
      setBanksError(message);
      setBanks([]);
    } finally {
      setBanksLoading(false);
    }
  }, []);

  const fetchWithdrawAccountName = useCallback(async (bankCode, accountNumber) => {
    if (!bankCode || !accountNumber || accountNumber.length !== 10) return;
    setWithdrawAccountNameLoading(true);
    setWithdrawAccountNameError("");
    try {
      const res = await api.post("/payments/verify-account", {
        bank_code: bankCode,
        account_number: accountNumber,
      });
      if (res.data?.success && res.data.data?.account_name) {
        setPersonalWithdrawForm((prev) => ({
          ...prev,
          account_name: res.data.data.account_name,
        }));
      } else {
        setWithdrawAccountNameError(
          "Could not auto-resolve account name. Enter it manually."
        );
      }
    } catch (error) {
      setWithdrawAccountNameError(
        error?.response?.data?.message ||
          "Could not auto-resolve account name. Enter it manually."
      );
    } finally {
      setWithdrawAccountNameLoading(false);
    }
  }, []);

  const handlePersonalBankChange = (event) => {
    const selectedCode = event.target.value;
    const selectedBank = banks.find((bank) => bank.code === selectedCode);

    setPersonalWithdrawForm((prev) => {
      const next = {
        ...prev,
        bank_code: selectedCode,
        bank_name: selectedBank?.name || "",
        account_name: "",
      };

      if (next.account_number.length === 10 && selectedCode) {
        fetchWithdrawAccountName(selectedCode, next.account_number);
      }

      return next;
    });
    setWithdrawAccountNameError("");
  };

  const handlePersonalAccountNumberChange = (event) => {
    const value = event.target.value.replace(/\D/g, "").slice(0, 10);
    setPersonalWithdrawForm((prev) => ({
      ...prev,
      account_number: value,
      account_name: "",
    }));
    setWithdrawAccountNameError("");

    if (withdrawAccountLookupTimerRef.current) {
      clearTimeout(withdrawAccountLookupTimerRef.current);
    }

    if (value.length === 10 && personalWithdrawForm.bank_code) {
      withdrawAccountLookupTimerRef.current = setTimeout(() => {
        fetchWithdrawAccountName(personalWithdrawForm.bank_code, value);
      }, 450);
    }
  };

  const submitPersonalWithdrawal = async () => {
    const { amount, bank_name, bank_code, account_number, account_name } =
      personalWithdrawForm;
    if (!amount || !bank_name || !bank_code || !account_number || !account_name) {
      toast.error("All withdrawal fields are required");
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
    if (
      isWithdrawableVisible &&
      parseFloat(amount) > Number(withdrawableSnapshot.withdrawable_amount || 0)
    ) {
      toast.error("Requested amount exceeds your withdrawable balance");
      return;
    }
    try {
      setSubmittingPersonalWithdraw(true);
      await api.post("/api/financial-admin/withdraw/request", {
        amount: parseFloat(amount),
        bank_name: String(bank_name).trim(),
        bank_code: String(bank_code || "").trim(),
        account_number: String(account_number).trim(),
        account_name: String(account_name).trim(),
      });
      toast.success("Withdrawal request submitted successfully");
      setShowPersonalWithdrawDialog(false);
      resetPersonalWithdrawalForm();
      await loadWithdrawableSnapshot();
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to submit withdrawal request"
      );
    } finally {
      setSubmittingPersonalWithdraw(false);
    }
  };

  return (
    <>
      {/* Banner */}
      <div
        className={`rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-3 ${className}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <svg
                className="h-8 w-8 text-indigo-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-indigo-900">
                Commission Withdrawal
              </p>
              <p className="text-xs text-indigo-700">
                Your withdrawable commission balance is{" "}
                <button
                  type="button"
                  onClick={() => {
                    if (!isWithdrawableVisible) {
                      setShowRevealAmountDialog(true);
                    }
                  }}
                  className="font-bold underline hover:text-indigo-900"
                >
                  {isWithdrawableVisible
                    ? formatCurrency(withdrawableSnapshot.withdrawable_amount)
                    : "*****"}
                </button>
                {!isWithdrawableVisible && (
                  <span className="ml-1 text-xs text-indigo-500">
                    (click to unlock)
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isWithdrawableVisible && (
              <button
                type="button"
                onClick={() => setShowPersonalWithdrawDialog(true)}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
              >
                Withdraw Now
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (!isWithdrawableVisible) {
                  setShowRevealAmountDialog(true);
                }
              }}
              className="rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
            >
              {isWithdrawableVisible ? "View Balance" : "Unlock Balance"}
            </button>
          </div>
        </div>
      </div>

      {/* Reveal password dialog */}
      <InputDialog
        isOpen={showRevealAmountDialog}
        onConfirm={revealWithdrawableAmount}
        onCancel={() => setShowRevealAmountDialog(false)}
        title="Unlock Withdrawable Commission"
        message="Enter your login password to reveal your withdrawable commission balance."
        type="info"
        confirmText="Unlock Amount"
        cancelText="Cancel"
        isLoading={verifyingRevealPassword}
        initialValues={revealPasswordInput}
        inputs={[
          {
            name: "password",
            label: "Password",
            type: "password",
            placeholder: "Enter your login password",
            required: true,
            validate: (value) =>
              String(value || "").trim().length > 0
                ? true
                : "Password is required",
          },
        ]}
      />

      {/* Withdrawal modal */}
      {showPersonalWithdrawDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 pb-4 pt-6">
              <h2 className="text-lg font-bold text-gray-800">
                Personal Commission Withdrawal
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowPersonalWithdrawDialog(false);
                  resetPersonalWithdrawalForm();
                }}
                className="text-xl font-bold text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                Payout destination is verified before submission. Enter bank
                details exactly as registered.
              </div>

              <p className="text-sm text-gray-500">
                Withdrawable balance:{" "}
                <span className="font-semibold text-gray-800">
                  {isWithdrawableVisible
                    ? formatCurrency(withdrawableSnapshot.withdrawable_amount)
                    : "*****"}
                </span>
              </p>

              {/* Amount */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Amount (NGN) *
                </label>
                <input
                  type="number"
                  min="1000"
                  value={personalWithdrawForm.amount}
                  onChange={(e) =>
                    setPersonalWithdrawForm((p) => ({
                      ...p,
                      amount: e.target.value,
                    }))
                  }
                  className="input w-full"
                  placeholder="Minimum ₦1,000"
                />
              </div>

              {/* Bank select */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Bank *
                </label>
                {banksLoading && (
                  <p className="mb-1 text-xs text-indigo-600">
                    Loading bank list...
                  </p>
                )}
                {banksError && (
                  <div className="mb-2 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                    <span>{banksError}</span>
                    <button
                      type="button"
                      onClick={loadBanks}
                      className="rounded border border-amber-300 bg-white px-2 py-0.5 font-medium hover:bg-amber-100"
                    >
                      Retry
                    </button>
                  </div>
                )}
                <select
                  value={personalWithdrawForm.bank_code}
                  onChange={handlePersonalBankChange}
                  className="input w-full"
                  disabled={banksLoading || banks.length === 0}
                >
                  <option value="">Select bank</option>
                  {banks.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Account number */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Account Number *
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={personalWithdrawForm.account_number}
                  onChange={handlePersonalAccountNumberChange}
                  className="input w-full"
                  placeholder="10-digit account number"
                />
              </div>

              {/* Account name — auto-resolved */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Account Name *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={personalWithdrawForm.account_name}
                    onChange={(e) =>
                      setPersonalWithdrawForm((p) => ({
                        ...p,
                        account_name: e.target.value,
                      }))
                    }
                    className="input w-full pr-20"
                    placeholder={
                      withdrawAccountNameLoading
                        ? "Verifying…"
                        : "Auto-filled after bank & account number"
                    }
                    readOnly={
                      withdrawAccountNameLoading ||
                      (personalWithdrawForm.account_name &&
                        !withdrawAccountNameError)
                    }
                  />
                  {withdrawAccountNameLoading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 animate-pulse text-xs text-indigo-500">
                      Verifying…
                    </span>
                  )}
                </div>
                {withdrawAccountNameError && (
                  <p className="mt-1 text-xs text-amber-600">
                    {withdrawAccountNameError}
                  </p>
                )}
                {personalWithdrawForm.account_name &&
                  !withdrawAccountNameLoading && (
                    <p className="mt-1 text-xs text-green-600">
                      Account resolved: {personalWithdrawForm.account_name}
                    </p>
                  )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPersonalWithdrawDialog(false);
                    resetPersonalWithdrawalForm();
                  }}
                  className="btn w-full"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitPersonalWithdrawal}
                  disabled={
                    submittingPersonalWithdraw ||
                    withdrawAccountNameLoading ||
                    banksLoading ||
                    banks.length === 0
                  }
                  className="btn btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submittingPersonalWithdraw
                    ? "Submitting…"
                    : "Submit Withdrawal"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
