# TIMESSELLERS — Luxury E-Commerce Platform

TIMESSELLERS is a full-stack luxury e-commerce application engineered with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS**, **Framer Motion**, **Lucide React**, and **Supabase** (**PostgreSQL**, **Phone OTP Authentication**, **Storage**, **Row Level Security**, and **Edge Functions**).

---

## 1. Architecture & Key Capabilities

### Three Isolated Experiences
1. **Public Customer Storefront**:
   - `/` — Luxury Landing Page (Hero, Featured Categories, Trending Creations, New Arrivals, Featured Collections, Best Sellers, Promotional Banner, Brand Introduction, Private Registry Newsletter, Footer).
   - `/shop` & `/shop/:category` — Full catalog browsing with search, category filter, price range filter, availability filter, sorting (`newest`, `popular`, `price_asc`, `price_desc`), and pagination.
   - `/product/:slug` — Detailed product showcase with zoomable gallery, thumbnail switcher, dynamic variants (only those configured), technical specifications, live stock counter, quantity selector, Add to Cart, Buy Now, and Verified Purchase Customer Reviews.
   - `/cart` — Server-synced shopping bag with live stock limits and free-shipping threshold indicator (`₹499`).
   - `/login` — Supabase Phone Number + SMS OTP authentication.
   - Legal & Trust Dossiers: `/about`, `/contact`, `/shipping-policy`, `/return-policy`, `/privacy-policy`, `/terms`.
2. **Authenticated Customer Dashboard (`/account/*` & `/checkout`)**:
   - `/checkout` — Indian delivery address validation (6-digit PIN code, State/UT selector), server-side quote calculation (`calculate_checkout_quote`), and dual payment settlement:
     - **UPI QR Payment**: Displays corporate UPI ID & QR code, accepts 12-digit UTR/reference number (with database-level duplicate UTR rejection) and optional payment proof upload.
     - **Cryptocurrency Payment**: Invokes `crypto-create-invoice` Edge Function and reconciles payment confirmation exclusively via HMAC-verified provider webhooks (`crypto-webhook`).
   - `/account` — Client Overview.
   - `/account/orders` & `/account/orders/:id` — Order history and 6-stage visual delivery milestone tracking with chronological status ledger.
   - `/account/profile` — Profile management & avatar upload.
   - `/account/addresses` — Pan-India delivery addresses CRUD & default selection.
   - `/account/wishlist` — Saved luxury pieces.
3. **Restricted Administrative Control Panel (`/admin/*`)**:
   - Enforced on both frontend (`ProtectedAdminRoute`) and backend (`public.is_admin()` in RLS & RPCs). No public admin registration exists.
   - `/admin` — Real-time revenue, today's revenue, order counters, low-stock alerts, daily/weekly/monthly sales & order graphs, best-selling products, and recent transactions.
   - `/admin/products` — Full product CRUD, multi-image upload & ordering via Supabase Storage, variants editor, technical specifications editor, scheduled discounts, and archive/publish controls. Deleting a product never destroys historical order items (`ON DELETE SET NULL` + immutable JSON snapshots).
   - `/admin/categories` — Category CRUD, image upload, display ordering, and activation toggles for the 10 initial departments (`Goggles`, `Men's Purses`, `Ladies' Purses`, `Men's Watches`, `Ladies' Watches`, `Perfumes`, `Shoes`, `Headphones`, `Smartwatches`, `Electronics`).
   - `/admin/orders` — Order search, status filtering, 9-stage lifecycle progression, AWB tracking input, cancellation, and refund processing with automatic atomic inventory restoration.
   - `/admin/payments` — Manual UPI verification queue (inspect UTR & uploaded proof, Approve/Reject with atomic stock deduction), crypto payment ledger, and raw webhook event monitor.
   - `/admin/inventory` — Real-time inventory status, low-stock filter, atomic stock adjustments, and transaction ledger (`inventory_transactions`).
   - `/admin/customers` — Client directory, order history inspection, and account restriction controls.
   - `/admin/analytics` — Deep-dive daily/weekly/monthly revenue & order charts + immutable administrative audit log (`admin_audit_logs`).
   - `/admin/settings` — Store branding, UPI ID, UPI QR code uploader, and configurable shipping threshold (`₹499` default).

---

