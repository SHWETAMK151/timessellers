-- ==============================================================================
-- TIMESSELLERS LUXURY E-COMMERCE PLATFORM
-- Migration 0005: Gateway-Free UPI Checkout Integration
-- (Based on Ujjawal99711/gateway-free-upi-checkout: Unique Paisa Amount Allocation
--  + Gmail Bank Credit Auto-Reconciliation Webhook / Polling + Manual UTR Fallback)
-- ==============================================================================

-- 1. Extend store_settings for Gateway-Free UPI configuration
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS gateway_free_upi_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS gateway_free_apps_script_url TEXT,
  ADD COLUMN IF NOT EXISTS gateway_free_max_paise_window INTEGER NOT NULL DEFAULT 899
    CHECK (gateway_free_max_paise_window >= 99 AND gateway_free_max_paise_window <= 4999);

-- 2. Extend orders & payments to track unique paisa-encoded amount and micro-discount
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS unique_payable_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS paisa_code_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMPTZ;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS gateway_free_reg_id INTEGER,
  ADD COLUMN IF NOT EXISTS gateway_free_token TEXT,
  ADD COLUMN IF NOT EXISTS payer_name TEXT,
  ADD COLUMN IF NOT EXISTS payer_vpa TEXT;

-- Index for O(1) lookup of active pending UPI orders by exact paisa amount on the current day
CREATE INDEX IF NOT EXISTS idx_orders_unique_payable_pending
  ON public.orders (unique_payable_amount, payment_status, created_at DESC);

