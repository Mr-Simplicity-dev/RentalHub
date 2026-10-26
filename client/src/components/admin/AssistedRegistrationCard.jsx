import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
export default function AssistedRegistrationCard() {
  const { user } = useAuth();
  if (!['super_admin', 'super_support_admin', 'zonal_admin', 'state_support_admin', 'lga_support_admin'].includes(user?.user_type)) return null;
  return <section className="my-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-left text-slate-900"><h2 className="text-lg font-semibold">Assisted registration and receipts</h2><p className="mt-2 text-sm text-slate-600">Help a customer register, record cash received, and download receipts.</p><Link to="/admin/assisted-registration" className="mt-4 inline-flex rounded-xl bg-blue-900 px-4 py-3 font-semibold text-white">Open assisted registration →</Link></section>;
}
