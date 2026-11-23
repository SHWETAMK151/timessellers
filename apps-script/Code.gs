/**
 * =============================================================================
 * TIMESSELLERS — Gateway-Free UPI Checkout Backend (`Code.gs`)
 * Adapted from https://github.com/Ujjawal99711/gateway-free-upi-checkout
 * =============================================================================
 *
 * How it works with TIMESSELLERS:
 * 1. When a customer places a UPI order on TIMESSELLERS, Supabase PostgreSQL
 *    (`allocate_unique_upi_amount`) assigns a unique decimal amount down to the
 *    paisa (e.g., ₹24,992.47 for a ₹25,000 timepiece) and generates a dynamic
 *    UPI QR code (`upi://pay?pa=...&am=24992.47&cu=INR`).
 * 2. The customer scans the QR and pays directly to your personal/business UPI ID.
 * 3. Your bank sends a "credited" email alert to your Gmail inbox.
 * 4. This script watches your Gmail inbox (1-minute trigger + live on-demand
 *    nudge when the customer's checkout page polls), verifies DMARC/DKIM
 *    authenticity, parses the exact paisa amount & 12-digit UTR, updates your
 *    Google Sheet (`Registrations`, `Payments`, `Review`), AND pushes an instant
 *    webhook to your TIMESSELLERS Supabase Edge Function (`gateway-free-upi`)
 *    so the order automatically flips to `Confirmed` and deducts stock!
 *
 * -----------------------------------------------------------------------------
 * SETUP
 * -----------------------------------------------------------------------------
 * 1. Create a Google Sheet with 3 tabs, named exactly:
 *    - `Registrations` — header row:
 *      Timestamp | Name | Email | Phone | Amount | Status | PaidAt | Payer | PayerVPA | UTR | InviteSentAt | Notes | Token
 *    - `Payments` — header row:
 *      Timestamp | Amount | Payer | PayerVPA | UTR | MatchedEmail | MessageId
 *    - `Review` — header row:
 *      Timestamp | Reason | Amount | Payer | UTR | Related | Status | Notes
 * 2. Open Extensions > Apps Script, paste this entire file into `Code.gs`.
 * 3. Edit `CONFIG` below with:
 *    - `UPI_ID` & `PAYEE_NAME`
 *    - `BANK_SENDER` (your bank's alert email address)
 *    - `SUPABASE_WEBHOOK_URL` (your deployed `gateway-free-upi` Edge Function URL)
 *    - `SUPABASE_WEBHOOK_SECRET` (matches `GATEWAY_FREE_UPI_SECRET` in Supabase secrets)
 * 4. Run `setup()` once from the Apps Script editor dropdown and approve permissions.
 * 5. Deploy > New deployment > Web app > Execute as: "Me", Who has access: "Anyone".
 * 6. Copy the deployed `/exec` URL and paste it into TIMESSELLERS `/admin/settings`
 *    (or set `GATEWAY_FREE_APPS_SCRIPT_URL` in Supabase Edge Function secrets).
 * =============================================================================
 */

var CONFIG = {
  UPI_ID: 'shwetanksingh@yesfam',                    // Your personal or business UPI ID
  PAYEE_NAME: 'SHWETANK SINGH',                      // Display name in UPI apps
  STALE_MINUTES: 45,                                 // Unpaid slot reuse window
  BANK_SENDER: 'alerts@yesbank.in',                  // From: address of your bank's credit alerts (or famapp/hdfc/etc.)
  TZ: 'Asia/Kolkata',
  // TIMESSELLERS Supabase Edge Function Webhook Bridge:
  SUPABASE_WEBHOOK_URL: 'https://youixtxcfluaskmylqmp.supabase.co/functions/v1/gateway-free-upi',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdWl4dHhjZmx1YXNrbXlscW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzMTUxNzQsImV4cCI6MjExMDg5MTE3NH0.mKVZ4-kQmnbIEdHkuI24qX2_VCgDKFCzw0LvG_B97U0',
  SUPABASE_WEBHOOK_SECRET: 'replace-with-your-gateway-free-upi-secret'
};

var SITES = {
  default: {
    minPaise: 101,
    maxPaise: 99999999,
    senderName: 'TIMESSELLERS Maison',
    title: 'TIMESSELLERS Luxury Order',
    when: '',
    link: ''
  },
  timessellers: {
    minPaise: 101,
    maxPaise: 99999999,
    senderName: 'TIMESSELLERS Maison',
    title: 'TIMESSELLERS Luxury Acquisition',
    when: '',
    link: ''
  }
};

function siteOf_(key) { return SITES[key] ? key : 'default'; }

