BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_type_check;
ALTER TABLE users ADD CONSTRAINT users_user_type_check CHECK (
  user_type IN (
    'admin',
    'tenant',
    'landlord',
    'agent',
    'marketing_agent',
    'lga_admin',
    'lga_support_admin',
    'lga_financial_admin',
    'lawyer',
    'fumigation_admin',
    'lga_fumigation_admin',
    'transportation_admin',
    'lga_transportation_admin',
    'state_admin',
    'state_support_admin',
    'state_financial_admin',
    'state_lawyer',
    'state_fumigation_admin',
    'state_transportation_admin',
    'zonal_admin',
    'zonal_financial_admin',
    'zonal_lawyer',
    'zonal_fumigation_admin',
    'zonal_transportation_admin',
    'super_admin',
    'super_support_admin',
    'super_financial_admin',
    'super_lawyer',
    'super_fumigation_admin',
    'super_transportation_admin',
    'financial_admin',
    'recruitment_admin'
  )
);
COMMIT;
