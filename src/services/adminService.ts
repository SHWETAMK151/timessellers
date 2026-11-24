// ==============================================================================
// TIMESSELLERS — ADMINISTRATIVE SERVICE
// All privileged operations are protected by Supabase RLS + server-side `is_admin()` checks.
// ==============================================================================

import { supabase } from '@/lib/supabase';
import type {
  AdminAuditLog,
  AdminDashboardAnalytics,
  Category,
  Inventory,
  InventoryTransaction,
  Order,
  OrderDeliveryStatus,
  Payment,
  PaymentVerification,
  PaymentWebhookEvent,
  Product,
  ProductStatus,
  Profile,
  ShippingSettings,
  StoreSettings,
} from '@/types/database';

export async function fetchAdminAnalytics(): Promise<AdminDashboardAnalytics> {
  const { data, error } = await supabase.rpc('admin_get_dashboard_analytics');
  if (error) throw new Error(error.message);
  return data as AdminDashboardAnalytics;
}

export async function fetchAdminRecentOrders(limit = 10): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), payments(*)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}

export async function fetchAllAdminProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      categories (*),
      inventory (*),
      product_images (*),
      product_variants (*),
      product_specifications (*)
    `)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Product[];
}

export interface UpsertProductInput {
  id?: string;
  name: string;
  slug: string;
  sku: string;
  category_id: string | null;
  brand: string;
  short_description: string;
  full_description: string;
  selling_price: number;
  original_price: number | null;
  scheduled_discount_price?: number | null;
  scheduled_discount_start?: string | null;
  scheduled_discount_end?: string | null;
  main_image_url: string;
  video_url?: string | null;
  is_featured: boolean;
  is_new_arrival: boolean;
  is_best_seller: boolean;
  is_trending: boolean;
  collection_tag: string | null;
  status: ProductStatus;
  available_stock: number;
  low_stock_threshold: number;
  additional_images: { image_url: string; alt_text?: string; display_order: number }[];
  variants: {
    id?: string;
    variant_sku: string;
    size?: string | null;
    color?: string | null;
    color_hex?: string | null;
    model?: string | null;
    option_name?: string | null;
    option_value?: string | null;
    price_adjustment: number;
    available_stock: number;
    is_active: boolean;
  }[];
  specifications: {
    spec_group: string;
    spec_key: string;
    spec_value: string;
    display_order: number;
  }[];
}

export async function saveAdminProduct(input: UpsertProductInput): Promise<Product> {
  const productPayload = {
    name: input.name.trim(),
    slug: input.slug.trim(),
    sku: input.sku.trim().toUpperCase(),
    category_id: input.category_id || null,
    brand: input.brand.trim() || 'TIMESSELLERS',
    short_description: input.short_description.trim(),
    full_description: input.full_description.trim(),
    selling_price: Number(input.selling_price),
    original_price: input.original_price ? Number(input.original_price) : null,
    scheduled_discount_price: input.scheduled_discount_price
      ? Number(input.scheduled_discount_price)
      : null,
    scheduled_discount_start: input.scheduled_discount_start || null,
    scheduled_discount_end: input.scheduled_discount_end || null,
    main_image_url: input.main_image_url.trim(),
    video_url: input.video_url?.trim() || null,
    is_featured: input.is_featured,
    is_new_arrival: input.is_new_arrival,
    is_best_seller: input.is_best_seller,
    is_trending: input.is_trending,
    collection_tag: input.collection_tag?.trim() || null,
    status: input.status,
  };

  let productId = input.id;

  if (productId) {
    const { error: updateErr } = await supabase
      .from('products')
      .update(productPayload)
      .eq('id', productId);
    if (updateErr) throw new Error(updateErr.message);
  } else {
    const { data: created, error: createErr } = await supabase
      .from('products')
      .insert(productPayload)
      .select('*')
      .single();
    if (createErr) throw new Error(createErr.message);
    productId = created.id;
  }

  if (!productId) throw new Error('Product ID missing after save.');

  // Upsert Inventory
  const { data: existingInv } = await supabase
    .from('inventory')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle();

  if (existingInv) {
    await supabase.rpc('admin_adjust_inventory', {
      p_product_id: productId,
      p_new_quantity: Number(input.available_stock),
      p_low_stock_threshold: Number(input.low_stock_threshold),
      p_notes: 'Inventory updated via Admin Product Manager',
    });
  } else {
    const { data: newInv, error: invErr } = await supabase
      .from('inventory')
      .insert({
        product_id: productId,
        sku: productPayload.sku,
        available_quantity: Number(input.available_stock),
        low_stock_threshold: Number(input.low_stock_threshold),
      })
      .select('*')
      .single();
    if (invErr) throw new Error(invErr.message);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from('inventory_transactions').insert({
      inventory_id: newInv.id,
      product_id: productId,
      transaction_type: 'initial_stock',
      quantity_change: Number(input.available_stock),
      previous_quantity: 0,
      new_quantity: Number(input.available_stock),
      notes: 'Initial product stock configured on creation',
      performed_by: user?.id ?? null,
    });
  }

  // Sync product_images
  await supabase.from('product_images').delete().eq('product_id', productId);
  if (input.additional_images.length > 0) {
    const imgRows = input.additional_images.map((img, idx) => ({
      product_id: productId,
      image_url: img.image_url,
      alt_text: img.alt_text || input.name,
      display_order: img.display_order ?? idx,
      is_primary: idx === 0,
    }));
    const { error: imgErr } = await supabase.from('product_images').insert(imgRows);
    if (imgErr) throw new Error(imgErr.message);
  }

  // Sync product_variants
  await supabase.from('product_variants').delete().eq('product_id', productId);
  if (input.variants.length > 0) {
    const varRows = input.variants.map((v) => ({
      product_id: productId,
      variant_sku: v.variant_sku.trim().toUpperCase(),
      size: v.size?.trim() || null,
      color: v.color?.trim() || null,
      color_hex: v.color_hex?.trim() || null,
      model: v.model?.trim() || null,
      option_name: v.option_name?.trim() || null,
      option_value: v.option_value?.trim() || null,
      price_adjustment: Number(v.price_adjustment || 0),
      available_stock: Number(v.available_stock || 0),
      is_active: v.is_active ?? true,
    }));
    const { error: varErr } = await supabase.from('product_variants').insert(varRows);
    if (varErr) throw new Error(varErr.message);
  }

  // Sync product_specifications
  await supabase.from('product_specifications').delete().eq('product_id', productId);
  if (input.specifications.length > 0) {
    const specRows = input.specifications
      .filter((s) => s.spec_key.trim() && s.spec_value.trim())
      .map((s, idx) => ({
        product_id: productId,
        spec_group: s.spec_group.trim() || 'Specifications',
        spec_key: s.spec_key.trim(),
        spec_value: s.spec_value.trim(),
        display_order: s.display_order ?? idx,
      }));
    if (specRows.length > 0) {
      const { error: specErr } = await supabase.from('product_specifications').insert(specRows);
      if (specErr) throw new Error(specErr.message);
    }
  }

  const { data: refreshed, error: refreshErr } = await supabase
    .from('products')
    .select(`
      *,
      categories (*),
      inventory (*),
      product_images (*),
      product_variants (*),
      product_specifications (*)
    `)
    .eq('id', productId)
    .single();

  if (refreshErr) throw new Error(refreshErr.message);
  return refreshed as Product;
}

export async function updateAdminProductStatus(
  productId: string,
  status: ProductStatus
): Promise<void> {
  const { error } = await supabase.from('products').update({ status }).eq('id', productId);
  if (error) throw new Error(error.message);
}

export async function deleteAdminProduct(productId: string): Promise<void> {
  // Note: order_items uses ON DELETE SET NULL with immutable JSON snapshots,
  // so deleting a product NEVER destroys historical order records.
  const { error } = await supabase.from('products').delete().eq('id', productId);
  if (error) throw new Error(error.message);
}

// Categories Management
export async function fetchAllAdminCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Category[];
}

export async function saveAdminCategory(
  input: Partial<Category> & { name: string; slug: string }
): Promise<Category> {
  const payload = {
    name: input.name.trim(),
    slug: input.slug.trim(),
    description: input.description?.trim() || null,
    image_url: input.image_url?.trim() || null,
    display_order: Number(input.display_order ?? 0),
    is_active: input.is_active ?? true,
    is_featured: input.is_featured ?? false,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from('categories')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as Category;
  } else {
    const { data, error } = await supabase
      .from('categories')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as Category;
  }
}

export async function deleteAdminCategory(categoryId: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', categoryId);
  if (error) throw new Error(error.message);
}

// Orders Management
export async function fetchAllAdminOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (*),
      order_status_history (*),
      payments (*),
      payment_verifications (*)
    `)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}

