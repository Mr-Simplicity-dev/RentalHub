import React from 'react';
import { LawyerDashboardView } from './LawyerDashboard';

const StateLawyerDashboard = () => (
  <LawyerDashboardView
    dashboardTitle="State Lawyer Dashboard"
    profileLabel="State Lawyer Profile"
    nameFallback="State Lawyer"
    dashboardSubtitle="Manage state-level disputes, verify evidence within your jurisdiction, and keep case notes aligned with your assigned state workflow."
    rolePillLabel="State Lawyer"
    showStateLawyerPanel
  />
);

export default StateLawyerDashboard;
