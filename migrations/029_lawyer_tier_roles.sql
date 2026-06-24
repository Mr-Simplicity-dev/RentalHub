DO $$
DECLARE
  existing_check_name TEXT;
BEGIN
  SELECT c.conname
  INTO existing_check_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'users'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%user_type%';

  IF existing_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', existing_check_name);
  END IF;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_user_type_check
  CHECK (
    user_type IN (
      'tenant',
      'landlord',
      'lawyer',
      'state_lawyer',
      'super_lawyer',
      'admin',
      'state_admin',
      'state_financial_admin',
      'state_support_admin',
      'super_admin',
      'financial_admin',
      'super_financial_admin',
      'super_support_admin',
      'agent'
    )
  );
