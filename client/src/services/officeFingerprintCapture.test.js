import { describe, it, expect } from 'vitest';
import { normalizePngSample } from './officeFingerprintCapture';
describe('HID PNG normalization', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUg==';
  it('accepts base64 and HID nested base64 samples', () => {
    expect(normalizePngSample(png)).toBe(png);
    expect(normalizePngSample(btoa(png))).toBe(png);
    expect(normalizePngSample(btoa('data:image/png;base64,' + png))).toBe(png);
  });
  it('rejects missing, non-image and oversized samples', () => {
    for (const value of [null, {}, '', 'a'.repeat(550001), btoa('not a fingerprint')]) expect(() => normalizePngSample(value)).toThrow();
  });
});