var REG = { AT: 1, NAME: 2, EMAIL: 3, PHONE: 4, AMOUNT: 5, STATUS: 6, PAID_AT: 7, PAYER: 8, PAYER_VPA: 9, UTR: 10, INVITE_AT: 11, NOTES: 12, TOKEN: 13 };
var PAY = { AT: 1, AMOUNT: 2, PAYER: 3, PAYER_VPA: 4, UTR: 5, MATCHED: 6, MSG_ID: 7 };

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'TIMESSELLERS Gateway-Free UPI Watcher' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * JSON API called by TIMESSELLERS frontend or Supabase Edge Function.
 * Sent as text/plain to avoid CORS preflight:
 *   {"action":"register","name":"..","email":"..","phone":"..","exact_amount":190.47,"order_id":"...","order_number":"TS-...","site":"timessellers"}
 *   {"action":"status","id":12,"token":"...","site":"timessellers"}
 */
function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'register') {
      if (body.website) throw new Error('Something went wrong. Please try again.');
      out = { ok: true, data: register(body) };
    } else if (body.action === 'status') {
      out = { ok: true, data: getStatus(body.id, body.token) };
    } else {
      throw new Error('Unknown action');
    }
  } catch (err) {
    out = { ok: false, error: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Registers a buyer in the Google Sheet.
 * Supports both standalone dynamic paise allocation AND pre-allocated exact_amount
 * passed from TIMESSELLERS Supabase `allocate_unique_upi_amount`.
 */
function register(form) {
  var name = String(form.name || 'Valued Client').trim();
  var email = String(form.email || 'concierge@timessellers.com').trim().toLowerCase();
  var phone = String(form.phone || '').replace(/[^\d+]/g, '');
  var site = siteOf_(form.site);
  var range = SITES[site];
  var orderId = String(form.order_id || '').trim();
  var orderNumber = String(form.order_number || '').trim();
  var preAllocatedAmount = Number(form.exact_amount || 0);

  if (name.length < 2) throw new Error('Please enter your name.');
  if (phone.replace(/\D/g, '').length < 10) throw new Error('Please enter a valid phone number.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_('Registrations');
    var now = new Date();
    var today = dayKey_(now);
    var staleMs = CONFIG.STALE_MINUTES * 60000;
    var taken = {};
    var stale = {};
    var last = sh.getLastRow();

    if (last >= 2) {
      var rows = sh.getRange(2, 1, last - 1, REG.TOKEN).getValues();
      for (var i = 0; i < rows.length; i++) {
        var at = rows[i][REG.AT - 1];
        var st = rows[i][REG.STATUS - 1];
        var rowNotes = String(rows[i][REG.NOTES - 1] || '');
        if (!(at instanceof Date) || dayKey_(at) !== today || st === 'Refunded') continue;
        var amt = toPaise_(rows[i][REG.AMOUNT - 1]);

        if (st === 'Pending') {
          if (orderId && rowNotes.indexOf('order_id:' + orderId) !== -1) {
            var existingTok = String(rows[i][REG.TOKEN - 1] || '');
            return regResult_(i + 2, amt / 100, orderNumber || name, existingTok);
          }
          if (now.getTime() - at.getTime() > staleMs) { stale[amt] = i + 2; continue; }
        }
        if (st === 'Expired') { if (!(amt in stale)) stale[amt] = 0; continue; }
        taken[amt] = true;
      }
    }

    var amount;
    if (preAllocatedAmount > 0) {
      amount = Math.round(preAllocatedAmount * 100) / 100;
    } else {
      var fresh = [], reusable = [];
      for (var p = range.minPaise; p <= Math.min(range.maxPaise, range.minPaise + 2000); p++) {
        if (p % 100 === 0 || taken[p]) continue;
        if (p in stale) reusable.push(p); else fresh.push(p);
      }
      var paise;
      if (fresh.length) {
        paise = fresh[Math.floor(Math.random() * fresh.length)];
      } else if (reusable.length) {
        paise = reusable[0];
      } else {
        throw new Error('All payment slots for today are taken.');
      }
      amount = paise / 100;
    }

    var token = newToken_();
    var noteMeta = [
      site === 'default' ? '' : 'site:' + site,
      orderId ? 'order_id:' + orderId : '',
      orderNumber ? 'order_no:' + orderNumber : ''
    ].filter(Boolean).join(' | ');

    sh.appendRow([now, name, email, phone, amount, 'Pending', '', '', '', '', '', noteMeta, token]);
    return regResult_(sh.getLastRow(), amount, orderNumber || name, token);
  } finally {
    lock.releaseLock();
  }
}

function regResult_(row, amount, label, token) {
  return {
    id: row,
    token: token,
    amount: amount.toFixed(2),
    upiUrl: upiUrl_(amount, 'Order ' + label),
    upiId: CONFIG.UPI_ID,
    payee: CONFIG.PAYEE_NAME
  };
}

function newToken_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 20); }

