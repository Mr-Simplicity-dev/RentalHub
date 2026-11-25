import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, within } from '@testing-library/dom';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import HeadphoneSupportButton from './HeadphoneSupportButton';
import api from '../../services/api';

const state = vi.hoisted(() => ({
  auth: { isAuthenticated: true, user: null },
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

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => state.auth }));
vi.mock('../../hooks/useSocket', () => ({ useSocket: () => state.socket }));
vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('HeadphoneSupportButton', () => {
  let root;
  let container;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    state.socket.connected = true;
    state.socket.startCall.mockResolvedValue({ success: true });
    state.socket.startSupportCall.mockResolvedValue({ success: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const renderButton = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <HeadphoneSupportButton />
        </MemoryRouter>
      );
    });
  };

  test('Tenant sees Contact Support popover with Chat and Call Support options', async () => {
    state.auth = { isAuthenticated: true, user: { id: 10, user_type: 'tenant', full_name: 'Tunde Tenant' } };
    api.get.mockResolvedValue({
      data: {
        data: {
          policy: {
            role: 'tenant',
            mode: 'support_only',
            canChatSupport: true,
            canCallSupport: true,
            canCallBoss: false,
            canCallSubordinates: false,
            canCallAnyone: false,
          },
          supportOnlineCount: 2,
          contacts: [],
        },
      },
    });

    await renderButton();
    const trigger = within(container).getByTestId('headphone-support-button');
    await act(async () => fireEvent.click(trigger));

    expect(within(container).getByTestId('headphone-support-popover')).toBeTruthy();
    expect(container.textContent).toContain('2 support agents online');
    expect(container.textContent).not.toContain('Call Your Boss');

    await act(async () => fireEvent.click(within(container).getByTestId('support-call-action')));
    expect(state.socket.startSupportCall).toHaveBeenCalledTimes(1);

    await act(async () => fireEvent.click(trigger));
    await act(async () => fireEvent.click(within(container).getByTestId('support-chat-action')));
    expect(state.navigate).toHaveBeenCalledWith('/support');
  });

  test('Marketing Agent can contact Support and also call their supervising boss', async () => {
    state.auth = {
      isAuthenticated: true,
      user: { id: 22, user_type: 'marketing_agent', full_name: 'Mina Marketer' },
    };
    api.get.mockResolvedValue({
      data: {
        data: {
          policy: {
            role: 'marketing_agent',
            mode: 'support_and_boss',
            canChatSupport: true,
            canCallSupport: true,
            canCallBoss: true,
            canCallSubordinates: false,
            canCallAnyone: false,
          },
          supportOnlineCount: 1,
          contacts: [
            {
              id: 5,
              full_name: 'Rakiya Recruiter',
              user_type: 'recruitment_admin',
              role_label: 'Recruitment Admin',
              assigned_state: 'Lagos',
              online: true,
              relation: 'boss',
            },
          ],
        },
      },
    });

    await renderButton();
    await act(async () => fireEvent.click(within(container).getByTestId('headphone-support-button')));

    expect(container.textContent).toContain('Chat with Support');
    expect(container.textContent).toContain('Call Support');
    expect(container.textContent).toContain('Rakiya Recruiter');

    const bossRow = within(container).getByTestId('boss-contact-5');
    await act(async () => fireEvent.click(within(bossRow).getByRole('button', { name: /Call/i })));
    expect(state.socket.startCall).toHaveBeenCalledWith(
      expect.objectContaining({ receiverId: 5, callType: 'audio' })
    );
  });

  test('National Admin opens Team Call Directory modal to call subordinate admins', async () => {
    state.auth = {
      isAuthenticated: true,
      user: { id: 3, user_type: 'super_support_admin', full_name: 'Nadia National' },
    };
    api.get.mockResolvedValue({
      data: {
        data: {
          policy: {
            role: 'super_support_admin',
            mode: 'admin_subordinates',
            canChatSupport: false,
            canCallSupport: false,
            canCallBoss: true,
            canCallSubordinates: true,
            canCallAnyone: false,
          },
          supportOnlineCount: 4,
          contacts: [
            {
              id: 41,
              full_name: 'Sadiq State Support',
              user_type: 'state_support_admin',
              role_label: 'State Support Admin',
              assigned_state: 'Kano',
              online: true,
              relation: 'subordinate',
            },
          ],
        },
      },
    });

    await renderButton();
    await act(async () => fireEvent.click(within(container).getByTestId('headphone-support-button')));

    const modal = within(container).getByTestId('headphone-call-directory-modal');
    expect(modal.textContent).toContain('Admin & Team Call Directory');
    expect(modal.textContent).toContain('Team Below Me');
    expect(modal.textContent).toContain('Sadiq State Support');

    const row = within(modal).getByTestId('directory-contact-41');
    await act(async () => fireEvent.click(within(row).getByRole('button', { name: /Call/i })));
    expect(state.socket.startCall).toHaveBeenCalledWith(
      expect.objectContaining({ receiverId: 41, callType: 'audio' })
    );
  });

  test('Super Admin opens Platform Call Directory with all role filter tabs and can call anyone', async () => {
    state.auth = {
      isAuthenticated: true,
      user: { id: 1, user_type: 'super_admin', full_name: 'Chief Super Admin' },
    };
    api.get.mockResolvedValue({
      data: {
        data: {
          policy: {
            role: 'super_admin',
            mode: 'platform_all',
            canChatSupport: false,
            canCallSupport: false,
            canCallBoss: false,
            canCallSubordinates: true,
            canCallAnyone: true,
          },
          supportOnlineCount: 2,
          contacts: [
            {
              id: 99,
              full_name: 'Chidi Landlord',
              user_type: 'landlord',
              role_label: 'Landlord',
              assigned_state: 'Rivers',
              online: true,
              relation: 'platform',
            },
          ],
        },
      },
    });

    await renderButton();
    await act(async () => fireEvent.click(within(container).getByTestId('headphone-support-button')));

    const modal = within(container).getByTestId('headphone-call-directory-modal');
    expect(modal.textContent).toContain('Platform Call Directory');
    expect(modal.textContent).toContain('Landlords');
    expect(modal.textContent).toContain('Tenants');
    expect(modal.textContent).toContain('Admins');
    expect(modal.textContent).toContain('Chidi Landlord');

    const row = within(modal).getByTestId('directory-contact-99');
    await act(async () => fireEvent.click(within(row).getByRole('button', { name: /Call/i })));
    expect(state.socket.startCall).toHaveBeenCalledWith(
      expect.objectContaining({ receiverId: 99, callType: 'audio' })
    );
  });
});
