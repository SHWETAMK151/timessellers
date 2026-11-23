-- ==============================================================================
-- TIMESSELLERS LUXURY E-COMMERCE PLATFORM
-- Migration 0003: Server-Side Atomic RPCs, Payment Flows, Inventory & Analytics
-- ==============================================================================

-- ==============================================================================
-- 1. SERVER-SIDE CART & CHECKOUT QUOTE CALCULATOR
-- Never trusts client prices or discounts; fetches live database prices.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.calculate_checkout_quote(p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_product RECORD;
  v_variant RECORD;
  v_inventory RECORD;
  v_unit_price NUMERIC(12, 2);
  v_orig_price NUMERIC(12, 2);
  v_line_subtotal NUMERIC(12, 2);
  v_line_discount NUMERIC(12, 2);
  v_subtotal NUMERIC(12, 2) := 0;
  v_total_discount NUMERIC(12, 2) := 0;
  v_shipping_charge NUMERIC(12, 2) := 0;
  v_free_threshold NUMERIC(12, 2) := 499.00;
  v_std_shipping NUMERIC(12, 2) := 79.00;
  v_final_amount NUMERIC(12, 2) := 0;
  v_line_items JSONB := '[]'::JSONB;
  v_qty INTEGER;
  v_avail_stock INTEGER;
  v_variant_label TEXT;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart cannot be empty.';
  END IF;

  SELECT free_shipping_threshold, standard_shipping_charge
  INTO v_free_threshold, v_std_shipping
  FROM public.shipping_settings
  WHERE singleton_key = 'default'
  LIMIT 1;

  v_free_threshold := COALESCE(v_free_threshold, 499.00);
  v_std_shipping := COALESCE(v_std_shipping, 79.00);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::INTEGER;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid product quantity requested.';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID
      AND status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'One or more products in your bag are no longer available.';
    END IF;

    SELECT * INTO v_inventory
    FROM public.inventory
    WHERE product_id = v_product.id;

    v_avail_stock := COALESCE(v_inventory.available_quantity, 0);

    -- Calculate active price (respecting scheduled discounts if active right now)
    IF v_product.scheduled_discount_price IS NOT NULL
       AND (v_product.scheduled_discount_start IS NULL OR NOW() >= v_product.scheduled_discount_start)
       AND (v_product.scheduled_discount_end IS NULL OR NOW() <= v_product.scheduled_discount_end)
    THEN
      v_unit_price := v_product.scheduled_discount_price;
    ELSE
      v_unit_price := v_product.selling_price;
    END IF;

    v_orig_price := COALESCE(v_product.original_price, v_unit_price);
    v_variant_label := NULL;

    IF v_item ? 'variant_id' AND NULLIF(v_item->>'variant_id', '') IS NOT NULL THEN
      SELECT * INTO v_variant
      FROM public.product_variants
      WHERE id = (v_item->>'variant_id')::UUID
        AND product_id = v_product.id
        AND is_active = TRUE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected variant for % is unavailable.', v_product.name;
      END IF;

      v_unit_price := v_unit_price + COALESCE(v_variant.price_adjustment, 0);
      v_orig_price := v_orig_price + COALESCE(v_variant.price_adjustment, 0);
      v_avail_stock := LEAST(v_avail_stock, v_variant.available_stock);
      v_variant_label := CONCAT_WS(' / ', v_variant.color, v_variant.size, v_variant.model, v_variant.option_value);
    END IF;

    IF v_qty > v_avail_stock THEN
      RAISE EXCEPTION 'Insufficient stock for "%". Available: %, Requested: %.', v_product.name, v_avail_stock, v_qty;
    END IF;

    v_line_subtotal := ROUND(v_unit_price * v_qty, 2);
    v_line_discount := ROUND(GREATEST(0, (v_orig_price - v_unit_price)) * v_qty, 2);

    v_subtotal := v_subtotal + v_line_subtotal;
    v_total_discount := v_total_discount + v_line_discount;

    v_line_items := v_line_items || jsonb_build_object(
      'product_id', v_product.id,
      'variant_id', NULLIF(v_item->>'variant_id', ''),
      'name', v_product.name,
      'sku', v_product.sku,
      'image_url', v_product.main_image_url,
      'variant_label', v_variant_label,
      'quantity', v_qty,
      'unit_price', v_unit_price,
      'original_price', v_orig_price,
      'line_discount', v_line_discount,
      'line_total', v_line_subtotal,
      'available_stock', v_avail_stock
    );
  END LOOP;

  IF v_subtotal >= v_free_threshold THEN
    v_shipping_charge := 0;
  ELSE
    v_shipping_charge := v_std_shipping;
  END IF;

  v_final_amount := ROUND(v_subtotal + v_shipping_charge, 2);

  RETURN jsonb_build_object(
    'items', v_line_items,
    'subtotal_amount', v_subtotal,
    'discount_amount', v_total_discount,
    'shipping_amount', v_shipping_charge,
    'free_shipping_threshold', v_free_threshold,
    'final_amount', v_final_amount,
    'currency', 'INR'
  );
END;
$$;

-- ==============================================================================
-- 2. SECURE ORDER CREATION RPC
-- Creates Order, Order Items, Initial Status History, and Pending Payment record.
-- Does NOT deduct inventory yet (Rule 12: Deduct inventory ONLY after confirmed payment).
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

  -- Validate Indian PIN Code & required delivery fields on server
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

  -- Generate luxury order reference number: TS-YYYYMMDD-XXXXXX
  v_order_number := 'TS-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 6));

  INSERT INTO public.orders (
    order_number,
    user_id,
    customer_snapshot,
    delivery_address_snapshot,
    subtotal_amount,
    discount_amount,
    shipping_amount,
    final_amount,
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
    (v_quote->>'discount_amount')::NUMERIC(12, 2),
    (v_quote->>'shipping_amount')::NUMERIC(12, 2),
    (v_quote->>'final_amount')::NUMERIC(12, 2),
    'INR',
    p_payment_method,
    'pending_payment',
    'pending_payment',
    FALSE
  )
  RETURNING id INTO v_order_id;

  -- Insert immutable order_items snapshots
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

  -- Record initial order status history
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
    'Order placed by customer. Awaiting payment confirmation.',
    v_user_id
  );

  -- Create initial payment record
  INSERT INTO public.payments (
    order_id,
    user_id,
    payment_method,
    provider,
    amount,
    currency,
    status,
    expires_at
  )
  VALUES (
    v_order_id,
    v_user_id,
    p_payment_method,
    CASE WHEN p_payment_method = 'upi_qr' THEN 'manual_upi' ELSE 'crypto_gateway' END,
    (v_quote->>'final_amount')::NUMERIC(12, 2),
    'INR',
    'pending',
    NOW() + INTERVAL '45 minutes'
  )
  RETURNING id INTO v_payment_id;

  -- Clear authenticated user's database cart items
  DELETE FROM public.cart_items
  WHERE cart_id IN (SELECT id FROM public.carts WHERE user_id = v_user_id);

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'payment_id', v_payment_id,
    'final_amount', (v_quote->>'final_amount')::NUMERIC(12, 2),
    'payment_method', p_payment_method
  );
