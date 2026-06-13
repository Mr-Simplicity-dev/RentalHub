import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { FaLock, FaCheckCircle, FaTimesCircle, FaSpinner } from 'react-icons/fa';

const AdminLedger = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verify = async () => {
      setLoading(true);
      try {
        const res = await api.get('/admin/ledger/verify');
        setStatus(res.data);
      } catch (err) {
        setStatus({
          success: false,
          message: err.response?.data?.message || 'Failed to verify ledger',
        });
      } finally {
        setLoading(false);
      }
    };
    verify();
  }, []);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Ledger Integrity</h1>
        <p className="mt-1 text-gray-600">
          Verifies the SHA-256 hash chain of all audit log entries
        </p>
      </div>

      <div className="mt-8 text-center">
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8">
            <FaSpinner className="mx-auto animate-spin text-4xl text-primary-600" />
            <p className="mt-4 text-gray-600">Verifying ledger integrity...</p>
          </div>
        ) : status?.success ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-8">
            <FaCheckCircle className="mx-auto text-5xl text-green-600" />
            <p className="mt-4 text-lg font-semibold text-green-800">Ledger Integrity Intact</p>
            <p className="mt-2 text-sm text-green-700">
              All audit log entries are verified. The hash chain is unbroken.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-red-200 bg-red-50 p-8">
            <FaTimesCircle className="mx-auto text-5xl text-red-600" />
            <p className="mt-4 text-lg font-semibold text-red-800">Integrity Compromised</p>
            {status?.compromisedAt ? (
              <p className="mt-2 text-sm text-red-700">
                Audit log entry #{status.compromisedAt} has been tampered with or corrupted.
              </p>
            ) : (
              <p className="mt-2 text-sm text-red-700">
                {status?.message || 'Verification failed'}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <FaLock className="text-gray-400" />
          <span className="font-medium">How it works</span>
        </div>
        <p className="mt-2">
          Each audit log entry contains a SHA-256 hash of its contents combined with the
          previous entry&apos;s hash, forming a chain. If any entry is modified, the
          chain breaks and the ledger is marked as compromised.
        </p>
      </div>
    </div>
  );
};

export default AdminLedger;
