import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, within } from '@testing-library/dom';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import ProductDemoCommercial from './ProductDemoCommercial';
import CommercialVideoShowcase from './CommercialVideoShowcase';
import WelcomeModal from '../tour/WelcomeModal';
import TourOverlay from '../tour/TourOverlay';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key, fallbackOrOpts, opts) => {
      if (typeof fallbackOrOpts === 'string') return fallbackOrOpts;
      if (fallbackOrOpts && typeof fallbackOrOpts === 'object' && fallbackOrOpts.defaultValue) {
        return fallbackOrOpts.defaultValue;
      }
      if (opts && typeof opts === 'object' && opts.defaultValue) {
        return opts.defaultValue;
      }
      return _key;
    },
  }),
}));

const PROHIBITED_CLAIMS = [
  /100%\s*(physically\s*)?(verified|inspected)/i,
  /zero\s*(fake\s*)?agent/i,
  /zero\s*(fee\s*)?extortion/i,
  /₦\s*0\.00/i,
  /legally\s*binding/i,
  /only\s*after\s*keys/i,
  /100%\s*escrow\s*guarantee/i,
  /paystack/i,
  /\blegal\b|\blegally\b|\blawyer\b|\battorney\b|\bsolicitor\b|\bbarrister\b/i,
];

let root;
let container;
let originalFetch;
let originalCreateObjectURL;
let originalRevokeObjectURL;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  originalFetch = globalThis.fetch;
  originalCreateObjectURL = URL.createObjectURL;
  originalRevokeObjectURL = URL.revokeObjectURL;

  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  window.HTMLMediaElement.prototype.load = vi.fn();
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe('ProductDemoCommercial redesign', () => {
  it('displays illustrative walkthrough notice, supports playback & scene navigation, and avoids unsupported or restricted claims', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <ProductDemoCommercial />
        </MemoryRouter>
      );
    });

    const view = within(container);
    expect(view.getByText(/Illustrative preview · not a live transaction/i)).toBeTruthy();
    expect(view.getByText(/Structured Search Across Nigeria/i)).toBeTruthy();

    for (let i = 0; i < 6; i += 1) {
      const text = container.textContent || '';
      for (const pattern of PROHIBITED_CLAIMS) {
        expect(text).not.toMatch(pattern);
      }
      const nextBtn = view.getByRole('button', { name: /Next/i });
      act(() => fireEvent.click(nextBtn));
    }

    const pauseOrPlay = view.getByRole('button', { name: /Pause walkthrough|Play walkthrough/i });
    const initialLabel = pauseOrPlay.getAttribute('aria-label');
    act(() => fireEvent.click(pauseOrPlay));
    expect(
      view.getByRole('button', { name: /Pause walkthrough|Play walkthrough/i }).getAttribute('aria-label')
    ).not.toBe(initialLabel);
  });
});

