import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { waitFor } from '@testing-library/dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import FinancialReceiptModal from './FinancialReceiptModal';
import { paymentService } from '../../services/paymentService';

vi.mock('../../services/paymentService', () => ({
  paymentService: {
    getDocumentReceipt: vi.fn(),
    downloadDocumentPdf: vi.fn(),
  },
}));
vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('FinancialReceiptModal', () => {
  let container;
  let root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('renders canonical payout receipt with masked bank account and ARH number', async () => {
    paymentService.getDocumentReceipt.mockResolvedValue({
      success: true,
      data: {
        documentType: 'OFFICIAL PAYOUT RECEIPT',
        receiptNumber: 'ARH-AG-PAY-000091',
        status: 'PROCESSED',
        fullName: 'Tunde Agent',
        email: 'tunde@example.com',
        date: '12 October 2026, 3:00 PM WAT',
        reference: 'ARH_AGW_91_1700000000',
        methodLine: 'Bank Transfer — Agent Payout',
        currency: 'NGN',
        payout: {
          withdrawalId: 91,
          bankName: 'GTBank',
          maskedAccountNumber: '••••••6789',
          accountName: 'Tunde Agent',
        },
        items: [{ label: 'Agent Commission Payout', amount: '₦45,000' }],
        total: '₦45,000',
        totalLabel: 'TOTAL PAID OUT',
      },
    });

    await act(async () => {
      root.render(<FinancialReceiptModal open kind="agent-payout" recordId={91} onClose={() => {}} />);
    });

    await waitFor(() => {
      expect(container.textContent).toContain('OFFICIAL PAYOUT RECEIPT');
      expect(container.textContent).toContain('ARH-AG-PAY-000091');
      expect(container.textContent).toContain('••••••6789');
      expect(container.textContent).toContain('Amana RentalHub NG');
      expect(container.textContent).toContain('₦45,000');
    });
  });

  it('renders refund confirmation linked to original receipt without claiming PAID', async () => {
    paymentService.getDocumentReceipt.mockResolvedValue({
      success: true,
      data: {
        documentType: 'REFUND CONFIRMATION',
        subtitle: 'Official Refund Record — Not a New Payment Receipt',
        receiptNumber: 'ARH-RFND-000055',
        status: 'REFUNDED',
        isPaid: false,
        fullName: 'Chidi Tenant',
        date: '15 October 2026, 12:00 PM WAT',
        reference: 'RF_998877',
        currency: 'NGN',
        refund: {
          originalReceiptNumber: 'ARH-RCPT-000123',
          originalReference: 'ARH_RENT_123',
          refundTypeLabel: 'Partial Refund (4 Months)',
          reason: 'Relocation',
        },
        items: [
          { label: 'Original Payment Amount', amount: '₦1,200,000' },
          { label: 'Partial Refund (4 Months) Amount', amount: '₦400,000' },
        ],
        total: '₦400,000',
        totalLabel: 'AMOUNT REFUNDED',
      },
    });

    await act(async () => {
      root.render(<FinancialReceiptModal open kind="refund" recordId={55} onClose={() => {}} />);
    });

    await waitFor(() => {
      expect(container.textContent).toContain('REFUND CONFIRMATION');
      expect(container.textContent).toContain('ARH-RFND-000055');
      expect(container.textContent).toContain('ARH-RCPT-000123');
      expect(container.textContent).toContain('AMOUNT REFUNDED');
      expect(container.textContent).not.toContain('TOTAL PAID');
    });
  });
});
