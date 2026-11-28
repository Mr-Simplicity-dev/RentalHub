import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { fireEvent, within } from '@testing-library/dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import MapPicker from './MapPicker';
import { useLoadScript } from '@react-google-maps/api';

vi.mock('@react-google-maps/api', () => ({
  GoogleMap: ({ children }) => <div>{children}</div>,
  Marker: () => null,
  useLoadScript: vi.fn(),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key, fallback) => fallback }),
}));

let root;
let container;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  useLoadScript.mockReturnValue({ isLoaded: false, loadError: new Error('Maps unavailable') });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test('manual coordinates remain usable when the map cannot load', async () => {
  const onChange = vi.fn();
  await act(async () => {
    root.render(<MapPicker value={{ lat: 6, lng: 8 }} onChange={onChange} />);
  });

  const ui = within(container);
  expect(container.textContent).toContain('Enter coordinates below or use current location.');
  await act(async () => {
    fireEvent.change(ui.getByLabelText('Latitude'), { target: { value: '6.5' } });
  });
  expect(onChange).toHaveBeenCalledWith({ lat: 6.5, lng: 8 });
});