describe('CommercialVideoShowcase redesign', () => {
  it('preserves 9:16 and 16:9 format switching, unveils additional editions under More Commercials, and avoids restricted copy', () => {
    act(() => {
      root.render(<CommercialVideoShowcase isStandalone={true} />);
    });

    const view = within(container);
    const downloadLink = container.querySelector('a[download]');
    expect(downloadLink?.getAttribute('href')).toBe('/promo/amana-app-tour-commercial.mp4');

    const widescreenBtn = view.getByRole('button', { name: /16:9 Widescreen Commercial/i });
    act(() => fireEvent.click(widescreenBtn));

    expect(container.querySelector('a[download]')?.getAttribute('href')).toBe(
      '/promo/amana-app-tour-landscape.mp4'
    );

    expect(view.queryByRole('button', { name: /Tenant Edition/i })).toBeNull();

    const moreBtn = view.getByRole('button', { name: /More Commercials/i });
    act(() => fireEvent.click(moreBtn));

    const editionsToCheck = [
      {
        btnPattern: /Tenant Edition/i,
        landscapeHref: '/promo/amana-tenant-commercial-16x9.mp4',
        verticalHref: '/promo/amana-tenant-commercial-9x16.mp4',
      },
      {
        btnPattern: /Landlord & Agent Edition/i,
        landscapeHref: '/promo/amana-landlord-commercial-16x9.mp4',
        verticalHref: '/promo/amana-landlord-commercial-9x16.mp4',
      },
      {
        btnPattern: /Property Protection Edition/i,
        landscapeHref: '/promo/amana-protection-commercial-16x9.mp4',
        verticalHref: '/promo/amana-protection-commercial-9x16.mp4',
      },
    ];

    for (const item of editionsToCheck) {
      act(() => fireEvent.click(view.getByRole('button', { name: item.btnPattern })));
      expect(container.querySelector('a[download]')?.getAttribute('href')).toBe(item.landscapeHref);

      const text = container.textContent || '';
      for (const pattern of PROHIBITED_CLAIMS) {
        expect(text).not.toMatch(pattern);
      }
    }

    act(() => fireEvent.click(view.getByRole('button', { name: /9:16 Vertical Commercial/i })));
    expect(container.querySelector('a[download]')?.getAttribute('href')).toBe(
      '/promo/amana-protection-commercial-9x16.mp4'
    );
  });

  it('preloads the complete MP4 into a memory Blob URL when Play is clicked before starting playback', async () => {
    const fakeBlob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: 'video/mp4' });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => '4' },
      blob: () => Promise.resolve(fakeBlob),
    });
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:https://rentalhub.test/buffered-clip');
    const mockRevokeObjectURL = vi.fn();

    globalThis.fetch = mockFetch;
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;

    act(() => {
      root.render(<CommercialVideoShowcase isStandalone={true} />);
    });

    const view = within(container);
    const playBtn = view.getByRole('button', { name: /Play video/i });

    await act(async () => {
      fireEvent.click(playBtn);
      await new Promise((resolve) => setTimeout(resolve, 220));
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/promo/amana-app-tour-commercial.mp4',
      expect.objectContaining({ cache: 'force-cache' })
    );
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    const videoEl = container.querySelector('video');
    expect(videoEl?.getAttribute('src')).toBe('blob:https://rentalhub.test/buffered-clip');
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });
});

describe('Dashboard onboarding tour UI', () => {
  it('WelcomeModal renders accessible start/resume controls and closes on Escape', () => {
    const onStart = vi.fn();
    const onSkip = vi.fn();

    act(() => {
      root.render(
        <WelcomeModal isOpen={true} onStartTour={onStart} onSkip={onSkip} canResume={true} />
      );
    });

    const dialog = within(document.body).getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /Resume guided tour/i })).toBeTruthy();

    act(() => fireEvent.click(within(dialog).getByRole('button', { name: /Resume guided tour/i })));
    expect(onStart).toHaveBeenCalledTimes(1);

    act(() => fireEvent.keyDown(document, { key: 'Escape' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('TourOverlay highlights target cleanly, supports keyboard navigation, and handles missing targets', () => {
    const targetEl = document.createElement('button');
    targetEl.className = 'tour-wallet';
    targetEl.textContent = 'Wallet';
    targetEl.getBoundingClientRect = () => ({
      top: 100,
      left: 100,
      right: 260,
      bottom: 148,
      width: 160,
      height: 48,
    });
    targetEl.scrollIntoView = vi.fn();
    document.body.appendChild(targetEl);

    const onNext = vi.fn();
    const onPrevious = vi.fn();
    const onSkip = vi.fn();

    const steps = [
      { id: 'step_1', target: '.tour-wallet', title: 'Wallet & Payments', description: 'Review wallet balances and payment history.' },
      { id: 'step_2', target: '.nonexistent-control', title: 'Secondary Control', description: 'Secondary panel details.' },
    ];

    try {
      act(() => {
        root.render(
          <TourOverlay
            isOpen={true}
            steps={steps}
            currentStep={0}
            onNext={onNext}
            onPrevious={onPrevious}
            onSkip={onSkip}
          />
        );
      });

      const overlay = within(document.body).getByTestId('rentalhub-tour-overlay');
      expect(within(overlay).getByText('Wallet & Payments')).toBeTruthy();

      act(() => fireEvent.keyDown(document, { key: 'ArrowRight' }));
      expect(onNext).toHaveBeenCalledTimes(1);

      act(() => fireEvent.keyDown(document, { key: 'Escape' }));
      expect(onSkip).toHaveBeenCalledTimes(1);
    } finally {
      targetEl.remove();
    }
  });
});
