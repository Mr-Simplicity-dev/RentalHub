import React from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import { Link } from 'react-router-dom';

const BackToSuperAdminOverview = () => (
  <Link
    to="/super-admin?tab=overview"
    className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-100"
  >
    <FaArrowLeft aria-hidden="true" />
    Back to Super Admin Overview
  </Link>
);

export default BackToSuperAdminOverview;
