import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, within } from '@testing-library/dom';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import MarketingAgentDashboard from './MarketingAgentDashboard';
import api from '../../services/api';

const state = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: {
      id: 77,
      user_type: 'marketing_agent',
      full_name: 'Amina Field Agent',
      assigned_state: 'Lagos',
      assigned_lga: 'Ikeja',
    },
    logout: vi.fn(),
  },
  socket: {
    connected: true,
    startCall: vi.fn(),
    startSupportCall: vi.fn(),
  },
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
    t: (_key, fallback, opts) => {
      if (typeof fallback === 'string' && opts?.name) {
        return fallback.replace('{{name}}', opts.name);
      }
      return fallback || _key;
    },
  }),
}));

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => state.auth }));
vi.mock('../../hooks/useSocket', () => ({ useSocket: () => state.socket }));
vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="recharts-container">{children}</div>,
  BarChart: ({ children }) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

describe('MarketingAgentDashboard', () => {
  let root;
  let container;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (url === '/survey/marketing-agent/overview') {
        return Promise.resolve({
          data: {
            data: {
              stats: { captured: 14, in_progress: 3, with_email: 11, with_phone: 14 },
              by_lga: [{ lga: 'Ikeja', count: 10 }],
              responses: [
                {
                  id: 101,
                  respondent_code: 'RH-001',
                  survey_type: 'landlord',
                  respondent_name: 'Bola Balogun',
                  respondent_phone: '08031234567',
                  agent_lga: 'Ikeja',
                  completed_at: '2026-10-01T10:00:00Z',
                },
              ],
              commissions: {
                total_earned: 25000,
                qualified_count: 5,
                reversed_count: 0,
                wallet_balance: 15000,
                commissions: [
                  {
                    id: 501,
                    new_user_name: 'Musa Landlord',
                    account_type: 'landlord',
                    stage: 'verification',
                    amount: 5000,
                    status: 'qualified',
                    qualified_at: '2026-10-12T09:00:00Z',
                  },
                ],
              },
            },
          },
        });
      }
      if (url === '/survey/marketing-agent/invite') {
        return Promise.resolve({
          data: {
            data: {
              referral_code: 'MKT-AMINA77',
              invite_url: 'https://rentalhub.ng/register?ref=MKT-AMINA77',
            },
          },
        });
      }
      if (url === '/notifications') {
        return Promise.resolve({ data: { data: { notifications: [] } } });
      }
      if (url === '/notifications/unread/count') {
        return Promise.resolve({ data: { data: { count: 2 } } });
      }
      return Promise.resolve({ data: { data: {} } });
    });
    api.post.mockResolvedValue({ data: { success: true } });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const mountDashboard = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <MarketingAgentDashboard />
        </MemoryRouter>
      );
    });
  };

  test('renders dedicated navbar with Property Market, Headphone beside Bell, Logout, Wallet, Invite Link, and Respondents', async () => {
    await mountDashboard();

    // Header controls
    expect(container.querySelector('a[href="/properties"]')).toBeTruthy();
    expect(within(container).getByTestId('headphone-support-button')).toBeTruthy();
    expect(within(container).getByTestId('marketing-notifications-button')).toBeTruthy();
    expect(within(container).getByTestId('marketing-logout-button')).toBeTruthy();

    // Commission wallet & referral invite link
    expect(within(container).getByTestId('marketing-wallet-balance').textContent).toContain('15,000');
    expect(within(container).getByTestId('marketing-invite-url').value).toBe(
      'https://rentalhub.ng/register?ref=MKT-AMINA77'
    );
    expect(container.textContent).toContain('MKT-AMINA77');

    // Commission history & captured respondents
    expect(container.textContent).toContain('Musa Landlord');
    expect(container.textContent).toContain('Bola Balogun');

    // Logout works
    await act(async () => fireEvent.click(within(container).getByTestId('marketing-logout-button')));
    expect(state.auth.logout).toHaveBeenCalledTimes(1);
    expect(state.navigate).toHaveBeenCalledWith('/login');
  });

  test('submits commission withdrawal request to /payments/wallet/withdraw', async () => {
    await mountDashboard();

    await act(async () =>
      fireEvent.click(within(container).getByTestId('withdraw-commission-button'))
    );
    const modal = within(container).getByTestId('withdraw-commission-modal');

    const amountInput = modal.querySelector('input[type="number"]');
    const textInputs = modal.querySelectorAll('input[type="text"]');
    await act(async () => {
      fireEvent.change(amountInput, { target: { value: '5000' } });
      fireEvent.change(textInputs[0], { target: { value: 'GTBank' } });
      fireEvent.change(textInputs[1], { target: { value: '0123456789' } });
      fireEvent.change(textInputs[2], { target: { value: 'Amina Field Agent' } });
    });

    await act(async () => {
      fireEvent.submit(modal.querySelector('form'));
    });

    expect(api.post).toHaveBeenCalledWith('/payments/wallet/withdraw', {
      amount: 5000,
      bank_name: 'GTBank',
      account_number: '0123456789',
      account_name: 'Amina Field Agent',
    });
  });
});
