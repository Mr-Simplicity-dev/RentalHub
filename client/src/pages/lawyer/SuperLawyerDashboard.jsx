import React from 'react';
import { useTranslation } from 'react-i18next';
import { LawyerDashboardView } from './LawyerDashboard';

const SuperLawyerDashboard = () => {
  const { t } = useTranslation();
  return (
    <LawyerDashboardView
      dashboardTitle={t('super_lawyer_dashboard.dashboard_title')}
      profileLabel={t('super_lawyer_dashboard.profile_label')}
      nameFallback={t('super_lawyer_dashboard.name_fallback')}
      dashboardSubtitle={t('super_lawyer_dashboard.dashboard_subtitle')}
      rolePillLabel={t('super_lawyer_dashboard.role_pill_label')}
      showSuperLawyerPanel
    />
  );
};

export default SuperLawyerDashboard;
