BEGIN;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_user_type_check;

ALTER TABLE users
  ADD CONSTRAINT users_user_type_check
  CHECK (user_type IN (
    'tenant', 'landlord', 'agent', 'marketing_agent',
    'super_admin', 'admin', 'lga_admin', 'state_admin', 'zonal_admin',
    'lga_support_admin', 'state_support_admin', 'super_support_admin',
    'lga_financial_admin', 'financial_admin', 'state_financial_admin', 'super_financial_admin',
    'recruitment_admin',
    'lawyer', 'state_lawyer', 'super_lawyer',
    'fumigation_admin', 'lga_fumigation_admin', 'state_fumigation_admin', 'super_fumigation_admin',
    'transportation_admin', 'lga_transportation_admin', 'state_transportation_admin', 'super_transportation_admin'
  ));

COMMIT;
