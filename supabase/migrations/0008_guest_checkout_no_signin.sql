-- ==============================================================================
-- TIMESSELLERS LUXURY E-COMMERCE PLATFORM
-- Migration 0008: Guest Checkout (No Customer Sign-In Required)
-- Allows customers to fill checkout details, pay via Gateway-Free UPI or Crypto,
-- and send all order, customer, address, and payment data directly to Admin Panel.
-- ==============================================================================

-- 1. Make user_id nullable on orders, payments, and payment_verifications for guest checkouts
ALTER TABLE public.orders
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS guest_token TEXT;

ALTER TABLE public.payments
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.payment_verifications
  ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_guest_token ON public.orders(guest_token);

-- 2. Upgrade `create_order_secure` to support Guest Checkout (auth.uid() IS NULL)
-- Captures full customer details (name, phone, email) & Indian delivery address
-- directly into `customer_snapshot` and `delivery_address_snapshot` for the Admin Panel.
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
  v_guest_token TEXT;
  v_expires_at TIMESTAMPTZ := NOW() + INTERVAL '45 minutes';
  v_customer_name TEXT;
  v_customer_phone TEXT;
  v_customer_email TEXT;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = v_user_id;

    IF FOUND AND v_profile.is_restricted THEN
      RAISE EXCEPTION 'Your account is restricted from placing orders.';
    END IF;
  END IF;

  IF p_payment_method NOT IN ('upi_qr', 'crypto') THEN
    RAISE EXCEPTION 'Unsupported payment method: %', p_payment_method;
  END IF;

  v_pin_code := TRIM(COALESCE(p_delivery_address->>'pin_code', ''));
  IF v_pin_code !~ '^[1-9][0-9]{5}$' THEN
    RAISE EXCEPTION 'Please enter a valid 6-digit Indian PIN code.';
  END IF;

  v_customer_name := TRIM(COALESCE(p_delivery_address->>'full_name', ''));
  v_customer_phone := TRIM(COALESCE(p_delivery_address->>'phone', ''));
  v_customer_email := NULLIF(TRIM(COALESCE(p_delivery_address->>'email', '')), '');

  IF v_customer_name = ''
     OR v_customer_phone = ''
     OR TRIM(COALESCE(p_delivery_address->>'house_building', '')) = ''
     OR TRIM(COALESCE(p_delivery_address->>'street', '')) = ''
     OR TRIM(COALESCE(p_delivery_address->>'city', '')) = ''
     OR TRIM(COALESCE(p_delivery_address->>'state', '')) = ''
  THEN
    RAISE EXCEPTION 'Complete delivery address and contact details are required.';
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
  v_guest_token := REPLACE(gen_random_uuid()::TEXT, '-', '');

  INSERT INTO public.orders (
    order_number,
    user_id,
    guest_token,
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
    v_guest_token,
    jsonb_build_object(
      'user_id', v_user_id,
      'full_name', COALESCE(NULLIF(v_profile.full_name, ''), v_customer_name),
      'phone', COALESCE(NULLIF(v_profile.phone, ''), v_customer_phone),
      'email', COALESCE(v_customer_email, v_profile.email),
      'is_guest', (v_user_id IS NULL)
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
      THEN 'Order placed with Gateway-Free UPI unique paisa code ₹' || TO_CHAR(v_unique_payable_amount, 'FM999999990.00') || ' (paise discount: ₹' || TO_CHAR(v_paisa_discount, 'FM999999990.00') || ').'
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

  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.cart_items
    WHERE cart_id IN (SELECT id FROM public.carts WHERE user_id = v_user_id);
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'payment_id', v_payment_id,
    'guest_token', v_guest_token,
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

-- 3. Upgrade `submit_upi_payment_proof` to support guest orders via `p_guest_token`
CREATE OR REPLACE FUNCTION public.submit_upi_payment_proof(
  p_order_id UUID,
  p_utr_number TEXT,
  p_payer_upi_id TEXT DEFAULT NULL,
  p_proof_image_url TEXT DEFAULT NULL,
  p_customer_note TEXT DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_order RECORD;
  v_payment RECORD;
  v_clean_utr TEXT;
  v_verification_id UUID;
BEGIN
  v_clean_utr := UPPER(TRIM(COALESCE(p_utr_number, '')));
  IF v_clean_utr !~ '^[A-Z0-9]{10,22}$' THEN
    RAISE EXCEPTION 'Please enter a valid 12-digit UTR / UPI reference number (alphanumeric, 10-22 characters).';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND (
      (v_user_id IS NOT NULL AND user_id = v_user_id)
      OR (p_guest_token IS NOT NULL AND guest_token = p_guest_token)
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or invalid order token.';
  END IF;

  IF v_order.payment_method <> 'upi_qr' THEN
    RAISE EXCEPTION 'This order does not use UPI QR payment.';
  END IF;

  IF v_order.payment_status NOT IN ('pending_payment', 'payment_verification') THEN
    RAISE EXCEPTION 'Payment for this order cannot be modified in its current status (%).', v_order.payment_status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_verifications
    WHERE UPPER(utr_number) = v_clean_utr AND order_id <> p_order_id
  ) OR EXISTS (
    SELECT 1 FROM public.payments
    WHERE UPPER(utr_reference) = v_clean_utr AND order_id <> p_order_id
  ) THEN
    RAISE EXCEPTION 'This UTR / reference number (%) has already been submitted for another transaction.', v_clean_utr;
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  UPDATE public.payments
  SET
    utr_reference = v_clean_utr,
    status = 'submitted_for_verification',
    updated_at = NOW()
  WHERE id = v_payment.id;

  INSERT INTO public.payment_verifications (
    payment_id,
    order_id,
    user_id,
    utr_number,
    payer_upi_id,
    proof_image_url,
    customer_note,
    verification_status,
    submitted_at
  )
  VALUES (
    v_payment.id,
    p_order_id,
    v_order.user_id,
    v_clean_utr,
    NULLIF(TRIM(p_payer_upi_id), ''),
    NULLIF(TRIM(p_proof_image_url), ''),
    NULLIF(TRIM(p_customer_note), ''),
    'pending',
    NOW()
  )
  ON CONFLICT (payment_id) DO UPDATE
  SET
    utr_number = EXCLUDED.utr_number,
    payer_upi_id = COALESCE(EXCLUDED.payer_upi_id, public.payment_verifications.payer_upi_id),
    proof_image_url = COALESCE(EXCLUDED.proof_image_url, public.payment_verifications.proof_image_url),
    customer_note = COALESCE(EXCLUDED.customer_note, public.payment_verifications.customer_note),
    verification_status = 'pending',
    submitted_at = NOW()
  RETURNING id INTO v_verification_id;

  UPDATE public.orders
  SET
    payment_status = 'payment_verification',
    delivery_status = 'payment_verification',
    payment_reference = v_clean_utr,
    updated_at = NOW()
  WHERE id = p_order_id;

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
    p_order_id,
    v_order.payment_status,
    'payment_verification',
    v_order.delivery_status,
    'payment_verification',
    'Customer submitted UPI UTR ' || v_clean_utr || ' for treasury verification.',
    v_user_id
  );

  RETURN jsonb_build_object(
    'verification_id', v_verification_id,
    'order_id', p_order_id,
    'utr_number', v_clean_utr,
    'status', 'payment_verification'
  );
END;
$$;

-- 4. Secure Guest Order Lookup RPC (by order_id + guest_token OR order_number + phone)
CREATE OR REPLACE FUNCTION public.get_guest_order_details(
  p_order_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL,
  p_order_number TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_items JSONB;
  v_history JSONB;
  v_clean_phone_10 TEXT;
BEGIN
  IF p_order_id IS NOT NULL AND p_guest_token IS NOT NULL THEN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id AND guest_token = p_guest_token
    LIMIT 1;
  ELSIF p_order_number IS NOT NULL AND p_phone IS NOT NULL THEN
    v_clean_phone_10 := RIGHT(regexp_replace(p_phone, '\D', '', 'g'), 10);
    SELECT * INTO v_order
    FROM public.orders
    WHERE UPPER(order_number) = UPPER(TRIM(p_order_number))
      AND RIGHT(regexp_replace(COALESCE(delivery_address_snapshot->>'phone', customer_snapshot->>'phone', ''), '\D', '', 'g'), 10) = v_clean_phone_10
    LIMIT 1;
  ELSE
    RETURN NULL;
  END IF;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(oi)), '[]'::JSONB)
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = v_order.id;

  SELECT COALESCE(jsonb_agg(row_to_json(oh) ORDER BY oh.created_at ASC), '[]'::JSONB)
  INTO v_history
  FROM public.order_status_history oh
  WHERE oh.order_id = v_order.id;

  RETURN to_jsonb(v_order) || jsonb_build_object(
    'order_items', v_items,
    'order_status_history', v_history
  );
END;
$$;

-- 5. Allow guest payment proof uploads into `payment-proofs` bucket under `guest/...`
DROP POLICY IF EXISTS "Guest upload payment proof" ON storage.objects;
CREATE POLICY "Guest upload payment proof"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = 'guest'
  );

GRANT EXECUTE ON FUNCTION public.create_order_secure(JSONB, JSONB, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_upi_payment_proof(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_guest_order_details(UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
