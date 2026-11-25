// ==============================================================================
// TIMESSELLERS — PRODUCT DETAIL PAGE (/product/:slug)
// Displays multi-image zoomable gallery with thumbnails, dynamic variants
// (only those actually configured), specifications, stock status, quantity
// selector, Add to Cart, Buy Now, and Verified Purchase Customer Reviews.
// ==============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Heart,
  ShoppingBag,
  Zap,
  Star,
  ShieldCheck,
  Truck,
  ZoomIn,
  Check,
  Minus,
  Plus,
  CheckCircle2,
  Play,
} from 'lucide-react';
import {
  fetchProductBySlug,
  fetchProductReviews,
  checkCustomerReviewEligibility,
  submitProductReview,
} from '@/services/catalogService';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import {
  extractInventory,
  formatINR,
  formatDate,
  getEffectivePrice,
  cn,
  sanitizeHttpUrl,
} from '@/lib/utils';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  Skeleton,
} from '@/components/ui/LuxuryPrimitives';
import type { Product, ProductReview, ProductVariant } from '@/types/database';

export const ProductDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToCart, toggleWishlist, isInWishlist } = useCart();
  const { shippingSettings } = useStoreSettings();

  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Gallery state
  const [activeImageUrl, setActiveImageUrl] = useState<string>('');
  const [showVideo, setShowVideo] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });

  // Variant & Quantity state
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  // Review submission state
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  const loadProductData = useCallback(async () => {
    if (!slug) return;
    setIsLoading(true);
    setError(null);
    try {
      const prod = await fetchProductBySlug(slug);
      setProduct(prod);
      if (prod) {
        setActiveImageUrl(prod.main_image_url);
        setShowVideo(false);
        setIsZoomed(false);
        setQuantity(1);
        const activeVariants = prod.product_variants?.filter((v) => v.is_active) ?? [];
        if (activeVariants.length > 0) {
          setSelectedVariant(activeVariants[0]);
        } else {
          setSelectedVariant(null);
        }

        const revs = await fetchProductReviews(prod.id);
        setReviews(revs);

        if (user) {
          const eligible = await checkCustomerReviewEligibility(user.id, prod.id);
          setCanReview(eligible);
        } else {
          setCanReview(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load product details');
    } finally {
      setIsLoading(false);
    }
  }, [slug, user]);

  useEffect(() => {
    void loadProductData();
  }, [loadProductData]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-6 space-y-4">
          <Skeleton className="aspect-[4/5] w-full" />
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        </div>
        <div className="lg:col-span-6 space-y-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <ErrorBanner message={error} onRetry={() => void loadProductData()} />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20">
        <EmptyState
          title="Creation Not Found"
          description="The requested piece could not be located in our active vault."
          action={
            <Link to="/shop">
              <Button variant="gold" size="sm">
                Return to Collections
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const inv = extractInventory(product);
  const baseAvailable = inv ? inv.available_quantity : 0;
  const maxAvailableStock = selectedVariant
    ? Math.min(baseAvailable, selectedVariant.available_stock)
    : baseAvailable;
  const isOutOfStock = maxAvailableStock <= 0;

  const baseEffectivePrice = getEffectivePrice(product);
  const variantAdjustment = Number(selectedVariant?.price_adjustment ?? 0);
  const unitPrice = baseEffectivePrice + variantAdjustment;
  const originalPrice = product.original_price
    ? Number(product.original_price) + variantAdjustment
    : null;
  const hasDiscount = originalPrice !== null && originalPrice > unitPrice;
  const discountPct = hasDiscount
    ? Math.round(((originalPrice - unitPrice) / originalPrice) * 100)
    : 0;

  // Build deduplicated image gallery list
  const galleryImages = [
    product.main_image_url,
    ...(product.product_images?.map((img) => img.image_url) ?? []),
  ].filter((url, index, self) => Boolean(url) && self.indexOf(url) === index);

  // Extract only configured variant attributes
  const activeVariants = product.product_variants?.filter((v) => v.is_active) ?? [];
  const configuredSpecs = product.product_specifications ?? [];

  const handleMouseMoveZoom = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isZoomed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomOrigin({ x, y });
  };

  const handleAddToCart = async (redirectToCheckout = false) => {
    setActionError(null);
    try {
      await addToCart(product, quantity, selectedVariant);
      if (redirectToCheckout) {
        navigate('/checkout');
      } else {
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 2000);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to add item to bag.');
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviewError(null);
    setIsSubmittingReview(true);
    try {
      await submitProductReview(product.id, reviewRating, reviewTitle, reviewComment);
      setReviewSuccess(true);
      setReviewTitle('');
      setReviewComment('');
      await loadProductData();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Review submission failed');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const wishlisted = isInWishlist(product.id);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-20">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[var(--ts-text-muted)]">
        <Link to="/" className="hover:text-[var(--ts-accent)]">
          Home
        </Link>
        <span>/</span>
        <Link to="/shop" className="hover:text-[var(--ts-accent)]">
          Shop
        </Link>
        {product.categories && (
          <>
            <span>/</span>
            <Link to={`/shop/${product.categories.slug}`} className="hover:text-[var(--ts-accent)]">
              {product.categories.name}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-[var(--ts-accent)] truncate max-w-xs">{product.name}</span>
      </nav>

      {/* Main Product Showcase */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left: Zoomable Image & Video Gallery */}
        <div className="lg:col-span-6 space-y-4">
          {showVideo && sanitizeHttpUrl(product.video_url) ? (
            <div className="relative aspect-[4/5] w-full bg-black border border-[var(--ts-border-subtle)] overflow-hidden">
              <video
                src={sanitizeHttpUrl(product.video_url)!}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div
              onClick={() => setIsZoomed((z) => !z)}
              onMouseMove={handleMouseMoveZoom}
              onMouseLeave={() => setIsZoomed(false)}
              className="relative aspect-[4/5] w-full bg-[var(--ts-bg-elevated)] border border-[var(--ts-border-subtle)] overflow-hidden cursor-zoom-in group"
            >
              <img
                src={activeImageUrl || product.main_image_url}
                alt={product.name}
                style={
                  isZoomed
                    ? {
                        transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                        transform: 'scale(2)',
                      }
                    : undefined
                }
                className="w-full h-full object-cover transition-transform duration-200"
              />
              <div className="absolute bottom-3 right-3 bg-[var(--ts-bg-main)]/80 border border-[var(--ts-border-strong)] px-2.5 py-1 text-[10px] uppercase tracking-widest text-[var(--ts-text-secondary)] flex items-center gap-1.5 pointer-events-none">
                <ZoomIn className="w-3.5 h-3.5 text-[var(--ts-accent)]" />
                <span>{isZoomed ? 'Click to Reset' : 'Click to Zoom'}</span>
              </div>
            </div>
          )}

          {(galleryImages.length > 1 || Boolean(sanitizeHttpUrl(product.video_url))) && (
            <div className="grid grid-cols-5 gap-3">
              {galleryImages.map((imgUrl, idx) => (
                <button
                  key={imgUrl}
                  type="button"
                  onClick={() => {
                    setShowVideo(false);
                    setActiveImageUrl(imgUrl);
                  }}
                  className={cn(
                    'aspect-square border overflow-hidden bg-[var(--ts-bg-elevated)] cursor-pointer transition-all',
                    !showVideo && activeImageUrl === imgUrl
                      ? 'border-[var(--ts-accent)] ring-1 ring-[var(--ts-accent)]'
                      : 'border-[var(--ts-border-subtle)] opacity-70 hover:opacity-100'
                  )}
                >
                  <img
                    src={imgUrl}
                    alt={`${product.name} view ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
              {sanitizeHttpUrl(product.video_url) && (
                <button
                  type="button"
                  onClick={() => {
                    setIsZoomed(false);
                    setShowVideo(true);
                  }}
                  className={cn(
                    'aspect-square border overflow-hidden bg-black/80 cursor-pointer transition-all flex flex-col items-center justify-center gap-1 text-[var(--ts-accent)]',
                    showVideo
                      ? 'border-[var(--ts-accent)] ring-1 ring-[var(--ts-accent)]'
                      : 'border-[var(--ts-border-subtle)] opacity-80 hover:opacity-100'
                  )}
                >
                  <Play className="w-5 h-5" />
                  <span className="text-[9px] uppercase tracking-widest">Video</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Details, Variants, Pricing & Actions */}
        <div className="lg:col-span-6 space-y-8">
          <div className="space-y-3 border-b border-[var(--ts-border-subtle)] pb-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-[0.26em] text-[var(--ts-accent)]">
                {product.brand || 'TIMESSELLERS'} • SKU: {selectedVariant?.variant_sku || product.sku}
              </span>
              {isOutOfStock ? (
                <Badge tone="danger">Out of Stock</Badge>
              ) : maxAvailableStock <= (inv?.low_stock_threshold ?? 5) ? (
                <Badge tone="warning">Low Stock • {maxAvailableStock} Left</Badge>
              ) : (
                <Badge tone="success">In Stock ({maxAvailableStock} Available)</Badge>
              )}
            </div>

            <h1 className="font-serif-luxury text-3xl sm:text-5xl text-[var(--ts-text-primary)] leading-tight">
              {product.name}
            </h1>

            {/* Real Rating Indicator */}
            <div className="flex items-center gap-3 pt-1">
              {product.review_count > 0 ? (
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center text-[var(--ts-accent)]">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          'w-3.5 h-3.5',
                          i < Math.round(product.average_rating)
                            ? 'fill-current text-[var(--ts-accent)]'
                            : 'text-[var(--ts-border-strong)]'
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-[var(--ts-text-primary)] font-medium">
                    {Number(product.average_rating).toFixed(1)}
                  </span>
                  <a
                    href="#verified-reviews"
                    className="text-xs text-[var(--ts-text-muted)] hover:text-[var(--ts-accent)] underline"
                  >
                    ({product.review_count} verified {product.review_count === 1 ? 'review' : 'reviews'})
                  </a>
                </div>
              ) : (
                <span className="text-xs text-[var(--ts-text-muted)] italic">
                  No verified client reviews yet
                </span>
              )}
            </div>

            {/* Pricing */}
            <div className="pt-4 flex items-baseline gap-4">
              <span className="font-serif-luxury text-3xl sm:text-4xl text-[var(--ts-text-primary)]">
                {formatINR(unitPrice)}
              </span>
              {hasDiscount && originalPrice && (
                <>
                  <span className="text-base text-[var(--ts-text-muted)] line-through">
                    {formatINR(originalPrice)}
                  </span>
                  <Badge tone="gold">Save {discountPct}%</Badge>
                </>
              )}
            </div>
            <p className="text-[11px] text-[var(--ts-text-muted)]">
              Inclusive of all taxes.{' '}
              {unitPrice >= shippingSettings.free_shipping_threshold
                ? 'Eligible for Complimentary Insured Pan-India Delivery.'
                : `Free delivery on orders above ${formatINR(shippingSettings.free_shipping_threshold)}.`}
            </p>
          </div>

          {/* Short Description */}
          {product.short_description && (
            <p className="text-sm text-[var(--ts-text-secondary)] leading-relaxed">{product.short_description}</p>
          )}

          {/* Configured Variants Selector (Only rendered if variants are actually configured) */}
          {activeVariants.length > 0 && (
            <div className="space-y-3">
              <label className="block text-[11px] uppercase tracking-[0.2em] text-[var(--ts-text-secondary)]">
                Select Configuration / Variant
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {activeVariants.map((variant) => {
                  const isSelected = selectedVariant?.id === variant.id;
                  const labelParts = [
                    variant.color,
                    variant.size,
                    variant.model,
                    variant.option_value,
                  ].filter(Boolean);
                  const variantLabel =
                    labelParts.length > 0 ? labelParts.join(' • ') : variant.variant_sku;

                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => {
                        setSelectedVariant(variant);
                        setQuantity(1);
                      }}
                      className={cn(
                        'p-3 border text-left flex items-center justify-between transition-all cursor-pointer',
                        isSelected
                          ? 'border-[var(--ts-accent)] bg-[var(--ts-bg-accent-tint)]'
                          : 'border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] hover:border-[var(--ts-border-strong)]'
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        {variant.color_hex && (
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
                            style={{ backgroundColor: variant.color_hex }}
                          />
                        )}
                        <div>
                          <p className="text-xs text-[var(--ts-text-primary)] font-medium">{variantLabel}</p>
                          <p className="text-[10px] text-[var(--ts-text-muted)]">
                            {variant.available_stock > 0
                              ? `${variant.available_stock} available`
                              : 'Out of stock'}
                          </p>
                        </div>
                      </div>
                      {variant.price_adjustment !== 0 && (
                        <span className="text-xs text-[var(--ts-accent)]">
                          {variant.price_adjustment > 0 ? '+' : ''}
                          {formatINR(variant.price_adjustment)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity & Purchase Controls */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)]">
                <button
                  type="button"
                  disabled={quantity <= 1 || isOutOfStock}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="p-3 text-[var(--ts-text-secondary)] hover:text-[var(--ts-text-primary)] disabled:opacity-40 cursor-pointer"
                  aria-label="Decrease Quantity"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="px-5 text-sm font-medium text-[var(--ts-text-primary)]">{quantity}</span>
                <button
                  type="button"
                  disabled={quantity >= maxAvailableStock || isOutOfStock}
                  onClick={() => setQuantity((q) => Math.min(maxAvailableStock, q + 1))}
                  className="p-3 text-[var(--ts-text-secondary)] hover:text-[var(--ts-text-primary)] disabled:opacity-40 cursor-pointer"
                  aria-label="Increase Quantity"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => void toggleWishlist(product).catch((e) => setActionError(e.message))}
                className={cn(
                  'px-4 py-3 border flex items-center gap-2 text-xs uppercase tracking-[0.16em] transition-colors cursor-pointer',
                  wishlisted
                    ? 'border-[var(--ts-accent)] bg-[var(--ts-accent)]/15 text-[var(--ts-accent)]'
                    : 'border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] text-[var(--ts-text-secondary)] hover:border-[var(--ts-accent)]'
                )}
              >
                <Heart className={cn('w-4 h-4', wishlisted && 'fill-current')} />
                <span>{wishlisted ? 'Saved' : 'Wishlist'}</span>
              </button>
            </div>

            {actionError && <ErrorBanner message={actionError} />}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button
                variant="outline"
                size="lg"
                disabled={isOutOfStock}
                onClick={() => void handleAddToCart(false)}
                leftIcon={
                  justAdded ? <Check className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />
                }
              >
                {justAdded ? 'Added to Bag' : isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
              </Button>

              <Button
                variant="gold"
                size="lg"
                disabled={isOutOfStock}
                onClick={() => void handleAddToCart(true)}
                leftIcon={<Zap className="w-4 h-4" />}
              >
                Buy Now
              </Button>
            </div>
          </div>

          {/* Full Description & Guarantees */}
          <div className="border-t border-[var(--ts-border-subtle)] pt-6 space-y-4">
            <h3 className="text-[11px] uppercase tracking-[0.22em] text-[var(--ts-accent)]">
              Editorial Notes &amp; Description
            </h3>
            <div className="text-xs sm:text-sm text-[var(--ts-text-secondary)] leading-relaxed whitespace-pre-line">
              {product.full_description || product.short_description}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--ts-border-subtle)]">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-[var(--ts-accent)] shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="text-[var(--ts-text-primary)] font-medium">Quality Inspected</p>
                <p className="text-[var(--ts-text-muted)]">Individually verified prior to dispatch</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Truck className="w-4 h-4 text-[var(--ts-accent)] shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="text-[var(--ts-text-primary)] font-medium">Pan-India Insured Transit</p>
                <p className="text-[var(--ts-text-muted)]">
                  {shippingSettings.estimated_delivery_days_min}–
                  {shippingSettings.estimated_delivery_days_max} business days
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Configured Technical Specifications (Only displayed when configured for the product) */}
      {configuredSpecs.length > 0 && (
        <section className="border-t border-[var(--ts-border-subtle)] pt-14 space-y-6">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.26em] text-[var(--ts-accent)]">
              Technical Dossier
            </p>
            <h2 className="font-serif-luxury text-2xl sm:text-3xl text-[var(--ts-text-primary)]">
              Specifications
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {configuredSpecs.map((spec) => (
              <div
                key={spec.id}
                className="flex items-center justify-between p-4 border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)]"
              >
                <span className="text-xs uppercase tracking-[0.16em] text-[var(--ts-text-muted)]">
                  {spec.spec_key}
                </span>
                <span className="text-xs text-[var(--ts-text-primary)] font-medium">{spec.spec_value}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Verified Purchase Reviews Section */}
      <section id="verified-reviews" className="border-t border-[var(--ts-border-subtle)] pt-14 space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.26em] text-[var(--ts-accent)]">
              Client Testimonials
            </p>
            <h2 className="font-serif-luxury text-2xl sm:text-3xl text-[var(--ts-text-primary)]">
              Verified Purchase Reviews ({reviews.length})
            </h2>
          </div>
          <p className="text-xs text-[var(--ts-text-muted)]">
            Only clients who have purchased and received this creation may submit a review.
          </p>
        </div>

        {/* Eligible Buyer Review Form */}
        {canReview && (
          <form
            onSubmit={handleReviewSubmit}
            className="border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] p-6 sm:p-8 space-y-5 max-w-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-serif-luxury text-xl text-[var(--ts-text-primary)]">
                Record Your Verified Impression
              </h3>
              <Badge tone="gold">Verified Owner</Badge>
            </div>

            {reviewError && <ErrorBanner message={reviewError} />}
            {reviewSuccess && (
              <div className="p-3 border border-emerald-800/60 bg-emerald-950/40 text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Your verified review has been published.</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[11px] uppercase tracking-[0.18em] text-[var(--ts-text-secondary)]">
                Star Rating
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    className="p-1 text-[var(--ts-accent)] cursor-pointer"
                  >
                    <Star
                      className={cn(
                        'w-5 h-5',
                        star <= reviewRating ? 'fill-current text-[var(--ts-accent)]' : 'text-[var(--ts-border-strong)]'
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="Review Headline"
              required
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              placeholder="e.g., Exceptional craftsmanship and weight"
            />

            <div className="space-y-1.5">
              <label className="block text-[11px] uppercase tracking-[0.18em] text-[var(--ts-text-secondary)]">
                Detailed Review
              </label>
              <textarea
                rows={4}
                required
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Share your experience with the finish, packaging, and performance..."
                className="w-full bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] p-4 text-sm text-[var(--ts-text-primary)] focus:outline-none focus:border-[var(--ts-accent)]"
              />
            </div>

            <Button type="submit" variant="gold" size="md" isLoading={isSubmittingReview}>
              Publish Verified Review
            </Button>
          </form>
        )}

        {/* Reviews List */}
        {reviews.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reviews.map((rev) => (
              <div
                key={rev.id}
                className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-[var(--ts-accent)]">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <Star
                          key={idx}
                          className={cn(
                            'w-3.5 h-3.5',
                            idx < rev.rating ? 'fill-current' : 'text-[var(--ts-text-faint)]'
                          )}
                        />
                      ))}
                    </div>
                    {rev.is_verified_purchase && (
                      <Badge tone="gold">Verified Purchase</Badge>
                    )}
                  </div>
                  <h4 className="font-serif-luxury text-lg text-[var(--ts-text-primary)]">{rev.title}</h4>
                  <p className="text-xs text-[var(--ts-text-secondary)] leading-relaxed">{rev.comment}</p>
                </div>

                <div className="pt-4 border-t border-[var(--ts-border-subtle)] flex items-center justify-between text-[11px] text-[var(--ts-text-muted)]">
                  <span>{rev.profiles?.full_name || 'Verified Client'}</span>
                  <span>{formatDate(rev.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No Verified Reviews Yet"
            description="We never display fabricated ratings. Verified reviews appear here once clients receive their delivered orders."
          />
        )}
      </section>
    </div>
  );
};
