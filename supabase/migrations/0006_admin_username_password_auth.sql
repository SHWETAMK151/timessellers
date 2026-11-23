-- ==============================================================================
-- TIMESSELLERS LUXURY E-COMMERCE PLATFORM
-- Migration 0006: Dedicated Admin Username & Password Authentication
-- (Bcrypt password hashing in Supabase Auth + Admin Username lookup in profiles)
-- ==============================================================================

-- 1. Add unique admin_username column to public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_username TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_profiles_admin_username
  ON public.profiles (LOWER(admin_username));

-- 2. Secure RPC to resolve an Admin Username (or email) to their Supabase Auth email
-- Only returns an email if the account holds 'admin' or 'super_admin' in public.user_roles
-- and is not restricted. Never exposes password hashes or non-admin accounts.
CREATE OR REPLACE FUNCTION public.resolve_admin_login_email(p_identifier TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clean TEXT := LOWER(TRIM(COALESCE(p_identifier, '')));
  v_email TEXT;
BEGIN
  IF v_clean = '' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(u.email, p.email)
  INTO v_email
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  JOIN auth.users u ON u.id = p.id
  WHERE ur.role IN ('admin', 'super_admin')
    AND p.is_restricted = FALSE
    AND (
      LOWER(p.admin_username) = v_clean
      OR LOWER(COALESCE(p.email, '')) = v_clean
      OR LOWER(COALESCE(u.email, '')) = v_clean
    )
  LIMIT 1;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_admin_login_email(TEXT) TO anon, authenticated, service_role;

-- 3. Secure RPC for an authenticated Super Admin to update their Admin Username & Password
-- directly in Supabase (hashes password with pgcrypto bcrypt `crypt(p_new_password, gen_salt('bf'))`)
CREATE OR REPLACE FUNCTION public.admin_update_own_credentials(
  p_new_username TEXT,
  p_new_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_clean_username TEXT := LOWER(TRIM(COALESCE(p_new_username, '')));
  v_auth_email TEXT;
BEGIN
  IF NOT public.is_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required.';
  END IF;

  IF v_clean_username !~ '^[a-z0-9_.-]{3,32}$' THEN
    RAISE EXCEPTION 'Username must be 3-32 characters (letters, numbers, _, ., -).';
  END IF;

  v_auth_email := v_clean_username || '@admin.timessellers.com';

  UPDATE public.profiles
  SET admin_username = v_clean_username,
      email = COALESCE(email, v_auth_email),
      updated_at = NOW()
  WHERE id = v_admin_id;

  IF p_new_password IS NOT NULL AND char_length(p_new_password) > 0 THEN
    IF char_length(p_new_password) < 8 THEN
      RAISE EXCEPTION 'Admin password must be at least 8 characters.';
    END IF;

    UPDATE auth.users
    SET email = COALESCE(email, v_auth_email),
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
        updated_at = NOW()
    WHERE id = v_admin_id;
  ELSE
    UPDATE auth.users
    SET email = COALESCE(email, v_auth_email),
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        updated_at = NOW()
    WHERE id = v_admin_id;
  END IF;

  INSERT INTO public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    new_state
  )
  VALUES (
    v_admin_id,
    'update_admin_credentials',
    'profile',
    v_admin_id::TEXT,
    jsonb_build_object('admin_username', v_clean_username, 'password_updated', (p_new_password IS NOT NULL AND char_length(p_new_password) > 0))
  );

  RETURN jsonb_build_object(
    'admin_username', v_clean_username,
    'password_updated', (p_new_password IS NOT NULL AND char_length(p_new_password) > 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_own_credentials(TEXT, TEXT) TO authenticated, service_role;
