import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, waitFor } from '@testing-library/dom';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import '../i18n';
import VerifyPhone from './VerifyPhone';
import api from '../services/api';

const { navigate, mockAuthState, toastMocks } = vi.hoisted(() => ({
  navigate: vi.fn(),
  mockAuthState: {
    user: {
      id: 7,
      user_type: 'landlord',
      phone: '+2348031234567',
      phone_verified: false,
    },
    updateUser: vi.fn(),
  },
  toastMocks: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => navigate,
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('react-toastify', () => ({
  toast: toastMocks,
}));

let root;
let container;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mockAuthState.user = {
    id: 7,
    user_type: 'landlord',
    phone: '+2348031234567',
    phone_verified: false,
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test('uses saved account phone directly without requiring re-entry and syncs user state on verification', async () => {
  api.post
    .mockResolvedValueOnce({ data: { success: true } })
    .mockResolvedValueOnce({ data: { success: true } });
  api.get.mockResolvedValueOnce({
    data: {
      success: true,
      data: {
        id: 7,
        user_type: 'landlord',
        phone: '+2348031234567',
        phone_verified: true,
      },
    },
  });

  await act(async () => {
    root.render(
      <MemoryRouter>
        <VerifyPhone />
      </MemoryRouter>
    );
  });

  expect(container.textContent).toContain('+2348031234567');
  expect(container.querySelector('input')).toBeNull();

  const sendButton = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent.includes('Send OTP')
  );
  await act(async () => {
    fireEvent.click(sendButton);
  });

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith('/auth/send-phone-otp', {
      phone: '+2348031234567',
    });
  });

  const otpInput = container.querySelector('input');
  await act(async () => {
    fireEvent.change(otpInput, { target: { value: '123456' } });
  });

  const verifyButton = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent.includes('Verify')
  );
  await act(async () => {
    fireEvent.click(verifyButton);
  });

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith('/auth/verify-phone', { otp: '123456' });
    expect(api.get).toHaveBeenCalledWith('/auth/me');
    expect(mockAuthState.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ phone_verified: true })
    );
    expect(navigate).toHaveBeenCalledWith('/profile');
  });
});

test('shows already-verified confirmation when phone_verified is already true', async () => {
  mockAuthState.user = {
    id: 7,
    user_type: 'landlord',
    phone: '+2348031234567',
    phone_verified: true,
  };

  await act(async () => {
    root.render(
      <MemoryRouter>
        <VerifyPhone />
      </MemoryRouter>
    );
  });

  expect(container.textContent).toContain('already verified');
  expect(api.post).not.toHaveBeenCalled();

  const profileButton = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent.includes('Back to Profile')
  );
  await act(async () => {
    fireEvent.click(profileButton);
  });
  expect(navigate).toHaveBeenCalledWith('/profile');
});
