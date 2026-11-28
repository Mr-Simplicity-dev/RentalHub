import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { fireEvent, within } from '@testing-library/dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import AddProperty from './AddProperty';
import { propertyService } from '../services/propertyService';
import { toast } from 'react-toastify';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getLocationOptions: vi.fn(),
  createProperty: vi.fn(),
  uploadClips: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 7, user_type: 'landlord' } }),
}));
vi.mock('../services/propertyService', () => ({
  propertyService: {
    getLocationOptions: mocks.getLocationOptions,
    createProperty: mocks.createProperty,
    uploadClips: mocks.uploadClips,
  },
}));
vi.mock('react-toastify', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    info: mocks.toastInfo,
  },
}));
vi.mock('../components/MapPicker', () => ({
  default: ({ onChange }) => (
    <button type="button" onClick={() => onChange({ lat: 6.6018, lng: 3.3515 })}>
      Set test coordinates
    </button>
  ),
}));
vi.mock('../components/properties/LivePropertyPhotoCapture', () => ({
  default: ({ onChange }) => (
    <button
      type="button"
      onClick={() => onChange([
        new File(['isolated photo'], 'listing.jpg', { type: 'image/jpeg' }),
      ], ['isolated-capture-ticket'])}
    >
      Capture test photo
    </button>
  ),
}));
vi.mock('../components/properties/LivePropertyClipCapture', () => ({ default: () => null }));
vi.mock('../components/properties/PropertyFeaturesForm', () => ({ default: () => null }));
vi.mock('../components/properties/ListingAssistancePanel', () => ({ default: () => null }));
vi.mock('../components/common/BackToDashboard', () => ({ default: () => null }));
vi.mock('../components/damage', () => ({ DamageReportButton: () => null }));

let root;
let container;

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mocks.getLocationOptions.mockResolvedValue({
    success: true,
    data: [{ id: 1, state_name: 'Lagos', lgas: ['Ikeja'] }],
  });
  mocks.createProperty.mockResolvedValue({
    success: true,
    message: 'Property created and submitted for review.',
    data: { id: 45, status: 'pending', is_verified: false },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const mountForm = async () => {
  await act(async () => {
    root.render(<AddProperty />);
    await Promise.resolve();
  });
  return within(container);
};

test('form validation alone does not count as a submitted listing', async () => {
  const ui = await mountForm();

  await act(async () => {
    fireEvent.click(ui.getByRole('button', { name: 'add_property.continue' }));
  });

  expect(mocks.toastError).toHaveBeenCalledWith('add_property.required');
  expect(propertyService.createProperty).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain('Property submitted for review');
});

test('valid form sends the captured listing and shows review status after the API succeeds', async () => {
  const ui = await mountForm();
  const placeholders = [
    ['add_property.form.title', 'Ikeja test property'],
    ['add_property.form.description', 'Isolated property listing for verification.'],
    ['add_property.form.city', 'Ikeja'],
    ['add_property.form.area', 'Allen Avenue'],
    ['add_property.form.rent', '1200000'],
  ];

  for (const [placeholder, value] of placeholders) {
    await act(async () => {
      fireEvent.change(ui.getByPlaceholderText(placeholder), { target: { value } });
    });
  }

  const selects = container.querySelectorAll('select');
  await act(async () => fireEvent.change(selects[0], { target: { value: '1' } }));
  await act(async () => fireEvent.change(selects[1], { target: { value: 'Ikeja' } }));
  await act(async () => fireEvent.change(selects[2], { target: { value: 'apartment' } }));
  await act(async () => fireEvent.click(ui.getByRole('button', { name: 'Set test coordinates' })));
  await act(async () => fireEvent.click(ui.getByRole('button', { name: 'Capture test photo' })));
  await act(async () => fireEvent.click(ui.getByRole('button', { name: 'add_property.continue' })));
  await act(async () => fireEvent.click(ui.getByRole('button', { name: 'add_property.publish' })));

  expect(propertyService.createProperty).toHaveBeenCalledTimes(1);
  const [submittedForm] = propertyService.createProperty.mock.calls[0];
  expect(submittedForm.get('state_id')).toBe('1');
  expect(submittedForm.get('lga_name')).toBe('Ikeja');
  expect(submittedForm.get('image_capture_source')).toBe('live_camera');
  expect(submittedForm.get('image_capture_tokens')).toBe('["isolated-capture-ticket"]');
  expect(container.textContent).toContain('Property submitted for review');
  expect(container.textContent).toContain('Property ID: 45');
  expect(toast.success).toHaveBeenCalledWith('Property created and submitted for review.');
});
