import React, { useCallback, useEffect, useRef, useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { toast } from "react-toastify";
import api from "../../services/api";
import InputDialog from "../common/InputDialog";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(Number(value || 0));

const getRequestErrorMessage = (error, fallback) => {
  const data = error?.response?.data;
  if (data?.message) return data.message;
  if (error?.response?.status === 404) {
    return "Commission password endpoint was not found. Restart the backend and try again.";
  }
  if (typeof data === "string" && data.trim()) {
    return data.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
  }
  return error?.message || fallback;
};

/*
 * Module-level balance cache.
 *
 * Because CommissionWithdrawalBanner is mounted on many dashboard pages
 * simultaneously (e.g. when a user has multiple admin roles in the same
 * session), every instance used to fire its own GET to
 * /financial-admin/commissions/withdrawable.
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
      .get("/financial-admin/commissions/withdrawable")
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
 * The user must enter their commission password to reveal the commission amount.
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
  const [commissionPasswordStatus, setCommissionPasswordStatus] = useState({
    has_commission_password: false,
    loading: true,
  });
  const [commissionPasswordDialogMode, setCommissionPasswordDialogMode] = useState(null);
  const [commissionPasswordInput, setCommissionPasswordInput] = useState({});
  const [savingCommissionPassword, setSavingCommissionPassword] = useState(false);

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

  const loadCommissionPasswordStatus = useCallback(async () => {
    try {
      const res = await api.get("/users/commission-password/status");
      setCommissionPasswordStatus({
        has_commission_password: Boolean(
          res.data?.data?.has_commission_password
        ),
        set_at: res.data?.data?.set_at || null,
        loading: false,
      });
    } catch (error) {
      console.error("Failed to load commission password status:", error);
      setCommissionPasswordStatus((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    loadCommissionPasswordStatus();
  }, [loadCommissionPasswordStatus]);

  const openCommissionPasswordDialog = (mode) => {
    setCommissionPasswordDialogMode(mode);
    setCommissionPasswordInput({});
  };

  const closeCommissionPasswordDialog = () => {
    setCommissionPasswordDialogMode(null);
    setCommissionPasswordInput({});
  };

  const getCommissionDialogConfig = () => {
    switch (commissionPasswordDialogMode) {
      case "setup":
        return {
          title: "Set Commission Password",
          message:
            "Create a separate password for revealing your withdrawable commission balance. Confirm with your login password.",
          confirmText: "Set Password",
          inputs: [
            {
              name: "login_password",
              label: "Login Password",
              type: "password",
              placeholder: "Enter your login password",
              required: true,
            },
            {
              name: "commission_password",
              label: "New Commission Password",
              type: "password",
              placeholder: "At least 6 characters",
              required: true,
            },
            {
              name: "confirm_commission_password",
              label: "Confirm Commission Password",
              type: "password",
              placeholder: "Re-enter commission password",
              required: true,
            },
          ],
        };
      case "change":
        return {
          title: "Change Commission Password",
          message: "Enter your current commission password and choose a new one.",
          confirmText: "Change Password",
          inputs: [
            {
              name: "current_commission_password",
              label: "Current Commission Password",
              type: "password",
              placeholder: "Enter current commission password",
              required: true,
            },
            {
              name: "new_commission_password",
              label: "New Commission Password",
              type: "password",
              placeholder: "At least 6 characters",
              required: true,
            },
            {
              name: "confirm_commission_password",
              label: "Confirm New Password",
              type: "password",
              placeholder: "Re-enter new commission password",
              required: true,
            },
          ],
        };
      case "reset":
        return {
          title: "Reset Commission Password",
          message:
            "Use your login password to reset a forgotten commission password.",
          confirmText: "Reset Password",
          inputs: [
            {
              name: "login_password",
              label: "Login Password",
              type: "password",
              placeholder: "Enter your login password",
              required: true,
            },
            {
              name: "new_commission_password",
              label: "New Commission Password",
              type: "password",
              placeholder: "At least 6 characters",
              required: true,
            },
            {
              name: "confirm_commission_password",
              label: "Confirm New Password",
              type: "password",
              placeholder: "Re-enter new commission password",
              required: true,
            },
          ],
        };
      case "verify":
      default:
        return {
          title: "Unlock Withdrawable Commission",
          message:
            "Enter your commission password to reveal your withdrawable commission balance.",
          confirmText: "Unlock Amount",
          inputs: [
            {
              name: "commission_password",
              label: "Commission Password",
              type: "password",
              placeholder: "Enter your commission password",
              required: true,
            },
          ],
        };
    }
  };

  const submitCommissionPasswordDialog = async (inputs) => {
    const mode = commissionPasswordDialogMode;
    const commissionPassword = String(inputs.commission_password || "");
    const newCommissionPassword = String(inputs.new_commission_password || "");
    const confirmation = String(inputs.confirm_commission_password || "");

    if (
      ["setup"].includes(mode) &&
      commissionPassword !== confirmation
    ) {
      toast.error("Commission password confirmation does not match");
      return;
    }

    if (
      ["change", "reset"].includes(mode) &&
      newCommissionPassword !== confirmation
    ) {
      toast.error("New commission password confirmation does not match");
      return;
    }

    try {
      setSavingCommissionPassword(true);

      if (mode === "setup") {
        await api.post("/users/commission-password/setup", {
          login_password: String(inputs.login_password || ""),
          commission_password: commissionPassword,
        });
        await loadCommissionPasswordStatus();
        setIsWithdrawableVisible(true);
        toast.success("Commission password set and balance unlocked");
      } else if (mode === "change") {
        await api.put("/users/commission-password/change", {
          current_commission_password: String(
            inputs.current_commission_password || ""
          ),
          new_commission_password: newCommissionPassword,
        });
        await loadCommissionPasswordStatus();
        toast.success("Commission password changed");
      } else if (mode === "reset") {
        await api.post("/users/commission-password/reset", {
          login_password: String(inputs.login_password || ""),
          new_commission_password: newCommissionPassword,
        });
        await loadCommissionPasswordStatus();
        setIsWithdrawableVisible(true);
        toast.success("Commission password reset and balance unlocked");
      } else {
        await api.post("/users/commission-password/verify", {
          commission_password: commissionPassword,
        });
        setIsWithdrawableVisible(true);
        toast.success("Withdrawable amount unlocked");
      }

      closeCommissionPasswordDialog();
    } catch (error) {
      toast.error(
        getRequestErrorMessage(error, "Commission password action failed")
      );
    } finally {
      setSavingCommissionPassword(false);
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
      await api.post("/financial-admin/withdraw/request", {
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
                      openCommissionPasswordDialog(
                        commissionPasswordStatus.has_commission_password
                          ? "verify"
                          : "setup"
                      );
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
                    {commissionPasswordStatus.has_commission_password
                      ? "(click to unlock)"
                      : "(set password to unlock)"}
                  </span>
                )}
              </p>
              <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-indigo-700">
                {commissionPasswordStatus.has_commission_password ? (
                  <>
                    <button
                      type="button"
                      className="underline hover:text-indigo-900"
                      onClick={() => openCommissionPasswordDialog("change")}
                    >
                      Change commission password
                    </button>
                    <span aria-hidden="true">|</span>
                    <button
                      type="button"
                      className="underline hover:text-indigo-900"
                      onClick={() => openCommissionPasswordDialog("reset")}
                    >
                      Forgot password?
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="underline hover:text-indigo-900"
                    onClick={() => openCommissionPasswordDialog("setup")}
                  >
                    Set commission password
                  </button>
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
                if (isWithdrawableVisible) {
                  setIsWithdrawableVisible(false);
                  toast.info("Commission balance locked");
                } else {
                  openCommissionPasswordDialog(
                    commissionPasswordStatus.has_commission_password
                      ? "verify"
                      : "setup"
                  );
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
              title={isWithdrawableVisible ? "Lock balance" : "Unlock balance"}
              aria-label={isWithdrawableVisible ? "Lock commission balance" : "Unlock commission balance"}
            >
              {isWithdrawableVisible ? (
                <FaEyeSlash className="h-3.5 w-3.5" />
              ) : (
                <FaEye className="h-3.5 w-3.5" />
              )}
              {isWithdrawableVisible
                ? "Lock Balance"
                : commissionPasswordStatus.has_commission_password
                ? "Unlock Balance"
                : "Set Password"}
            </button>
          </div>
        </div>
      </div>

      {/* Commission password dialog */}
      <InputDialog
        key={commissionPasswordDialogMode || "commission-password"}
        isOpen={Boolean(commissionPasswordDialogMode)}
        onConfirm={submitCommissionPasswordDialog}
        onCancel={closeCommissionPasswordDialog}
        title={getCommissionDialogConfig().title}
        message={getCommissionDialogConfig().message}
        type="info"
        confirmText={getCommissionDialogConfig().confirmText}
        cancelText="Cancel"
        isLoading={savingCommissionPassword}
        initialValues={commissionPasswordInput}
        inputs={getCommissionDialogConfig().inputs}
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
