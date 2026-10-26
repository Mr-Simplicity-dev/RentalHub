import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, waitFor, within } from '@testing-library/dom';
import { vi } from 'vitest';
import '../i18n';
import api from '../services/api';
import PhoneAccountAccess from '../components/common/PhoneAccountAccess';
import RegistrationPayment from './RegistrationPayment';
import AssistedRegistration from './admin/AssistedRegistration';
import AssistedRegistrationCard from '../components/admin/AssistedRegistrationCard';
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
  useNavigate: () => navigate,
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>
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


test('staff can review a fresh quote after the fee changes without losing customer details', async () => {
  auth.user = { id: 9, user_type: 'super_admin' };
  api.get.mockImplementation(url => Promise.resolve({data:{data:url.endsWith('/config') ? {nin_enabled:false}:[]}}));
  api.post.mockResolvedValueOnce({data:{data:{amount:3000}}}).mockRejectedValueOnce({response:{data:{code:'REGISTRATION_QUOTE_CHANGED',message:'The fee has changed'}}}).mockResolvedValueOnce({data:{data:{amount:4000}}});
  await mount(<AssistedRegistration />);
  fireEvent.change(within(container).getByLabelText('Full name'), {target:{value:'Customer Name'}});
  await act(async () => fireEvent.submit(container.querySelector('form')));
  expect(container.textContent).toContain('Create customer account');
  await act(async () => fireEvent.submit(container.querySelector('form')));
  expect(container.textContent).toContain('Review registration fee');
  expect(within(container).getByLabelText('Full name').value).toBe('Customer Name');
  await act(async () => fireEvent.submit(container.querySelector('form')));
  expect(api.post.mock.calls[2][0]).toBe('/assisted-registration/staff/quote');
  expect(container.textContent).toContain('4,000');
});

test('waived registration offers an acknowledgement instead of a payment receipt', async () => {
  auth.user={id:9,user_type:'super_admin'};
  api.get.mockImplementation(url => Promise.resolve({data:{data:url.endsWith('/config')?{nin_enabled:false}:url.endsWith('/staff')?[{reference:'waived',status:'paid',collection_method:'waived',amount_due:0,full_name:'Customer'}]:[]}}));
  await mount(<AssistedRegistration />);
  expect(container.textContent).toContain('Fee waived');
  expect(within(container).getByText('Download acknowledgement')).toBeTruthy();
  expect(within(container).queryByText('Generate receipt')).toBeNull();
});

test('assisted registration dashboard card is restricted to authorised staff', async () => {
  for(const role of ['tenant','landlord','marketing_agent','recruitment_admin']) {
    auth.user={user_type:role};await mount(<AssistedRegistrationCard />);expect(container.textContent).toBe('');
  }
  for(const role of ['super_admin','super_support_admin','zonal_admin','state_support_admin','lga_support_admin']) {
    auth.user={user_type:role};await mount(<AssistedRegistrationCard />);expect(within(container).getByRole('link').getAttribute('href')).toBe('/admin/assisted-registration');
  }
});