-- ==============================================================================
-- 3. ATOMIC UNIQUE PAISA AMOUNT ALLOCATOR (Ported from Code.gs `register()`)
-- Given an order's authoritative base final_amount (in INR), allocates a unique
-- decimal amount for TODAY (in Asia/Kolkata) at or slightly below final_amount
-- (never overcharging the customer, never a round .00 rupee amount).
-- Reuses stale unpaid slots older than 45 minutes.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.allocate_unique_upi_amount(
  p_base_amount NUMERIC(12, 2)
)
RETURNS NUMERIC(12, 2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_paise BIGINT;
  v_window_paise INTEGER := 899; -- Default up to Rs 8.99 micro-discount window (890 unique non-round slots)
  v_min_paise BIGINT;
  v_candidate_paise BIGINT;
  v_today_start TIMESTAMPTZ;
  v_stale_cutoff TIMESTAMPTZ;
  v_available_paise BIGINT[];
BEGIN
  -- Serialize paisa slot allocation using a transaction-level advisory lock (equivalent to LockService.getScriptLock())
  PERFORM pg_advisory_xact_lock(99711001);

  SELECT COALESCE(gateway_free_max_paise_window, 899)
  INTO v_window_paise
  FROM public.store_settings
  WHERE singleton_key = 'default'
  LIMIT 1;

  v_base_paise := ROUND(p_base_amount * 100)::BIGINT;

  -- Ensure minimum payable amount is at least Rs 1.01 (101 paise)
  v_min_paise := GREATEST(101, v_base_paise - v_window_paise);

  -- Current day boundary in Asia/Kolkata (IST)
  v_today_start := (date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata');
  v_stale_cutoff := NOW() - INTERVAL '45 minutes';

  -- Mark stale unpaid pending_payment orders older than 45 minutes as expired in payments
  UPDATE public.payments p
  SET status = 'expired',
      updated_at = NOW()
  FROM public.orders o
  WHERE p.order_id = o.id
    AND o.payment_method = 'upi_qr'
    AND o.payment_status = 'pending_payment'
    AND p.status = 'pending'
    AND o.created_at < v_stale_cutoff;

  -- Build array of unused non-round paise amounts in [v_min_paise, v_base_paise] for today
  SELECT ARRAY(
    SELECT s.p
    FROM generate_series(v_min_paise, v_base_paise) AS s(p)
    WHERE (s.p % 100) <> 0 -- Skip round .00 rupee amounts (core rule from Code.gs line 141)
      AND NOT EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE o.payment_method = 'upi_qr'
          AND o.created_at >= v_today_start
          AND ROUND(COALESCE(o.unique_payable_amount, o.final_amount) * 100)::BIGINT = s.p
          AND (
            o.payment_status IN ('confirmed', 'payment_verification')
            OR (o.payment_status = 'pending_payment' AND o.created_at >= v_stale_cutoff)
          )
      )
  ) INTO v_available_paise;

  IF v_available_paise IS NULL OR array_length(v_available_paise, 1) IS NULL THEN
    RAISE EXCEPTION 'All gateway-free UPI payment slots in this price bracket are currently active. Please try again in a few minutes.';
  END IF;

  -- Pick a random available paise slot within the tight range (just like Code.gs line 146)
  v_candidate_paise := v_available_paise[1 + floor(random() * array_length(v_available_paise, 1))::INTEGER];

  RETURN ROUND((v_candidate_paise::NUMERIC / 100.0), 2);
END;
$$;

-- ==============================================================================
-- 4. UPGRADE `create_order_secure` TO ASSIGN UNIQUE PAISA AMOUNT FOR UPI ORDERS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.create_order_secure(
  p_items JSONB,
  p_delivery_address JSONB,
  p_payment_method TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile RECORD;
  v_quote JSONB;
  v_line JSONB;
  v_order_id UUID;
  v_payment_id UUID;
  v_order_number TEXT;
  v_pin_code TEXT;
  v_base_final_amount NUMERIC(12, 2);
  v_unique_payable_amount NUMERIC(12, 2);
  v_paisa_discount NUMERIC(12, 2) := 0;
  v_gateway_free_enabled BOOLEAN := TRUE;
  v_gateway_token TEXT;
  v_expires_at TIMESTAMPTZ := NOW() + INTERVAL '45 minutes';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to place an order.';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT FOUND OR v_profile.is_restricted THEN
    RAISE EXCEPTION 'Your account is restricted from placing orders.';
  END IF;

  IF p_payment_method NOT IN ('upi_qr', 'crypto') THEN
    RAISE EXCEPTION 'Unsupported payment method: %', p_payment_method;
  END IF;

  v_pin_code := TRIM(COALESCE(p_delivery_address->>'pin_code', ''));
  IF v_pin_code !~ '^[1-9][0-9]{5}$' THEN
    RAISE EXCEPTION 'Please enter a valid 6-digit Indian PIN code.';
  END IF;

  IF TRIM(COALESCE(p_delivery_address->>'full_name', '')) = ''
     OR TRIM(COALESCE(p_delivery_address->>'phone', '')) = ''
     OR TRIM(COALESCE(p_delivery_address->>'house_building', '')) = ''
     OR TRIM(COALESCE(p_delivery_address->>'street', '')) = ''
     OR TRIM(COALESCE(p_delivery_address->>'city', '')) = ''
     OR TRIM(COALESCE(p_delivery_address->>'state', '')) = ''
  THEN
    RAISE EXCEPTION 'Complete delivery address details are required.';
  END IF;

  -- Calculate authoritative server-side quote
  v_quote := public.calculate_checkout_quote(p_items);
  v_base_final_amount := (v_quote->>'final_amount')::NUMERIC(12, 2);

  SELECT COALESCE(gateway_free_upi_enabled, TRUE)
  INTO v_gateway_free_enabled
  FROM public.store_settings
  WHERE singleton_key = 'default'
  LIMIT 1;

  IF p_payment_method = 'upi_qr' AND v_gateway_free_enabled THEN
    v_unique_payable_amount := public.allocate_unique_upi_amount(v_base_final_amount);
    v_paisa_discount := ROUND(GREATEST(0, v_base_final_amount - v_unique_payable_amount), 2);
  ELSE
    v_unique_payable_amount := v_base_final_amount;
    v_paisa_discount := 0;
  END IF;

  v_order_number := 'TS-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 6));
  v_gateway_token := SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 20);

  INSERT INTO public.orders (
    order_number,
    user_id,
    customer_snapshot,
    delivery_address_snapshot,
    subtotal_amount,
    discount_amount,
    shipping_amount,
    final_amount,
    unique_payable_amount,
    paisa_code_discount,
    payment_expires_at,
    currency,
    payment_method,
    payment_status,
    delivery_status,
    inventory_deducted
  )
  VALUES (
    v_order_number,
    v_user_id,
    jsonb_build_object(
      'user_id', v_profile.id,
      'full_name', COALESCE(NULLIF(v_profile.full_name, ''), p_delivery_address->>'full_name'),
      'phone', v_profile.phone,
      'email', v_profile.email
    ),
    p_delivery_address,
    (v_quote->>'subtotal_amount')::NUMERIC(12, 2),
    ROUND((v_quote->>'discount_amount')::NUMERIC(12, 2) + v_paisa_discount, 2),
    (v_quote->>'shipping_amount')::NUMERIC(12, 2),
    v_unique_payable_amount,
    v_unique_payable_amount,
    v_paisa_discount,
    v_expires_at,
    'INR',
    p_payment_method,
    'pending_payment',
    'pending_payment',
    FALSE
  )
  RETURNING id INTO v_order_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_quote->'items')
  LOOP
    INSERT INTO public.order_items (
      order_id,
      product_id,
      variant_id,
      product_snapshot,
      sku_snapshot,
      product_name_snapshot,
      product_image_snapshot,
      variant_label_snapshot,
      quantity,
      unit_price_at_purchase,
      original_price_at_purchase,
      discount_at_purchase,
      total_price
    )
    VALUES (
      v_order_id,
      (v_line->>'product_id')::UUID,
      NULLIF(v_line->>'variant_id', '')::UUID,
      v_line,
      v_line->>'sku',
      v_line->>'name',
      v_line->>'image_url',
      NULLIF(v_line->>'variant_label', ''),
      (v_line->>'quantity')::INTEGER,
      (v_line->>'unit_price')::NUMERIC(12, 2),
      (v_line->>'original_price')::NUMERIC(12, 2),
      (v_line->>'line_discount')::NUMERIC(12, 2),
      (v_line->>'line_total')::NUMERIC(12, 2)
    );
  END LOOP;

  INSERT INTO public.order_status_history (
    order_id,
    previous_payment_status,
    new_payment_status,
    previous_delivery_status,
    new_delivery_status,
    note,
    changed_by
  )
  VALUES (
    v_order_id,
    NULL,
    'pending_payment',
    NULL,
    'pending_payment',
    CASE
      WHEN p_payment_method = 'upi_qr'
      THEN 'Order placed with Gateway-Free UPI unique paisa code ₹' || TO_CHAR(v_unique_payable_amount, 'FM999999990.00') || ' (paise discount: ₹' || TO_CHAR(v_paisa_discount, 'FM999990.00') || ').'
      ELSE 'Order placed by customer. Awaiting cryptocurrency payment confirmation.'
    END,
    v_user_id
  );

  INSERT INTO public.payments (
    order_id,
    user_id,
    payment_method,
    provider,
    amount,
    currency,
    status,
    gateway_free_token,
    expires_at
  )
  VALUES (
    v_order_id,
    v_user_id,
    p_payment_method,
    CASE WHEN p_payment_method = 'upi_qr' THEN 'gateway_free_upi' ELSE 'crypto_gateway' END,
    v_unique_payable_amount,
    'INR',
    'pending',
    v_gateway_token,
    v_expires_at
  )
  RETURNING id INTO v_payment_id;

  DELETE FROM public.cart_items
  WHERE cart_id IN (SELECT id FROM public.carts WHERE user_id = v_user_id);

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'payment_id', v_payment_id,
    'base_amount', v_base_final_amount,
    'final_amount', v_unique_payable_amount,
    'unique_payable_amount', v_unique_payable_amount,
    'paisa_code_discount', v_paisa_discount,
    'gateway_free_token', v_gateway_token,
    'expires_at', v_expires_at,
    'payment_method', p_payment_method
  );
