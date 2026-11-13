import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import SupportLanguageDesk from '../../components/admin/SupportLanguageDesk';
export default function SupportLanguages() {
  const { user } = useAuth();
  const allowed = ['super_admin', 'super_support_admin', 'state_support_admin', 'lga_support_admin'].includes(user?.user_type);
  if (!allowed) return <main className="mx-auto max-w-4xl p-5"><p role="alert">Support staff access required.</p></main>;
  return <main className="mx-auto max-w-4xl p-5"><Link className="inline-block min-h-11 rounded border p-3" to={user.user_type === 'super_admin' ? '/super-admin' : '/admin'}>Back to my dashboard</Link><h1 className="mt-5 text-2xl font-bold">{user.user_type === 'super_admin' ? 'Support language and response review' : 'Support languages and availability'}</h1><SupportLanguageDesk user={user} /></main>;
}
