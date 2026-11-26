import React, { useEffect, useState } from 'react';
import { FaFilePdf, FaPrint, FaTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { paymentService } from '../../services/paymentService';

const STATUS_BADGE_MAP = {
  PAID: 'bg-emerald-100 text-emerald-800',
  SAVED: 'bg-emerald-100 text-emerald-800',
  PROCESSED: 'bg-emerald-100 text-emerald-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  REFUNDED: 'bg-sky-100 text-sky-800',
  'APPROVED (WALLET CREDITED)': 'bg-sky-100 text-sky-800',
  PENDING: 'bg-amber-100 text-amber-800',
  PROCESSING: 'bg-indigo-100 text-indigo-800',
  FAILED: 'bg-red-100 text-red-800',
  REVERSED: 'bg-red-100 text-red-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-700',
};

const FinancialReceiptModal = ({ open, kind, recordId, onClose }) => {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    if (!open || !kind || !recordId) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    setReceipt(null);

    paymentService
      .getDocumentReceipt(kind, recordId)
      .then((res) => {
        if (!active) return;
        if (res?.success && res?.data) {
          setReceipt(res.data);
        } else {
          setError(res?.message || 'Unable to load financial document.');
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err?.response?.data?.message ||
            err?.message ||
            'Unable to load financial document.'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, kind, recordId]);

  if (!open) return null;

  const handleDownloadPdf = async () => {
    if (!kind || !recordId || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const blob = await paymentService.downloadDocumentPdf(kind, recordId);
      const looksLikePdf = blob && blob.type === 'application/pdf';
      if (!looksLikePdf && blob && blob.type && blob.type.includes('json')) {
        const text = await blob.text();
        let message = 'Failed to download PDF';
        try {
          message = JSON.parse(text)?.message || message;
        } catch {
          // keep generic message
        }
        throw new Error(message);
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = String(receipt?.receiptNumber || `${kind}-${recordId}`)
        .replace(/[^A-Za-z0-9_-]/g, '-')
        .toLowerCase();
      link.download = `${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success('Document PDF downloaded');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to download PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const statusUpper = String(receipt?.status || '').toUpperCase();
  const statusClasses = STATUS_BADGE_MAP[statusUpper] || 'bg-slate-100 text-slate-700';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Financial Receipt Document"
    >
      <div
        className="my-auto flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 print:hidden">
          <span className="text-sm font-semibold text-slate-800">
            {receipt?.documentType || 'Financial Document'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close document"
          >
            <FaTimes />
          </button>
        </div>

        <div className="receipt-print-area flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="py-12 text-center text-sm text-slate-500">
              Loading official document...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && receipt && (
            <div>
              {/* Amana Header */}
              <div className="border-b-2 border-sky-600 pb-4 text-center">
                <img
                  src="/rentalhub-mark.svg"
                  alt="Amana RentalHub NG"
                  className="mx-auto mb-1 h-10 w-10 rounded-xl object-contain"
                />
                <div
                  className="text-2xl leading-tight"
                  style={{
                    fontFamily: "'Segoe Script', 'Brush Script MT', cursive",
                    color: '#6e1b2b',
                  }}
                >
                  Amana
                </div>
                <h2 className="text-lg font-bold text-slate-900">Amana RentalHub NG</h2>
                <p className="text-xs text-slate-500">
                  rentalhub.com.ng &nbsp;•&nbsp; support@rentalhub.com.ng
                </p>
                <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-700">
                  {receipt.documentType}
                </p>
                {receipt.subtitle && (
                  <p className="mt-0.5 text-xs text-slate-500">{receipt.subtitle}</p>
                )}
                <p className="mt-1 font-mono text-sm font-bold text-sky-700" data-testid="receipt-number">
                  {receipt.receiptNumber}
                </p>
              </div>

              {/* Status + Metadata */}
              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Status</span>
                  <span
                    data-testid="receipt-status"
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClasses}`}
                  >
                    {receipt.status}
                  </span>
                </div>
                {receipt.fullName && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">{receipt.partyLabel || 'Paid by'}</span>
                    <span className="font-medium text-slate-900 text-right">{receipt.fullName}</span>
                  </div>
                )}
                {receipt.email && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Email</span>
                    <span className="font-medium text-slate-900 text-right break-all">{receipt.email}</span>
                  </div>
                )}
                {receipt.recipientName && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Recipient</span>
                    <span className="font-medium text-slate-900 text-right">{receipt.recipientName}</span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Date</span>
                  <span className="font-medium text-slate-900 text-right">{receipt.date}</span>
                </div>
                {receipt.reference && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Reference</span>
                    <span className="font-mono text-xs text-slate-900 text-right break-all">
                      {receipt.reference}
                    </span>
                  </div>
                )}
                {receipt.methodLine && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Method</span>
                    <span className="font-medium text-slate-900 text-right">{receipt.methodLine}</span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Currency</span>
                  <span className="font-medium text-slate-900">{receipt.currency || 'NGN'}</span>
                </div>
              </div>

              {/* Rent context */}
              {receipt.rent && (
                <div className="mt-4 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  {receipt.rent.paymentFor && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Payment For</span>
                      <span className="font-medium text-slate-900">{receipt.rent.paymentFor}</span>
                    </div>
                  )}
                  {receipt.rent.propertyTitle && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Property</span>
                      <span className="font-medium text-slate-900 text-right">{receipt.rent.propertyTitle}</span>
                    </div>
                  )}
                  {receipt.rent.propertyAddress && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Address</span>
                      <span className="font-medium text-slate-900 text-right">{receipt.rent.propertyAddress}</span>
                    </div>
                  )}
                  {receipt.rent.tenantName && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Tenant</span>
                      <span className="font-medium text-slate-900">{receipt.rent.tenantName}</span>
                    </div>
                  )}
                  {receipt.rent.landlordName && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Landlord</span>
                      <span className="font-medium text-slate-900">{receipt.rent.landlordName}</span>
                    </div>
                  )}
                  {receipt.rent.rentalPeriod?.start && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Rental Period</span>
                      <span className="font-medium text-slate-900">
                        {receipt.rent.rentalPeriod.end
                          ? `${receipt.rent.rentalPeriod.start} – ${receipt.rent.rentalPeriod.end}`
                          : receipt.rent.rentalPeriod.start}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Context rows (service bookings, wallet movement, savings plan, evidence) */}
              {Array.isArray(receipt.contextRows) && receipt.contextRows.length > 0 && (
                <div className="mt-4 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  {receipt.contextRows.map((row, idx) => (
                    <div key={`${row.label}-${idx}`} className="flex justify-between gap-3">
                      <span className="text-slate-500">{row.label}</span>
                      <span className="font-medium text-slate-900 text-right break-words">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Payout bank details (always masked) */}
              {receipt.payout && (
                <div className="mt-4 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Withdrawal ID</span>
                    <span className="font-medium text-slate-900">#{receipt.payout.withdrawalId}</span>
                  </div>
                  {receipt.payout.bankName && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Bank Name</span>
                      <span className="font-medium text-slate-900">{receipt.payout.bankName}</span>
                    </div>
                  )}
                  {receipt.payout.maskedAccountNumber && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Account Number</span>
                      <span className="font-mono font-medium text-slate-900" data-testid="masked-account">
                        {receipt.payout.maskedAccountNumber}
                      </span>
                    </div>
                  )}
                  {receipt.payout.accountName && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Account Name</span>
                      <span className="font-medium text-slate-900 text-right">
                        {receipt.payout.accountName}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Refund link details */}
              {receipt.refund && (
                <div className="mt-4 space-y-1.5 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-slate-700">
                  {receipt.refund.originalReceiptNumber && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Original Receipt</span>
                      <span className="font-mono font-medium text-slate-900">
                        {receipt.refund.originalReceiptNumber}
                      </span>
                    </div>
                  )}
                  {receipt.refund.originalReference && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Original Reference</span>
                      <span className="font-mono text-slate-900 text-right break-all">
                        {receipt.refund.originalReference}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Refund Type</span>
                    <span className="font-medium text-slate-900">{receipt.refund.refundTypeLabel}</span>
                  </div>
                  {receipt.refund.propertyTitle && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Property</span>
                      <span className="font-medium text-slate-900 text-right">
                        {receipt.refund.propertyTitle}
                      </span>
                    </div>
                  )}
                  {receipt.refund.reason && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Reason</span>
                      <span className="font-medium text-slate-900 text-right">{receipt.refund.reason}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Notice banner (failed/reversed payouts) */}
              {receipt.noticeBanner && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800">
                  {receipt.noticeBanner}
                </div>
              )}

              {/* Line items */}
              {Array.isArray(receipt.items) && receipt.items.length > 0 && (
                <div className="mt-5 border-t border-slate-200 pt-3">
                  <div className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span>Description</span>
                    <span>Amount</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    {receipt.items.map((item, idx) => (
                      <div key={`${item.label}-${idx}`} className="flex justify-between gap-4">
                        <span className="text-slate-700">{item.label}</span>
                        <span className="font-medium text-slate-900 whitespace-nowrap">
                          {item.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="mt-4 flex items-center justify-between border-t-2 border-slate-200 pt-3">
                <span className="text-sm font-bold text-slate-900">
                  {receipt.totalLabel || (receipt.isPaid === false ? 'AMOUNT' : 'TOTAL PAID')}
                </span>
                <span className="text-lg font-bold text-sky-700" data-testid="receipt-total">
                  {receipt.total}
                </span>
              </div>

              {/* Rent platform fee footnote */}
              {Number(receipt.rent?.platformFee) > 0 && (
                <p className="mt-3 rounded-md bg-slate-50 p-2.5 text-xs text-slate-600">
                  {receipt.viewerPerspective === 'landlord'
                    ? `Platform/Service Fee deducted: ₦${Number(receipt.rent.platformFee).toLocaleString()} • Net Rent Credited: ₦${Number(receipt.rent.netLandlordAmount || 0).toLocaleString()}`
                    : `Platform/Service Fee: ₦${Number(receipt.rent.platformFee).toLocaleString()} (deducted from the landlord's payout — not charged to you)`}
                </p>
              )}

              <p className="mt-6 text-center text-[11px] text-slate-400">
                This is a computer-generated document from Amana RentalHub NG and does not require a physical signature.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!loading && !error && receipt && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <FaPrint /> Print
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              <FaFilePdf /> {downloadingPdf ? 'Downloading...' : 'Download PDF'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancialReceiptModal;
