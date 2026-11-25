import { useAuth } from '../../hooks/useAuth';
import FumigationCleaningAdmin from '../../components/fumigation/FumigationCleaningAdmin';

const StateFumigationAdminDashboard = () => {
  const { user } = useAuth();
  const isZonal = String(user?.user_type || '').trim().toLowerCase() === 'zonal_fumigation_admin';

  return (
    <FumigationCleaningAdmin
      title={isZonal ? 'Zonal Fumigation Dashboard' : 'State Fumigation Dashboard'}
      subtitle={
        isZonal
          ? 'Oversee fumigation and cleaning bookings across states in your assigned geopolitical zone.'
          : 'Oversee fumigation and cleaning bookings across LGAs in your assigned state.'
      }
      scopeLabel={
        isZonal
          ? (user?.assigned_zone ? `Zone scope: ${user.assigned_zone}` : 'Zone scope not configured')
          : (user?.assigned_state ? `State scope: ${user.assigned_state}` : 'State scope not configured')
      }
    />
  );
};

export default StateFumigationAdminDashboard;