function getStatus(id, token) {
  id = Number(id);
  var cache = CacheService.getScriptCache();
  if (!cache.get('recentCheck')) {
    cache.put('recentCheck', '1', 20);
    try { checkPayments(1); } catch (e) { console.error(e); }
  }
  var sh = sheet_('Registrations');
  if (!id || id < 2 || id > sh.getLastRow()) return { status: 'Unknown' };
  var r = sh.getRange(id, 1, 1, REG.TOKEN).getValues()[0];
  var out = { status: r[REG.STATUS - 1] };
  if (token && String(token) === String(r[REG.TOKEN - 1]) && out.status === 'Paid') {
    out.amount = Number(r[REG.AMOUNT - 1]).toFixed(2);
    out.utr = String(r[REG.UTR - 1]);
    out.payer = String(r[REG.PAYER - 1] || '');
    out.vpa = String(r[REG.PAYER_VPA - 1] || '');
  }
  return out;
}

/**
 * Watches Gmail for bank credit alerts, matches by exact paise amount,
 * updates Google Sheets, AND notifies TIMESSELLERS Supabase Edge Function.
 */
function checkPayments(lockWaitMs) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(typeof lockWaitMs === 'number' ? lockWaitMs : 15000)) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var since = Number(props.getProperty('watchSince') || 0);
    var paySh = sheet_('Payments');
    var regSh = sheet_('Registrations');
    var reviewSh = sheet_('Review');

    var seen = {};
    var pl = paySh.getLastRow();
    if (pl >= 2) paySh.getRange(2, PAY.MSG_ID, pl - 1, 1).getValues().forEach(function (v) { seen[String(v[0])] = true; });
    var rl = reviewSh.getLastRow();
    if (rl >= 2) reviewSh.getRange(2, 7, rl - 1, 1).getValues().forEach(function (v) {
      var m = String(v[0]).match(/msg:([\w-]+)/); if (m) seen[m[1]] = true;
    });

    // Search for UPI credit alerts from your configured bank OR any FamApp / Yes Bank / standard bank UPI credit email
    var searchQuery = CONFIG.BANK_SENDER
      ? '(from:' + CONFIG.BANK_SENDER + ' OR "shwetanksingh@yesfam" OR "UPI Reference" OR "credited") "credited" newer_than:2d'
      : '"credited" newer_than:2d';
    var threads = GmailApp.search(searchQuery, 0, 30);
    var found = [];
    threads.forEach(function (t) {
      t.getMessages().forEach(function (m) {
        if (seen[m.getId()]) return;
        if (m.getDate().getTime() < since) return;
        found.push(m);
      });
    });
    found.sort(function (a, b) { return a.getDate() - b.getDate(); });

    found.forEach(function (m) {
      var p = parseBankCredit_(htmlToText_(m.getBody()));
      if (!p) { addReview_(reviewSh, m.getDate(), 'Could not parse bank alert email', '', '', '', '', m.getId()); return; }
      if (!looksAuthentic_(m)) {
        addReview_(reviewSh, m.getDate(), 'Sender failed DMARC/DKIM verification', p.amount, p.payer, p.utr, '', m.getId());
        return;
      }
      if (pl >= 2 && paySh.getRange(2, PAY.UTR, paySh.getLastRow() - 1, 1).getValues().some(function (v) { return String(v[0]) === p.utr; })) {
        addReview_(reviewSh, m.getDate(), 'UPI reference already used', p.amount, p.payer, p.utr, '', m.getId());
        return;
      }

      var match = findPending_(regSh, p.paise, m.getDate());
      var matchedEmail = '';
      var extractedOrderId = null;

      if (match) {
        matchedEmail = match.email;
        extractedOrderId = match.orderId;
        regSh.getRange(match.row, REG.STATUS, 1, 5).setValues([['Paid', m.getDate(), p.payer, p.vpa, p.utr]]);
      }

      // Push verified bank credit to TIMESSELLERS Supabase Edge Function (`gateway-free-upi`)
      // Note: Even if the buyer wasn't registered in the Google Sheet first, Supabase matches
      // the exact paise amount against `public.orders.unique_payable_amount`!
      var supabaseMatched = notifySupabaseBridge_(p, m.getId(), extractedOrderId);

      if (!match && !supabaseMatched) {
        addReview_(reviewSh, m.getDate(), 'No pending registration with this exact amount today', p.amount, p.payer, p.utr, '', m.getId());
      }

      paySh.appendRow([m.getDate(), p.amount, p.payer, p.vpa, p.utr, matchedEmail || (supabaseMatched ? 'Matched in Supabase' : 'No match (see Review)'), m.getId()]);
      pl = paySh.getLastRow();
    });
  } finally {
    lock.releaseLock();
  }
}

