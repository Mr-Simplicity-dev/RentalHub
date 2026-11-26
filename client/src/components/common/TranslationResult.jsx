import React from 'react';

const TranslationResult = ({ originalText, translatedText, label = 'Machine translation' }) => (
  <div className="mt-2 space-y-2" data-testid="translation-result">
    <div>
      <div className="text-[11px] uppercase tracking-wide opacity-70">Original</div>
      <div className="text-sm whitespace-pre-wrap">{originalText}</div>
    </div>
    <div className="border-t border-current/20 pt-2">
      <div className="text-[11px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-sm whitespace-pre-wrap">{translatedText}</div>
    </div>
  </div>
);

export default TranslationResult;
