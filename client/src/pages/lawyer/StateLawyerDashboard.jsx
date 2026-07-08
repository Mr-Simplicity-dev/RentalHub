import React from 'react';
import { useTranslation } from 'react-i18next';
import { LawyerDashboardView } from './LawyerDashboard';

const StateLawyerDashboard = () => {
  const { t } = useTranslation();
  return (
    <LawyerDashboardView
      dashboardTitle={t('state_lawyer_dashboard.dashboard_title')}
      profileLabel={t('state_lawyer_dashboard.profile_label')}
      nameFallback={t('state_lawyer_dashboard.name_fallback')}
      dashboardSubtitle={t('state_lawyer_dashboard.dashboard_subtitle')}
      rolePillLabel={t('state_lawyer_dashboard.role_pill_label')}
      showStateLawyerPanel
    />
  );
};

export default StateLawyerDashboard;
