import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test } from 'vitest';
import TranslationResult from './TranslationResult';

test('shows original and machine translation separately', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <TranslationResult
          originalText="The rent is paid."
          translatedText="An karɓi kuɗin hayarka."
          label="Machine translation"
        />
      );
    });
    expect(container.textContent).toContain('The rent is paid.');
    expect(container.textContent).toContain('An karɓi kuɗin hayarka.');
    expect(container.textContent).toContain('Machine translation');
    expect(container.textContent).toContain('Original');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
