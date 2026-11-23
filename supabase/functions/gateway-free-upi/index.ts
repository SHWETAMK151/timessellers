// ==============================================================================
// TIMESSELLERS — SUPABASE EDGE FUNCTION: gateway-free-upi
// Bridges the `Ujjawal99711/gateway-free-upi-checkout` Google Apps Script Gmail
// Watcher with TIMESSELLERS Supabase PostgreSQL.
//
// Supported Actions:
// 1. `action: 'webhook_bank_credit'` (Called by Apps Script `checkPayments()`
//    when a bank "credited" email is authenticated via DMARC/DKIM in Gmail).
//    Verifies `x-gateway-free-secret` header (HMAC or shared secret) and invokes
//    `reconcile_gateway_free_upi_credit` to confirm the order & deduct stock.
// 2. `action: 'sync_order_status'` (Called by the customer checkout page every
//    12 seconds). Checks if the order is already confirmed in Supabase; if a
//    Google Apps Script `/exec` URL is configured, also nudges/polls `action: status`
//    on the Apps Script deployment and reconciles immediately if `status === 'Paid'`.
// 3. `action: 'register_bridge'` (Called on order creation if an Apps Script
//    `/exec` URL is configured so the Google Sheet `Registrations` tab stays in
//    1:1 sync with the exact paise amount reserved by Supabase).
// ==============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-gateway-free-secret',
};