export async function adminUpdateOrderStatus(params: {
  orderId: string;
  newDeliveryStatus: OrderDeliveryStatus;
  trackingNumber?: string;
  courierPartner?: string;
  trackingUrl?: string;
  note?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('admin_update_order_lifecycle', {
    p_order_id: params.orderId,
    p_new_delivery_status: params.newDeliveryStatus,
    p_tracking_number: params.trackingNumber ?? null,
    p_courier_partner: params.courierPartner ?? null,
    p_tracking_url: params.trackingUrl ?? null,
    p_note: params.note ?? null,
  });

  if (error) throw new Error(error.message);
}

// Payments & Verification Queue
export async function fetchAdminPaymentVerifications(): Promise<PaymentVerification[]> {
  const { data, error } = await supabase
    .from('payment_verifications')
    .select(`
      *,
      orders (*),
      payments (*)
    `)
    .order('submitted_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as PaymentVerification[];
}

export async function adminDecideUpiVerification(
  verificationId: string,
  decision: 'approved' | 'rejected',
  remarks?: string
): Promise<void> {
  const { error } = await supabase.rpc('admin_verify_upi_payment', {
    p_verification_id: verificationId,
    p_decision: decision,
    p_admin_remarks: remarks ?? null,
  });

  if (error) throw new Error(error.message);
}

export async function fetchAdminAllPayments(): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*, orders(id, order_number, final_amount, customer_snapshot)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Payment[];
}

export async function fetchAdminWebhookEvents(): Promise<PaymentWebhookEvent[]> {
  const { data, error } = await supabase
    .from('payment_webhook_events')
    .select('*')
    .order('received_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return (data ?? []) as PaymentWebhookEvent[];
}

// Inventory Management
export async function fetchAdminInventoryList(): Promise<
  (Inventory & { products: Pick<Product, 'id' | 'name' | 'slug' | 'main_image_url' | 'selling_price' | 'status'> })[]
> {
  const { data, error } = await supabase
    .from('inventory')
    .select('*, products(id, name, slug, main_image_url, selling_price, status)')
    .order('available_quantity', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as (Inventory & {
    products: Pick<Product, 'id' | 'name' | 'slug' | 'main_image_url' | 'selling_price' | 'status'>;
  })[];
}

export async function fetchAdminInventoryTransactions(
  limit = 100
): Promise<InventoryTransaction[]> {
  const { data, error } = await supabase
    .from('inventory_transactions')
    .select('*, products(id, name, sku, main_image_url)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryTransaction[];
}

export async function adminAdjustProductInventory(params: {
  productId: string;
  newQuantity: number;
  lowStockThreshold?: number;
  notes: string;
}): Promise<void> {
  const { error } = await supabase.rpc('admin_adjust_inventory', {
    p_product_id: params.productId,
    p_new_quantity: params.newQuantity,
    p_low_stock_threshold: params.lowStockThreshold ?? null,
    p_notes: params.notes,
  });

  if (error) throw new Error(error.message);
}

// Customers Management (Combines registered profiles + guest checkout buyers from orders)
export async function fetchAdminCustomers(): Promise<(Profile & { orders?: Order[] })[]> {
  const [profilesRes, guestOrdersRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('*, orders(id, order_number, final_amount, payment_status, delivery_status, created_at)')
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('id, order_number, final_amount, payment_status, delivery_status, created_at, customer_snapshot, delivery_address_snapshot')
      .is('user_id', null)
      .order('created_at', { ascending: false }),
  ]);

  if (profilesRes.error) throw new Error(profilesRes.error.message);

  const registered = (profilesRes.data ?? []) as (Profile & { orders?: Order[] })[];
  const guestMap = new Map<string, Profile & { orders: Order[] }>();

  for (const ord of guestOrdersRes.data ?? []) {
    const cust = (ord.customer_snapshot || {}) as {
      full_name?: string;
      phone?: string;
      email?: string | null;
    };
    const addr = (ord.delivery_address_snapshot || {}) as {
      full_name?: string;
      phone?: string;
      email?: string | null;
    };
    const phone = cust.phone || addr.phone || `guest-${ord.id.slice(0, 8)}`;
    const existing = guestMap.get(phone);
    if (existing) {
      existing.orders.push(ord as unknown as Order);
    } else {
      guestMap.set(phone, {
        id: `guest-${phone}`,
        full_name: cust.full_name || addr.full_name || 'Guest Client',
        phone,
        email: cust.email || addr.email || null,
        avatar_url: null,
        is_restricted: false,
        restriction_reason: null,
        created_at: ord.created_at,
        updated_at: ord.created_at,
        orders: [ord as unknown as Order],
      });
    }
  }

  return [...Array.from(guestMap.values()), ...registered];
}

export async function adminSetCustomerRestriction(
  userId: string,
  isRestricted: boolean,
  reason?: string
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      is_restricted: isRestricted,
      restriction_reason: isRestricted ? reason || 'Account restricted by administrator.' : null,
    })
    .eq('id', userId);

  if (error) throw new Error(error.message);
}

// Store & Shipping Settings
export async function updateAdminStoreSettings(
  settings: Partial<StoreSettings>
): Promise<StoreSettings> {
  const { data, error } = await supabase
    .from('store_settings')
    .update({
      ...settings,
      updated_at: new Date().toISOString(),
    })
    .eq('singleton_key', 'default')
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as StoreSettings;
}

export async function updateAdminShippingSettings(
  settings: Partial<ShippingSettings>
): Promise<ShippingSettings> {
  const { data, error } = await supabase
    .from('shipping_settings')
    .update({
      ...settings,
      updated_at: new Date().toISOString(),
    })
    .eq('singleton_key', 'default')
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as ShippingSettings;
}

export async function fetchAdminAuditLogs(limit = 50): Promise<AdminAuditLog[]> {
  const { data, error } = await supabase
    .from('admin_audit_logs')
    .select('*, profiles(full_name, phone)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as AdminAuditLog[];
}

export interface InstagramSyncResult {
  ok: boolean;
  fetched_count: number;
  imported_count: number;
  skipped_count: number;
  error_count: number;
  details: Array<{
    media_id: string;
    product_id?: string;
    name?: string;
    images_count?: number;
    status: string;
    reason?: string;
  }>;
  error?: string;
}

export async function syncInstagramProducts(limit = 12): Promise<InstagramSyncResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Administrator session expired. Please sign in again.');
  }

  const { data, error } = await supabase.functions.invoke<InstagramSyncResult>('instagram-ai-sync', {
    body: { limit },
  });

  if (error) {
    throw new Error(error.message || 'Instagram AI sync failed.');
  }
  if (!data || !data.ok) {
    throw new Error(data?.error || 'Instagram AI sync failed.');
  }
  return data;
}
