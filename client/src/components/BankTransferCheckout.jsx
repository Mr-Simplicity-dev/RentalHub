import React, { useEffect, useState } from 'react';
import { FaCamera, FaCheckCircle, FaCopy, FaTimes, FaUniversity } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../services/api';

export const canCaptureScreen = () =>
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

// The app itself grabs a frame of the confirmation screen the payer is looking
// at; nothing is picked from the gallery and no file input exists.
export const captureScreenFrame = async () => {
  if (!canCaptureScreen()) {
    throw new Error(
      'Screen capture is not available in this browser. Open rentalhub.com.ng in Chrome to capture your transfer confirmation.'
    );
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 2 },
    audio: false,
  });

  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const sourceWidth = video.videoWidth || 1280;
    const sourceHeight = video.videoHeight || 720;
    const scale = Math.min(1, 1280 / sourceWidth);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sourceWidth * scale);
    canvas.height = Math.round(sourceHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
};

export default function BankTransferCheckout({
  amount,
  reference,
  accounts: providedAccounts,
  endpoint,
  buildPayload,
  submitLabel = 'I have paid — submit capture',
  onSubmitted,
  onCancel,
}) {
  const [accounts, setAccounts] = useState(providedAccounts || []);
  const [accountsLoading, setAccountsLoading] = useState(!providedAccounts?.length);
  const [accountId, setAccountId] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerBank, setPayerBank] = useState('');
  const [proof, setProof] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    if (providedAccounts?.length) {
      setAccounts(providedAccounts);
      setAccountsLoading(false);
      return () => { active = false; };
    }

    setAccountsLoading(true);
    api.get('/bank-transfer/accounts', { skipAuth: true, skipAuthRefresh: true })
      .then((res) => {
        if (!active) return;
        setAccounts(res.data?.data || []);
      })
      .catch(() => {
        if (active) setAccounts([]);
      })
      .finally(() => {
        if (active) setAccountsLoading(false);
      });

    return () => { active = false; };
  }, [providedAccounts]);

  const selectedAccount = accounts.find((account) => String(account.id) === String(accountId));

  const copyValue = async (value, label) => {
    try {
      await navigator.clipboard.writeText(String(value));
      toast.success(`${label} copied`);
    } catch (error) {
      toast.info(String(value));
    }
  };

  const handleCapture = async () => {
    setCapturing(true);
    try {
      const frame = await captureScreenFrame();
      setProof(frame);
      toast.success('Screen captured');
    } catch (error) {
      toast.error(error.message || 'Could not capture the screen');
    } finally {
      setCapturing(false);
    }
  };

  const handleSubmit = async () => {
    if (!accountId) return toast.error('Choose the account you paid into');
    if (!payerName.trim()) return toast.error('Enter the name on the account you paid from');
    if (!proof) return toast.error('Capture the transfer confirmation screen first');

    setSubmitting(true);
    try {
      const basePayload = {
        bank_account_id: Number(accountId),
        payer_name: payerName.trim(),
        payer_bank: payerBank.trim() || null,
        proof_image: proof,
        reference,
      };
      const payload = buildPayload ? buildPayload(basePayload) : basePayload;
      const res = await api.post(endpoint, payload);
      toast.success(res.data?.message || 'Transfer submitted for approval');
      if (onSubmitted) onSubmitted(res.data?.data || {});
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not submit the transfer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-teal-700">Amount to transfer</p>
        <p className="mt-1 text-2xl font-bold text-teal-900">₦{Number(amount || 0).toLocaleString()}</p>
        {reference ? (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-teal-800">
            <span>Use reference</span>
            <span className="font-mono font-semibold">{reference}</span>
            <button type="button" onClick={() => copyValue(reference, 'Reference')} className="text-teal-700 hover:text-teal-900">
              <FaCopy />
            </button>
          </p>
        ) : null}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-800">Choose the account you are paying into</p>
        {accountsLoading ? (
          <p className="text-sm text-gray-500">Loading accounts…</p>
        ) : accounts.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            No receiving account is configured yet. Please contact support.
          </p>
        ) : (
          <div className="space-y-2">
            {accounts.map((account) => {
              const active = String(account.id) === String(accountId);
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setAccountId(String(account.id))}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    active ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-200' : 'border-gray-200 hover:border-teal-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <FaUniversity className={`mt-1 ${active ? 'text-teal-600' : 'text-gray-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">{account.bank_name}</p>
                      <p className="text-sm text-gray-700">{account.account_name}</p>
                      <p className="flex items-center gap-2 font-mono text-sm font-semibold text-gray-900">
                        {account.account_number}
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            copyValue(account.account_number, 'Account number');
                          }}
                          onKeyDown={() => {}}
                          className="text-gray-400 hover:text-gray-700"
                        >
                          <FaCopy />
                        </span>
                      </p>
                      {account.instructions ? (
                        <p className="mt-1 text-xs text-gray-500">{account.instructions}</p>
                      ) : null}
                    </div>
                    {active ? <FaCheckCircle className="mt-1 text-teal-600" /> : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Name on your account</label>
          <input
            type="text"
            value={payerName}
            onChange={(event) => setPayerName(event.target.value)}
            className="input w-full"
            placeholder="e.g. Haruna Musa"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Your bank (optional)</label>
          <input
            type="text"
            value={payerBank}
            onChange={(event) => setPayerBank(event.target.value)}
            className="input w-full"
            placeholder="e.g. Moniepoint"
          />
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-gray-300 px-4 py-4">
        <p className="text-sm font-semibold text-gray-800">Proof of payment</p>
        <p className="mt-1 text-xs text-gray-500">
          Open your bank app's successful-transfer screen, then tap capture. The app records the screen
          itself — there is nothing to upload.
        </p>

        {proof ? (
          <div className="mt-3 flex items-center gap-3">
            <img src={proof} alt="Transfer confirmation capture" className="h-20 w-32 rounded-lg border object-cover" />
            <button type="button" onClick={handleCapture} className="text-sm font-semibold text-teal-700 hover:text-teal-900">
              Capture again
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleCapture}
            disabled={capturing || !canCaptureScreen()}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            <FaCamera /> {capturing ? 'Capturing…' : 'Capture transfer screen'}
          </button>
        )}

        {!canCaptureScreen() ? (
          <p className="mt-2 text-xs text-amber-700">
            Screen capture is unavailable in this browser. Use Chrome on Android or a desktop browser.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {onCancel ? (
          <button type="button" onClick={onCancel} className="btn w-full sm:flex-1">
            <span className="inline-flex items-center gap-2"><FaTimes /> Cancel</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !proof || !accountId || !payerName.trim()}
          className="btn btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1"
        >
          {submitting ? 'Submitting…' : submitLabel}
        </button>
      </div>

      {selectedAccount ? (
        <p className="text-center text-xs text-gray-500">
          A super admin confirms the credit before your account or wallet is updated.
        </p>
      ) : null}
    </div>
  );
}
