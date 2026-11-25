import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent } from '@testing-library/dom';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Login from './Login';
import workflow from '../propertyProtection/workflow.cjs';

const state = vi.hoisted(() => ({
  login: vi.fn(),
  establishSession: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => state.navigate,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k, fallback) => fallback || _k,
    i18n: { language: 'en' },
  }),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    login: state.login,
    establishSession: state.establishSession,
  }),
}));

vi.mock('../components/common/FloatingContactWidget', () => ({ default: () => null }));
vi.mock('../components/common/WhatsAppBotWidget', () => ({ default: () => null }));
vi.mock('../components/common/TurnstileWidget', () => ({
  default: React.forwardRef((_props, _ref) => null),
}));
vi.mock('./CustomerGoogleSignIn', () => ({ default: () => null }));
vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('Login post-login dashboard redirects', () => {
  let root;
  let container;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  test.each([
    ['marketing_agent', '/marketing-agent/dashboard'],
    [' Marketing_Agent ', '/marketing-agent/dashboard'],
    ['super_transportation_admin', '/super-admin/transportation'],
    ['zonal_transportation_admin', '/admin/transportation/zonal'],
    ['zonal_fumigation_admin', '/admin/fumigation-cleaning/zonal'],
    ['zonal_financial_admin', '/admin/zonal-financial-dashboard'],
    ['zonal_support_admin', '/admin/zonal-support-dashboard'],
    ['zonal_admin', '/admin'],
    ['recruitment_admin', '/admin/recruitment'],
  ])('redirects %s straight to %s after login', async (role, expectedPath) => {
    state.login.mockResolvedValue({
      success: true,
      data: {
        token: 'test-token',
        user: { id: 42, email: 'staff@rentalhub.ng', user_type: role },
      },
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/login']}>
          <Login />
        </MemoryRouter>
      );
    });

    const emailInput = container.querySelector('input[type="text"], input[type="email"]');
    const passwordInput = container.querySelector('input[type="password"]');
    const form = container.querySelector('form');

    await act(async () => {
      fireEvent.change(emailInput, { target: { value: 'staff@rentalhub.ng' } });
      fireEvent.change(passwordInput, { target: { value: 'StrongPass123!' } });
    });

    await act(async () => {
      fireEvent.submit(form);
    });

    expect(state.login).toHaveBeenCalledTimes(1);
    expect(state.navigate).toHaveBeenCalledWith(expectedPath);
    expect(workflow.dashboardPathFor({ user_type: role })).toBe(expectedPath);
  });
});