END;
$$;

-- ==============================================================================
-- 3. CUSTOMER UPI UTR & PROOF SUBMISSION RPC
-- Enforces unique UTR across both payment_verifications and payments tables.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.submit_upi_payment_proof(
  p_order_id UUID,
  p_utr_number TEXT,
  p_payer_upi_id TEXT DEFAULT NULL,
  p_proof_image_url TEXT DEFAULT NULL,
  p_customer_note TEXT DEFAULT NULL
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  v_clean_utr := UPPER(TRIM(COALESCE(p_utr_number, '')));
  IF v_clean_utr !~ '^[A-Z0-9]{10,22}$' THEN
    RAISE EXCEPTION 'Please enter a valid 12-digit UTR / UPI reference number (alphanumeric, 10-22 characters).';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.payment_method <> 'upi_qr' THEN
    RAISE EXCEPTION 'This order does not use UPI QR payment.';
  END IF;

  IF v_order.payment_status NOT IN ('pending_payment', 'payment_verification') THEN
    RAISE EXCEPTION 'Payment for this order cannot be modified in its current status (%).', v_order.payment_status;
  END IF;

  -- Prevent duplicate UTR submission across the entire platform
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
    v_user_id,
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
    'Customer submitted UPI UTR ' || v_clean_utr || ' for manual treasury verification.',
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

-- ==============================================================================
-- 4. ATOMIC INVENTORY DEDUCTION ON PAYMENT CONFIRMATION (Internal Helper)
-- Locks inventory rows FOR UPDATE, prevents overselling, deducts stock,
-- updates total_sold, and writes inventory_transactions records.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.deduct_order_inventory_internal(
  p_order_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_inv RECORD;
  v_new_qty INTEGER;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found for inventory deduction.', p_order_id;
  END IF;

  -- Idempotency guard: never deduct twice
  IF v_order.inventory_deducted THEN
    RETURN;
  END IF;

  FOR v_item IN
    SELECT * FROM public.order_items
    WHERE order_id = p_order_id
    ORDER BY product_id
  LOOP
    IF v_item.product_id IS NOT NULL THEN
      SELECT * INTO v_inv
      FROM public.inventory
      WHERE product_id = v_item.product_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory record missing for product %', v_item.product_name_snapshot;
      END IF;

      IF v_inv.available_quantity < v_item.quantity THEN
        RAISE EXCEPTION 'Insufficient inventory to confirm order for "%". Available: %, Required: %',
          v_item.product_name_snapshot, v_inv.available_quantity, v_item.quantity;
      END IF;

      v_new_qty := v_inv.available_quantity - v_item.quantity;

      UPDATE public.inventory
      SET available_quantity = v_new_qty
      WHERE id = v_inv.id;

      IF v_item.variant_id IS NOT NULL THEN
        UPDATE public.product_variants
        SET available_stock = GREATEST(0, available_stock - v_item.quantity)
        WHERE id = v_item.variant_id;
      END IF;

      UPDATE public.products
      SET total_sold = total_sold + v_item.quantity
      WHERE id = v_item.product_id;

      INSERT INTO public.inventory_transactions (
        inventory_id,
        product_id,
        order_id,
        transaction_type,
        quantity_change,
        previous_quantity,
        new_quantity,
        notes,
        performed_by
      )
      VALUES (
        v_inv.id,
        v_item.product_id,
        p_order_id,
        'payment_confirmed_deduction',
        -v_item.quantity,
        v_inv.available_quantity,
        v_new_qty,
        'Stock deducted on confirmed payment for order ' || v_order.order_number,
        p_actor_id
      );
    END IF;
  END LOOP;

  UPDATE public.orders
  SET inventory_deducted = TRUE
  WHERE id = p_order_id;
END;
$$;

-- ==============================================================================
-- 5. ATOMIC INVENTORY RESTORATION ON CANCELLATION OR REFUND (Internal Helper)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.restore_order_inventory_internal(
  p_order_id UUID,
  p_reason_type TEXT,
  p_actor_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_inv RECORD;
  v_new_qty INTEGER;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_order.inventory_deducted THEN
    RETURN;
  END IF;

  FOR v_item IN
    SELECT * FROM public.order_items
    WHERE order_id = p_order_id
    ORDER BY product_id
  LOOP
    IF v_item.product_id IS NOT NULL THEN
      SELECT * INTO v_inv
      FROM public.inventory
      WHERE product_id = v_item.product_id
      FOR UPDATE;

      IF FOUND THEN
        v_new_qty := v_inv.available_quantity + v_item.quantity;

        UPDATE public.inventory
        SET available_quantity = v_new_qty
        WHERE id = v_inv.id;

        IF v_item.variant_id IS NOT NULL THEN
          UPDATE public.product_variants
          SET available_stock = available_stock + v_item.quantity
          WHERE id = v_item.variant_id;
        END IF;

        UPDATE public.products
        SET total_sold = GREATEST(0, total_sold - v_item.quantity)
        WHERE id = v_item.product_id;

        INSERT INTO public.inventory_transactions (
          inventory_id,
          product_id,
          order_id,
          transaction_type,
          quantity_change,
          previous_quantity,
          new_quantity,
          notes,
          performed_by
        )
        VALUES (
          v_inv.id,
          v_item.product_id,
          p_order_id,
          p_reason_type,
          v_item.quantity,
          v_inv.available_quantity,
          v_new_qty,
          'Stock restored due to ' || p_reason_type || ' on order ' || v_order.order_number,
          p_actor_id
        );
      END IF;
    END IF;
  END LOOP;

  UPDATE public.orders
  SET inventory_deducted = FALSE
  WHERE id = p_order_id;
END;
$$;

-- ==============================================================================
-- 6. ADMIN MANUAL UPI PAYMENT VERIFICATION RPC
-- Only authorized administrators can approve or reject UPI verifications.
-- Approving atomically deducts inventory, confirms order, and logs an audit entry.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_verify_upi_payment(
  p_verification_id UUID,
  p_decision TEXT,
  p_admin_remarks TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_verif RECORD;
  v_order RECORD;
BEGIN
  IF NOT public.is_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required.';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected.';
  END IF;

  SELECT * INTO v_verif
  FROM public.payment_verifications
  WHERE id = p_verification_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment verification record not found.';
  END IF;

  IF v_verif.verification_status = 'approved' THEN
    RAISE EXCEPTION 'This payment verification has already been approved.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_verif.order_id
  FOR UPDATE;

  IF p_decision = 'approved' THEN
    -- Atomically deduct inventory first (throws if out of stock)
    PERFORM public.deduct_order_inventory_internal(v_order.id, v_admin_id);

    UPDATE public.payment_verifications
    SET
      verification_status = 'approved',
      verified_by = v_admin_id,
      admin_remarks = p_admin_remarks,
      verified_at = NOW()
    WHERE id = p_verification_id;

    UPDATE public.payments
    SET
      status = 'confirmed',
      confirmed_at = NOW()
    WHERE id = v_verif.payment_id;

    UPDATE public.orders
    SET
      payment_status = 'confirmed',
      delivery_status = 'confirmed',
      confirmed_at = NOW()
    WHERE id = v_order.id;

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
      v_order.id,
      v_order.payment_status,
      'confirmed',
      v_order.delivery_status,
      'confirmed',
      'UPI payment (UTR: ' || v_verif.utr_number || ') verified & approved by administrator. ' || COALESCE(p_admin_remarks, ''),
      v_admin_id
    );
  ELSE
    UPDATE public.payment_verifications
    SET
      verification_status = 'rejected',
      verified_by = v_admin_id,
      admin_remarks = p_admin_remarks,
      verified_at = NOW()
    WHERE id = p_verification_id;

    UPDATE public.payments
    SET status = 'rejected'
    WHERE id = v_verif.payment_id;

    UPDATE public.orders
    SET
      payment_status = 'failed',
      delivery_status = 'pending_payment'
    WHERE id = v_order.id;

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
      v_order.id,
      v_order.payment_status,
      'failed',
      v_order.delivery_status,
      'pending_payment',
      'UPI payment verification rejected by administrator. Reason: ' || COALESCE(p_admin_remarks, 'Unverified UTR reference.'),
      v_admin_id
    );
  END IF;

  INSERT INTO public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    previous_state,
    new_state
  )
  VALUES (
    v_admin_id,
    'upi_payment_' || p_decision,
    'payment_verification',
    p_verification_id::TEXT,
    jsonb_build_object('verification_status', v_verif.verification_status, 'order_id', v_order.id),
    jsonb_build_object('verification_status', p_decision, 'utr_number', v_verif.utr_number, 'remarks', p_admin_remarks)
  );

  RETURN jsonb_build_object(
    'verification_id', p_verification_id,
    'order_id', v_order.id,
    'decision', p_decision
  );
END;
$$;

-- ==============================================================================
-- 7. SERVER-SIDE CRYPTO WEBHOOK CONFIRMATION RPC
-- Invoked exclusively by verified webhook Edge Function using service_role.
-- Idempotent against duplicate webhook deliveries.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.confirm_crypto_payment_webhook(
  p_provider TEXT,
  p_event_id TEXT,
  p_provider_invoice_id TEXT,
  p_order_id UUID,
  p_transaction_hash TEXT,
  p_crypto_currency TEXT,
  p_crypto_amount NUMERIC,
  p_event_type TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_payment RECORD;
BEGIN
  -- 1. Duplicate webhook check
  IF EXISTS (SELECT 1 FROM public.payment_webhook_events WHERE event_id = p_event_id) THEN
    RETURN jsonb_build_object('status', 'ignored_duplicate', 'event_id', p_event_id);
  END IF;

  INSERT INTO public.payment_webhook_events (
    provider,
    event_id,
    provider_invoice_id,
    order_id,
    event_type,
    signature_verified,
    processing_status,
    payload,
    processed_at
  )
  VALUES (
    p_provider,
    p_event_id,
    p_provider_invoice_id,
    p_order_id,
    p_event_type,
    TRUE,
    'processed',
    p_payload,
    NOW()
  );

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found for crypto webhook.', p_order_id;
  END IF;

  IF v_order.payment_status = 'confirmed' THEN
    RETURN jsonb_build_object('status', 'already_confirmed', 'order_id', p_order_id);
  END IF;

  -- Deduct inventory atomically
  PERFORM public.deduct_order_inventory_internal(v_order.id, NULL);

  SELECT * INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.payments
    SET
      provider = p_provider,
      provider_invoice_id = COALESCE(p_provider_invoice_id, provider_invoice_id),
      transaction_hash = COALESCE(p_transaction_hash, transaction_hash),
      crypto_currency = COALESCE(p_crypto_currency, crypto_currency),
      crypto_amount = COALESCE(p_crypto_amount, crypto_amount),
      status = 'confirmed',
      confirmed_at = NOW(),
      raw_metadata = p_payload
    WHERE id = v_payment.id;
  END IF;

  UPDATE public.orders
  SET
    payment_status = 'confirmed',
    delivery_status = 'confirmed',
    payment_reference = COALESCE(p_transaction_hash, p_provider_invoice_id),
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
    'Cryptocurrency payment confirmed automatically via verified ' || p_provider || ' webhook (Tx: ' || COALESCE(p_transaction_hash, p_provider_invoice_id) || ').'
  );

  RETURN jsonb_build_object(
    'status', 'confirmed',
    'order_id', v_order.id,
    'order_number', v_order.order_number
  );
END;
$$;

-- ==============================================================================
-- 8. ADMIN ORDER STATUS, CANCELLATION & REFUND MANAGEMENT RPC
-- Handles complete 9-stage lifecycle + automatic inventory restoration on cancel/refund.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_update_order_lifecycle(
  p_order_id UUID,
  p_new_delivery_status TEXT,
  p_tracking_number TEXT DEFAULT NULL,
  p_courier_partner TEXT DEFAULT NULL,
  p_tracking_url TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_order RECORD;
  v_new_payment_status TEXT;
BEGIN
  IF NOT public.is_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required.';
  END IF;

  IF p_new_delivery_status NOT IN (
    'pending_payment',
    'payment_verification',
    'confirmed',
    'processing',
    'shipped',
    'out_for_delivery',
    'delivered',
    'cancelled',
    'refunded'
  ) THEN
    RAISE EXCEPTION 'Invalid delivery status: %', p_new_delivery_status;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  v_new_payment_status := v_order.payment_status;

  -- If moving to confirmed/processing/shipped/out_for_delivery/delivered, ensure payment is confirmed and stock deducted
  IF p_new_delivery_status IN ('confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered') THEN
    IF v_order.payment_status <> 'confirmed' THEN
      RAISE EXCEPTION 'Cannot advance delivery to "%" before payment is confirmed.', p_new_delivery_status;
    END IF;
    IF NOT v_order.inventory_deducted THEN
      PERFORM public.deduct_order_inventory_internal(v_order.id, v_admin_id);
    END IF;
  END IF;

  -- If cancelled or refunded, restore inventory if it was deducted
  IF p_new_delivery_status = 'cancelled' THEN
    PERFORM public.restore_order_inventory_internal(v_order.id, 'order_cancelled_restoration', v_admin_id);
  ELSIF p_new_delivery_status = 'refunded' THEN
    PERFORM public.restore_order_inventory_internal(v_order.id, 'order_refunded_restoration', v_admin_id);
    v_new_payment_status := 'refunded';
    UPDATE public.payments SET status = 'refunded' WHERE order_id = v_order.id;
  END IF;

  UPDATE public.orders
  SET
    delivery_status = p_new_delivery_status,
    payment_status = v_new_payment_status,
    tracking_number = COALESCE(NULLIF(TRIM(p_tracking_number), ''), tracking_number),
    courier_partner = COALESCE(NULLIF(TRIM(p_courier_partner), ''), courier_partner),
    tracking_url = COALESCE(NULLIF(TRIM(p_tracking_url), ''), tracking_url),
    shipped_at = CASE WHEN p_new_delivery_status = 'shipped' AND shipped_at IS NULL THEN NOW() ELSE shipped_at END,
    delivered_at = CASE WHEN p_new_delivery_status = 'delivered' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END,
    cancelled_at = CASE WHEN p_new_delivery_status = 'cancelled' AND cancelled_at IS NULL THEN NOW() ELSE cancelled_at END,
    cancellation_reason = CASE WHEN p_new_delivery_status = 'cancelled' THEN COALESCE(p_note, cancellation_reason) ELSE cancellation_reason END,
    refunded_at = CASE WHEN p_new_delivery_status = 'refunded' AND refunded_at IS NULL THEN NOW() ELSE refunded_at END,
    refund_reason = CASE WHEN p_new_delivery_status = 'refunded' THEN COALESCE(p_note, refund_reason) ELSE refund_reason END,
    refunded_amount = CASE WHEN p_new_delivery_status = 'refunded' THEN final_amount ELSE refunded_amount END
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
    v_new_payment_status,
    v_order.delivery_status,
    p_new_delivery_status,
    COALESCE(NULLIF(TRIM(p_note), ''), 'Order status updated to ' || p_new_delivery_status),
    v_admin_id
  );

  INSERT INTO public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    previous_state,
    new_state
  )
  VALUES (
    v_admin_id,
    'update_order_status',
    'order',
    p_order_id::TEXT,
    jsonb_build_object('delivery_status', v_order.delivery_status, 'payment_status', v_order.payment_status),
    jsonb_build_object('delivery_status', p_new_delivery_status, 'payment_status', v_new_payment_status, 'tracking_number', p_tracking_number)
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'delivery_status', p_new_delivery_status,
    'payment_status', v_new_payment_status
  );
