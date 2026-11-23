// ==============================================================================
// TIMESSELLERS — CATALOG, PRODUCT & CATEGORY SERVICE
// Queries live Supabase PostgreSQL tables with filtering, sorting & pagination.
// ==============================================================================

import { supabase } from '@/lib/supabase';
import type { Category, Product, ProductReview } from '@/types/database';

export interface ProductFilterParams {
  categorySlug?: string;
  categoryId?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sortBy?: 'newest' | 'price_asc' | 'price_desc' | 'popular';
  isFeatured?: boolean;
  isNewArrival?: boolean;
  isBestSeller?: boolean;
  isTrending?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PaginatedProductsResult {
  products: Product[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const PRODUCT_SELECT_QUERY = `
  *,
  categories (*),
  inventory (*),
  product_images (*),
  product_variants (*),
  product_specifications (*)
`;

export async function fetchActiveCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Category[];
}

export async function fetchCategoryBySlug(slug: string): Promise<Category | null> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as Category | null) ?? null;
}

export async function fetchProducts(
  params: ProductFilterParams = {}
): Promise<PaginatedProductsResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, Math.min(48, params.pageSize ?? 12));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let resolvedCategoryId = params.categoryId;

  if (!resolvedCategoryId && params.categorySlug) {
    const category = await fetchCategoryBySlug(params.categorySlug);
    if (!category) {
      return {
        products: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }
    resolvedCategoryId = category.id;
  }

  let query = supabase
    .from('products')
    .select(PRODUCT_SELECT_QUERY, { count: 'exact' })
    .eq('status', 'active');

  if (resolvedCategoryId) {
    query = query.eq('category_id', resolvedCategoryId);
  }

  if (params.search && params.search.trim().length > 0) {
    const q = params.search.trim();
    query = query.or(`name.ilike.%${q}%,short_description.ilike.%${q}%,brand.ilike.%${q}%,sku.ilike.%${q}%`);
  }

  if (params.minPrice !== undefined && params.minPrice >= 0) {
    query = query.gte('selling_price', params.minPrice);
  }

  if (params.maxPrice !== undefined && params.maxPrice > 0) {
    query = query.lte('selling_price', params.maxPrice);
  }

  if (params.isFeatured !== undefined) {
    query = query.eq('is_featured', params.isFeatured);
  }

  if (params.isNewArrival !== undefined) {
    query = query.eq('is_new_arrival', params.isNewArrival);
  }

  if (params.isBestSeller !== undefined) {
    query = query.eq('is_best_seller', params.isBestSeller);
  }

  if (params.isTrending !== undefined) {
    query = query.eq('is_trending', params.isTrending);
  }

  switch (params.sortBy) {
    case 'price_asc':
      query = query.order('selling_price', { ascending: true });
      break;
    case 'price_desc':
      query = query.order('selling_price', { ascending: false });
      break;
    case 'popular':
      query = query.order('total_sold', { ascending: false }).order('created_at', { ascending: false });
      break;
    case 'newest':
    default:
      query = query.order('created_at', { ascending: false });
      break;
  }

  const { data, error, count } = await query.range(from, to);

  if (error) throw new Error(error.message);

  let products = (data ?? []) as Product[];

  if (params.inStockOnly) {
    products = products.filter((p) => {
      const inv = Array.isArray(p.inventory) ? p.inventory[0] : p.inventory;
      return inv ? inv.available_quantity > 0 : false;
    });
  }

  const totalCount = count ?? products.length;
  return {
    products,
    totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize),
  };
}

export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT_QUERY)
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const product = data as Product;
  if (product.product_images) {
    product.product_images.sort((a, b) => a.display_order - b.display_order);
  }
  if (product.product_specifications) {
    product.product_specifications.sort((a, b) => a.display_order - b.display_order);
  }
  return product;
}

export async function fetchProductReviews(productId: string): Promise<ProductReview[]> {
  const { data, error } = await supabase
    .from('product_reviews')
    .select('*, profiles(full_name, avatar_url)')
    .eq('product_id', productId)
    .eq('moderation_status', 'approved')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ProductReview[];
}

export async function checkCustomerReviewEligibility(
  userId: string,
  productId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_items!inner(product_id)')
    .eq('user_id', userId)
    .eq('delivery_status', 'delivered')
    .eq('payment_status', 'confirmed')
    .eq('order_items.product_id', productId)
    .limit(1);

  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

export async function submitProductReview(
  productId: string,
  rating: number,
  title: string,
  comment: string
): Promise<{ review_id: string; order_id: string }> {
  const { data, error } = await supabase.rpc('submit_verified_review', {
    p_product_id: productId,
    p_rating: rating,
    p_title: title,
    p_comment: comment,
  });

  if (error) throw new Error(error.message);
  return data as { review_id: string; order_id: string };
}
