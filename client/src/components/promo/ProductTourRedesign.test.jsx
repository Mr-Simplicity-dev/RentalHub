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
];

let root;
let container;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

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
});

describe('ProductDemoCommercial redesign', () => {
  it('displays illustrative walkthrough notice, supports playback & scene navigation, and avoids unsupported claims', () => {
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

    // Navigate through all 6 scenes and audit visible copy against prohibited claims
    for (let i = 0; i < 6; i += 1) {
      const text = container.textContent || '';
      for (const pattern of PROHIBITED_CLAIMS) {
        expect(text).not.toMatch(pattern);
      }
      const nextBtn = view.getByRole('button', { name: /Next/i });
      act(() => fireEvent.click(nextBtn));
    }

    // Play / pause toggle
    const pauseOrPlay = view.getByRole('button', { name: /Pause walkthrough|Play walkthrough/i });
    const initialLabel = pauseOrPlay.getAttribute('aria-label');
    act(() => fireEvent.click(pauseOrPlay));
    expect(
      view.getByRole('button', { name: /Pause walkthrough|Play walkthrough/i }).getAttribute('aria-label')
    ).not.toBe(initialLabel);
  });
});

describe('CommercialVideoShowcase redesign', () => {
  it('preserves 9:16 and 16:9 format switching, MP4 download links, and accurate copy', () => {
    act(() => {
      root.render(<CommercialVideoShowcase isStandalone={true} />);
    });

    const view = within(container);
    const downloadLink = container.querySelector('a[download]');
    expect(downloadLink?.getAttribute('href')).toBe('/promo/amana-app-tour-commercial.mp4');

    const widescreenBtn = view.getByRole('button', { name: /16:9 Widescreen Commercial/i });
    act(() => fireEvent.click(widescreenBtn));

    const updatedDownload = container.querySelector('a[download]');
    expect(updatedDownload?.getAttribute('href')).toBe('/promo/amana-app-tour-landscape.mp4');

    const text = container.textContent || '';
    for (const pattern of PROHIBITED_CLAIMS) {
      expect(text).not.toMatch(pattern);
    }
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
