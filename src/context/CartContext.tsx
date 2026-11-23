// ==============================================================================
// TIMESSELLERS — SHOPPING CART & WISHLIST CONTEXT
// Syncs cart & wishlist with Supabase PostgreSQL for authenticated users,
// validates live stock limits, and computes authoritative server-side totals.
// ==============================================================================

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { extractInventory, getEffectivePrice } from '@/lib/utils';
import type { Product, ProductVariant } from '@/types/database';

export interface ActiveCartItem {
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  product: Product;
  variant: ProductVariant | null;
}

interface LocalCartEntry {
  product_id: string;
  variant_id: string | null;
  quantity: number;
}

const LOCAL_CART_STORAGE_KEY = 'timessellers_guest_bag_v1';

interface CartContextValue {
  items: ActiveCartItem[];
  wishlistProductIds: string[];
  wishlistProducts: Product[];
  itemCount: number;
  estimatedSubtotal: number;
  isLoading: boolean;
  addToCart: (product: Product, quantity?: number, variant?: ProductVariant | null) => Promise<void>;
  updateQuantity: (productId: string, variantId: string | null, quantity: number) => Promise<void>;
  removeFromCart: (productId: string, variantId: string | null) => Promise<void>;
  clearCart: () => Promise<void>;
  toggleWishlist: (product: Product) => Promise<boolean>;
  isInWishlist: (productId: string) => boolean;
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [items, setItems] = useState<ActiveCartItem[]>([]);
  const [wishlistProducts, setWishlistProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const getAvailableStockForEntry = (product: Product, variant: ProductVariant | null): number => {
    const inv = extractInventory(product);
    const baseStock = inv ? inv.available_quantity : 0;
    if (variant) {
      return Math.min(baseStock, variant.available_stock);
    }
    return baseStock;
  };

  const ensureUserCartId = useCallback(async (userId: string): Promise<string> => {
    const { data: existing } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: created, error } = await supabase
      .from('carts')
      .insert({ user_id: userId })
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    return created.id;
  }, []);

