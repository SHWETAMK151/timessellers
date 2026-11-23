// ==============================================================================
// TIMESSELLERS — LUXURY LANDING PAGE (/)
// Sections: Hero, Featured Categories, Trending Products, New Arrivals,
// Best Sellers, Featured Collections, Promotional Banner, Brand Introduction,
// Newsletter Section. All products and categories come from the live database.
// ==============================================================================

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Truck,
  Award,
  CheckCircle2,
} from 'lucide-react';
import { fetchActiveCategories, fetchProducts } from '@/services/catalogService';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { ProductCard } from '@/components/product/ProductCard';
import { Button, EmptyState, Skeleton } from '@/components/ui/LuxuryPrimitives';
import { formatINR } from '@/lib/utils';
import type { Category, Product } from '@/types/database';

export const LandingPage: React.FC = () => {
  const { shippingSettings } = useStoreSettings();
  const [categories, setCategories] = useState<Category[]>([]);
  const [trendingProducts, setTrendingProducts] = useState<Product[]>([]);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);
  const [bestSellers, setBestSellers] = useState<Product[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);

  useEffect(() => {
    let active = true;
    const loadLandingData = async () => {
      if (!isSupabaseConfigured) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const [cats, trendingRes, arrivalsRes, bestRes, featuredRes] = await Promise.all([
          fetchActiveCategories(),
          fetchProducts({ isTrending: true, pageSize: 4 }),
          fetchProducts({ isNewArrival: true, pageSize: 4 }),
          fetchProducts({ isBestSeller: true, pageSize: 4 }),
          fetchProducts({ isFeatured: true, pageSize: 8 }),
        ]);

        if (!active) return;
        setCategories(cats);
        setTrendingProducts(
          trendingRes.products.length > 0 ? trendingRes.products : featuredRes.products.slice(0, 4)
        );
        setNewArrivals(
          arrivalsRes.products.length > 0 ? arrivalsRes.products : featuredRes.products.slice(0, 4)
        );
        setBestSellers(
          bestRes.products.length > 0 ? bestRes.products : featuredRes.products.slice(0, 4)
        );
        setFeaturedProducts(featuredRes.products);
      } catch {
        // Handled gracefully with empty states
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadLandingData();
    return () => {
      active = false;
    };
  }, []);

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail.trim() || !newsletterEmail.includes('@')) return;
    setNewsletterSubscribed(true);
    setNewsletterEmail('');
  };

  return (
    <div className="space-y-24 pb-20">
      {/* 1. HERO SECTION */}
      <section className="relative min-h-[84vh] flex items-center border-b border-[var(--ts-border-subtle)] overflow-hidden bg-[var(--ts-bg-main)]">
        {/* Luxury Background Photography with Obsidian Vignette */}
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=2000&q=85"
            alt="TIMESSELLERS Haute Horlogerie"
            className="w-full h-full object-cover object-center opacity-25 scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--ts-bg-main)] via-[var(--ts-bg-main)]/85 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--ts-bg-main)] via-transparent to-[var(--ts-bg-main)]/60" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="lg:col-span-7 space-y-8"
          >
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 border border-[var(--ts-accent)]/40 bg-[var(--ts-bg-card)]/80">
              <Sparkles className="w-3.5 h-3.5 text-[var(--ts-accent)]" />
              <span className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
                Maison TIMESSELLERS • Private Edition
              </span>
            </div>

            <h1 className="font-serif-luxury text-4xl sm:text-6xl lg:text-7xl font-normal text-[var(--ts-text-primary)] leading-[1.08] tracking-tight">
              Mastery of Time &amp; <br />
              <span className="text-[var(--ts-accent)] italic">Sovereign Objects.</span>
            </h1>

            <p className="text-sm sm:text-base text-[var(--ts-text-secondary)] max-w-xl leading-relaxed font-light">
              Discover precision chronographs, architectural Italian leather goods, rare extrait de
              parfum compositions, titanium eyewear, and bespoke acoustic instruments curated for
              collectors across India.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link to="/shop">
                <Button variant="gold" size="lg" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Shop Now
                </Button>
              </Link>
              <a href="#featured-categories">
                <Button variant="outline" size="lg">
                  Explore Collection
                </Button>
              </a>
            </div>

            {/* Trust Pillars */}
            <div className="pt-8 border-t border-[var(--ts-border-subtle)] grid grid-cols-3 gap-6 max-w-lg">
              <div>
                <p className="font-serif-luxury text-2xl text-[var(--ts-accent)]">100%</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--ts-text-muted)]">
                  Inspected Quality
                </p>
              </div>
              <div>
                <p className="font-serif-luxury text-2xl text-[var(--ts-accent)]">
                  {formatINR(shippingSettings.free_shipping_threshold)}+
                </p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--ts-text-muted)]">
                  Free Insured Delivery
                </p>
              </div>
              <div>
                <p className="font-serif-luxury text-2xl text-[var(--ts-accent)]">UPI &amp; Crypto</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--ts-text-muted)]">
                  Verified Settlement
                </p>
              </div>
            </div>
          </motion.div>

          {/* Hero Showcase Portrait */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="lg:col-span-5 hidden lg:block"
          >
            <div className="relative border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] p-3">
              <div className="aspect-[4/5] overflow-hidden bg-[var(--ts-bg-elevated)]">
                <img
                  src="https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=1200&q=85"
                  alt="Luxury Chronograph Timepiece"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-4 bg-[var(--ts-bg-card)] border-t border-[var(--ts-border-subtle)] flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--ts-accent)]">
                    Signature Collection
                  </p>
                  <p className="font-serif-luxury text-lg text-[var(--ts-text-primary)]">
                    Haute Horlogerie &amp; Accessories
                  </p>
                </div>
                <Link
                  to="/shop/mens-watches"
                  className="text-xs uppercase tracking-[0.18em] text-[var(--ts-accent)] hover:underline"
                >
                  Discover →
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 2. FEATURED CATEGORIES */}
      <section id="featured-categories" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[var(--ts-border-subtle)] pb-6">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
              Curated Departments
            </p>
            <h2 className="font-serif-luxury text-3xl sm:text-4xl text-[var(--ts-text-primary)]">
              Featured Categories
            </h2>
          </div>
          <Link
            to="/shop"
            className="text-xs uppercase tracking-[0.2em] text-[var(--ts-accent)] hover:underline flex items-center gap-2"
          >
            <span>Browse All 10 Departments</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, idx) => (
              <Skeleton key={idx} className="aspect-[4/5]" />
            ))}
          </div>
        ) : categories.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                to={`/shop/${cat.slug}`}
                className="group relative aspect-[4/5] overflow-hidden border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] hover:border-[var(--ts-accent)]/60 transition-all"
              >
                {cat.image_url ? (
                  <img
                    src={cat.image_url}
                    alt={cat.name}
                    loading="lazy"
                    className="w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-105 transition-all duration-700"
                  />
                ) : (
                  <div className="w-full h-full bg-[var(--ts-bg-elevated)]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--ts-bg-main)] via-[var(--ts-bg-main)]/40 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 space-y-1">
                  <p className="text-[9px] uppercase tracking-[0.24em] text-[var(--ts-accent)]">
                    Collection
                  </p>
                  <h3 className="font-serif-luxury text-lg text-[var(--ts-text-primary)] group-hover:text-[var(--ts-accent)] transition-colors">
                    {cat.name}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Categories Ready for Initialization"
            description="Run the SQL migrations in supabase/migrations/ to populate the 10 luxury categories or add categories in the Admin Dashboard."
          />
        )}
      </section>

      {/* 3. TRENDING PRODUCTS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[var(--ts-border-subtle)] pb-6">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
              Most Coveted Pieces
            </p>
            <h2 className="font-serif-luxury text-3xl sm:text-4xl text-[var(--ts-text-primary)]">
              Trending Creations
            </h2>
          </div>
          <Link
            to="/shop?sort=popular"
            className="text-xs uppercase tracking-[0.2em] text-[var(--ts-accent)] hover:underline flex items-center gap-2"
          >
            <span>Explore Trending</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-96" />
            ))}
          </div>
        ) : trendingProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {trendingProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No Trending Products Published Yet"
            description="Products added and marked as Trending or Active in the Admin Dashboard will appear here directly from Supabase PostgreSQL."
            action={
              <Link to="/admin/products">
                <Button variant="outline" size="sm">
                  Manage Catalog in Admin
                </Button>
              </Link>
            }
          />
        )}
      </section>

      {/* 4. NEW ARRIVALS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[var(--ts-border-subtle)] pb-6">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
              Latest Releases
            </p>
            <h2 className="font-serif-luxury text-3xl sm:text-4xl text-[var(--ts-text-primary)]">
              New Arrivals
            </h2>
          </div>
          <Link
            to="/shop?sort=newest"
            className="text-xs uppercase tracking-[0.2em] text-[var(--ts-accent)] hover:underline flex items-center gap-2"
          >
            <span>View All New Arrivals</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-96" />
            ))}
          </div>
        ) : newArrivals.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {newArrivals.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="New Season Arrivals Coming Soon"
            description="Mark products as 'New Arrival' in the Admin Product Manager to showcase them in this section."
          />
        )}
      </section>

      {/* 5. FEATURED COLLECTIONS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="space-y-2 text-center max-w-2xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
            Bespoke Curations
          </p>
          <h2 className="font-serif-luxury text-3xl sm:text-4xl text-[var(--ts-text-primary)]">
            Featured Collections
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link
            to="/shop/mens-watches"
            className="group relative aspect-[4/5] border border-[var(--ts-border-subtle)] overflow-hidden bg-[var(--ts-bg-card)]"
          >
            <img
              src="https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=1000&q=85"
              alt="Sovereign Horology"
              loading="lazy"
              className="w-full h-full object-cover opacity-70 group-hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--ts-bg-main)] via-[var(--ts-bg-main)]/40 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 p-8 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--ts-accent)]">
                Haute Horlogerie
              </p>
              <h3 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
                The Chronograph Atelier
              </h3>
              <p className="text-xs text-[var(--ts-text-secondary)]">
                Mechanical precision engineered in sapphire crystal and brushed steel.
              </p>
            </div>
          </Link>

          <Link
            to="/shop/ladies-purses"
            className="group relative aspect-[4/5] border border-[var(--ts-border-subtle)] overflow-hidden bg-[var(--ts-bg-card)]"
          >
            <img
              src="https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1000&q=85"
              alt="Maroquinerie Leather Goods"
              loading="lazy"
              className="w-full h-full object-cover opacity-70 group-hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--ts-bg-main)] via-[var(--ts-bg-main)]/40 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 p-8 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--ts-accent)]">
                Fine Leather Goods
              </p>
              <h3 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
                Architectural Maroquinerie
              </h3>
              <p className="text-xs text-[var(--ts-text-secondary)]">
                Hand-stitched purses, executive billfolds, and evening silhouettes.
              </p>
            </div>
          </Link>

          <Link
            to="/shop/perfumes"
            className="group relative aspect-[4/5] border border-[var(--ts-border-subtle)] overflow-hidden bg-[var(--ts-bg-card)]"
          >
            <img
              src="https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1000&q=85"
              alt="Haute Parfumerie"
              loading="lazy"
              className="w-full h-full object-cover opacity-70 group-hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--ts-bg-main)] via-[var(--ts-bg-main)]/40 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 p-8 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--ts-accent)]">
                Haute Parfumerie
              </p>
              <h3 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
                Nocturnal Extrait Collection
              </h3>
              <p className="text-xs text-[var(--ts-text-secondary)]">
                High-concentration olfactory compositions crafted for lasting presence.
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* 6. BEST SELLERS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[var(--ts-border-subtle)] pb-6">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
              Collector Favourites
            </p>
            <h2 className="font-serif-luxury text-3xl sm:text-4xl text-[var(--ts-text-primary)]">
              Best Sellers
            </h2>
          </div>
          <Link
            to="/shop?sort=popular"
            className="text-xs uppercase tracking-[0.2em] text-[var(--ts-accent)] hover:underline flex items-center gap-2"
          >
            <span>Shop Best Sellers</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-96" />
            ))}
          </div>
        ) : bestSellers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {bestSellers.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : featuredProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredProducts.slice(0, 4).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Best Sellers Catalogue Ready"
            description="As customers place confirmed orders or administrators mark flagship creations as Best Sellers, they appear here automatically."
          />
        )}
      </section>

      {/* 7. PROMOTIONAL BANNER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] overflow-hidden p-8 sm:p-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8 space-y-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ts-accent)]">
              Private Treasury &amp; Digital Asset Desk
            </p>
            <h2 className="font-serif-luxury text-3xl sm:text-5xl text-[var(--ts-text-primary)] leading-tight">
              Seamless Settlement via Verified UPI QR &amp; Cryptocurrency
            </h2>
            <p className="text-xs sm:text-sm text-[var(--ts-text-secondary)] max-w-2xl leading-relaxed">
              Experience direct treasury settlement across India via instant UPI QR transfer with
              dedicated UTR verification, or pay globally in USDT, Bitcoin, Ethereum, and Solana
              with automatic cryptographic webhook confirmation.
            </p>
          </div>
          <div className="lg:col-span-4 flex lg:justify-end">
            <Link to="/shop">
              <Button variant="gold" size="lg" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Acquire Your Piece
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* 8. BRAND INTRODUCTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 border-y border-[var(--ts-border-subtle)] py-16">
          <div className="space-y-3 p-6 border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)]">
            <ShieldCheck className="w-6 h-6 text-[var(--ts-accent)]" />
            <h3 className="font-serif-luxury text-xl text-[var(--ts-text-primary)]">
              Uncompromising Provenance
            </h3>
            <p className="text-xs text-[var(--ts-text-muted)] leading-relaxed">
              Every timepiece, leather accessory, fragrance, and acoustic object in the
              TIMESSELLERS vault undergoes multi-point inspection prior to sealed dispatch.
            </p>
          </div>

          <div className="space-y-3 p-6 border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)]">
            <Truck className="w-6 h-6 text-[var(--ts-accent)]" />
            <h3 className="font-serif-luxury text-xl text-[var(--ts-text-primary)]">
              Pan-India White-Glove Delivery
            </h3>
            <p className="text-xs text-[var(--ts-text-muted)] leading-relaxed">
              Complimentary insured courier delivery across all Indian states and PIN codes on
              orders above {formatINR(shippingSettings.free_shipping_threshold)}, complete with
              live milestone tracking.
            </p>
          </div>

          <div className="space-y-3 p-6 border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)]">
            <Award className="w-6 h-6 text-[var(--ts-accent)]" />
            <h3 className="font-serif-luxury text-xl text-[var(--ts-text-primary)]">
              Dedicated Client Concierge
            </h3>
            <p className="text-xs text-[var(--ts-text-muted)] leading-relaxed">
              From sizing guidance to private acquisitions and post-purchase care, our Lower Parel
              concierge desk serves registered members seven days a week.
            </p>
          </div>
        </div>
      </section>

      {/* 9. NEWSLETTER SECTION */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
          The Private Registry
        </p>
        <h2 className="font-serif-luxury text-3xl sm:text-4xl text-[var(--ts-text-primary)]">
          Receive Private Allocation Invitations
        </h2>
        <p className="text-xs text-[var(--ts-text-muted)] max-w-lg mx-auto leading-relaxed">
          Subscribe to receive early notice of limited horological releases, private sales, and
          Maison editorials.
        </p>

        {newsletterSubscribed ? (
          <div className="inline-flex items-center gap-2.5 border border-[var(--ts-accent)]/50 bg-[var(--ts-bg-card)] px-6 py-3.5 text-xs text-[var(--ts-accent)]">
            <CheckCircle2 className="w-4 h-4" />
            <span>You have been inscribed in the TIMESSELLERS Private Registry.</span>
          </div>
        ) : (
          <form
            onSubmit={handleNewsletterSubmit}
            className="max-w-md mx-auto flex flex-col sm:flex-row gap-3 pt-2"
          >
            <input
              type="email"
              required
              value={newsletterEmail}
              onChange={(e) => setNewsletterEmail(e.target.value)}
              placeholder="Enter your email address"
              className="flex-1 bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] px-4 py-3 text-xs text-[var(--ts-text-primary)] placeholder:text-[var(--ts-text-faint)] focus:outline-none focus:border-[var(--ts-accent)]"
            />
            <Button type="submit" variant="gold" size="md">
              Inscribe
            </Button>
          </form>
        )}
      </section>
    </div>
  );
};
