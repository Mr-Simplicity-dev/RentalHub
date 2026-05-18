import React, { useMemo, useState } from 'react';
import { FaCheckCircle, FaTimes, FaWallet } from 'react-icons/fa';

export default function WalletFundModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
  userType,
  walletBalance,
  landlordWallet,
  onSwitchToWithdraw,
}) {
  const [amount, setAmount] = useState('');

  const selectedBalance = useMemo(() => {
    if (userType === 'tenant') return walletBalance;
    return landlordWallet?.available_to_withdraw || 0;
  }, [userType, walletBalance, landlordWallet]);

  if (!isOpen) return null;

  const presetAmounts = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <FaWallet className="text-teal-500 text-2xl" />
            <h2 className="text-lg font-bold text-gray-800">Fund Wallet</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FaTimes className="text-xl" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {selectedBalance !== null && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-teal-600">Current Balance</p>
                <p className="text-2xl font-bold text-teal-800">₦{Number(selectedBalance || 0).toLocaleString()}</p>
              </div>
              <FaWallet className="text-teal-400 text-3xl" />
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Select or enter amount</p>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {presetAmounts.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setAmount(String(amt))}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${Number(amount) === amt ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:border-teal-300'}`}
                >
                  ₦{amt >= 1000 ? `${amt / 1000}k` : amt.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Custom Amount (₦)</label>
            <input
              type="number"
              min="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input w-full text-lg font-semibold"
              placeholder="Enter amount e.g. 15000"
            />
            {amount && Number(amount) >= 100 && (
              <p className="text-xs text-teal-600 mt-1">
                You will be charged <strong>₦{Number(amount).toLocaleString()}</strong> to fund your wallet.
              </p>
            )}
          </div>

          <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-xs text-green-700">
            <FaCheckCircle className="mt-0.5 shrink-0 text-green-500" />
            <span>Payment is processed securely. Your wallet will be credited immediately after successful payment.</span>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn w-full">Cancel</button>
            <button
              type="button"
              onClick={() => onSubmit(amount)}
              disabled={isLoading || !amount || Number(amount) < 100}
              className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Redirecting...' : `Pay ₦${amount ? Number(amount).toLocaleString() : '0'}`}
            </button>
          </div>

          <button
            type="button"
            onClick={onSwitchToWithdraw}
            className="w-full text-center text-sm text-indigo-600 hover:text-indigo-800"
          >
            Need to withdraw instead? Open Withdraw Funds
          </button>
        </div>
      </div>
    </div>
  );
}
