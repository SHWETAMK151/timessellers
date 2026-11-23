-- ==============================================================================
-- TIMESSELLERS LUXURY E-COMMERCE PLATFORM
-- Migration 0009: Customer Payment Screenshot Upload & Admin Viewing
-- ==============================================================================

-- 1. Allow guest `createSignedUrl` / read on their UUID-prefixed proof in `payment-proofs`
DROP POLICY IF EXISTS "Guest read own uploaded payment proof" ON storage.objects;
CREATE POLICY "Guest read own uploaded payment proof"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = 'guest'
  );

-- 2. Server-side RPC to attach a payment screenshot to an order (no UTR required)
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
  v_order RECORD;
  v_payment RECORD;
  v_ref_code TEXT;
  v_verification_id UUID;
BEGIN
  IF NULLIF(TRIM(COALESCE(p_proof_image_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Payment screenshot URL is required.';
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
      raw_metadata = COALESCE(raw_metadata, '{}'::JSONB) || jsonb_build_object('proof_image_url', TRIM(p_proof_image_url)),
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
      TRIM(p_proof_image_url),
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
    'proof_image_url', TRIM(p_proof_image_url),
    'status', 'payment_verification'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_payment_screenshot(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
