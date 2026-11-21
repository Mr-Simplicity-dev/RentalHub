import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PropertyCard from './PropertyCard';
import { getParkingSummary } from '../../utils/propertyParking';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key, fallbackOrOpts, opts) => {
      if (typeof fallbackOrOpts === 'string') {
        if (opts && typeof opts === 'object') {
          return Object.entries(opts).reduce(
            (acc, [k, v]) => acc.replace(`{{${k}}}`, String(v)),
            fallbackOrOpts
          );
        }
        return fallbackOrOpts;
      }
      return _key;
    },
  }),
}));

vi.mock('./PropertyShareButton', () => ({
  default: () => <button type="button">Share</button>,
}));

let container = null;
let root = null;

afterEach(() => {
  if (root) {
    act(() => {
      root.unmount();
    });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

describe('getParkingSummary', () => {
  it('reads explicit parking_spaces and structured feature fallbacks', () => {
    expect(getParkingSummary({ parking_spaces: 3 })).toEqual({
      count: 3,
      hasParking: true,
      label: '3',
    });
    expect(
      getParkingSummary({
        structured_features: { parking: { available: true, details: { capacity: 2 } } },
      })
    ).toEqual({ count: 2, hasParking: true, label: '2' });
    expect(getParkingSummary({ amenities: ['Parking Space'] })).toEqual({
      count: 1,
      hasParking: true,
      label: '1',
    });
    expect(getParkingSummary({})).toEqual({
      count: 0,
      hasParking: false,
      label: '0',
    });
  });
});

describe('PropertyCard', () => {
  it('renders beds, baths, parking spaces, rent amount, and working save button', () => {
    const onSave = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <MemoryRouter>
          <PropertyCard
            property={{
              id: 42,
              title: '3-Bedroom Duplex in Lekki',
              area: 'Lekki Phase 1',
              city: 'Lagos',
              state_name: 'Lagos',
              bedrooms: 3,
              bathrooms: 4,
              parking_spaces: 2,
              rent_amount: 5500000,
              payment_frequency: 'yearly',
              avg_rating: '4.8',
            }}
            isSaved={false}
            onSave={onSave}
            showSaveButton={true}
          />
        </MemoryRouter>
      );
    });

    const text = container.textContent || '';
    expect(text).toContain('3 Bed');
    expect(text).toContain('4 Bath');
    expect(text).toContain('2 Park');
    expect(text).toContain('4.8');
    expect(text).toMatch(/5,500,000/);

    const saveBtn = container.querySelector('button[aria-label*="Save property"]');
    expect(saveBtn).toBeTruthy();
    act(() => {
      saveBtn.click();
    });
    expect(onSave).toHaveBeenCalledWith(42);
  });
});
