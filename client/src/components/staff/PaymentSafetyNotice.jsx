import React from 'react';
import { FaExclamationTriangle } from 'react-icons/fa';

export const PAYMENT_SAFETY_PARAGRAPHS = [
  'Verifying an Amana staff member does not automatically authorise that person to collect rent, deposits, service fees or other payments on behalf of Amana.',
  "Always make payments through Amana's officially approved payment channels within the RentalHub platform.",
  "Never transfer money to a staff member's personal bank account or wallet based solely on their staff identity or verbal instructions.",
  'If anyone requests payment outside the official platform, stop and contact Amana through its official support channels.',
];

export default function PaymentSafetyNotice({ compact = false, className = '' }) {
  return (
    <section
      role="alert"
      aria-label="Important Payment Safety Notice"
      className={`rounded-xl border border-amber-300 bg-amber-50 text-amber-950 ${
        compact ? 'p-4' : 'p-5 sm:p-6'
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <FaExclamationTriangle
          className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-sm font-bold tracking-wide text-amber-950">
            IMPORTANT PAYMENT SAFETY NOTICE
          </h3>
          <div className="space-y-1.5 text-sm leading-relaxed text-amber-900">
            {PAYMENT_SAFETY_PARAGRAPHS.map((paragraph, idx) => (
              <p key={idx}>{paragraph}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
