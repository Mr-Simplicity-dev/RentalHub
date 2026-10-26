import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, waitFor, within } from '@testing-library/dom';
import { vi } from 'vitest';
import '../i18n';
import api from '../services/api';
import PhoneAccountAccess from '../components/common/PhoneAccountAccess';
import RegistrationPayment from './RegistrationPayment';
const auth = vi.hoisted(() => ({
  user: {
    id: 1,
    full_name: 'Customer',
    assisted_registration: true
  },
  establishSession: vi.fn(),
  updateUser: vi.fn(),
  logout: vi.fn()
}));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => auth
}));
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate
}));
vi.mock('../components/common/TurnstileWidget', async () => {
  const React = await import('react');
  return {
    default: React.forwardRef(({
      onToken
    }, ref) => {
      React.useEffect(() => {
        onToken('security-token');
      }, [onToken]);
      React.useImperativeHandle(ref, () => ({
        reset: () => {}
      }));
      return null;
    })
  };
});
vi.mock('../components/VirtualAccountCheckout', () => ({
  default: () => null
}));
vi.mock('../components/BankTransferCheckout', () => ({
  default: ({
    onSubmitted
  }) => <button onClick={() => onSubmitted({
    paid: true
  })}>Submit transfer for review</button>
}));
let container, root;
beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const mount = async node => {
  await act(async () => root.render(node));
};
test('phone verification opens payment for an unpaid customer without requesting an email', async () => {
  api.post.mockResolvedValueOnce({
    data: {
      data: {
        challenge_id: 'challenge',
        message: 'Code requested'
      }
    }
  }).mockResolvedValueOnce({
    data: {
      data: {
        token: 'owned-session',
        user: {
          id: 1,
          user_type: 'tenant',
          registration_payment_required: true
        }
      }
    }
  });
  await mount(<PhoneAccountAccess />);
  const ui = within(container);
  fireEvent.change(ui.getByLabelText('Phone number'), {
    target: {
      value: '08031234567'
    }
  });
  await act(async () => fireEvent.submit(container.querySelector('form')));
  expect(api.post.mock.calls[0][1]).toEqual({
    phone: '08031234567',
    turnstile_token: 'security-token'
  });
  fireEvent.change(ui.getByLabelText('Six-digit verification code'), {
    target: {
      value: '123456'
    }
  });
  await act(async () => fireEvent.submit(container.querySelector('form')));
  expect(auth.establishSession).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith('/registration-payment', {
    replace: true
  });
});
test('an invalid phone code does not establish any session', async () => {
  api.post.mockResolvedValueOnce({
    data: {
      data: {
        challenge_id: 'challenge',
        message: 'Code requested'
      }
    }
  }).mockRejectedValueOnce({
    response: {
      data: {
        message: 'Invalid or expired verification code'
      }
    }
  });
  await mount(<PhoneAccountAccess />);
  fireEvent.change(within(container).getByLabelText('Phone number'), {
    target: {
      value: '08031234567'
    }
  });
  await act(async () => fireEvent.submit(container.querySelector('form')));
  fireEvent.change(within(container).getByLabelText('Six-digit verification code'), {
    target: {
      value: '000000'
    }
  });
  await act(async () => fireEvent.submit(container.querySelector('form')));
  expect(auth.establishSession).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Invalid or expired');
});
test('a phone-only customer can submit a transfer but cannot unlock their dashboard from client claims', async () => {
  api.get.mockResolvedValue({
    data: {
      data: {
        reference: 'ARH_ASSIST_123',
        amount: 3000,
        status: 'unpaid',
        email: null
      }
    }
  });
  api.post.mockResolvedValue({
    data: {
      data: {
        available: false,
        bank_accounts: []
      }
    }
  });
  await mount(<RegistrationPayment />);
  await waitFor(() => expect(container.textContent).toContain('₦3,000'));
  expect(within(container).queryByText('Pay by card', {
    exact: true
  })).toBeNull();
  await act(async () => fireEvent.click(within(container).getByText('Pay by bank transfer')));
  await act(async () => fireEvent.click(within(container).getByText('Submit transfer for review')));
  expect(container.textContent).toContain('Transfer submitted for review');
  expect(auth.updateUser).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});
test('confirmed payment refreshes the authoritative user before opening their dashboard', async () => {
  api.get.mockImplementation(url => Promise.resolve({
    data: {
      data: url === '/auth/me' ? {
        id: 1,
        user_type: 'tenant',
        registration_payment_required: false
      } : {
        status: 'paid'
      }
    }
  }));
  await mount(<RegistrationPayment />);
  await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({
    id: 1,
    user_type: 'tenant',
    registration_payment_required: false
  }));
  expect(navigate).toHaveBeenCalledWith('/tenant/dashboard', {
    replace: true
  });
});
test('payment lookup failure does not manufacture a fee or grant dashboard access', async () => {
  api.get.mockRejectedValue({
    response: {
      data: {
        message: 'Payment service unavailable'
      }
    }
  });
  await mount(<RegistrationPayment />);
  await waitFor(() => expect(container.textContent).toContain('Payment service unavailable'));
  expect(container.textContent).not.toContain('₦0');
  expect(auth.updateUser).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});