function notifySupabaseBridge_(parsedCredit, messageId, orderId) {
  if (!CONFIG.SUPABASE_WEBHOOK_URL || CONFIG.SUPABASE_WEBHOOK_URL.indexOf('your-project-ref') !== -1) {
    return false;
  }
  try {
    var resp = UrlFetchApp.fetch(CONFIG.SUPABASE_WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'x-gateway-free-secret': CONFIG.SUPABASE_WEBHOOK_SECRET
      },
      payload: JSON.stringify({
        action: 'webhook_bank_credit',
        amount: parsedCredit.amount,
        utr: parsedCredit.utr,
        payer: parsedCredit.payer,
        vpa: parsedCredit.vpa,
        message_id: messageId,
        order_id: orderId
      }),
      muteHttpExceptions: true
    });
    var json = JSON.parse(resp.getContentText() || '{}');
    return Boolean(json.ok && json.result && json.result.status === 'confirmed');
  } catch (e) {
    console.error('Supabase webhook push error:', e);
    return false;
  }
}

function findPending_(regSh, paise, paidAt) {
  var last = regSh.getLastRow();
  if (last < 2) return null;
  var rows = regSh.getRange(2, 1, last - 1, REG.NOTES).getValues();
  var paidDay = dayKey_(paidAt);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var at = r[REG.AT - 1];
    if (r[REG.STATUS - 1] !== 'Pending' || !(at instanceof Date)) continue;
    if (dayKey_(at) !== paidDay) continue;
    if (at.getTime() > paidAt.getTime() + 60000) continue;
    if (toPaise_(r[REG.AMOUNT - 1]) !== paise) continue;
    var notes = String(r[REG.NOTES - 1] || '');
    var m = notes.match(/order_id:([0-9a-fA-F-]{36})/);
    return {
      row: i + 2,
      name: r[REG.NAME - 1],
      email: r[REG.EMAIL - 1],
      orderId: m ? m[1] : null
    };
  }
  return null;
}

/**
 * Multi-bank UPI credit email parser (HDFC, ICICI, SBI, Axis, Kotak).
 */
function parseBankCredit_(text) {
  var a = text.match(/(?:Rs\.?|INR|₹)\s*([\d,]+\.\d{2})\s+(?:has been|is)\s+(?:successfully\s+)?credited/i);
  if (!a) return null;
  var amount = Number(a[1].replace(/,/g, ''));
  var s = text.match(/Sender:\s*(.*?)\s*\(VPA:\s*([^)]+)\)/i) || text.match(/from\s+([^\s]+@[^\s.]+)/i);
  var u = text.match(/(?:UPI Reference No\.?|Ref No\.?|UTR|RRN):?\s*(\d{12})/i);
  if (!u) return null;
  return {
    amount: amount,
    paise: Math.round(amount * 100),
    payer: s && s[2] ? s[1].trim() : '',
    vpa: s ? (s[2] ? s[2].trim() : s[1].trim()) : '',
    utr: u[1]
  };
}

function looksAuthentic_(m) {
  var auth = String(m.getHeader('Authentication-Results') || '').toLowerCase();
  if (!auth) return true;
  // Verify the email passed Google's own DMARC or DKIM cryptographic check
  return /dmarc=pass/.test(auth) || /dkim=pass/.test(auth);
}

function addReview_(sh, at, reason, amount, payer, utr, related, msgId) {
  sh.appendRow([at, reason, amount, payer, utr || '', related, 'Open (msg:' + msgId + ')', '']);
}

function sheet_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Tab "' + name + '" not found');
  return sh;
}
function dayKey_(d) { return Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd'); }
function toPaise_(v) { return Math.round(Number(v) * 100); }
function htmlToText_(h) {
  return String(h).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ');
}
function upiUrl_(amount, note) {
  return 'upi://pay?pa=' + CONFIG.UPI_ID + '&pn=' + encodeURIComponent(CONFIG.PAYEE_NAME) +
    '&am=' + amount.toFixed(2) + '&cu=INR&tn=' + encodeURIComponent(note.slice(0, 40));
}

function setup() {
  PropertiesService.getScriptProperties().setProperty('watchSince', String(Date.now()));
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkPayments') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkPayments').timeBased().everyMinutes(1).create();
  GmailApp.getInboxUnreadCount();
  sheet_('Registrations'); sheet_('Payments'); sheet_('Review');
  Logger.log('TIMESSELLERS Gateway-Free UPI setup complete. Deploy as a Web App.');
}
