import React from 'react';
import { FeaturePage } from '../../components/common/FeaturePage';
import { useAuth } from '../../hooks/useAuth';
import SupportLanguageDesk from '../../components/admin/SupportLanguageDesk';
export default function SupportLanguages() {
  const { user } = useAuth();
  const allowed = ['super_admin', 'super_support_admin', 'state_support_admin', 'lga_support_admin'].includes(user?.user_type);
  if (!allowed) return <main className="mx-auto max-w-4xl p-5"><p role="alert">Support staff access required.</p></main>;
  return <FeaturePage title={user.user_type === 'super_admin' ? 'Support language and response review' : 'Support languages and availability'} eyebrow="Support operations" description={user.user_type === 'super_admin' ? 'Review staff language skills and follow up on delayed requests.' : 'Keep your language skills and availability current so customer requests reach the right person.'} backTo={user.user_type === 'super_admin' ? '/super-admin' : '/admin'}><SupportLanguageDesk user={user}/></FeaturePage>;
}
