-- ==============================================================================
-- TIMESSELLERS LUXURY E-COMMERCE PLATFORM
-- Migration 0002: Row Level Security (RLS), Role Guards & Auth Triggers
-- ==============================================================================

-- 1. Automatic Profile & Customer Role Provisioning on Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_phone TEXT;
BEGIN
  normalized_phone := COALESCE(
    NULLIF(TRIM(NEW.phone), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''),
    'user-' || NEW.id::TEXT
  );

  INSERT INTO public.profiles (id, full_name, phone, email)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), 'Valued Client'),
    normalized_phone,
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
    SET phone = EXCLUDED.phone,
        email = COALESCE(EXCLUDED.email, public.profiles.email);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.carts (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.wishlists (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Security Helper Functions
CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = COALESCE(check_user_id, auth.uid())
      AND ur.role IN ('admin', 'super_admin')
      AND p.is_restricted = FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_user(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = COALESCE(check_user_id, auth.uid())
      AND p.is_restricted = FALSE
  );
$$;

-- Prevent non-admin users from altering is_restricted or restriction_reason on their own profile
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    NEW.is_restricted := OLD.is_restricted;
    NEW.restriction_reason := OLD.restriction_reason;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- 3. Enable RLS on ALL 24 Tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_specifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- RLS POLICIES BY TABLE
-- ==============================================================================

-- 1. profiles: Customers read/update only their own profile; Admins read/update all
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own_or_admin"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- 2. user_roles: Users read own roles; ONLY admins can view all; Customers can NEVER assign roles
CREATE POLICY "user_roles_select_own_or_admin"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "user_roles_admin_manage"
  ON public.user_roles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. addresses: Customers manage only their own addresses; Admins can view for order support
CREATE POLICY "addresses_customer_own"
  ON public.addresses FOR ALL
  USING (auth.uid() = user_id AND public.is_active_user())
  WITH CHECK (auth.uid() = user_id AND public.is_active_user());

CREATE POLICY "addresses_admin_select"
  ON public.addresses FOR SELECT
  USING (public.is_admin());

-- 4. categories: Public can read active categories; Admins have full CRUD
CREATE POLICY "categories_public_read"
  ON public.categories FOR SELECT
  USING (is_active = TRUE OR public.is_admin());

CREATE POLICY "categories_admin_all"
  ON public.categories FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. products: Public can read active products; Admins have full CRUD
CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  USING (status = 'active' OR public.is_admin());

CREATE POLICY "products_admin_all"
  ON public.products FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 6. product_images: Public read; Admin write
CREATE POLICY "product_images_public_read"
  ON public.product_images FOR SELECT
  USING (TRUE);

CREATE POLICY "product_images_admin_all"
  ON public.product_images FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 7. product_variants: Public read; Admin write
CREATE POLICY "product_variants_public_read"
  ON public.product_variants FOR SELECT
  USING (is_active = TRUE OR public.is_admin());

CREATE POLICY "product_variants_admin_all"
  ON public.product_variants FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 8. product_specifications: Public read; Admin write
CREATE POLICY "product_specifications_public_read"
  ON public.product_specifications FOR SELECT
  USING (TRUE);

CREATE POLICY "product_specifications_admin_all"
  ON public.product_specifications FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 9. inventory: Public can read stock availability; Customers can NEVER modify inventory directly
CREATE POLICY "inventory_public_read"
  ON public.inventory FOR SELECT
  USING (TRUE);

CREATE POLICY "inventory_admin_all"
  ON public.inventory FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 10. inventory_transactions: Admin read/insert only
CREATE POLICY "inventory_transactions_admin_select"
  ON public.inventory_transactions FOR SELECT
  USING (public.is_admin());

CREATE POLICY "inventory_transactions_admin_insert"
  ON public.inventory_transactions FOR INSERT
  WITH CHECK (public.is_admin());

-- 11. carts: Customers access only their own cart
CREATE POLICY "carts_customer_own"
  ON public.carts FOR ALL
  USING (auth.uid() = user_id AND public.is_active_user())
  WITH CHECK (auth.uid() = user_id AND public.is_active_user());

-- 12. cart_items: Customers access only items in their own cart
CREATE POLICY "cart_items_customer_own"
  ON public.cart_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.carts c
      WHERE c.id = cart_items.cart_id
        AND c.user_id = auth.uid()
    )
    AND public.is_active_user()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.carts c
      WHERE c.id = cart_items.cart_id
        AND c.user_id = auth.uid()
    )
    AND public.is_active_user()
  );

