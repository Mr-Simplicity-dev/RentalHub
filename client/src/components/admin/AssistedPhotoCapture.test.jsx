import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, within } from '@testing-library/dom';
import { vi } from 'vitest';
import AssistedPhotoCapture from './AssistedPhotoCapture';
const captured = vi.hoisted(() => ({ props: null }));
vi.mock('../common/LivePassportCaptureModal', () => ({ default: props => {
  captured.props = props;
  return <button onClick={() => { props.onCapture(); props.onClose(); }}>Upload test capture</button>;
} }));
test('customer consent gates camera and routes capture to the selected customer', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onSaved = vi.fn(), onClose = vi.fn();
  try {
    await act(async () => root.render(<AssistedPhotoCapture customer={{ full_name: 'Test customer', reference: 'ARH/test' }} onSaved={onSaved} onClose={onClose} />));
    const ui = within(container);
    expect(ui.getByText('Test customer')).toBeTruthy();
    expect(ui.getByRole('button', { name: 'Continue to camera' }).disabled).toBe(true);
    await act(async () => fireEvent.click(ui.getByRole('checkbox')));
    await act(async () => fireEvent.click(ui.getByRole('button', { name: 'Continue to camera' })));
    expect(captured.props.sessionEndpoint).toBe('/assisted-registration/staff/ARH%2Ftest/photo/session');
    expect(captured.props.uploadEndpoint).toBe('/assisted-registration/staff/ARH%2Ftest/photo');
    expect(captured.props.consentConfirmed).toBe(true);
    await act(async () => fireEvent.click(ui.getByText('Upload test capture')));
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
