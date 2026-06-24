import { useAuth } from '../../hooks/useAuth';
import FumigationCleaningAdmin from '../../components/fumigation/FumigationCleaningAdmin';

const LgaFumigationAdminDashboard = () => {
  const { user } = useAuth();
  const scope = [user?.assigned_state, user?.assigned_city]
    .filter(Boolean)
    .join(', ');

  return (
    <FumigationCleaningAdmin
      title="LGA Fumigation Dashboard"
      subtitle="Manage fumigation and cleaning bookings inside your assigned local government."
      scopeLabel={scope ? `Scope: ${scope}` : 'LGA scope not configured'}
    />
  );
};

export default LgaFumigationAdminDashboard;
