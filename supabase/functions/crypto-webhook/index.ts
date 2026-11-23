// ==============================================================================
// TIMESSELLERS — SUPABASE EDGE FUNCTION: crypto-webhook
// Verifies cryptographic HMAC signatures (NOWPayments HMAC-SHA512 / Coinbase HMAC-SHA256)
// Never trusts frontend payment notifications.
// Protects against duplicate webhooks & atomically confirms payment + deducts inventory.
// ==============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

function sortObjectKeysRecursively(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeysRecursively);
  }
  if (obj !== null && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObjectKeysRecursively(record[key]);
        return acc;
      }, {});
  }
  return obj;
}

async function computeHmacHex(
  algorithm: 'SHA-256' | 'SHA-512',
  secret: string,
  payload: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const cleanA = a.trim().toLowerCase();
  const cleanB = b.trim().toLowerCase();
  if (cleanA.length !== cleanB.length) return false;
  let diff = 0;
  for (let i = 0; i < cleanA.length; i++) {
    diff |= cleanA.charCodeAt(i) ^ cleanB.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const webhookSecret = Deno.env.get('CRYPTO_WEBHOOK_SECRET');
    const provider = (Deno.env.get('CRYPTO_PROVIDER') || 'nowpayments').toLowerCase();

    if (!supabaseUrl || !supabaseServiceRoleKey || !webhookSecret) {
      return new Response(
        JSON.stringify({ error: 'Server webhook credentials not configured.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const rawBody = await req.text();
    const parsedPayload = JSON.parse(rawBody);

    // 1. Verify HMAC Signature
    const nowPaymentsSig = req.headers.get('x-nowpayments-sig');
    const coinbaseSig = req.headers.get('x-cc-webhook-signature');

    let signatureVerified = false;

    if (provider === 'coinbase_commerce' && coinbaseSig) {
      const expectedSig = await computeHmacHex('SHA-256', webhookSecret, rawBody);
      signatureVerified = timingSafeEqualHex(expectedSig, coinbaseSig);
    } else if (nowPaymentsSig) {
      const sortedJson = JSON.stringify(sortObjectKeysRecursively(parsedPayload));
      const expectedSig = await computeHmacHex('SHA-512', webhookSecret, sortedJson);
      signatureVerified = timingSafeEqualHex(expectedSig, nowPaymentsSig);
    }

    if (!signatureVerified) {
      return new Response(
        JSON.stringify({ error: 'Invalid webhook HMAC signature.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 2. Normalize Webhook Payload across providers
    let eventId = '';
    let invoiceId = '';
    let orderId = '';
    let eventStatus = '';
    let txHash = '';
    let payCurrency = '';
    let payAmount = 0;

    if (provider === 'coinbase_commerce') {
      eventId = String(parsedPayload.event?.id || parsedPayload.id || '');
      eventStatus = String(parsedPayload.event?.type || '');
      const chargeData = parsedPayload.event?.data || {};
      invoiceId = String(chargeData.code || chargeData.id || '');
      orderId = String(chargeData.metadata?.order_id || '');
      const payments = Array.isArray(chargeData.payments) ? chargeData.payments : [];
      txHash = String(payments[0]?.transaction_id || invoiceId);
      payCurrency = String(payments[0]?.value?.crypto?.currency || 'CRYPTO');
      payAmount = Number(payments[0]?.value?.crypto?.amount || 0);
    } else {
      // NOWPayments IPN format
      invoiceId = String(parsedPayload.payment_id || '');
      orderId = String(parsedPayload.order_id || '');
      eventStatus = String(parsedPayload.payment_status || '');
      txHash = String(parsedPayload.payin_hash || parsedPayload.payment_id || '');
      payCurrency = String(parsedPayload.pay_currency || '').toUpperCase();
      payAmount = Number(parsedPayload.actually_paid || parsedPayload.pay_amount || 0);
      eventId = `nowpayments:${invoiceId}:${eventStatus}:${txHash}`;
    }

    if (!orderId || !eventId) {
      return new Response(
        JSON.stringify({ error: 'Webhook payload missing order_id or event identifier.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const isConfirmedEvent =
      eventStatus === 'finished' ||
      eventStatus === 'confirmed' ||
      eventStatus === 'charge:confirmed' ||
      eventStatus === 'charge:resolved';

    if (isConfirmedEvent) {
      const { data: rpcResult, error: rpcError } = await adminClient.rpc(
        'confirm_crypto_payment_webhook',
        {
          p_provider: provider,
          p_event_id: eventId,
          p_provider_invoice_id: invoiceId,
          p_order_id: orderId,
          p_transaction_hash: txHash,
          p_crypto_currency: payCurrency,
          p_crypto_amount: payAmount,
          p_event_type: eventStatus,
          p_payload: parsedPayload,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      return new Response(JSON.stringify({ ok: true, result: rpcResult }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Record non-final webhook lifecycle event (e.g., waiting, confirming, expired)
    await adminClient.from('payment_webhook_events').upsert(
      {
        provider,
        event_id: eventId,
        provider_invoice_id: invoiceId,
        order_id: orderId,
        event_type: eventStatus,
        signature_verified: true,
        processing_status: 'processed',
        payload: parsedPayload,
        processed_at: new Date().toISOString(),
      },
      { onConflict: 'event_id' }
    );

    if (eventStatus === 'expired' || eventStatus === 'failed' || eventStatus === 'charge:failed') {
      await adminClient
        .from('payments')
        .update({
          status: eventStatus === 'expired' ? 'expired' : 'failed',
          raw_metadata: parsedPayload,
        })
        .eq('order_id', orderId);
    }

    return new Response(
      JSON.stringify({ ok: true, status: 'recorded', event_type: eventStatus }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook processing failed';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
