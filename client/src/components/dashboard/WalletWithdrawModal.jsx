import React from 'react';
import { useTranslation } from 'react-i18next';
import { FaCheckCircle, FaExclamationTriangle, FaTimes, FaWallet } from 'react-icons/fa';
import ApprovalTimeline from '../common/ApprovalTimeline';

export default function WalletWithdrawModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
  userType,
  walletBalance,
  landlordWallet,
  propertyFeeReserve,
  withdrawForm,
  setWithdrawForm,
  handleBankChange,
  handleAccountNumberChange,
  banks,
  banksLoading,
  accountNameLoading,
  accountNameError,
  consentChecked,
  setConsentChecked,
  withdrawHistory,
  withdrawStatusBadge,
  onSwitchToFund,
}) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <FaWallet className="text-indigo-500 text-2xl" />
            <h2 className="text-lg font-bold text-gray-800">{t('wallet_withdraw.title', 'Withdraw Funds')}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FaTimes className="text-xl" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {userType === 'tenant' && (
            <>
              <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-teal-600">{t('wallet_withdraw.available_balance', 'Available Wallet Balance')}</p>
                  <p className="text-2xl font-bold text-teal-800">
                    {walletBalance !== null ? `â‚¦${Number(walletBalance).toLocaleString()}` : 'â€”'}
                  </p>
                </div>
                <FaWallet className="text-teal-400 text-3xl" />
              </div>
            </>
          )}

          {userType === 'landlord' && (
            <>
              {landlordWallet ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-green-600">{t('wallet_withdraw.available_to_withdraw', 'Available to Withdraw')}</p>
                    <p className="text-xl font-bold text-green-800">â‚¦{Number(landlordWallet.available_to_withdraw).toLocaleString()}</p>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-yellow-600">{t('wallet_withdraw.pending_hold', 'Pending (14-day hold)')}</p>
                    <p className="text-xl font-bold text-yellow-800">â‚¦{Number(landlordWallet.pending_balance).toLocaleString()}</p>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500 text-center">{t('wallet_withdraw.loading_wallet', 'Loading wallet...')}</div>
              )}
              {propertyFeeReserve?.reserve_required && Number(propertyFeeReserve?.amount_due || 0) > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  <FaExclamationTriangle className="mt-0.5 shrink-0" />
                  <span>
                    {(propertyFeeReserve.fee_label || t('wallet_withdraw.landlord_charges', 'Landlord Property Charges'))} {t('wallet_withdraw.reserve_due', 'reserve: ₦{{amount}} is due on {{date}}. You can withdraw up to ₦{{available}} while this reserve is active.', { amount: Number(propertyFeeReserve.amount_due || 0).toLocaleString(), date: new Date(propertyFeeReserve.due_at).toLocaleDateString(), available: Number(propertyFeeReserve.available_after_reserve || 0).toLocaleString() })}
                  </span>
                </div>
              )}
            </>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (â‚¦) *</label>
              <input
                type="number"
                required
                min="100"
                value={withdrawForm.amount}
                onChange={(e) => setWithdrawForm((p) => ({ ...p, amount: e.target.value }))}
                className="input w-full"
                placeholder="{t('wallet_withdraw.amount_placeholder', 'Enter amount to withdraw')}"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('wallet_withdraw.bank_label', 'Bank Name *')}</label>
              <select
                required
                value={withdrawForm.bank_name}
                onChange={handleBankChange}
                className="input w-full"
              >
                <option value="">{t('wallet_withdraw.select_bank', '-- Select your bank --')}</option>
                {banksLoading ? (
                  <option disabled>{t('wallet_withdraw.loading_banks', 'Loading banks...')}</option>
                ) : (
                  banks.map((bank) => (
                    <option key={bank.code || bank.name} value={bank.name}>
                      {bank.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('wallet_withdraw.account_number_label', 'Account Number *')}</label>
              <div className="relative">
                <input
                  required
                  maxLength={10}
                  value={withdrawForm.account_number}
                  onChange={handleAccountNumberChange}
                  className="input w-full"
                  placeholder="{t('wallet_withdraw.account_number_placeholder', '10-digit account number')}"
                />
                {accountNameLoading && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
                  </div>
                )}
              </div>
              {accountNameError && (
                <p className="text-xs text-red-600 mt-1">{accountNameError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('wallet_withdraw.account_name_label', 'Account Name *')}</label>
              <input
                required
                value={withdrawForm.account_name}
                onChange={(e) => setWithdrawForm((p) => ({ ...p, account_name: e.target.value }))}
                className={`input w-full ${accountNameLoading ? 'bg-gray-100' : ''}`}
                placeholder="{t('wallet_withdraw.account_name_placeholder', 'Account holder name')}"
                readOnly={!accountNameError && withdrawForm.account_name && !accountNameLoading}
              />
              {withdrawForm.account_name && !accountNameError && withdrawForm.account_number.length === 10 && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <FaCheckCircle className="text-xs" /> {t('wallet_withdraw.account_verified', 'Account verified')}
                </p>
              )}
            </div>

            <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <input
                type="checkbox"
                id="withdrawConsent"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <label htmlFor="withdrawConsent" className="text-xs text-gray-700">
                {t('wallet_withdraw.consent', 'I confirm that the bank account details provided above are correct and belong to me.')}
              </label>
            </div>

            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
              <FaExclamationTriangle className="mt-0.5 shrink-0" />
              <span>{t('wallet_withdraw.processing_note', 'Withdrawals are processed within 1-7 business days.')}</span>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn w-full">{t('wallet_withdraw.cancel', 'Cancel')}</button>
              <button
                type="submit"
                disabled={
                  isLoading ||
                  !withdrawForm.amount ||
                  !withdrawForm.bank_name ||
                  !withdrawForm.account_number ||
                  !withdrawForm.account_name ||
                  !consentChecked
                }
                className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Submitting...' : 'Request Withdrawal'}
              </button>
            </div>
          </form>

          {withdrawHistory.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-sm font-semibold text-gray-700 border-t pt-3">{t('wallet_withdraw.recent_withdrawals', 'Recent Withdrawals')}</p>
              {withdrawHistory.slice(0, 5).map((w) => (
                <div key={w.id} className="text-sm border rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-800">â‚¦{Number(w.amount).toLocaleString()}</p>
                      <p className="text-xs text-gray-500">{w.bank_name} Â· {w.account_number}</p>
                      <p className="text-xs text-gray-400">{new Date(w.requested_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${withdrawStatusBadge(w.status)}`}>{w.status}</span>
                  </div>
                  <ApprovalTimeline
                    steps={[
                      { key: 'requested', label: t('wallet_withdraw.step_requested', 'Requested') },
                      { key: 'reviewed', label: t('wallet_withdraw.step_reviewed', 'Reviewed') },
                      { key: 'processed', label: t('wallet_withdraw.step_processed', 'Processed') },
                    ]}
                    currentStepKey={
                      w.status === 'pending'
                        ? 'reviewed'
                        : w.status === 'approved' || w.status === 'processed'
                          ? 'processed'
                          : 'reviewed'
                    }
                    finalStatus={w.status === 'processed' ? 'approved' : w.status}
                  />
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onSwitchToFund}
            className="w-full text-center text-sm text-teal-600 hover:text-teal-800"
          >
            {t('wallet_withdraw.fund_link', 'Need to fund wallet first? Open Fund Wallet')}
          </button>
        </div>
      </div>
    </div>
  );
}



