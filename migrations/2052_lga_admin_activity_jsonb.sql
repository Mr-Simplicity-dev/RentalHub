BEGIN;
CREATE OR REPLACE FUNCTION public.log_lga_admin_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  sensitive_keys CONSTANT text[] := ARRAY[
    'password_hash', 'password', 'totp_secret', 'totp_recovery_codes',
    'nin', 'nin_hash', 'nin_encrypted', 'international_passport_number',
    'passport_photo_hash'
  ];
BEGIN
  IF NEW.user_type = 'lga_admin' AND TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO public.lga_admin_activities (
      lga_admin_id, activity_type, activity_details, ip_address, user_agent
    ) VALUES (
      NEW.id,
      CASE WHEN TG_OP = 'INSERT' THEN 'account_created' ELSE 'account_updated' END,
      jsonb_build_object(
        'old_data', CASE WHEN TG_OP = 'UPDATE'
          THEN to_jsonb(OLD) - sensitive_keys ELSE '{}'::jsonb END,
        'new_data', to_jsonb(NEW) - sensitive_keys
      ),
      NULL,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$function$;
COMMIT;