END;
$$;

-- ==============================================================================
-- 9. ADMIN ATOMIC INVENTORY ADJUSTMENT RPC
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_adjust_inventory(
  p_product_id UUID,
  p_new_quantity INTEGER,
  p_low_stock_threshold INTEGER DEFAULT NULL,
  p_notes TEXT DEFAULT 'Manual inventory adjustment by administrator'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_inv RECORD;
  v_diff INTEGER;
BEGIN
  IF NOT public.is_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required.';
  END IF;

  IF p_new_quantity < 0 THEN
    RAISE EXCEPTION 'Inventory quantity cannot be negative.';
  END IF;

  SELECT * INTO v_inv
  FROM public.inventory
  WHERE product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory record not found for product.';
  END IF;

  v_diff := p_new_quantity - v_inv.available_quantity;

  UPDATE public.inventory
  SET
    available_quantity = p_new_quantity,
    low_stock_threshold = COALESCE(p_low_stock_threshold, low_stock_threshold)
  WHERE id = v_inv.id;

  INSERT INTO public.inventory_transactions (
    inventory_id,
    product_id,
    transaction_type,
    quantity_change,
    previous_quantity,
    new_quantity,
    notes,
    performed_by
  )
  VALUES (
    v_inv.id,
    p_product_id,
    CASE WHEN v_diff > 0 THEN 'restock' ELSE 'admin_adjustment' END,
    v_diff,
    v_inv.available_quantity,
    p_new_quantity,
    p_notes,
    v_admin_id
  );

  INSERT INTO public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    previous_state,
    new_state
  )
  VALUES (
    v_admin_id,
    'adjust_inventory',
    'inventory',
    v_inv.id::TEXT,
    jsonb_build_object('available_quantity', v_inv.available_quantity),
    jsonb_build_object('available_quantity', p_new_quantity, 'notes', p_notes)
  );

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'previous_quantity', v_inv.available_quantity,
    'new_quantity', p_new_quantity
  );
