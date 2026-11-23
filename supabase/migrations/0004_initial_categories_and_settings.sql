-- ==============================================================================
-- TIMESSELLERS LUXURY E-COMMERCE PLATFORM
-- Migration 0004: Initial Categories, Store/Shipping Settings, Storage & Analytics RPC
-- ==============================================================================

-- 1. Seed the 10 Required Initial Categories
INSERT INTO public.categories (name, slug, description, image_url, display_order, is_active, is_featured)
VALUES
  (
    'Goggles',
    'goggles',
    'Precision-crafted luxury eyewear, titanium frames, and polarized sun shields.',
    'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1000&q=85',
    1,
    TRUE,
    TRUE
  ),
  (
    'Men''s Purses',
    'mens-purses',
    'Full-grain Italian calfskin wallets, billfolds, and executive cardholders.',
    'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=1000&q=85',
    2,
    TRUE,
    TRUE
  ),
  (
    'Ladies'' Purses',
    'ladies-purses',
    'Architectural leather handbags, evening clutches, and bespoke shoulder silhouettes.',
    'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1000&q=85',
    3,
    TRUE,
    TRUE
  ),
  (
    'Men''s Watches',
    'mens-watches',
    'Mechanical chronographs, tourbillon timepieces, and heritage dress watches.',
    'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=1000&q=85',
    4,
    TRUE,
    TRUE
  ),
  (
    'Ladies'' Watches',
    'ladies-watches',
    'Diamond-bezel horology, mother-of-pearl dials, and gold bracelet timepieces.',
    'https://images.unsplash.com/photo-1508615039623-a25605d2b022?auto=format&fit=crop&w=1000&q=85',
    5,
    TRUE,
    TRUE
  ),
  (
    'Perfumes',
    'perfumes',
    'Rare extrait de parfum compositions featuring aged oud, ambergris, and Grasse florals.',
    'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1000&q=85',
    6,
    TRUE,
    TRUE
  ),
  (
    'Shoes',
    'shoes',
    'Goodyear-welted dress oxfords, artisan loafers, and monochromatic luxury footwear.',
    'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=1000&q=85',
    7,
    TRUE,
    FALSE
  ),
  (
    'Headphones',
    'headphones',
    'Audiophile planar-magnetic and active noise-cancelling acoustic instruments.',
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=85',
    8,
    TRUE,
    FALSE
  ),
  (
    'Smartwatches',
    'smartwatches',
    'Sapphire-crystal connected chronographs engineered from Grade-5 titanium.',
    'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?auto=format&fit=crop&w=1000&q=85',
    9,
    TRUE,
    FALSE
  ),
  (
    'Electronics',
    'electronics',
    'Bespoke desk acoustics, precision personal audio, and executive technology objects.',
    'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=1000&q=85',
    10,
    TRUE,
    FALSE
  )
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order;

-- 2. Initialize Default Store Settings & Shipping Settings (Free shipping >= ₹499)
INSERT INTO public.store_settings (
  singleton_key,
  store_name,
  store_tagline,
  upi_id,
  upi_display_name,
  upi_payment_instructions,
  crypto_enabled,
  crypto_provider_name,
  supported_crypto_currencies,
  currency_code,
  currency_symbol,
  contact_email,
  contact_phone,
  contact_address
)
VALUES (
  'default',
  'TIMESSELLERS',
  'Haute Horlogerie & Luxury Objects',
  'timessellers@upi',
  'TIMESSELLERS LUXURY PRIVATE LIMITED',
  'Scan the official TIMESSELLERS UPI QR code or transfer the exact invoice amount to our corporate UPI ID. Once completed, enter your 12-digit UTR / UPI Reference Number and optionally attach your transaction receipt. Our treasury desk verifies every transfer before dispatching your piece.',
  TRUE,
  'NOWPayments',
  ARRAY['USDT (TRC20)', 'USDT (ERC20)', 'BTC', 'ETH', 'SOL'],
  'INR',
  '₹',
  'concierge@timessellers.com',
  '+91 22 6000 8800',
  'Level 14, Prestige Palladium Bayan, Lower Parel, Mumbai, Maharashtra 400013, India'
)
ON CONFLICT (singleton_key) DO NOTHING;

