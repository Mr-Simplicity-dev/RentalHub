import React, { useEffect, useMemo, useState } from 'react';
import { FaCheckCircle, FaTimes, FaWallet, FaHistory } from 'react-icons/fa';
import api from '../services/api';

const TYPE_LABELS = {
  wallet_funding: 'Wallet Funding',
  rent_payment: 'Rent Credit',
  rent_refund: 'Refund Reversal',
  refund: 'Refund',
  rent_savings: 'Rent Savings',
  withdrawal: 'Withdrawal',
  general: 'General',
};

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  cleared: 'bg-green-100 text-green-700',
  reversed: 'bg-red-100 text-red-700',
  withdrawn: 'bg-slate-100 text-slate-600',
};

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
  const [transactions, setTransactions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setShowHistory(false);
    setHistoryLoading(true);
    api.get('/payments/wallet/transactions', { params: { limit: 20 } })
      .then((res) => setTransactions(res.data?.data || []))
      .catch(() => setTransactions([]))
      .finally(() => setHistoryLoading(false));
  }, [isOpen]);

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

          {/* Wallet transaction history (real data) */}
          <div className="border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setShowHistory((prev) => !prev)}
              className="flex w-full items-center justify-between text-sm font-semibold text-gray-700 hover:text-teal-700"
            >
              <span className="flex items-center gap-2">
                <FaHistory className="text-teal-500" /> Transaction History
              </span>
              <span>{showHistory ? 'Hide' : `Show (${transactions.length})`}</span>
            </button>

            {showHistory && (
              <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-gray-200">
                {historyLoading ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">Loading transactions…</p>
                ) : transactions.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">No wallet transactions yet.</p>
                ) : (
                  transactions.map((tx) => {
                    const fee = Number(tx.metadata?.platform_fee || 0);
                    return (
                      <div key={tx.id} className="border-b border-gray-100 px-4 py-3 last:border-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900">
                              {TYPE_LABELS[tx.source] || tx.source?.replace(/_/g, ' ') || 'Transaction'}
                            </p>
                            <p className="truncate text-xs text-gray-500">
                              {new Date(tx.created_at).toLocaleString()}
                              {tx.reference ? ` • ${tx.reference}` : ''}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={`text-sm font-bold ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                              {tx.type === 'credit' ? '+' : '−'}₦{Number(tx.amount).toLocaleString()}
                            </p>
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[tx.status] || 'bg-gray-100 text-gray-600'}`}>
                              {tx.status}
                            </span>
                          </div>
                        </div>
                        {fee > 0 && (
                          <p className="mt-1 text-xs text-gray-500">
                            Platform fee deducted: ₦{fee.toLocaleString()}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
