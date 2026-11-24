-- ==============================================================================
-- TIMESSELLERS LUXURY E-COMMERCE PLATFORM
-- Migration 0010: Security Hardening (Pentest Remediation)
-- 1. Strip guest_token from get_guest_order_details response
-- 2. Validate proof_image_url (HTTPS Supabase Storage only) in payment RPCs
-- 3. Restrict guest payment-proofs uploads to safe image/PDF extensions
-- 4. Revoke anon/authenticated EXECUTE on internal & webhook-only functions
-- ==============================================================================

-- 1. Strip guest_token from get_guest_order_details so order_number + phone lookup
--    never leaks the bearer guest_token.
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

  RETURN (to_jsonb(v_order) - 'guest_token') || jsonb_build_object(
    'order_items', v_items,
    'order_status_history', v_history
  );
END;
$$;

-- 2. Validate p_proof_image_url in submit_payment_screenshot (HTTPS Storage URL only)
CREATE OR REPLACE FUNCTION public.submit_payment_screenshot(
  p_order_id UUID,
  p_proof_image_url TEXT,
  p_guest_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clean_url TEXT := TRIM(COALESCE(p_proof_image_url, ''));
  v_order RECORD;
  v_payment RECORD;
  v_ref_code TEXT;
  v_verification_id UUID;
BEGIN
  IF v_clean_url = '' OR v_clean_url !~* '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/(sign|public)/payment-proofs/' THEN
    RAISE EXCEPTION 'Invalid payment screenshot URL. Must be a valid Supabase storage proof URL.';
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

  v_ref_code := 'IMG-' || REPLACE(v_order.order_number, 'TS-', '');

  SELECT * INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.payments
    SET
      status = 'submitted_for_verification',
      raw_metadata = COALESCE(raw_metadata, '{}'::JSONB) || jsonb_build_object('proof_image_url', v_clean_url),
      updated_at = NOW()
    WHERE id = v_payment.id;

    INSERT INTO public.payment_verifications (
      payment_id,
      order_id,
      user_id,
      utr_number,
      proof_image_url,
      customer_note,
      verification_status,
      submitted_at
    )
    VALUES (
      v_payment.id,
      p_order_id,
      v_order.user_id,
      v_ref_code,
      v_clean_url,
      'Customer uploaded payment screenshot at checkout.',
      'pending',
      NOW()
    )
    ON CONFLICT (payment_id) DO UPDATE
    SET
      proof_image_url = EXCLUDED.proof_image_url,
      verification_status = 'pending',
      submitted_at = NOW()
    RETURNING id INTO v_verification_id;
  END IF;

  UPDATE public.orders
  SET
    payment_status = 'payment_verification',
    delivery_status = 'payment_verification',
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
    'Customer uploaded payment screenshot for manual admin verification.',
    v_user_id
  );

  RETURN jsonb_build_object(
    'verification_id', v_verification_id,
    'order_id', p_order_id,
    'proof_image_url', v_clean_url,
    'status', 'payment_verification'
  );
END;
$$;

-- 3. Restrict guest payment-proofs uploads to safe image/PDF extensions (no HTML/SVG)
DROP POLICY IF EXISTS "Guest upload payment proof" ON storage.objects;
CREATE POLICY "Guest upload payment proof"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = 'guest'
    AND LOWER(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp', 'pdf')
  );

-- 4. Revoke PUBLIC / anon / authenticated EXECUTE on internal & webhook-only functions
DO $$
DECLARE
  fn_sig TEXT;
  internal_fns TEXT[] := ARRAY[
    'public.deduct_order_inventory_internal(uuid, uuid)',
    'public.restore_order_inventory_internal(uuid, text, uuid)',
    'public.allocate_unique_upi_amount(numeric)',
    'public.reconcile_gateway_free_upi_credit(numeric, text, text, text, text, uuid)',
    'public.confirm_crypto_payment_webhook(text, text, text, uuid, text, text, numeric, text, jsonb)'
  ];
BEGIN
  FOREACH fn_sig IN ARRAY internal_fns LOOP
    IF to_regprocedure(fn_sig) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn_sig);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
