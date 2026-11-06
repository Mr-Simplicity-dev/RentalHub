import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent } from '@testing-library/dom';
import { vi } from 'vitest';
import '../i18n';
import Verification from './RegistrationPhoneVerification';
import api from '../services/api';
vi.mock('../services/api', () => ({ default: { post: vi.fn() } }));
let container, root;
const pending = { payload: { phone: '08012345678', user_type: 'landlord' }, challenge: 'challenge-one', flow: 'paid' };
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; vi.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });
test('the sent screen opens after initial send; verification precedes checkout', async () => {
  const verified = vi.fn();
  await act(async () => root.render(<Verification pending={pending} onVerified={verified} onClose={vi.fn()} />));
  expect(container.textContent).toContain('We sent a verification code');
  expect(api.post).not.toHaveBeenCalled();
  expect(container.querySelector('[type="submit"]').disabled).toBe(true);
  api.post.mockResolvedValue({ data: { success: true, data: { reference: 'ref', completion_token: 'proof', authorization_url: 'https://checkout.paystack.com/test' } } });
  await act(async () => fireEvent.change(container.querySelector('input'), { target: { value: '123456' } }));
  await act(async () => fireEvent.submit(container.querySelector('form')));
  expect(api.post).toHaveBeenCalledWith('/auth/register/payment/verify-phone', { ...pending.payload, phone_challenge: pending.challenge, phone_verification_protocol: 2, otp: '123456' }, { skipAuth: true, skipAuthRefresh: true, timeout: 120000 });
  expect(verified).toHaveBeenCalledTimes(1);
});
test('invalid code does not open payment; failed resend does not claim a code was sent', async () => {
  vi.useFakeTimers(); const verified = vi.fn();
  await act(async () => root.render(<Verification pending={pending} onVerified={verified} onClose={vi.fn()} />));
  api.post.mockRejectedValue({ response: { data: { message: 'Invalid verification code.' } } });
  await act(async () => fireEvent.change(container.querySelector('input'), { target: { value: '999999' } }));
  await act(async () => fireEvent.submit(container.querySelector('form')));
  expect(verified).not.toHaveBeenCalled(); expect(container.querySelector('[role="alert"]').textContent).toContain('Invalid');
  for (let i = 0; i < 60; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  const resend = [...container.querySelectorAll('button')].find(button => button.textContent.includes('Resend'));
  await act(async () => fireEvent.click(resend));
  expect(container.querySelector('[role="status"]').textContent).toContain('Could not send');
  expect(container.querySelector('[type="submit"]').disabled).toBe(true);
});
test('free account verification uses the free endpoint and does not request a payment URL', async () => {
  const verified = vi.fn(); api.post.mockResolvedValue({ data: { success: true, data: { token: 'session', user: { user_type: 'tenant' } } } });
  await act(async () => root.render(<Verification pending={{ ...pending, flow: 'free' }} onVerified={verified} onClose={vi.fn()} />));
  await act(async () => fireEvent.change(container.querySelector('input'), { target: { value: '123456' } }));
  await act(async () => fireEvent.submit(container.querySelector('form')));
  expect(api.post.mock.calls[0][0]).toBe('/auth/register/verify-phone'); expect(verified).toHaveBeenCalledTimes(1);
});

test('a provider delay preserves phone verification and retries without reusing the consumed code', async () => {
 const verified=vi.fn();
 api.post.mockResolvedValueOnce({data:{success:true,code:'PHONE_VERIFIED',phone_verification_token:'signed-proof'}})
 .mockResolvedValueOnce({data:{success:false,code:'PREMBLY_VERIFICATION_PENDING',message:'Identity check pending',phone_verification_token:'signed-proof',data:{can_auto_check:false}}});
 await act(async()=>root.render(<Verification pending={pending} onVerified={verified} onClose={vi.fn()}/>));
 await act(async()=>fireEvent.change(container.querySelector('input'),{target:{value:'123456'}}));
 await act(async()=>fireEvent.submit(container.querySelector('form')));
 expect(api.post).toHaveBeenCalledTimes(2);expect(verified).not.toHaveBeenCalled();
 expect(container.querySelector('input').disabled).toBe(true);expect(container.textContent).toContain('Identity check pending');
 api.post.mockResolvedValueOnce({data:{success:true,data:{reference:'ref',authorization_url:'https://checkout.paystack.com/test'}}});
 await act(async()=>fireEvent.submit(container.querySelector('form')));
 const body=api.post.mock.calls[2][1];expect(body.phone_verification_token).toBe('signed-proof');expect(body.otp).toBeUndefined();expect(verified).toHaveBeenCalledTimes(1);
});