  const ensureUserWishlistId = useCallback(async (userId: string): Promise<string> => {
    const { data: existing } = await supabase
      .from('wishlists')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: created, error } = await supabase
      .from('wishlists')
      .insert({ user_id: userId })
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    return created.id;
  }, []);

  const loadCart = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setIsLoading(true);
    try {
      if (user) {
        const cartId = await ensureUserCartId(user.id);

        // Merge any guest cart entries into the user's database cart on login
        const rawGuest = localStorage.getItem(LOCAL_CART_STORAGE_KEY);
        if (rawGuest) {
          try {
            const guestEntries = JSON.parse(rawGuest) as LocalCartEntry[];
            for (const entry of guestEntries) {
              if (entry.quantity > 0) {
                await supabase.from('cart_items').upsert(
                  {
                    cart_id: cartId,
                    product_id: entry.product_id,
                    variant_id: entry.variant_id,
                    quantity: entry.quantity,
                  },
                  { onConflict: 'cart_id,product_id,variant_id' }
                );
              }
            }
            localStorage.removeItem(LOCAL_CART_STORAGE_KEY);
          } catch {
            localStorage.removeItem(LOCAL_CART_STORAGE_KEY);
          }
        }

        const { data: dbItems } = await supabase
          .from('cart_items')
          .select(`
            id,
            product_id,
            variant_id,
            quantity,
            products (*, categories(*), inventory(*), product_variants(*)),
            product_variants (*)
          `)
          .eq('cart_id', cartId)
          .order('created_at', { ascending: true });

        const mapped: ActiveCartItem[] = (dbItems ?? [])
          .filter((row) => row.products)
          .map((row) => ({
            id: row.id,
            product_id: row.product_id,
            variant_id: row.variant_id,
            quantity: row.quantity,
            product: row.products as unknown as Product,
            variant: (row.product_variants as unknown as ProductVariant | null) ?? null,
          }));

        setItems(mapped);
      } else {
        // Guest cart hydrated from live product records in Supabase
        const rawGuest = localStorage.getItem(LOCAL_CART_STORAGE_KEY);
        if (!rawGuest) {
          setItems([]);
          return;
        }
        const guestEntries = JSON.parse(rawGuest) as LocalCartEntry[];
        if (!Array.isArray(guestEntries) || guestEntries.length === 0) {
          setItems([]);
          return;
        }

        const productIds = Array.from(new Set(guestEntries.map((e) => e.product_id)));
        const { data: liveProducts } = await supabase
          .from('products')
          .select('*, categories(*), inventory(*), product_variants(*)')
          .in('id', productIds)
          .eq('status', 'active');

        const productMap = new Map<string, Product>();
        (liveProducts ?? []).forEach((p) => productMap.set(p.id, p as Product));

        const hydrated: ActiveCartItem[] = [];
        for (const entry of guestEntries) {
          const prod = productMap.get(entry.product_id);
          if (!prod) continue;
          const matchedVariant = entry.variant_id
            ? prod.product_variants?.find((v) => v.id === entry.variant_id) ?? null
            : null;
          hydrated.push({
            id: `${entry.product_id}:${entry.variant_id ?? 'base'}`,
            product_id: entry.product_id,
            variant_id: entry.variant_id,
            quantity: entry.quantity,
            product: prod,
            variant: matchedVariant,
          });
        }
        setItems(hydrated);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user, ensureUserCartId]);

  const loadWishlist = useCallback(async () => {
    if (!isSupabaseConfigured || !user) {
      setWishlistProducts([]);
      return;
    }

    const wishlistId = await ensureUserWishlistId(user.id);
    const { data } = await supabase
      .from('wishlist_items')
      .select('id, product_id, products(*, categories(*), inventory(*))')
      .eq('wishlist_id', wishlistId)
      .order('created_at', { ascending: false });

    const prods = (data ?? [])
      .map((row) => row.products as unknown as Product | null)
      .filter((p): p is Product => Boolean(p));

    setWishlistProducts(prods);
  }, [user, ensureUserWishlistId]);

  useEffect(() => {
    void loadCart();
    void loadWishlist();
  }, [loadCart, loadWishlist]);

  const saveGuestEntries = (entries: LocalCartEntry[]) => {
    localStorage.setItem(LOCAL_CART_STORAGE_KEY, JSON.stringify(entries));
  };

  const addToCart = async (
    product: Product,
    quantity = 1,
    variant: ProductVariant | null = null
  ) => {
    const availStock = getAvailableStockForEntry(product, variant);
    if (availStock <= 0) {
      throw new Error(`"${product.name}" is currently out of stock.`);
    }

    const existing = items.find(
      (i) => i.product_id === product.id && i.variant_id === (variant?.id ?? null)
    );
    const desiredQty = (existing?.quantity ?? 0) + quantity;

    if (desiredQty > availStock) {
      throw new Error(
        `Cannot add more than available inventory (${availStock} available for "${product.name}").`
      );
    }

    if (user) {
      const cartId = await ensureUserCartId(user.id);
      if (existing) {
        const { error } = await supabase
          .from('cart_items')
          .update({ quantity: desiredQty })
          .eq('id', existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('cart_items').insert({
          cart_id: cartId,
          product_id: product.id,
          variant_id: variant?.id ?? null,
          quantity: desiredQty,
        });
        if (error) throw new Error(error.message);
      }
      await loadCart();
    } else {
      const nextEntries: LocalCartEntry[] = items.map((i) => ({
        product_id: i.product_id,
        variant_id: i.variant_id,
        quantity: i.quantity,
      }));
      const idx = nextEntries.findIndex(
        (e) => e.product_id === product.id && e.variant_id === (variant?.id ?? null)
      );
      if (idx >= 0) {
        nextEntries[idx].quantity = desiredQty;
      } else {
        nextEntries.push({
          product_id: product.id,
          variant_id: variant?.id ?? null,
          quantity: desiredQty,
        });
      }
      saveGuestEntries(nextEntries);
      await loadCart();
    }
  };

  const updateQuantity = async (
    productId: string,
    variantId: string | null,
    quantity: number
  ) => {
    if (quantity <= 0) {
      await removeFromCart(productId, variantId);
      return;
    }

    const target = items.find((i) => i.product_id === productId && i.variant_id === variantId);
    if (!target) return;

    const availStock = getAvailableStockForEntry(target.product, target.variant);
    if (quantity > availStock) {
      throw new Error(`Maximum available stock for "${target.product.name}" is ${availStock}.`);
    }

    if (user) {
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity })
        .eq('id', target.id);
      if (error) throw new Error(error.message);
      await loadCart();
    } else {
      const nextEntries = items.map((i) => ({
        product_id: i.product_id,
        variant_id: i.variant_id,
        quantity: i.product_id === productId && i.variant_id === variantId ? quantity : i.quantity,
      }));
      saveGuestEntries(nextEntries);
      await loadCart();
    }
  };

  const removeFromCart = async (productId: string, variantId: string | null) => {
    const target = items.find((i) => i.product_id === productId && i.variant_id === variantId);
    if (!target) return;

    if (user) {
      await supabase.from('cart_items').delete().eq('id', target.id);
      await loadCart();
    } else {
      const nextEntries = items
        .filter((i) => !(i.product_id === productId && i.variant_id === variantId))
        .map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id,
          quantity: i.quantity,
        }));
      saveGuestEntries(nextEntries);
      await loadCart();
    }
  };

  const clearCart = async () => {
    if (user) {
      const cartId = await ensureUserCartId(user.id);
      await supabase.from('cart_items').delete().eq('cart_id', cartId);
    }
    localStorage.removeItem(LOCAL_CART_STORAGE_KEY);
    setItems([]);
  };

  const toggleWishlist = async (product: Product): Promise<boolean> => {
    if (!user) {
      throw new Error('Please sign in with your phone number to save pieces to your wishlist.');
    }
    const wishlistId = await ensureUserWishlistId(user.id);
    const exists = wishlistProducts.some((p) => p.id === product.id);

    if (exists) {
      await supabase
        .from('wishlist_items')
        .delete()
        .eq('wishlist_id', wishlistId)
        .eq('product_id', product.id);
      await loadWishlist();
      return false;
    } else {
      await supabase.from('wishlist_items').insert({
        wishlist_id: wishlistId,
        product_id: product.id,
      });
      await loadWishlist();
      return true;
    }
  };

  const isInWishlist = (productId: string): boolean => {
    return wishlistProducts.some((p) => p.id === productId);
  };

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const estimatedSubtotal = items.reduce((sum, item) => {
    const base = getEffectivePrice(item.product);
    const adj = Number(item.variant?.price_adjustment ?? 0);
    return sum + (base + adj) * item.quantity;
  }, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        wishlistProductIds: wishlistProducts.map((p) => p.id),
        wishlistProducts,
        itemCount,
        estimatedSubtotal,
        isLoading,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        toggleWishlist,
        isInWishlist,
        refreshCart: loadCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return ctx;
}
