// ==============================================================================
// TIMESSELLERS — SUPABASE EDGE FUNCTION: crypto-create-invoice
// Creates a cryptocurrency payment invoice for a verified order on the backend.
// Provider-agnostic adapter architecture (supports NOWPayments, Coinbase Commerce, Cryptomus).
// Never exposes API keys to the browser.
// ==============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const ALLOWED_ORIGINS = new Set([
  'https://timeseller.work.gd',
  'https://www.timeseller.work.gd',
  'https://timesellers-dun.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]);

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://timeseller.work.gd';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

interface InvoiceRequest {
  order_id: string;
  crypto_currency: string;
  guest_token?: string;
}

interface ProviderInvoiceResult {
  provider: string;
  invoice_id: string;
  payment_url: string;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  expires_at: string;
  raw: Record<string, unknown>;
}

async function createNowPaymentsInvoice(
  apiKey: string,
  callbackUrl: string,
  orderId: string,
  orderNumber: string,
  amountInr: number,
  cryptoCurrency: string
): Promise<ProviderInvoiceResult> {
  const normalizedTicker = cryptoCurrency
    .toLowerCase()
    .replace(/\s*\(trc20\)/i, 'trc20')
    .replace(/\s*\(erc20\)/i, 'erc20')
    .trim();

  const response = await fetch('https://api.nowpayments.io/v1/payment', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      price_amount: amountInr,
      price_currency: 'inr',
      pay_currency: normalizedTicker,
      ipn_callback_url: callbackUrl,
      order_id: orderId,
      order_description: `TIMESSELLERS Order ${orderNumber}`,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`NOWPayments invoice creation failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const expiresAt = data.expiration_estimate_date
    ? new Date(data.expiration_estimate_date).toISOString()
    : new Date(Date.now() + 30 * 60 * 1000).toISOString();

  return {
    provider: 'nowpayments',
    invoice_id: String(data.payment_id),
    payment_url: data.invoice_url || `https://nowpayments.io/payment/?iid=${data.payment_id}`,
    pay_address: String(data.pay_address || ''),
    pay_amount: Number(data.pay_amount || 0),
    pay_currency: String(data.pay_currency || normalizedTicker).toUpperCase(),
    expires_at: expiresAt,
    raw: data,
  };
}

async function createCoinbaseCommerceCharge(
  apiKey: string,
  orderId: string,
  orderNumber: string,
  amountInr: number,
  cryptoCurrency: string
): Promise<ProviderInvoiceResult> {
  const response = await fetch('https://api.commerce.coinbase.com/charges', {
    method: 'POST',
    headers: {
      'X-CC-Api-Key': apiKey,
      'X-CC-Version': '2018-03-22',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `TIMESSELLERS ${orderNumber}`,
      description: `Luxury Order ${orderNumber}`,
      pricing_type: 'fixed_price',
      local_price: {
        amount: amountInr.toFixed(2),
        currency: 'INR',
      },
      metadata: {
        order_id: orderId,
        order_number: orderNumber,
        preferred_crypto: cryptoCurrency,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Coinbase Commerce charge creation failed (${response.status}): ${errText}`);
  }

  const { data } = await response.json();
  return {
    provider: 'coinbase_commerce',
    invoice_id: String(data.code || data.id),
    payment_url: String(data.hosted_url),
    pay_address: String(data.addresses?.usdc || data.addresses?.bitcoin || data.addresses?.ethereum || ''),
    pay_amount: Number(amountInr),
    pay_currency: cryptoCurrency.toUpperCase(),
    expires_at: data.expires_at || new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    raw: data,
  };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseAnonKey) {
      throw new Error('Server Supabase environment variables are not configured.');
    }

    let authedUserId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const tokenVal = authHeader.replace('Bearer ', '').trim();
      if (tokenVal && tokenVal !== supabaseAnonKey) {
        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: userData } = await userClient.auth.getUser();
        authedUserId = userData?.user?.id ?? null;
      }
    }

    const body = (await req.json()) as InvoiceRequest;
    if (!body.order_id || !body.crypto_currency) {
      return new Response(JSON.stringify({ error: 'order_id and crypto_currency are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Fetch order and verify ownership (via JWT or guest_token) + server-side final_amount
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('*')
      .eq('id', body.order_id)
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: 'Order not found or access denied.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ownsViaUser = Boolean(authedUserId && order.user_id === authedUserId);
    const ownsViaGuest = Boolean(body.guest_token && order.guest_token && order.guest_token === body.guest_token);
    if (!ownsViaUser && !ownsViaGuest) {
      return new Response(JSON.stringify({ error: 'Unauthorized order access.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (order.payment_status === 'confirmed') {
      return new Response(JSON.stringify({ error: 'Order is already paid and confirmed.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cryptoProvider = (Deno.env.get('CRYPTO_PROVIDER') || 'nowpayments').toLowerCase();
    const providerApiKey = Deno.env.get('CRYPTO_PROVIDER_API_KEY');
    const callbackUrl =
      Deno.env.get('CRYPTO_IPN_CALLBACK_URL') || `${supabaseUrl}/functions/v1/crypto-webhook`;

    if (!providerApiKey) {
      return new Response(
        JSON.stringify({
          error:
            'CRYPTO_PROVIDER_API_KEY is not configured in Supabase Edge Function secrets. Configure your provider API key via `supabase secrets set CRYPTO_PROVIDER_API_KEY=...`.',
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let invoiceResult: ProviderInvoiceResult;
    if (cryptoProvider === 'coinbase_commerce') {
      invoiceResult = await createCoinbaseCommerceCharge(
        providerApiKey,
        order.id,
        order.order_number,
        Number(order.final_amount),
        body.crypto_currency
      );
    } else {
      invoiceResult = await createNowPaymentsInvoice(
        providerApiKey,
        callbackUrl,
        order.id,
        order.order_number,
        Number(order.final_amount),
        body.crypto_currency
      );
    }

    // Update the payment record with provider invoice details
    const { data: updatedPayment, error: paymentUpdateError } = await adminClient
      .from('payments')
      .update({
        provider: invoiceResult.provider,
        provider_invoice_id: invoiceResult.invoice_id,
        provider_payment_url: invoiceResult.payment_url,
        crypto_address: invoiceResult.pay_address,
        crypto_amount: invoiceResult.pay_amount,
        crypto_currency: invoiceResult.pay_currency,
        expires_at: invoiceResult.expires_at,
        raw_metadata: invoiceResult.raw,
      })
      .eq('order_id', order.id)
      .select('*')
      .single();

    if (paymentUpdateError) {
      throw paymentUpdateError;
    }

    return new Response(
      JSON.stringify({
        payment: updatedPayment,
        invoice: {
          provider: invoiceResult.provider,
          invoice_id: invoiceResult.invoice_id,
          payment_url: invoiceResult.payment_url,
          pay_address: invoiceResult.pay_address,
          pay_amount: invoiceResult.pay_amount,
          pay_currency: invoiceResult.pay_currency,
          expires_at: invoiceResult.expires_at,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
