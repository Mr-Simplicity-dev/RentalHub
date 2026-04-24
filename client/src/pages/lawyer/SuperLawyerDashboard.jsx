import React from 'react';
import { LawyerDashboardView } from './LawyerDashboard';

const SuperLawyerDashboard = () => (
  <LawyerDashboardView
    dashboardTitle="Super Lawyer Dashboard"
    profileLabel="Super Lawyer Profile"
    nameFallback="Super Lawyer"
    dashboardSubtitle="Lead cross-state legal review, evidence verification, and escalated dispute oversight from the super lawyer command layer."
    rolePillLabel="Super Lawyer"
    showSuperLawyerPanel
  />
);

export default SuperLawyerDashboard;
