import React from 'react';
import { useTranslation } from 'react-i18next';
import { LawyerDashboardView } from './LawyerDashboard';

const ZonalLawyerDashboard = () => {
  const { t } = useTranslation();
  return (
    <LawyerDashboardView
      dashboardTitle={t('zonal_lawyer_dashboard.dashboard_title', 'Zonal Legal Workspace')}
      profileLabel={t('zonal_lawyer_dashboard.profile_label', 'Zonal Lawyer')}
      nameFallback={t('zonal_lawyer_dashboard.name_fallback', 'Zonal Lawyer')}
      dashboardSubtitle={t('zonal_lawyer_dashboard.dashboard_subtitle', 'Manage legal cases across your assigned zone.')}
      rolePillLabel={t('zonal_lawyer_dashboard.role_pill_label', 'Zonal Lawyer')}
      showStateLawyerPanel
    />
  );
};

export default ZonalLawyerDashboard;
