// ==============================================================================
// TIMESSELLERS — SHOPPING CART PAGE (/cart)
// Displays products, variants, available stock, quantity adjustments, item removal,
// live free-shipping progress bar (₹499), and server-calculated price quote.
// ==============================================================================

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Trash2,
  Minus,
  Plus,
  ShoppingBag,
  ArrowRight,
  Truck,
  ShieldCheck,
} from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { getServerCheckoutQuote } from '@/services/orderService';
import { extractInventory, formatINR, getEffectivePrice } from '@/lib/utils';
import {
  Button,
  EmptyState,
  ErrorBanner,
} from '@/components/ui/LuxuryPrimitives';
import type { CheckoutQuote } from '@/types/database';

export const CartPage: React.FC = () => {
  const { items, updateQuantity, removeFromCart, clearCart, estimatedSubtotal } = useCart();
  const { shippingSettings } = useStoreSettings();
  const navigate = useNavigate();

  const [serverQuote, setServerQuote] = useState<CheckoutQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchQuote = async () => {
      if (items.length === 0) {
        setServerQuote(null);
        return;
      }
      setQuoteLoading(true);
      try {
        const quote = await getServerCheckoutQuote(
          items.map((i) => ({
            product_id: i.product_id,
            variant_id: i.variant_id,
            quantity: i.quantity,
          }))
        );
        if (active) setServerQuote(quote);
      } catch {
        // Fallback to local calculation if RPC fails
      } finally {
        if (active) setQuoteLoading(false);
      }
    };
    void fetchQuote();
    return () => {
      active = false;
    };
  }, [items]);

  const handleQtyChange = async (
    productId: string,
    variantId: string | null,
    newQty: number
  ) => {
    setError(null);
    try {
      await updateQuantity(productId, variantId, newQty);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update quantity');
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20">
        <EmptyState
          title="Your Shopping Bag is Empty"
          description="Explore our horological collections, fine leather goods, rare perfumes, and luxury objects to add creations to your bag."
          icon={<ShoppingBag className="w-5 h-5" />}
          action={
            <Link to="/shop">
              <Button variant="gold" size="md" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Explore Collections
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const subtotal = serverQuote ? serverQuote.subtotal_amount : estimatedSubtotal;
  const freeThreshold = serverQuote
    ? serverQuote.free_shipping_threshold
    : shippingSettings.free_shipping_threshold;
  const shippingCharge = serverQuote
    ? serverQuote.shipping_amount
    : subtotal >= freeThreshold
      ? 0
      : shippingSettings.standard_shipping_charge;
  const discountAmount = serverQuote ? serverQuote.discount_amount : 0;
  const finalAmount = serverQuote ? serverQuote.final_amount : subtotal + shippingCharge;
  const remainingForFreeShipping = Math.max(0, freeThreshold - subtotal);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <div className="border-b border-[var(--ts-border-subtle)] pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
            Your Selection
          </p>
          <h1 className="font-serif-luxury text-3xl sm:text-5xl text-[var(--ts-text-primary)]">
            Shopping Bag
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void clearCart()}
          className="text-xs uppercase tracking-[0.18em] text-[var(--ts-text-muted)] hover:text-red-400 transition-colors cursor-pointer self-start sm:self-auto"
        >
          Empty Bag
        </button>
      </div>

      {/* Complimentary Shipping Threshold Progress */}
      <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-4 flex items-center gap-3 text-xs">
        <Truck className="w-4 h-4 text-[var(--ts-accent)] shrink-0" />
        {remainingForFreeShipping === 0 ? (
          <span className="text-emerald-300">
            Your order qualifies for <strong>Complimentary Insured Pan-India Delivery</strong> (Orders above {formatINR(freeThreshold)}).
          </span>
        ) : (
          <span className="text-[var(--ts-text-secondary)]">
            Add <strong className="text-[var(--ts-accent)]">{formatINR(remainingForFreeShipping)}</strong>{' '}
            more to unlock Complimentary Insured Shipping (Threshold: {formatINR(freeThreshold)}).
          </span>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Cart Line Items */}
        <div className="lg:col-span-8 space-y-4">
          {items.map((item) => {
            const inv = extractInventory(item.product);
            const baseAvail = inv ? inv.available_quantity : 0;
            const maxAvail = item.variant
              ? Math.min(baseAvail, item.variant.available_stock)
              : baseAvail;
            const unitPrice =
              getEffectivePrice(item.product) + Number(item.variant?.price_adjustment ?? 0);
            const lineTotal = unitPrice * item.quantity;

            const variantParts = [
              item.variant?.color,
              item.variant?.size,
              item.variant?.model,
              item.variant?.option_value,
            ].filter(Boolean);

            return (
              <div
                key={`${item.product_id}:${item.variant_id ?? 'base'}`}
                className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-4 sm:p-6 flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between"
              >
                <div className="flex items-center gap-5">
                  <Link
                    to={`/product/${item.product.slug}`}
                    className="w-24 h-28 bg-[var(--ts-bg-elevated)] border border-[var(--ts-border-subtle)] shrink-0 overflow-hidden"
                  >
                    <img
                      src={item.product.main_image_url}
                      alt={item.product.name}
                      className="w-full h-full object-cover"
                    />
                  </Link>

                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
                      {item.product.brand} • SKU: {item.variant?.variant_sku || item.product.sku}
                    </p>
                    <Link
                      to={`/product/${item.product.slug}`}
                      className="font-serif-luxury text-xl text-[var(--ts-text-primary)] hover:text-[var(--ts-accent)] transition-colors block"
                    >
                      {item.product.name}
                    </Link>

                    {variantParts.length > 0 && (
                      <p className="text-xs text-[var(--ts-accent)]">
                        Variant: {variantParts.join(' / ')}
                      </p>
                    )}

                    <p className="text-[11px] text-[var(--ts-text-muted)]">
                      Unit Price: {formatINR(unitPrice)} • Available Stock: {maxAvail}
                    </p>
                  </div>
                </div>

                <div className="w-full sm:w-auto flex sm:flex-col items-center sm:items-end justify-between gap-4 border-t sm:border-t-0 border-[var(--ts-border-subtle)] pt-3 sm:pt-0">
                  <span className="font-serif-luxury text-xl text-[var(--ts-text-primary)]">
                    {formatINR(lineTotal)}
                  </span>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center border border-[var(--ts-border-strong)] bg-[var(--ts-bg-main)]">
                      <button
                        type="button"
                        onClick={() =>
                          void handleQtyChange(
                            item.product_id,
                            item.variant_id,
                            item.quantity - 1
                          )
                        }
                        className="p-2 text-[var(--ts-text-secondary)] hover:text-[var(--ts-text-primary)] cursor-pointer"
                        aria-label="Decrease"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-3.5 text-xs font-medium text-[var(--ts-text-primary)]">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={item.quantity >= maxAvail}
                        onClick={() =>
                          void handleQtyChange(
                            item.product_id,
                            item.variant_id,
                            item.quantity + 1
                          )
                        }
                        className="p-2 text-[var(--ts-text-secondary)] hover:text-[var(--ts-text-primary)] disabled:opacity-30 cursor-pointer"
                        aria-label="Increase"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => void removeFromCart(item.product_id, item.variant_id)}
                      className="p-2 text-[var(--ts-text-muted)] hover:text-red-400 transition-colors cursor-pointer"
                      aria-label="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Order Summary Sidebar */}
        <div className="lg:col-span-4">
          <div className="border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] p-6 sm:p-8 space-y-6 sticky top-28">
            <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)] border-b border-[var(--ts-border-subtle)] pb-4">
              Order Summary
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between text-[var(--ts-text-secondary)]">
                <span>Subtotal</span>
                <span className="text-[var(--ts-text-primary)]">{formatINR(subtotal)}</span>
              </div>

              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Privilege Savings</span>
                  <span>-{formatINR(discountAmount)}</span>
                </div>
              )}

              <div className="flex justify-between text-[var(--ts-text-secondary)]">
                <span>Pan-India Insured Shipping</span>
                <span className="text-[var(--ts-text-primary)]">
                  {shippingCharge === 0 ? (
                    <span className="text-emerald-400 uppercase tracking-wider">Complimentary</span>
                  ) : (
                    formatINR(shippingCharge)
                  )}
                </span>
              </div>

              <div className="border-t border-[var(--ts-border-subtle)] pt-4 flex justify-between items-baseline">
                <span className="text-xs uppercase tracking-[0.2em] text-[var(--ts-text-primary)]">
                  Payable Total
                </span>
                <span className="font-serif-luxury text-2xl text-[var(--ts-accent)]">
                  {formatINR(finalAmount)}
                </span>
              </div>
            </div>

            {quoteLoading && (
              <p className="text-[11px] text-[var(--ts-text-muted)]">
                Synchronizing authoritative server prices...
              </p>
            )}

            <Button
              variant="gold"
              size="lg"
              className="w-full"
              onClick={() => navigate('/checkout')}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Proceed to Checkout
            </Button>

            <div className="pt-4 border-t border-[var(--ts-border-subtle)] space-y-2 text-[11px] text-[var(--ts-text-muted)]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[var(--ts-accent)] shrink-0" />
                <span>Prices &amp; inventory verified server-side on order placement</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
