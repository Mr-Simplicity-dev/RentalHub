import React from 'react';
import BackToDashboard from '../components/common/BackToDashboard';
import MyStaffIdentityPanel from '../components/staff/MyStaffIdentityPanel';

export default function MyStaffIdentity() {
  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-6">
        <BackToDashboard />
        <MyStaffIdentityPanel />
      </div>
    </div>
  );
}
