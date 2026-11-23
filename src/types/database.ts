// ==============================================================================
// TIMESSELLERS — STRICT TYPESCRIPT DATABASE & DOMAIN MODELS
// Maps 1:1 with the 24 PostgreSQL tables in supabase/migrations/0001_initial_schema.sql
// ==============================================================================

export type UserRoleType = 'customer' | 'admin' | 'super_admin';

export type ProductStatus = 'active' | 'inactive' | 'archived';

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export type PaymentMethodType = 'upi_qr' | 'crypto';

export type OrderPaymentStatus =
  | 'pending_payment'
  | 'payment_verification'
  | 'confirmed'
  | 'failed'
  | 'refunded';

export type OrderDeliveryStatus =
  | 'pending_payment'
  | 'payment_verification'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  admin_username?: string | null;
  avatar_url: string | null;
  is_restricted: boolean;
  restriction_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: UserRoleType;
  assigned_by: string | null;
  created_at: string;
}

export interface Address {
  id: string;
  user_id: string;
  label: string;
  full_name: string;
  phone: string;
  house_building: string;
  street: string;
  landmark: string | null;
  city: string;
  state: string;
  pin_code: string;
  country: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  alt_text: string | null;
  display_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  variant_sku: string;
  size: string | null;
  color: string | null;
  color_hex: string | null;
  model: string | null;
  option_name: string | null;
  option_value: string | null;
  price_adjustment: number;
  available_stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductSpecification {
  id: string;
  product_id: string;
  spec_group: string;
  spec_key: string;
  spec_value: string;
  display_order: number;
  created_at: string;
}

export interface Inventory {
  id: string;
  product_id: string;
  sku: string;
  available_quantity: number;
  reserved_quantity: number;
  low_stock_threshold: number;
  stock_status: StockStatus;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  category_id: string | null;
  brand: string;
  short_description: string;
  full_description: string;
  selling_price: number;
  original_price: number | null;
  discount_percentage: number;
  scheduled_discount_price: number | null;
  scheduled_discount_start: string | null;
  scheduled_discount_end: string | null;
  main_image_url: string;
  is_featured: boolean;
  is_new_arrival: boolean;
  is_best_seller: boolean;
  is_trending: boolean;
  collection_tag: string | null;
  status: ProductStatus;
  average_rating: number;
  review_count: number;
  total_sold: number;
  created_at: string;
  updated_at: string;
  // Joined relations
  categories?: Category | null;
  inventory?: Inventory | Inventory[] | null;
  product_images?: ProductImage[];
  product_variants?: ProductVariant[];
  product_specifications?: ProductSpecification[];
}

export interface InventoryTransaction {
  id: string;
  inventory_id: string;
  product_id: string;
  order_id: string | null;
  transaction_type:
    | 'initial_stock'
    | 'restock'
    | 'payment_confirmed_deduction'
    | 'order_cancelled_restoration'
    | 'order_refunded_restoration'
    | 'admin_adjustment'
    | 'reservation'
    | 'reservation_release';
  quantity_change: number;
  previous_quantity: number;
  new_quantity: number;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  products?: Pick<Product, 'id' | 'name' | 'sku' | 'main_image_url'> | null;
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  created_at: string;
  updated_at: string;
  products?: Product;
  product_variants?: ProductVariant | null;
}

export interface WishlistItem {
  id: string;
  wishlist_id: string;
  product_id: string;
  created_at: string;
  products?: Product;
}

export interface DeliveryAddressSnapshot {
  full_name: string;
  phone: string;
  house_building: string;
  street: string;
  landmark?: string | null;
  city: string;
  state: string;
  pin_code: string;
  country?: string;
}

export interface CustomerSnapshot {
  user_id: string;
  full_name: string;
  phone: string;
  email: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_snapshot: Record<string, unknown>;
  sku_snapshot: string;
  product_name_snapshot: string;
  product_image_snapshot: string;
  variant_label_snapshot: string | null;
  quantity: number;
  unit_price_at_purchase: number;
  original_price_at_purchase: number | null;
  discount_at_purchase: number;
  total_price: number;
  created_at: string;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  previous_payment_status: OrderPaymentStatus | null;
  new_payment_status: OrderPaymentStatus;
  previous_delivery_status: OrderDeliveryStatus | null;
  new_delivery_status: OrderDeliveryStatus;
  note: string | null;
  changed_by: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  customer_snapshot: CustomerSnapshot;
  delivery_address_snapshot: DeliveryAddressSnapshot;
  subtotal_amount: number;
  discount_amount: number;
  shipping_amount: number;
  final_amount: number;
  unique_payable_amount?: number | null;
  paisa_code_discount?: number;
  payment_expires_at?: string | null;
  currency: string;
  payment_method: PaymentMethodType;
  payment_status: OrderPaymentStatus;
  delivery_status: OrderDeliveryStatus;
  payment_reference: string | null;
  tracking_number: string | null;
  courier_partner: string | null;
  tracking_url: string | null;
  inventory_deducted: boolean;
  cancellation_reason: string | null;
  refund_reason: string | null;
  refunded_amount: number | null;
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
  order_status_history?: OrderStatusHistory[];
  payments?: Payment[];
  payment_verifications?: PaymentVerification[];
}

export interface Payment {
  id: string;
  order_id: string;
  user_id: string;
  payment_method: PaymentMethodType;
  provider: string;
  amount: number;
  currency: string;
  crypto_currency: string | null;
  crypto_amount: number | null;
  crypto_address: string | null;
  provider_invoice_id: string | null;
  provider_payment_url: string | null;
  transaction_hash: string | null;
  utr_reference: string | null;
  gateway_free_reg_id?: number | null;
  gateway_free_token?: string | null;
  payer_name?: string | null;
  payer_vpa?: string | null;
  status:
    | 'pending'
    | 'submitted_for_verification'
    | 'confirmed'
    | 'failed'
    | 'expired'
    | 'rejected'
    | 'refunded';
  expires_at: string | null;
  confirmed_at: string | null;
  raw_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  orders?: Pick<Order, 'id' | 'order_number' | 'final_amount' | 'customer_snapshot'>;
}

export interface PaymentVerification {
  id: string;
  payment_id: string;
  order_id: string;
  user_id: string;
  utr_number: string;
  payer_upi_id: string | null;
  proof_image_url: string | null;
  customer_note: string | null;
  verification_status: 'pending' | 'approved' | 'rejected';
  verified_by: string | null;
  admin_remarks: string | null;
  submitted_at: string;
  verified_at: string | null;
  orders?: Order;
  payments?: Payment;
}

export interface PaymentWebhookEvent {
  id: string;
  provider: string;
  event_id: string;
  provider_invoice_id: string | null;
  order_id: string | null;
  event_type: string;
  signature_verified: boolean;
  processing_status: 'received' | 'processed' | 'ignored_duplicate' | 'failed';
  payload: Record<string, unknown>;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
}

export interface ProductReview {
  id: string;
  product_id: string;
  user_id: string;
  order_id: string;
  rating: number;
  title: string;
  comment: string;
  is_verified_purchase: boolean;
  moderation_status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Pick<Profile, 'full_name' | 'avatar_url'> | null;
}

export type LuxuryThemeId =
  | 'light_luxury_editorial'
  | 'obsidian_gold'
  | 'midnight_royal_platinum'
  | 'emerald_gold_heritage'
  | 'minimalist_monochrome';

export interface StoreSettings {
  id: string;
  singleton_key: string;
  store_name: string;
  store_tagline: string;
  active_theme?: LuxuryThemeId;
  logo_url: string | null;
  upi_id: string;
  upi_display_name: string;
  upi_qr_image_url: string | null;
  upi_payment_instructions: string;
  gateway_free_upi_enabled?: boolean;
  gateway_free_apps_script_url?: string | null;
  gateway_free_max_paise_window?: number;
  crypto_enabled: boolean;
  crypto_provider_name: string;
  supported_crypto_currencies: string[];
  currency_code: string;
  currency_symbol: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  about_story: string | null;
  shipping_policy_text: string | null;
  return_policy_text: string | null;
  privacy_policy_text: string | null;
  terms_text: string | null;
  updated_at: string;
}

export interface ShippingSettings {
  id: string;
  singleton_key: string;
  free_shipping_threshold: number;
  standard_shipping_charge: number;
  pan_india_delivery_enabled: boolean;
  estimated_delivery_days_min: number;
  estimated_delivery_days_max: number;
  updated_at: string;
}

export interface AdminAuditLog {
  id: string;
  admin_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'full_name' | 'phone'> | null;
}

export interface CheckoutQuoteLineItem {
  product_id: string;
  variant_id: string | null;
  name: string;
  sku: string;
  image_url: string;
  variant_label: string | null;
  quantity: number;
  unit_price: number;
  original_price: number;
  line_discount: number;
  line_total: number;
  available_stock: number;
}

export interface CheckoutQuote {
  items: CheckoutQuoteLineItem[];
  subtotal_amount: number;
  discount_amount: number;
  shipping_amount: number;
  free_shipping_threshold: number;
  final_amount: number;
  currency: string;
}

export interface SalesSeriesPoint {
  label: string;
  period_key: string;
  revenue: number;
  orders_count: number;
}

export interface BestSellerMetric {
  id: string;
  name: string;
  sku: string;
  main_image_url: string;
  selling_price: number;
  total_sold: number;
  total_revenue: number;
}

export interface AdminDashboardAnalytics {
  total_revenue: number;
  today_revenue: number;
  total_orders: number;
  pending_orders: number;
  confirmed_orders: number;
  delivered_orders: number;
  total_customers: number;
  total_products: number;
  low_stock_count: number;
  daily_sales: SalesSeriesPoint[];
  weekly_sales: SalesSeriesPoint[];
  monthly_sales: SalesSeriesPoint[];
  best_sellers: BestSellerMetric[];
}