function timingSafeEqualString(a: string, b: string): boolean {
  const cleanA = a.trim();
  const cleanB = b.trim();
  if (cleanA.length !== cleanB.length) return false;
  let diff = 0;
  for (let i = 0; i < cleanA.length; i++) {
    diff |= cleanA.charCodeAt(i) ^ cleanB.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const gatewayFreeSecret = Deno.env.get('GATEWAY_FREE_UPI_SECRET') || '';

    if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseAnonKey) {
      throw new Error('Server Supabase environment variables are not configured.');
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const body = await req.json();
    const action = String(body.action || '');

    // ==========================================================================
    // ACTION 1: DIRECT BANK CREDIT WEBHOOK FROM GOOGLE APPS SCRIPT (`Code.gs`)
    // ==========================================================================
    if (action === 'webhook_bank_credit') {
      const providedSecret =
        req.headers.get('x-gateway-free-secret') || String(body.secret || '');

      if (!gatewayFreeSecret || !timingSafeEqualString(providedSecret, gatewayFreeSecret)) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Unauthorized gateway-free webhook secret.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const paidAmount = Number(body.amount);
      const utr = String(body.utr || '').trim();
      const payerName = body.payer ? String(body.payer).trim() : null;
      const payerVpa = body.vpa ? String(body.vpa).trim() : null;
      const messageId = body.message_id ? String(body.message_id).trim() : null;
      const orderId = body.order_id ? String(body.order_id).trim() : null;

      if (!paidAmount || paidAmount <= 0 || !utr) {
        return new Response(
          JSON.stringify({ ok: false, error: 'amount and utr are required.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: rpcResult, error: rpcError } = await adminClient.rpc(
        'reconcile_gateway_free_upi_credit',
        {
          p_paid_amount: paidAmount,
          p_utr_number: utr,
          p_payer_name: payerName,
          p_payer_vpa: payerVpa,
          p_gmail_message_id: messageId,
          p_order_id: orderId,
        }
      );

      if (rpcError) throw rpcError;

      return new Response(JSON.stringify({ ok: true, result: rpcResult }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================================================
    // AUTHENTICATED CUSTOMER ACTIONS (`register_bridge` & `sync_order_status`)
    // ==========================================================================
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication session.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const orderId = String(body.order_id || '');
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'order_id is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: order, error: orderErr } = await adminClient
      .from('orders')
      .select('*, payments(*)')
      .eq('id', orderId)
      .eq('user_id', user.id)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: 'Order not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: storeSettings } = await adminClient
      .from('store_settings')
      .select('*')
      .eq('singleton_key', 'default')
      .maybeSingle();

    const appsScriptUrl =
      Deno.env.get('GATEWAY_FREE_APPS_SCRIPT_URL') ||
      storeSettings?.gateway_free_apps_script_url ||
      '';

    const paymentRow = Array.isArray(order.payments) ? order.payments[0] : null;

    // ==========================================================================
    // ACTION 2: REGISTER ORDER IN GOOGLE SHEET APPS SCRIPT (`action: register`)
    // ==========================================================================
    if (action === 'register_bridge') {
      if (!appsScriptUrl) {
        return new Response(
          JSON.stringify({
            ok: true,
            bridged: false,
            amount: Number(order.unique_payable_amount ?? order.final_amount).toFixed(2),
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const customer = order.customer_snapshot || {};
      const gsRes = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'register',
          site: 'timessellers',
          order_id: order.id,
          order_number: order.order_number,
          exact_amount: Number(order.unique_payable_amount ?? order.final_amount),
          name: customer.full_name || 'TIMESSELLERS Client',
          email: customer.email || `${order.order_number.toLowerCase()}@timessellers.com`,
          phone: customer.phone || '9999999999',
          website: '', // honeypot must be empty
        }),
      });

      const gsJson = await gsRes.json();
      if (gsJson.ok && gsJson.data && paymentRow) {
        await adminClient
          .from('payments')
          .update({
            gateway_free_reg_id: Number(gsJson.data.id) || null,
            gateway_free_token: String(gsJson.data.token || paymentRow.gateway_free_token || ''),
          })
          .eq('id', paymentRow.id);
      }

      return new Response(
        JSON.stringify({
          ok: true,
          bridged: Boolean(gsJson.ok),
          data: gsJson.data || null,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==========================================================================
    // ACTION 3: POLL / NUDGE GMAIL CHECK (`action: sync_order_status`)
    // ==========================================================================
    if (action === 'sync_order_status') {
      if (order.payment_status === 'confirmed') {
        return new Response(
          JSON.stringify({
            ok: true,
            status: 'Paid',
            payment_status: 'confirmed',
            utr: order.payment_reference,
            amount: Number(order.unique_payable_amount ?? order.final_amount).toFixed(2),
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If Apps Script URL is configured and we have a registration row ID, poll `action: status`
      // which triggers `checkPayments(1)` on the Apps Script side (at most every 20s)
      if (appsScriptUrl && paymentRow?.gateway_free_reg_id) {
        try {
          const gsRes = await fetch(appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'status',
              site: 'timessellers',
              id: paymentRow.gateway_free_reg_id,
              token: paymentRow.gateway_free_token,
            }),
          });
          const gsJson = await gsRes.json();
          if (gsJson.ok && gsJson.data?.status === 'Paid' && gsJson.data?.utr) {
            const { data: reconciled } = await adminClient.rpc(
              'reconcile_gateway_free_upi_credit',
              {
                p_paid_amount: Number(
                  gsJson.data.amount || order.unique_payable_amount || order.final_amount
                ),
                p_utr_number: String(gsJson.data.utr),
                p_payer_name: gsJson.data.payer || null,
                p_payer_vpa: gsJson.data.vpa || null,
                p_gmail_message_id: `gs_row_${paymentRow.gateway_free_reg_id}`,
                p_order_id: order.id,
              }
            );

            return new Response(
              JSON.stringify({
                ok: true,
                status: 'Paid',
                payment_status: 'confirmed',
                utr: gsJson.data.utr,
                reconciled,
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } catch {
          // Network blip to Apps Script — fall through and return current DB status
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          status:
            order.payment_status === 'payment_verification'
              ? 'Review'
              : paymentRow?.status === 'expired'
                ? 'Expired'
                : 'Pending',
          payment_status: order.payment_status,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
