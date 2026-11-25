// ==============================================================================
// TIMESSELLERS — LUXURY LANDING PAGE (/)
// Minimalist Hero-only storefront entrance with direct CTA buttons.
// ==============================================================================

import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { Button } from '@/components/ui/LuxuryPrimitives';
import { formatINR } from '@/lib/utils';

export const LandingPage: React.FC = () => {
  const { shippingSettings } = useStoreSettings();

  return (
    <div>
      {/* HERO SECTION */}
      <section className="relative min-h-[84vh] flex items-center border-b border-[var(--ts-border-subtle)] overflow-hidden bg-[var(--ts-bg-main)]">
        {/* Luxury Background Photography with Vignette */}
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fm=webp&fit=crop&w=1400&q=75"
            alt="TIMESSELLERS Haute Horlogerie"
            loading="eager"
            className="w-full h-full object-cover object-center opacity-25 scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--ts-bg-main)] via-[var(--ts-bg-main)]/85 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--ts-bg-main)] via-transparent to-[var(--ts-bg-main)]/60" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center w-full">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="lg:col-span-7 space-y-6 sm:space-y-8 min-w-0"
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
              <Link to="/collections">
                <Button variant="gold" size="lg" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Shop Now
                </Button>
              </Link>
              <Link to="/collections">
                <Button variant="outline" size="lg">
                  Explore Collection
                </Button>
              </Link>
            </div>

            {/* Trust Pillars */}
            <div className="pt-8 border-t border-[var(--ts-border-subtle)] grid grid-cols-3 gap-3 sm:gap-6 max-w-lg">
              <div className="min-w-0">
                <p className="font-serif-luxury text-lg sm:text-2xl text-[var(--ts-accent)]">100%</p>
                <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.12em] sm:tracking-[0.18em] text-[var(--ts-text-muted)]">
                  Inspected Quality
                </p>
              </div>
              <div className="min-w-0">
                <p className="font-serif-luxury text-lg sm:text-2xl text-[var(--ts-accent)]">
                  {formatINR(shippingSettings.free_shipping_threshold)}+
                </p>
                <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.12em] sm:tracking-[0.18em] text-[var(--ts-text-muted)]">
                  Free Insured Delivery
                </p>
              </div>
              <div className="min-w-0">
                <p className="font-serif-luxury text-lg sm:text-2xl text-[var(--ts-accent)]">UPI &amp; Crypto</p>
                <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.12em] sm:tracking-[0.18em] text-[var(--ts-text-muted)]">
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
                  src="https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fm=webp&fit=crop&w=900&q=75"
                  alt="Luxury Chronograph Timepiece"
                  loading="eager"
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
    </div>
  );
};