END;
$$;

-- ==============================================================================
-- 5. SERVER-SIDE GATEWAY-FREE UPI AUTO-RECONCILIATION RPC
-- Matches an incoming verified bank credit alert (by exact paise amount or order_id)
-- from the Google Apps Script Gmail Watcher (or Edge Function), enforces duplicate
-- UTR and duplicate Gmail messageId protection, atomically deducts inventory,
-- and transitions the order to `confirmed`.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.reconcile_gateway_free_upi_credit(
  p_paid_amount NUMERIC(12, 2),
  p_utr_number TEXT,
  p_payer_name TEXT DEFAULT NULL,
  p_payer_vpa TEXT DEFAULT NULL,
  p_gmail_message_id TEXT DEFAULT NULL,
  p_order_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_utr TEXT;
  v_event_id TEXT;
  v_paid_paise BIGINT;
  v_today_start TIMESTAMPTZ;
  v_order RECORD;
  v_payment RECORD;
BEGIN
  v_clean_utr := UPPER(TRIM(COALESCE(p_utr_number, '')));
  IF v_clean_utr !~ '^[A-Z0-9]{10,22}$' THEN
    RAISE EXCEPTION 'Invalid bank UTR reference in credit alert: %', v_clean_utr;
  END IF;

  v_paid_paise := ROUND(p_paid_amount * 100)::BIGINT;
  v_event_id := 'gf_upi:' || COALESCE(NULLIF(TRIM(p_gmail_message_id), ''), v_clean_utr);

  -- 1. Idempotency check on Gmail Message ID / Event ID
  IF EXISTS (SELECT 1 FROM public.payment_webhook_events WHERE event_id = v_event_id) THEN
    RETURN jsonb_build_object('status', 'ignored_duplicate_message', 'event_id', v_event_id);
  END IF;

  -- 2. Duplicate UTR guard (Code.gs line 239: same bank reference can never be matched twice)
  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE UPPER(utr_reference) = v_clean_utr AND status = 'confirmed'
  ) THEN
    INSERT INTO public.payment_webhook_events (
      provider, event_id, event_type, signature_verified, processing_status, payload, error_message, processed_at
    ) VALUES (
      'gateway_free_upi', v_event_id, 'bank_credit_duplicate_utr', TRUE, 'ignored_duplicate',
      jsonb_build_object('amount', p_paid_amount, 'utr', v_clean_utr, 'payer', p_payer_name, 'vpa', p_payer_vpa),
      'UTR reference already used on a confirmed order', NOW()
    );
    RETURN jsonb_build_object('status', 'duplicate_utr_rejected', 'utr', v_clean_utr);
  END IF;

  v_today_start := (date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata');

  -- 3. Match Pending Order by exact paise amount today (or explicit order_id if linked)
  IF p_order_id IS NOT NULL THEN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
      AND payment_method = 'upi_qr'
      AND ROUND(COALESCE(unique_payable_amount, final_amount) * 100)::BIGINT = v_paid_paise
    FOR UPDATE;
  ELSE
    SELECT * INTO v_order
    FROM public.orders
    WHERE payment_method = 'upi_qr'
      AND payment_status IN ('pending_payment', 'payment_verification')
      AND created_at >= v_today_start
      AND ROUND(COALESCE(unique_payable_amount, final_amount) * 100)::BIGINT = v_paid_paise
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    -- Log unmatched bank credit to payment_webhook_events (equivalent to Code.gs `Review` tab)
    INSERT INTO public.payment_webhook_events (
      provider, event_id, event_type, signature_verified, processing_status, payload, error_message, processed_at
    ) VALUES (
      'gateway_free_upi', v_event_id, 'unmatched_bank_credit', TRUE, 'failed',
      jsonb_build_object('amount', p_paid_amount, 'paise', v_paid_paise, 'utr', v_clean_utr, 'payer', p_payer_name, 'vpa', p_payer_vpa),
      'No pending registration with this exact paisa amount today', NOW()
    );
    RETURN jsonb_build_object(
      'status', 'no_matching_pending_order',
      'paid_amount', p_paid_amount,
      'utr', v_clean_utr
    );
  END IF;

  IF v_order.payment_status = 'confirmed' THEN
    RETURN jsonb_build_object('status', 'already_confirmed', 'order_id', v_order.id, 'order_number', v_order.order_number);
  END IF;

  -- 4. Atomically deduct inventory (Rule 12: Deduct inventory only after confirmed payment)
  PERFORM public.deduct_order_inventory_internal(v_order.id, NULL);

  -- 5. Update payments & payment_verifications
  SELECT * INTO v_payment
  FROM public.payments
  WHERE order_id = v_order.id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.payments
    SET
      provider = 'gateway_free_upi',
      utr_reference = v_clean_utr,
      payer_name = COALESCE(NULLIF(TRIM(p_payer_name), ''), payer_name),
      payer_vpa = COALESCE(NULLIF(TRIM(p_payer_vpa), ''), payer_vpa),
      status = 'confirmed',
      confirmed_at = NOW(),
      raw_metadata = jsonb_build_object(
        'matched_by', 'exact_paisa_amount',
        'paid_amount', p_paid_amount,
        'utr', v_clean_utr,
        'payer_name', p_payer_name,
        'payer_vpa', p_payer_vpa,
        'gmail_message_id', p_gmail_message_id
      )
    WHERE id = v_payment.id;

    INSERT INTO public.payment_verifications (
      payment_id,
      order_id,
      user_id,
      utr_number,
      payer_upi_id,
      customer_note,
      verification_status,
      admin_remarks,
      submitted_at,
      verified_at
    )
    VALUES (
      v_payment.id,
      v_order.id,
      v_order.user_id,
      v_clean_utr,
      NULLIF(TRIM(p_payer_vpa), ''),
      'Auto-matched via Gateway-Free UPI exact paisa amount (₹' || TO_CHAR(p_paid_amount, 'FM999999990.00') || ')',
      'approved',
      'Automatically verified via authentic bank credit alert (Payer: ' || COALESCE(p_payer_name, 'Verified') || ', Msg: ' || COALESCE(p_gmail_message_id, 'Webhook') || ')',
      NOW(),
      NOW()
    )
    ON CONFLICT (payment_id) DO UPDATE
    SET
      utr_number = EXCLUDED.utr_number,
      payer_upi_id = COALESCE(EXCLUDED.payer_upi_id, public.payment_verifications.payer_upi_id),
      verification_status = 'approved',
      admin_remarks = EXCLUDED.admin_remarks,
      verified_at = NOW();
  END IF;

  -- 6. Mark Order Confirmed
  UPDATE public.orders
  SET
    payment_status = 'confirmed',
    delivery_status = 'confirmed',
    payment_reference = v_clean_utr,
    confirmed_at = NOW()
  WHERE id = v_order.id;

  INSERT INTO public.order_status_history (
    order_id,
    previous_payment_status,
    new_payment_status,
    previous_delivery_status,
    new_delivery_status,
    note
  )
  VALUES (
    v_order.id,
    v_order.payment_status,
    'confirmed',
    v_order.delivery_status,
    'confirmed',
    'Gateway-Free UPI payment of ₹' || TO_CHAR(p_paid_amount, 'FM999999990.00') || ' auto-confirmed via bank credit alert (UTR: ' || v_clean_utr || ', VPA: ' || COALESCE(p_payer_vpa, 'UPI') || ').'
  );

  INSERT INTO public.payment_webhook_events (
    provider,
    event_id,
    order_id,
    event_type,
    signature_verified,
    processing_status,
    payload,
    processed_at
  )
  VALUES (
    'gateway_free_upi',
    v_event_id,
    v_order.id,
    'bank_credit_matched',
    TRUE,
    'processed',
    jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'paid_amount', p_paid_amount,
      'utr', v_clean_utr,
      'payer_name', p_payer_name,
      'payer_vpa', p_payer_vpa,
      'gmail_message_id', p_gmail_message_id
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'status', 'confirmed',
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'paid_amount', p_paid_amount,
    'utr', v_clean_utr
  );
END;
$$;
