import React, { useState } from 'react';
import LivePassportCaptureModal from '../common/LivePassportCaptureModal';

export default function AssistedPhotoCapture({ customer, onClose, onSaved }) {
  const [consent, setConsent] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const base = '/assisted-registration/staff/' + encodeURIComponent(customer.reference) + '/photo';
  if (capturing) return <LivePassportCaptureModal
    title={'Customer photo: ' + customer.full_name} language="en"
    sessionEndpoint={base + '/session'} uploadEndpoint={base} consentConfirmed={consent}
    onClose={onClose} onCapture={onSaved} />;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="customer-photo-title" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
      <h2 id="customer-photo-title" className="text-xl font-bold">Capture customer photo</h2>
      <p className="mt-3 font-semibold">{customer.full_name}</p>
      <p className="break-all text-xs text-slate-500">{customer.reference}</p>
      <p className="mt-3 text-sm text-slate-600">Point the camera at this customer and guide them through the face movements. Preview the photo before uploading. The photo is saved to their account for identity review.</p>
      <label className="my-4 flex items-start gap-3 text-sm"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />The customer agrees to having their photo captured and stored for account identity verification.</label>
      <div className="flex flex-wrap gap-3"><button disabled={!consent} onClick={() => setCapturing(true)} className="rounded-xl bg-blue-900 px-4 py-3 text-white disabled:opacity-50">Continue to camera</button><button onClick={onClose} className="rounded-xl border px-4 py-3">Cancel</button></div>
    </section>
  </div>;
}