## 2. Project Setup & Installation

### Prerequisites
- Node.js `v20+` (tested on `v24.18.0`)
- A Supabase project ([https://supabase.com](https://supabase.com))
- Supabase CLI (optional, for deploying Edge Functions locally)

### Install Dependencies
```bash
cd d:\tools\timessellers
npm install
```

---

## 3. Environment Variables Configuration

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` and supply your public Supabase project URL and anonymous key:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key-here
VITE_EDGE_FUNCTIONS_URL=
```

> **Security Rule**: Never place `SUPABASE_SERVICE_ROLE_KEY`, `CRYPTO_PROVIDER_API_KEY`, or `CRYPTO_WEBHOOK_SECRET` in `.env.local` or any `VITE_`-prefixed variable. Those belong strictly in Supabase Edge Function secrets.

---

## 4. Database Migrations (24 Tables, RLS & Atomic RPCs)

Execute the SQL migration files in `supabase/migrations/` in numerical order inside the **Supabase SQL Editor** (or via `supabase db push`):

1. `supabase/migrations/0001_initial_schema.sql` — Creates all 24 normalized PostgreSQL tables (`profiles`, `user_roles`, `addresses`, `categories`, `products`, `product_images`, `product_variants`, `product_specifications`, `inventory`, `inventory_transactions`, `carts`, `cart_items`, `wishlists`, `wishlist_items`, `orders`, `order_items`, `order_status_history`, `payments`, `payment_verifications`, `payment_webhook_events`, `product_reviews`, `store_settings`, `shipping_settings`, `admin_audit_logs`), foreign keys, indexes, and triggers.
2. `supabase/migrations/0002_rls_and_security.sql` — Enables Row Level Security on all 24 tables, creates `public.is_admin()`, and defines strict customer-isolation and admin-authorization policies.
3. `supabase/migrations/0003_functions_and_rpcs.sql` — Creates server-side transactional RPCs:
   - `calculate_checkout_quote`
   - `create_order_secure`
   - `submit_upi_payment_proof`
   - `admin_verify_upi_payment`
   - `confirm_crypto_payment_webhook`
   - `admin_update_order_lifecycle`
   - `admin_adjust_inventory`
   - `submit_verified_review`
4. `supabase/migrations/0004_initial_categories_and_settings.sql` — Seeds the 10 luxury categories, default store & shipping settings (`₹499` free shipping threshold), storage buckets, and the `admin_get_dashboard_analytics` RPC.
5. `supabase/migrations/0005_gateway_free_upi_checkout.sql` — Adds **Gateway-Free UPI Checkout** (`Ujjawal99711/gateway-free-upi-checkout`) with atomic daily unique paisa-level amount allocation (`allocate_unique_upi_amount`) and automatic bank credit email reconciliation (`reconcile_gateway_free_upi_credit`).

### Granting Administrator Access
Because there is no public admin registration, promote an authenticated user to administrator by running the following query in the Supabase SQL Editor (replace with the user's phone number or UUID):

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'
FROM public.profiles
WHERE phone = '+919876543210'
ON CONFLICT (user_id, role) DO NOTHING;
```

---

## 5. Supabase Storage Configuration

Migration `0004_initial_categories_and_settings.sql` automatically provisions five storage buckets with strict MIME-type and file-size constraints:
- `product-images` (Public read, Admin write, max 5MB, JPEG/PNG/WEBP/AVIF)
- `category-images` (Public read, Admin write, max 5MB, JPEG/PNG/WEBP/AVIF)
- `store-assets` (Public read, Admin write, max 5MB, JPEG/PNG/WEBP/SVG)
- `avatars` (Public read, Authenticated user write to own folder, max 2MB)
- `payment-proofs` (Private bucket, Authenticated customer write to own folder, Customer/Admin read via signed URLs, max 5MB, JPEG/PNG/WEBP/PDF)

---

## 6. Phone OTP Authentication Setup

1. In your Supabase Dashboard, navigate to **Authentication → Providers → Phone**.
2. Enable **Phone Provider**.
3. Configure your SMS provider (Twilio, MessageBird, Vonage, or Textlocal for India `+91`).
4. For development/staging testing without live SMS dispatch, you can configure test phone numbers and static OTPs under **Authentication → Providers → Phone → Test Phone Numbers** in Supabase.

---

## 7. Payment Provider & Edge Functions Setup

### A. Gateway-Free UPI Checkout (`Ujjawal99711/gateway-free-upi-checkout`)
TIMESSELLERS integrates the **Gateway-Free UPI Checkout** architecture so you can accept UPI payments directly to your personal or business UPI ID with **automatic payment confirmation** and zero payment-gateway fees:

1. **How the Paisa-Level Order ID Works**:
   - When a customer places a UPI order on TIMESSELLERS, PostgreSQL (`allocate_unique_upi_amount` in `0005_gateway_free_upi_checkout.sql`) assigns the order a **unique decimal amount down to the paisa** for today (e.g., `₹24,993.47` for a `₹25,000` timepiece — always at or slightly under the base price so the customer never overpays, and never a round `.00` rupee amount).
   - The checkout screen ([CheckoutPage.tsx](file:///d:/tools/timessellers/src/pages/storefront/CheckoutPage.tsx)) dynamically generates a UPI QR code encoded with that exact paisa amount (`upi://pay?pa=...&am=24993.47&cu=INR`).
   - When the customer pays, your bank emails a `"credited"` alert to your Gmail inbox.
2. **Setting Up the Google Sheet & Gmail Watcher (`apps-script/Code.gs`)**:
   - Create a Google Sheet with 3 tabs named `Registrations`, `Payments`, and `Review` (exact headers are listed at the top of [apps-script/Code.gs](file:///d:/tools/timessellers/apps-script/Code.gs)).
   - Open **Extensions → Apps Script**, paste the contents of [apps-script/Code.gs](file:///d:/tools/timessellers/apps-script/Code.gs), and fill in `CONFIG` (`UPI_ID`, `PAYEE_NAME`, `BANK_SENDER`, `SUPABASE_WEBHOOK_URL`, and `SUPABASE_WEBHOOK_SECRET`).
   - Run `setup()` once in the Apps Script editor to authorize Gmail/Sheets and install the 1-minute trigger.
   - Click **Deploy → New deployment → Web app** (Execute as: *Me*, Who has access: *Anyone*) and copy the `/exec` URL.
3. **Deploying the Supabase Bridge Edge Function (`gateway-free-upi`)**:
   ```bash
   supabase functions deploy gateway-free-upi --no-verify-jwt
   supabase secrets set GATEWAY_FREE_UPI_SECRET=your_shared_secret
   supabase secrets set GATEWAY_FREE_APPS_SCRIPT_URL=https://script.google.com/macros/s/XXXXXXXX/exec
   ```
   - You can also configure the Apps Script `/exec` URL and the maximum paisa discount window directly in the Admin Dashboard at `/admin/settings`.
   - While on the checkout screen, the page polls every 12 seconds (`pollGatewayFreeUpiStatus`) — nudging `checkPayments()` on Apps Script and confirming the order automatically within ~1 minute of payment. An expandable **Manual UTR / Receipt Fallback** drawer is also available on the checkout page and in `/admin/payments`.

### B. Cryptocurrency Payment & Webhook Verification
Deploy the two Edge Functions in `supabase/functions/`:

```bash
supabase functions deploy crypto-create-invoice
supabase functions deploy crypto-webhook --no-verify-jwt
```

Configure the server-side secrets (supports `nowpayments` or `coinbase_commerce`):

```bash
supabase secrets set CRYPTO_PROVIDER=nowpayments
supabase secrets set CRYPTO_PROVIDER_API_KEY=your_provider_api_key
supabase secrets set CRYPTO_WEBHOOK_SECRET=your_ipn_hmac_secret
supabase secrets set CRYPTO_IPN_CALLBACK_URL=https://your-project-ref.supabase.co/functions/v1/crypto-webhook
```

---

## 8. Running, Testing & Deployment

### Development Server
```bash
npm run dev
```

### Type-Checking, Automated Tests & Production Build
```bash
npm run typecheck
npm test
npm run build
```

### Deployment (Vercel / Netlify)
- **Vercel**: Import the project directory; `vercel.json` is pre-configured for SPA routing. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel project environment variables.
- **Netlify**: Import the project directory; `netlify.toml` is pre-configured with `npm run build`, publish directory `dist`, and SPA redirect rules.
