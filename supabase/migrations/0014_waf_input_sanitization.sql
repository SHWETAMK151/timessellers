-- ==============================================================================
-- TIMESSELLERS LUXURY E-COMMERCE PLATFORM
-- Migration 0014: Lightweight WAF Input Sanitization & Payload Guards
-- Blocks script/HTML injection & oversized strings silently at the DB layer
-- with zero latency impact on legitimate customers.
-- ==============================================================================

-- 1. Fast SQL-level XSS / malicious payload detector
CREATE OR REPLACE FUNCTION public.is_suspicious_input(p_val TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_val, '') ~* '(<\s*script|javascript\s*:|on(error|load|click|mouseover)\s*=|<\s*iframe|<\s*object|<\s*embed|\x00)';
$$;

-- 2. Trigger on orders to reject malicious script payloads or absurd field lengths
CREATE OR REPLACE FUNCTION public.waf_validate_order_inputs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_text TEXT := COALESCE(NEW.customer_snapshot::TEXT, '');
  v_address_text TEXT := COALESCE(NEW.delivery_address_snapshot::TEXT, '');
BEGIN
  IF char_length(v_customer_text) > 4000 OR char_length(v_address_text) > 4000 THEN
    RAISE EXCEPTION 'Order payload exceeds maximum allowed size.';
  END IF;

  IF public.is_suspicious_input(v_customer_text) OR public.is_suspicious_input(v_address_text) THEN
    RAISE EXCEPTION 'Invalid characters detected in order details.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_waf_validate_order_inputs ON public.orders;
CREATE TRIGGER trg_waf_validate_order_inputs
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.waf_validate_order_inputs();

-- 3. Trigger on product_reviews to reject script injection & oversized reviews
CREATE OR REPLACE FUNCTION public.waf_validate_review_inputs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF char_length(COALESCE(NEW.title, '')) > 200 OR char_length(COALESCE(NEW.comment, '')) > 3000 THEN
    RAISE EXCEPTION 'Review text exceeds maximum allowed length.';
  END IF;

  IF public.is_suspicious_input(NEW.title) OR public.is_suspicious_input(NEW.comment) THEN
    RAISE EXCEPTION 'Invalid characters detected in review.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_waf_validate_review_inputs ON public.product_reviews;
CREATE TRIGGER trg_waf_validate_review_inputs
  BEFORE INSERT OR UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.waf_validate_review_inputs();

NOTIFY pgrst, 'reload schema';
