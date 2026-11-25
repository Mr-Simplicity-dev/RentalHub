import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, waitFor, within } from '@testing-library/dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import '../i18n';
import VerifyStaff from './VerifyStaff';
import Header from '../components/common/Header';
import staffVerificationService from '../services/staffVerificationService';

vi.mock('../services/staffVerificationService', () => ({
  default: {
    lookupPublicStaff: vi.fn(),
    createLiveChallenge: vi.fn(),
    pollLiveChallenge: vi.fn(),
    submitImpersonationReport: vi.fn(),
  },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    logout: vi.fn(),
    updateUser: vi.fn(),
  }),
}));

vi.mock('../context/AuthContext', () => ({
  AuthContext: React.createContext({
    user: null,
    isAuthenticated: false,
    logout: vi.fn(),
    updateUser: vi.fn(),
  }),
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    logout: vi.fn(),
    updateUser: vi.fn(),
  }),
}));

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { success: false } }),
    patch: vi.fn().mockResolvedValue({ data: { success: false } }),
    defaults: { headers: { common: {} } },
  },
}));

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

test('Website Header places underlined "Verify Staff Before Engaging Them" link directly beneath primary nav items while keeping Verify Evidence separate', async () => {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>
    );
  });

  const nav = container.querySelector('nav[aria-label="Primary navigation"]');
  expect(nav).not.toBeNull();
  const navParent = nav.parentElement;
  const verifyEvidenceLink = within(nav).getByRole('link', { name: /Verify Evidence/i });
  expect(verifyEvidenceLink.getAttribute('href')).toBe('/verify-case');

  const directBelowLink = within(navParent).getByRole('link', {
    name: 'Verify Staff Before Engaging Them',
  });
  expect(directBelowLink.getAttribute('href')).toBe('/verify-staff');
  expect(directBelowLink.className).toContain('underline');
  // Must be direct sibling immediately following the <nav>
  expect(nav.nextElementSibling).toBe(directBelowLink);
});

test('VerifyStaff renders mandatory payment safety notice, looks up active staff, completes live confirmation, and records impersonation report', async () => {
  staffVerificationService.lookupPublicStaff.mockResolvedValue({
    data: {
      success: true,
      data: {
        verification_state: 'ACTIVE_REGISTRATION',
        face_match_advisory:
          'Compare the person in front of you with the official photograph.',
        staff_profile: {
          staff_verification_id: 'AMN-7K4P-9M2X-3Q8R',
          full_name: 'Amina Bello',
          official_photo_url: 'https://example.com/amina.jpg',
          official_role: 'Field Inspection Officer',
          department: 'Property Operations',
          engagement_type: 'field_agent',
          engagement_type_label: 'Field Agent',
          registration_status: 'active',
          verification_state: 'ACTIVE_REGISTRATION',
          approved_activities: [
            { code: 'coordinate_property_inspections', label: 'Coordinate property inspections' },
          ],
          restricted_by_default: ['Collect rent into a personal bank account'],
          financial_collection_authorized: false,
          valid_from: '2026-01-01T00:00:00.000Z',
          expires_at: '2027-01-01T00:00:00.000Z',
          can_request_live_confirmation: true,
        },
      },
    },
  });

  staffVerificationService.createLiveChallenge.mockResolvedValue({
    data: {
      success: true,
      data: {
        challenge_reference: 'CHK-11AA-22BB',
        short_code: 'WXYZ-9876',
        qr_payload: 'amana-staff-challenge:securetoken1234567890',
        visitor_poll_token: 'pollsecret1234567890',
        purpose: 'Property inspection at Lekki Phase 1',
        expires_at: new Date(Date.now() + 120000).toISOString(),
        verification_state: 'PENDING',
      },
    },
  });

  staffVerificationService.submitImpersonationReport.mockResolvedValue({
    data: {
      success: true,
      data: {
        report_reference: 'IMP-8899-ABCD',
        status: 'open',
      },
    },
  });

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/verify-staff']}>
        <Routes>
          <Route path="/verify-staff" element={<VerifyStaff />} />
        </Routes>
      </MemoryRouter>
    );
  });

  const ui = within(container);
  // Mandatory payment safety notice visible on landing
  expect(ui.getAllByText(/IMPORTANT PAYMENT SAFETY NOTICE/i).length).toBeGreaterThanOrEqual(1);
  expect(
    ui.getByText(/Never transfer money to a staff member's personal bank account/i)
  ).toBeTruthy();

  // Manual Staff ID lookup
  const input = ui.getByLabelText(/Amana Staff Verification ID/i);
  await act(async () => {
    fireEvent.change(input, { target: { value: 'AMN-7K4P-9M2X-3Q8R' } });
    fireEvent.click(ui.getByRole('button', { name: /Verify Staff ID/i }));
  });

  await waitFor(() => {
    expect(ui.getByText('Amina Bello')).toBeTruthy();
  });
  expect(ui.getByTestId('verification-status-banner').getAttribute('data-verification-state')).toBe(
    'ACTIVE_REGISTRATION'
  );
  expect(ui.getByText('Coordinate property inspections')).toBeTruthy();
  expect(ui.getByText(/NOT authorised to collect payments/i)).toBeTruthy();

  // Request Live Confirmation
  const purposeInput = ui.getByLabelText(/Purpose of verification/i);
  await act(async () => {
    fireEvent.change(purposeInput, { target: { value: 'Property inspection at Lekki Phase 1' } });
    fireEvent.click(ui.getByRole('button', { name: /Request Live Confirmation/i }));
  });

  await waitFor(() => {
    expect(ui.getByTestId('live-challenge-code').textContent).toBe('WXYZ-9876');
  });
  expect(ui.getByTestId('verification-status-banner').getAttribute('data-verification-state')).toBe(
    'PENDING'
  );

  // Submit Impersonation Report
  await act(async () => {
    fireEvent.click(ui.getAllByRole('button', { name: /Report Suspected Impersonation/i })[0]);
  });
  const desc = ui.getByLabelText(/What Happened/i);
  await act(async () => {
    fireEvent.change(desc, {
      target: { value: 'Caller asked for cash transfer to a personal account.' },
    });
    fireEvent.click(ui.getByRole('button', { name: /Submit Report/i }));
  });
  await waitFor(() => {
    expect(ui.getByText('IMP-8899-ABCD')).toBeTruthy();
  });
});

test('VerifyStaff displays REVOKED state and blocks live confirmation option', async () => {
  staffVerificationService.lookupPublicStaff.mockResolvedValue({
    data: {
      success: true,
      data: {
        verification_state: 'REVOKED',
        staff_profile: {
          staff_verification_id: 'AMN-REV1-2222-3333',
          full_name: 'Former Rep',
          official_role: 'Field Agent',
          department: 'Operations',
          engagement_type: 'field_agent',
          engagement_type_label: 'Field Agent',
          registration_status: 'revoked',
          verification_state: 'REVOKED',
          approved_activities: [],
          restricted_by_default: [],
          financial_collection_authorized: false,
          can_request_live_confirmation: false,
        },
      },
    },
  });

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/verify-staff/AMN-REV1-2222-3333']}>
        <Routes>
          <Route path="/verify-staff/:staffId" element={<VerifyStaff />} />
        </Routes>
      </MemoryRouter>
    );
  });

  const ui = within(container);
  await waitFor(() => {
    expect(ui.getByTestId('verification-status-banner').getAttribute('data-verification-state')).toBe(
      'REVOKED'
    );
  });
  expect(ui.queryByRole('button', { name: /Request Live Confirmation/i })).toBeNull();
});
