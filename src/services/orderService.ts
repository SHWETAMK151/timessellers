// ==============================================================================
// TIMESSELLERS — CHECKOUT, ORDER & PAYMENT SERVICE
// All pricing, shipping calculations, order creation, and UPI submissions execute
// on the backend via PostgreSQL SECURITY DEFINER RPCs or Supabase Edge Functions.
// ==============================================================================

import { supabase, getEdgeFunctionsBaseUrl } from '@/lib/supabase';
import type {
  CheckoutQuote,
  DeliveryAddressSnapshot,
  Order,
  Payment,
  PaymentMethodType,
  ShippingSettings,
  StoreSettings,
} from '@/types/database';

export interface CartOrderPayloadItem {
  product_id: string;
  variant_id?: string | null;
  quantity: number;
}

export async function fetchStoreAndShippingSettings(): Promise<{
  store: StoreSettings | null;
  shipping: ShippingSettings | null;
}> {
  const [storeRes, shippingRes] = await Promise.all([
    supabase.from('store_settings').select('*').eq('singleton_key', 'default').maybeSingle(),
    supabase.from('shipping_settings').select('*').eq('singleton_key', 'default').maybeSingle(),
  ]);

  return {
    store: (storeRes.data as StoreSettings | null) ?? null,
    shipping: (shippingRes.data as ShippingSettings | null) ?? null,
  };
}

export async function getServerCheckoutQuote(
  items: CartOrderPayloadItem[]
): Promise<CheckoutQuote> {
  const { data, error } = await supabase.rpc('calculate_checkout_quote', {
    p_items: items,
  });

  if (error) throw new Error(error.message);
  return data as CheckoutQuote;
}

export async function createOrderOnServer(
  items: CartOrderPayloadItem[],
  deliveryAddress: DeliveryAddressSnapshot,
  paymentMethod: PaymentMethodType
): Promise<{
  order_id: string;
  order_number: string;
  payment_id: string;
  guest_token?: string;
  base_amount?: number;
  final_amount: number;
  unique_payable_amount?: number;
  paisa_code_discount?: number;
  gateway_free_token?: string;
  expires_at?: string;
  payment_method: PaymentMethodType;
}> {
  const { data, error } = await supabase.rpc('create_order_secure', {
    p_items: items,
    p_delivery_address: deliveryAddress,
    p_payment_method: paymentMethod,
  });

  if (error) throw new Error(error.message);
  return data as {
    order_id: string;
    order_number: string;
    payment_id: string;
    guest_token?: string;
    base_amount?: number;
    final_amount: number;
    unique_payable_amount?: number;
    paisa_code_discount?: number;
    gateway_free_token?: string;
    expires_at?: string;
    payment_method: PaymentMethodType;
  };
}

export async function registerGatewayFreeUpiBridge(
  orderId: string,
  guestToken?: string
): Promise<{ ok: boolean; bridged: boolean }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const endpoint = `${getEdgeFunctionsBaseUrl()}/gateway-free-upi`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'register_bridge',
      order_id: orderId,
      guest_token: guestToken,
    }),
  });
  if (!response.ok) return { ok: false, bridged: false };
  return (await response.json()) as { ok: boolean; bridged: boolean };
}

export async function pollGatewayFreeUpiStatus(
  orderId: string,
  guestToken?: string
): Promise<{
  ok: boolean;
  status: 'Pending' | 'Paid' | 'Review' | 'Expired';
  payment_status: string;
  utr?: string | null;
  amount?: string;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const endpoint = `${getEdgeFunctionsBaseUrl()}/gateway-free-upi`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'sync_order_status',
      order_id: orderId,
      guest_token: guestToken,
    }),
  });

  if (!response.ok) {
    throw new Error('Status poll request failed');
  }

  return (await response.json()) as {
    ok: boolean;
    status: 'Pending' | 'Paid' | 'Review' | 'Expired';
    payment_status: string;
    utr?: string | null;
    amount?: string;
  };
}

export async function fetchGuestOrderDetails(params: {
  orderId?: string;
  guestToken?: string;
  orderNumber?: string;
  phone?: string;
}): Promise<Order | null> {
  const { data, error } = await supabase.rpc('get_guest_order_details', {
    p_order_id: params.orderId ?? null,
    p_guest_token: params.guestToken ?? null,
    p_order_number: params.orderNumber ?? null,
    p_phone: params.phone ?? null,
  });

  if (error) throw new Error(error.message);
  return (data as Order | null) ?? null;
}

export async function submitUpiPaymentVerification(params: {
  orderId: string;
  utrNumber: string;
  payerUpiId?: string;
  proofImageUrl?: string;
  customerNote?: string;
  guestToken?: string;
}): Promise<{
  verification_id: string;
  order_id: string;
  utr_number: string;
  status: string;
}> {
  const { data, error } = await supabase.rpc('submit_upi_payment_proof', {
    p_order_id: params.orderId,
    p_utr_number: params.utrNumber,
    p_payer_upi_id: params.payerUpiId ?? null,
    p_proof_image_url: params.proofImageUrl ?? null,
    p_customer_note: params.customerNote ?? null,
    p_guest_token: params.guestToken ?? null,
  });

  if (error) throw new Error(error.message);
  return data as {
    verification_id: string;
    order_id: string;
    utr_number: string;
    status: string;
  };
}

export interface CryptoInvoiceResponse {
  payment: Payment;
  invoice: {
    provider: string;
    invoice_id: string;
    payment_url: string;
    pay_address: string;
    pay_amount: number;
    pay_currency: string;
    expires_at: string;
  };
}

export async function createCryptoPaymentInvoice(
  orderId: string,
  cryptoCurrency: string,
  guestToken?: string
): Promise<CryptoInvoiceResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const endpoint = `${getEdgeFunctionsBaseUrl()}/crypto-create-invoice`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      order_id: orderId,
      crypto_currency: cryptoCurrency,
      guest_token: guestToken,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to generate cryptocurrency payment invoice.');
  }

  return payload as CryptoInvoiceResponse;
}

export async function fetchCustomerOrders(userId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (*),
      payments (*),
      payment_verifications (*)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}

export async function fetchCustomerOrderById(
  orderId: string,
  userId?: string
): Promise<Order | null> {
  let query = supabase
    .from('orders')
    .select(`
      *,
      order_items (*),
      order_status_history (*),
      payments (*),
      payment_verifications (*)
    `)
    .eq('id', orderId);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const order = data as Order;
  if (order.order_status_history) {
    order.order_status_history.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }
  return order;
}