END;
$$;

-- ==============================================================================
-- 10. VERIFIED PURCHASE REVIEW SUBMISSION RPC
-- Enforces Rule 15 on the backend: Only customers who purchased AND received
-- (`delivery_status = 'delivered'`) the product can submit a review.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.submit_verified_review(
  p_product_id UUID,
  p_rating INTEGER,
  p_title TEXT,
  p_comment TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_eligible_order_id UUID;
  v_review_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Please sign in to submit a review.';
  END IF;

  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5 stars.';
  END IF;

  IF char_length(TRIM(COALESCE(p_title, ''))) < 3 OR char_length(TRIM(COALESCE(p_comment, ''))) < 10 THEN
    RAISE EXCEPTION 'Please provide a descriptive review title and comment (at least 10 characters).';
  END IF;

  -- Find a delivered order belonging to this customer that contains this product
  SELECT o.id INTO v_eligible_order_id
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.user_id = v_user_id
    AND o.delivery_status = 'delivered'
    AND o.payment_status = 'confirmed'
    AND oi.product_id = p_product_id
  ORDER BY o.delivered_at DESC NULLS LAST, o.created_at DESC
  LIMIT 1;

  IF v_eligible_order_id IS NULL THEN
    RAISE EXCEPTION 'Reviews are restricted to verified clients who have purchased and received this piece.';
  END IF;

  INSERT INTO public.product_reviews (
    product_id,
    user_id,
    order_id,
    rating,
    title,
    comment,
    is_verified_purchase,
    moderation_status
  )
  VALUES (
    p_product_id,
    v_user_id,
    v_eligible_order_id,
    p_rating,
    TRIM(p_title),
    TRIM(p_comment),
    TRUE,
    'approved'
  )
  ON CONFLICT (product_id, user_id, order_id) DO UPDATE
  SET
    rating = EXCLUDED.rating,
    title = EXCLUDED.title,
    comment = EXCLUDED.comment,
    updated_at = NOW()
  RETURNING id INTO v_review_id;

  RETURN jsonb_build_object(
    'review_id', v_review_id,
    'order_id', v_eligible_order_id,
    'is_verified_purchase', TRUE
  );
END;
$$;