-- 13. wishlists: Customers access only their own wishlist
CREATE POLICY "wishlists_customer_own"
  ON public.wishlists FOR ALL
  USING (auth.uid() = user_id AND public.is_active_user())
  WITH CHECK (auth.uid() = user_id AND public.is_active_user());

-- 14. wishlist_items: Customers access only items in their own wishlist
CREATE POLICY "wishlist_items_customer_own"
  ON public.wishlist_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.wishlists w
      WHERE w.id = wishlist_items.wishlist_id
        AND w.user_id = auth.uid()
    )
    AND public.is_active_user()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wishlists w
      WHERE w.id = wishlist_items.wishlist_id
        AND w.user_id = auth.uid()
    )
    AND public.is_active_user()
  );

-- 15. orders: Customers can ONLY read their own orders; creation and price calculation run via SECURITY DEFINER RPC
CREATE POLICY "orders_select_own_or_admin"
  ON public.orders FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "orders_admin_update"
  ON public.orders FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 16. order_items: Customers read items belonging to their own orders; Admins read all
CREATE POLICY "order_items_select_own_or_admin"
  ON public.order_items FOR SELECT
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.user_id = auth.uid()
    )
  );

-- 17. order_status_history: Customers read history of their own orders; Admins read/insert
CREATE POLICY "order_status_history_select_own_or_admin"
  ON public.order_status_history FOR SELECT
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND o.user_id = auth.uid()
    )
  );

-- 18. payments: Customers read only their own payment records; Admins read all
CREATE POLICY "payments_select_own_or_admin"
  ON public.payments FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- 19. payment_verifications: Customers read only their own submissions; Admins read/update via RPC
CREATE POLICY "payment_verifications_select_own_or_admin"
  ON public.payment_verifications FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- 20. payment_webhook_events: Strictly Admin read-only (written by Edge Function service role)
CREATE POLICY "payment_webhook_events_admin_select"
  ON public.payment_webhook_events FOR SELECT
  USING (public.is_admin());

-- 21. product_reviews: Public reads approved reviews; Customers read own; Creation enforced via verified-purchase RPC
CREATE POLICY "product_reviews_public_read"
  ON public.product_reviews FOR SELECT
  USING (moderation_status = 'approved' OR auth.uid() = user_id OR public.is_admin());

CREATE POLICY "product_reviews_admin_update"
  ON public.product_reviews FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "product_reviews_admin_delete"
  ON public.product_reviews FOR DELETE
  USING (public.is_admin() OR auth.uid() = user_id);

-- 22. store_settings: Public read; Admin update
CREATE POLICY "store_settings_public_read"
  ON public.store_settings FOR SELECT
  USING (TRUE);

CREATE POLICY "store_settings_admin_update"
  ON public.store_settings FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "store_settings_admin_insert"
  ON public.store_settings FOR INSERT
  WITH CHECK (public.is_admin());

-- 23. shipping_settings: Public read; Admin update
CREATE POLICY "shipping_settings_public_read"
  ON public.shipping_settings FOR SELECT
  USING (TRUE);

CREATE POLICY "shipping_settings_admin_update"
  ON public.shipping_settings FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "shipping_settings_admin_insert"
  ON public.shipping_settings FOR INSERT
  WITH CHECK (public.is_admin());

-- 24. admin_audit_logs: Admin read-only
CREATE POLICY "admin_audit_logs_admin_select"
  ON public.admin_audit_logs FOR SELECT
  USING (public.is_admin());

-- 4. Grant standard Supabase schema & table permissions to anon and authenticated roles
-- (RLS policies above strictly govern row-level access)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