INSERT INTO public.shipping_settings (
  singleton_key,
  free_shipping_threshold,
  standard_shipping_charge,
  pan_india_delivery_enabled,
  estimated_delivery_days_min,
  estimated_delivery_days_max
)
VALUES (
  'default',
  499.00,
  79.00,
  TRUE,
  2,
  5
)
ON CONFLICT (singleton_key) DO NOTHING;

-- ==============================================================================
-- 3. SUPABASE STORAGE BUCKETS & MIME/SIZE POLICIES
-- Validates image types (JPEG, PNG, WEBP, AVIF) and file sizes (max 5MB).
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-images', 'product-images', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('category-images', 'category-images', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('store-assets', 'store-assets', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  ('avatars', 'avatars', TRUE, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('payment-proofs', 'payment-proofs', FALSE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS policies
CREATE POLICY "Public read product and category and store images"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('product-images', 'category-images', 'store-assets', 'avatars'));

CREATE POLICY "Admin upload product category store images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id IN ('product-images', 'category-images', 'store-assets')
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "Admin update delete product category store images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id IN ('product-images', 'category-images', 'store-assets')
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "Authenticated users upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "Authenticated users upload own payment proof"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "Customers read own payment proofs or admin reads all"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-proofs'
    AND (
      public.is_admin(auth.uid())
      OR (storage.foldername(name))[1] = auth.uid()::TEXT
    )
  );

