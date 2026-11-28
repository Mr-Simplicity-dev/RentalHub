import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { fireEvent, within } from '@testing-library/dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ListingAssistanceQueue from './ListingAssistanceQueue';
import api from '../../services/api';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('react-toastify', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

let root;
let container;
const request = {
  id: 21,
  landlord_name: 'Landlord One',
  state_name: 'Lagos',
  lga_name: 'Ikeja',
  status: 'awaiting_assignment',
  created_at: '2026-11-28T10:00:00Z',
  eligible_agents: [{ id: 51, full_name: 'Agent One', assigned_lga: 'Ikeja' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockResolvedValue({ data: { data: [request] } });
  api.post.mockResolvedValue({ data: { success: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test('staff can assign only an eligible agent from the matching request queue', async () => {
  await act(async () => root.render(<ListingAssistanceQueue />));
  expect(api.get).toHaveBeenCalledWith('/listing-assistance/staff/requests');
  expect(container.textContent).toContain('Free listing-assistance requests');
  expect(container.textContent).toContain('Ikeja, Lagos');
  expect(container.textContent).toContain('property-management access only');

  const ui = within(container);
  await act(async () => fireEvent.change(ui.getByLabelText('Eligible agent for request 21'), { target: { value: '51' } }));
  await act(async () => fireEvent.click(ui.getByRole('button', { name: 'Assign agent' })));

  expect(api.post).toHaveBeenCalledWith('/listing-assistance/staff/requests/21/assign', { agentId: 51 });
  expect(api.get).toHaveBeenCalledTimes(2);
});

test('staff UI leaves requests pending when no suitable agent is available', async () => {
  api.get.mockResolvedValue({ data: { data: [{ ...request, eligible_agents: [] }] } });
  await act(async () => root.render(<ListingAssistanceQueue />));

  expect(container.textContent).toContain('No available platform agent currently matches this state and LGA');
  expect(container.textContent).toContain('Awaiting assignment');
  expect(within(container).queryByRole('button', { name: 'Assign agent' })).toBeNull();
  expect(api.post).not.toHaveBeenCalled();
});
