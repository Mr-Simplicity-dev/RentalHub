import { useAuth } from '../../hooks/useAuth';
import FumigationCleaningAdmin from '../../components/fumigation/FumigationCleaningAdmin';

const StateFumigationAdminDashboard = () => {
  const { user } = useAuth();

  return (
    <FumigationCleaningAdmin
      title="State Fumigation Dashboard"
      subtitle="Oversee fumigation and cleaning bookings across LGAs in your assigned state."
      scopeLabel={user?.assigned_state ? `State scope: ${user.assigned_state}` : 'State scope not configured'}
    />
  );
};

export default StateFumigationAdminDashboard;
