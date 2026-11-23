// ==============================================================================
// TIMESSELLERS — LUXURY PRODUCT CARD COMPONENT
// Displays product image, name, category, selling price, original price,
// discount percentage, real product rating (never fabricated), stock status,
// Add to Cart button, and Wishlist toggle button.
// ==============================================================================

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, Star, Check } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { extractInventory, formatINR, getEffectivePrice, cn } from '@/lib/utils';
import type { Product } from '@/types/database';

export const ProductCard: React.FC<{ product: Product }> = ({ product }) => {
  const { addToCart, toggleWishlist, isInWishlist } = useCart();
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const inv = extractInventory(product);
  const availableQty = inv ? inv.available_quantity : 0;
  const isOutOfStock = availableQty <= 0;
  const isLowStock = availableQty > 0 && availableQty <= (inv?.low_stock_threshold ?? 5);

  const effectivePrice = getEffectivePrice(product);
  const originalPrice = product.original_price ? Number(product.original_price) : null;
  const hasDiscount = originalPrice !== null && originalPrice > effectivePrice;
  const discountPct = hasDiscount
    ? Math.round(((originalPrice - effectivePrice) / originalPrice) * 100)
    : 0;

  const wishlisted = isInWishlist(product.id);

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfStock || isAdding) return;

    setFeedbackError(null);
    setIsAdding(true);
    try {
      const firstActiveVariant =
        product.product_variants?.find((v) => v.is_active && v.available_stock > 0) ?? null;
      await addToCart(product, 1, firstActiveVariant);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1800);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Could not add item');
      setTimeout(() => setFeedbackError(null), 3500);
    } finally {
      setIsAdding(false);
    }
  };

  const handleWishlistClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFeedbackError(null);
    try {
      await toggleWishlist(product);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Sign in required');
      setTimeout(() => setFeedbackError(null), 3500);
    }
  };

  return (
    <div className="group relative bg-[var(--ts-bg-card)] border border-[var(--ts-border-subtle)] hover:border-[var(--ts-accent)]/50 transition-all duration-300 flex flex-col justify-between">
      {/* Top Media Container */}
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[var(--ts-bg-elevated)]">
        <Link to={`/product/${product.slug}`} className="block w-full h-full">
          <img
            src={product.main_image_url}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
          />
        </Link>

        {/* Top Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
          {hasDiscount && discountPct > 0 && (
            <span className="bg-[var(--ts-accent)] text-[var(--ts-on-accent)] px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.16em] uppercase">
              -{discountPct}%
            </span>
          )}
          {product.is_new_arrival && (
            <span className="bg-[var(--ts-bg-main)]/90 text-[var(--ts-text-primary)] border border-[var(--ts-border-strong)] px-2.5 py-0.5 text-[10px] tracking-[0.16em] uppercase">
              New Arrival
            </span>
          )}
          {isOutOfStock ? (
            <span className="bg-red-950/90 text-red-300 border border-red-800/60 px-2.5 py-0.5 text-[10px] tracking-[0.16em] uppercase">
              Out of Stock
            </span>
          ) : isLowStock ? (
            <span className="bg-amber-950/90 text-amber-300 border border-amber-800/60 px-2.5 py-0.5 text-[10px] tracking-[0.16em] uppercase">
              Only {availableQty} Left
            </span>
          ) : null}
        </div>

        {/* Wishlist Button */}
        <button
          type="button"
          onClick={handleWishlistClick}
          aria-label={wishlisted ? 'Remove from Wishlist' : 'Save to Wishlist'}
          className={cn(
            'absolute top-3 right-3 w-9 h-9 flex items-center justify-center border transition-colors cursor-pointer',
            wishlisted
              ? 'bg-[var(--ts-accent)] border-[var(--ts-accent)] text-[var(--ts-bg-main)]'
              : 'bg-[var(--ts-bg-main)]/80 border-[var(--ts-border-strong)] text-[var(--ts-text-primary)] hover:border-[var(--ts-accent)] hover:text-[var(--ts-accent)]'
          )}
        >
          <Heart className={cn('w-4 h-4', wishlisted && 'fill-current')} />
        </button>
      </div>

      {/* Product Metadata */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
            <span>{product.categories?.name || product.brand || 'TIMESSELLERS'}</span>
            <span
              className={cn(
                'tracking-[0.14em]',
                isOutOfStock
                  ? 'text-red-400'
                  : isLowStock
                    ? 'text-amber-400'
                    : 'text-emerald-400/90'
              )}
            >
              {isOutOfStock ? 'Unavailable' : isLowStock ? `${availableQty} in Stock` : 'In Stock'}
            </span>
          </div>

          <Link
            to={`/product/${product.slug}`}
            className="block font-serif-luxury text-lg text-[var(--ts-text-primary)] group-hover:text-[var(--ts-accent)] transition-colors line-clamp-1"
          >
            {product.name}
          </Link>

          {/* Honest Rating Display: Only shows stars when real verified reviews exist */}
          <div className="h-4 flex items-center gap-1.5">
            {product.review_count > 0 ? (
              <>
                <div className="flex items-center text-[var(--ts-accent)]">
                  <Star className="w-3 h-3 fill-current" />
                </div>
                <span className="text-xs text-[var(--ts-text-primary)] font-medium">
                  {Number(product.average_rating).toFixed(1)}
                </span>
                <span className="text-[11px] text-[var(--ts-text-muted)]">
                  ({product.review_count} {product.review_count === 1 ? 'review' : 'reviews'})
                </span>
              </>
            ) : (
              <span className="text-[11px] text-[var(--ts-text-faint)] italic">No client reviews yet</span>
            )}
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-[var(--ts-border-subtle)]">
          {/* Pricing */}
          <div className="flex items-baseline gap-2.5">
            <span className="text-base font-medium text-[var(--ts-text-primary)] tracking-wide">
              {formatINR(effectivePrice)}
            </span>
            {hasDiscount && originalPrice && (
              <span className="text-xs text-[var(--ts-text-muted)] line-through">
                {formatINR(originalPrice)}
              </span>
            )}
          </div>

          {feedbackError && (
            <p className="text-[11px] text-amber-400 leading-tight">{feedbackError}</p>
          )}

          {/* Add to Cart Button */}
          <button
            type="button"
            disabled={isOutOfStock || isAdding}
            onClick={handleAddToCart}
            className={cn(
              'w-full py-2.5 px-4 text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 border transition-all duration-200 cursor-pointer',
              isOutOfStock
                ? 'bg-[var(--ts-bg-elevated)] border-[var(--ts-border-subtle)] text-[var(--ts-text-faint)] cursor-not-allowed'
                : justAdded
                  ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                  : 'bg-[var(--ts-bg-elevated)] border-[var(--ts-border-strong)] text-[var(--ts-text-primary)] hover:bg-[var(--ts-accent)] hover:border-[var(--ts-accent)] hover:text-[var(--ts-on-accent)]'
            )}
          >
            {justAdded ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Added to Bag</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>{isOutOfStock ? 'Out of Stock' : isAdding ? 'Adding...' : 'Add to Cart'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