-- ==============================================================================
-- 4. REAL-TIME ADMIN ANALYTICS & DASHBOARD METRICS RPC
-- Computes all statistics and time-series directly from real database rows.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_analytics()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_revenue NUMERIC(14, 2);
  v_today_revenue NUMERIC(14, 2);
  v_total_orders INTEGER;
  v_pending_orders INTEGER;
  v_confirmed_orders INTEGER;
  v_delivered_orders INTEGER;
  v_total_customers INTEGER;
  v_total_products INTEGER;
  v_low_stock_count INTEGER;
  v_daily_sales JSONB;
  v_weekly_sales JSONB;
  v_monthly_sales JSONB;
  v_best_sellers JSONB;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required.';
  END IF;

  SELECT COALESCE(SUM(final_amount), 0)
  INTO v_total_revenue
  FROM public.orders
  WHERE payment_status = 'confirmed' AND delivery_status <> 'cancelled';

  SELECT COALESCE(SUM(final_amount), 0)
  INTO v_today_revenue
  FROM public.orders
  WHERE payment_status = 'confirmed'
    AND delivery_status <> 'cancelled'
    AND created_at >= date_trunc('day', NOW());

  SELECT COUNT(*) INTO v_total_orders FROM public.orders;

  SELECT COUNT(*) INTO v_pending_orders
  FROM public.orders
  WHERE payment_status IN ('pending_payment', 'payment_verification');

  SELECT COUNT(*) INTO v_confirmed_orders
  FROM public.orders
  WHERE delivery_status IN ('confirmed', 'processing', 'shipped', 'out_for_delivery');

  SELECT COUNT(*) INTO v_delivered_orders
  FROM public.orders
  WHERE delivery_status = 'delivered';

  SELECT COUNT(*) INTO v_total_customers FROM public.profiles;

  SELECT COUNT(*) INTO v_total_products
  FROM public.products
  WHERE status <> 'archived';

  SELECT COUNT(*) INTO v_low_stock_count
  FROM public.inventory i
  JOIN public.products p ON p.id = i.product_id
  WHERE p.status = 'active' AND i.stock_status IN ('low_stock', 'out_of_stock');

  -- Daily sales over last 14 days
  SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::JSONB)
  INTO v_daily_sales
  FROM (
    SELECT
      TO_CHAR(day_series, 'DD Mon') AS label,
      TO_CHAR(day_series, 'YYYY-MM-DD') AS period_key,
      COALESCE(SUM(o.final_amount) FILTER (WHERE o.payment_status = 'confirmed' AND o.delivery_status <> 'cancelled'), 0) AS revenue,
      COUNT(o.id) AS orders_count
    FROM generate_series(
      date_trunc('day', NOW()) - INTERVAL '13 days',
      date_trunc('day', NOW()),
      INTERVAL '1 day'
    ) AS day_series
    LEFT JOIN public.orders o
      ON date_trunc('day', o.created_at) = day_series
    GROUP BY day_series
    ORDER BY day_series ASC
  ) d;

  -- Weekly sales over last 8 weeks
  SELECT COALESCE(jsonb_agg(row_to_json(w)), '[]'::JSONB)
  INTO v_weekly_sales
  FROM (
    SELECT
      'Wk ' || TO_CHAR(week_series, 'DD Mon') AS label,
      TO_CHAR(week_series, 'YYYY-MM-DD') AS period_key,
      COALESCE(SUM(o.final_amount) FILTER (WHERE o.payment_status = 'confirmed' AND o.delivery_status <> 'cancelled'), 0) AS revenue,
      COUNT(o.id) AS orders_count
    FROM generate_series(
      date_trunc('week', NOW()) - INTERVAL '7 weeks',
      date_trunc('week', NOW()),
      INTERVAL '1 week'
    ) AS week_series
    LEFT JOIN public.orders o
      ON date_trunc('week', o.created_at) = week_series
    GROUP BY week_series
    ORDER BY week_series ASC
  ) w;

  -- Monthly sales over last 6 months
  SELECT COALESCE(jsonb_agg(row_to_json(m)), '[]'::JSONB)
  INTO v_monthly_sales
  FROM (
    SELECT
      TO_CHAR(month_series, 'Mon YYYY') AS label,
      TO_CHAR(month_series, 'YYYY-MM') AS period_key,
      COALESCE(SUM(o.final_amount) FILTER (WHERE o.payment_status = 'confirmed' AND o.delivery_status <> 'cancelled'), 0) AS revenue,
      COUNT(o.id) AS orders_count
    FROM generate_series(
      date_trunc('month', NOW()) - INTERVAL '5 months',
      date_trunc('month', NOW()),
      INTERVAL '1 month'
    ) AS month_series
    LEFT JOIN public.orders o
      ON date_trunc('month', o.created_at) = month_series
    GROUP BY month_series
    ORDER BY month_series ASC
  ) m;

  -- Best-selling products from real database records
  SELECT COALESCE(jsonb_agg(row_to_json(b)), '[]'::JSONB)
  INTO v_best_sellers
  FROM (
    SELECT
      p.id,
      p.name,
      p.sku,
      p.main_image_url,
      p.selling_price,
      p.total_sold,
      COALESCE(SUM(oi.total_price) FILTER (WHERE o.payment_status = 'confirmed'), 0) AS total_revenue
    FROM public.products p
    LEFT JOIN public.order_items oi ON oi.product_id = p.id
    LEFT JOIN public.orders o ON o.id = oi.order_id
    WHERE p.status <> 'archived'
    GROUP BY p.id
    ORDER BY p.total_sold DESC, total_revenue DESC
    LIMIT 6
  ) b;

  RETURN jsonb_build_object(
    'total_revenue', v_total_revenue,
    'today_revenue', v_today_revenue,
    'total_orders', v_total_orders,
    'pending_orders', v_pending_orders,
    'confirmed_orders', v_confirmed_orders,
    'delivered_orders', v_delivered_orders,
    'total_customers', v_total_customers,
    'total_products', v_total_products,
    'low_stock_count', v_low_stock_count,
    'daily_sales', v_daily_sales,
    'weekly_sales', v_weekly_sales,
    'monthly_sales', v_monthly_sales,
    'best_sellers', v_best_sellers
  );
END;
$$;
