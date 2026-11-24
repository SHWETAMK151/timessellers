// ==============================================================================
// TIMESSELLERS — STOREFRONT HEADER, NAVIGATION & FOOTER
// Includes TIMESSELLERS logo, Home, Shop, Categories dropdown, Search bar,
// Account link, Cart icon with badge, Admin link for authorized admins, and Mobile drawer.
// ==============================================================================

import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Search,
  ShoppingBag,
  Package,
  Menu,
  X,
  ChevronDown,
  Database,
} from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { fetchActiveCategories } from '@/services/catalogService';
import { formatINR } from '@/lib/utils';
import type { Category } from '@/types/database';

export const StorefrontLayout: React.FC = () => {
  const { itemCount } = useCart();
  const { storeSettings, shippingSettings } = useStoreSettings();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [categoriesDropdownOpen, setCategoriesDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    fetchActiveCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    setSearchOpen(false);
    setMobileMenuOpen(false);
    if (q) {
      navigate(`/shop?q=${encodeURIComponent(q)}`);
    } else {
      navigate('/shop');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--ts-bg-main)] text-[var(--ts-text-primary)] flex flex-col overflow-x-clip">
      {/* Top Complimentary Shipping Announcement Bar */}
      <div className="bg-[var(--ts-bg-elevated)] border-b border-[var(--ts-border-subtle)] px-3 sm:px-4 py-2 text-center">
        <p className="text-[10px] uppercase tracking-[0.14em] sm:tracking-[0.24em] text-[var(--ts-accent)]">
          Complimentary Insured Pan-India Delivery on Orders Above{' '}
          {formatINR(shippingSettings.free_shipping_threshold)} • UPI &amp; Crypto Accepted
        </p>
      </div>

      {/* Supabase Environment Configuration Notice if .env.local is not populated yet */}
      {!isSupabaseConfigured && (
        <div className="bg-amber-950/60 border-b border-amber-800/60 px-4 py-2.5 text-center text-xs text-amber-200 flex items-center justify-center gap-2">
          <Database className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Supabase credentials are not configured yet. Copy <code>.env.example</code> to{' '}
            <code>.env.local</code> and add your <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code>.
          </span>
        </div>
      )}

      {/* Main Luxury Header */}
      <header className="sticky top-0 z-40 bg-[var(--ts-bg-main)]/95 backdrop-blur-md border-b border-[var(--ts-border-subtle)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Mobile Hamburger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="lg:hidden p-2 text-[var(--ts-text-primary)] hover:text-[var(--ts-accent)] cursor-pointer"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-2 sm:gap-3 group min-w-0">
            {storeSettings.logo_url ? (
              <img
                src={storeSettings.logo_url}
                alt={storeSettings.store_name}
                className="h-7 sm:h-8 w-auto object-contain shrink-0"
              />
            ) : null}
            <div className="flex flex-col min-w-0">
              <span className="font-serif-luxury text-lg sm:text-3xl tracking-[0.14em] sm:tracking-[0.26em] text-[var(--ts-text-primary)] group-hover:text-[var(--ts-accent)] transition-colors truncate">
                {storeSettings.store_name || 'TIMESSELLERS'}
              </span>
              <span className="text-[8px] uppercase tracking-[0.35em] text-[var(--ts-text-muted)] hidden sm:block">
                {storeSettings.store_tagline || 'Haute Horlogerie & Luxury Maison'}
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-8">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `text-xs uppercase tracking-[0.2em] transition-colors ${
                  isActive ? 'text-[var(--ts-accent)]' : 'text-[var(--ts-text-secondary)] hover:text-[var(--ts-accent)]'
                }`
              }
            >
              Home
            </NavLink>

            <NavLink
              to="/shop"
              className={({ isActive }) =>
                `text-xs uppercase tracking-[0.2em] transition-colors ${
                  isActive ? 'text-[var(--ts-accent)]' : 'text-[var(--ts-text-secondary)] hover:text-[var(--ts-accent)]'
                }`
              }
            >
              Shop
            </NavLink>

            {/* Categories Dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setCategoriesDropdownOpen(true)}
              onMouseLeave={() => setCategoriesDropdownOpen(false)}
            >
              <button
                type="button"
                onClick={() => setCategoriesDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-[var(--ts-text-secondary)] hover:text-[var(--ts-accent)] py-2 cursor-pointer"
              >
                <span>Categories</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {categoriesDropdownOpen && (
                <div className="absolute left-0 top-full w-64 bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] shadow-2xl py-2 z-50 grid grid-cols-1">
                  {categories.length > 0 ? (
                    categories.map((cat) => (
                      <Link
                        key={cat.id}
                        to={`/shop/${cat.slug}`}
                        onClick={() => setCategoriesDropdownOpen(false)}
                        className="px-5 py-2.5 text-xs uppercase tracking-[0.16em] text-[var(--ts-text-secondary)] hover:bg-[var(--ts-bg-subtle)] hover:text-[var(--ts-accent)] transition-colors"
                      >
                        {cat.name}
                      </Link>
                    ))
                  ) : (
                    <Link
                      to="/shop"
                      onClick={() => setCategoriesDropdownOpen(false)}
                      className="px-5 py-3 text-xs text-[var(--ts-text-muted)]"
                    >
                      Explore All Categories
                    </Link>
                  )}
                </div>
              )}
            </div>

            <NavLink
              to="/about"
              className={({ isActive }) =>
                `text-xs uppercase tracking-[0.2em] transition-colors ${
                  isActive ? 'text-[var(--ts-accent)]' : 'text-[var(--ts-text-secondary)] hover:text-[var(--ts-accent)]'
                }`
              }
            >
              Maison
            </NavLink>

            <NavLink
              to="/contact"
              className={({ isActive }) =>
                `text-xs uppercase tracking-[0.2em] transition-colors ${
                  isActive ? 'text-[var(--ts-accent)]' : 'text-[var(--ts-text-secondary)] hover:text-[var(--ts-accent)]'
                }`
              }
            >
              Concierge
            </NavLink>
          </nav>

          {/* Header Actions: Search, Track Order, Cart */}
          <div className="flex items-center gap-3 sm:gap-5">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              className="p-2 text-[var(--ts-text-secondary)] hover:text-[var(--ts-accent)] transition-colors cursor-pointer"
              aria-label="Search Catalog"
            >
              <Search className="w-4 h-4" />
            </button>

            <Link
              to="/track-order"
              className="p-2 text-[var(--ts-text-secondary)] hover:text-[var(--ts-accent)] transition-colors flex items-center gap-2"
              aria-label="Track Order"
            >
              <Package className="w-4 h-4" />
              <span className="hidden xl:inline text-[11px] uppercase tracking-[0.18em]">
                Track Order
              </span>
            </Link>

            <Link
              to="/cart"
              className="relative p-2 text-[var(--ts-text-secondary)] hover:text-[var(--ts-accent)] transition-colors flex items-center gap-2"
              aria-label="Shopping Bag"
            >
              <ShoppingBag className="w-4 h-4" />
              {itemCount > 0 && (
                <span className="w-5 h-5 bg-[var(--ts-accent)] text-[var(--ts-on-accent)] text-[10px] font-semibold flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Expandable Search Bar */}
        {searchOpen && (
          <div className="border-t border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] py-4 px-4">
            <form onSubmit={handleSearchSubmit} className="max-w-3xl mx-auto flex gap-3">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search watches, goggles, leather purses, perfumes, SKU..."
                autoFocus
                className="flex-1 bg-[var(--ts-bg-main)] border border-[var(--ts-border-strong)] px-4 py-3 text-sm text-[var(--ts-text-primary)] placeholder:text-[var(--ts-text-faint)] focus:outline-none focus:border-[var(--ts-accent)]"
              />
              <button
                type="submit"
                className="bg-[var(--ts-accent)] text-[var(--ts-on-accent)] px-6 py-3 text-xs uppercase tracking-[0.2em] font-medium hover:bg-[var(--ts-accent-hover)] cursor-pointer"
              >
                Search
              </button>
            </form>
          </div>
        )}

        {/* Mobile Drawer Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] px-6 py-6 space-y-5">
            <div className="flex flex-col space-y-3">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="text-xs uppercase tracking-[0.2em] text-[var(--ts-text-primary)] py-1.5"
              >
                Home
              </Link>
              <Link
                to="/shop"
                onClick={() => setMobileMenuOpen(false)}
                className="text-xs uppercase tracking-[0.2em] text-[var(--ts-text-primary)] py-1.5"
              >
                All Collections
              </Link>
              <Link
                to="/track-order"
                onClick={() => setMobileMenuOpen(false)}
                className="text-xs uppercase tracking-[0.2em] text-[var(--ts-text-primary)] py-1.5"
              >
                Track Order
              </Link>
              <Link
                to="/cart"
                onClick={() => setMobileMenuOpen(false)}
                className="text-xs uppercase tracking-[0.2em] text-[var(--ts-text-primary)] py-1.5"
              >
                Shopping Bag ({itemCount})
              </Link>
              <Link
                to="/about"
                onClick={() => setMobileMenuOpen(false)}
                className="text-xs uppercase tracking-[0.2em] text-[var(--ts-text-primary)] py-1.5"
              >
                Maison
              </Link>
              <Link
                to="/contact"
                onClick={() => setMobileMenuOpen(false)}
                className="text-xs uppercase tracking-[0.2em] text-[var(--ts-text-primary)] py-1.5"
              >
                Concierge
              </Link>
            </div>

            {categories.length > 0 && (
              <div className="pt-4 border-t border-[var(--ts-border-subtle)]">
                <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--ts-text-muted)] mb-3">
                  Categories
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {categories.map((cat) => (
                    <Link
                      key={cat.id}
                      to={`/shop/${cat.slug}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className="text-xs text-[var(--ts-text-secondary)] hover:text-[var(--ts-accent)] py-1"
                    >
                      {cat.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Route Content */}
      <main className="flex-1 min-w-0 overflow-x-clip">
        <Outlet />
      </main>

      {/* Luxury Footer */}
      <footer className="bg-[var(--ts-bg-deep)] border-t border-[var(--ts-border-subtle)] pt-16 pb-12 text-[var(--ts-text-muted)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 pb-14 border-b border-[var(--ts-border-subtle)]">
            {/* Col 1: Brand Identity */}
            <div className="space-y-4">
              <Link
                to="/"
                className="font-serif-luxury text-2xl tracking-[0.26em] text-[var(--ts-text-primary)] block"
              >
                {storeSettings.store_name || 'TIMESSELLERS'}
              </Link>
              <p className="text-xs leading-relaxed text-[var(--ts-text-muted)]">
                Curators of fine horology, architectural leather goods, rare perfumery, eyewear,
                and acoustic instruments. Every creation is inspected and dispatched with insured
                pan-India white-glove delivery.
              </p>
              <div className="pt-2 text-xs text-[var(--ts-text-secondary)] space-y-1.5">
                {storeSettings.contact_phone && (
                  <p>
                    <a
                      href={`tel:${storeSettings.contact_phone.replace(/[^\d+]/g, '')}`}
                      className="hover:text-[var(--ts-accent)] transition-colors"
                    >
                      {storeSettings.contact_phone}
                    </a>
                  </p>
                )}
                {storeSettings.contact_email && (
                  <p>
                    <a
                      href={`mailto:${storeSettings.contact_email}`}
                      className="hover:text-[var(--ts-accent)] transition-colors break-all"
                    >
                      {storeSettings.contact_email}
                    </a>
                  </p>
                )}
              </div>
            </div>

            {/* Col 2: Categories */}
            <div className="space-y-4">
              <h4 className="text-[11px] uppercase tracking-[0.22em] text-[var(--ts-text-primary)]">
                Collections
              </h4>
              <ul className="space-y-2.5 text-xs">
                {categories.slice(0, 6).map((cat) => (
                  <li key={cat.id}>
                    <Link
                      to={`/shop/${cat.slug}`}
                      className="hover:text-[var(--ts-accent)] transition-colors"
                    >
                      {cat.name}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link to="/shop" className="text-[var(--ts-accent)] hover:underline">
                    View Full Catalog →
                  </Link>
                </li>
              </ul>
            </div>

            {/* Col 3: Client Services */}
            <div className="space-y-4">
              <h4 className="text-[11px] uppercase tracking-[0.22em] text-[var(--ts-text-primary)]">
                Client Services
              </h4>
              <ul className="space-y-2.5 text-xs">
                <li>
                  <Link to="/track-order" className="hover:text-[var(--ts-accent)] transition-colors">
                    Track Your Order
                  </Link>
                </li>
                <li>
                  <Link to="/shop" className="hover:text-[var(--ts-accent)] transition-colors">
                    Browse Collections
                  </Link>
                </li>
                <li>
                  <Link to="/cart" className="hover:text-[var(--ts-accent)] transition-colors">
                    Shopping Bag
                  </Link>
                </li>
                <li>
                  <Link to="/checkout" className="hover:text-[var(--ts-accent)] transition-colors">
                    Express Checkout
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="hover:text-[var(--ts-accent)] transition-colors">
                    Private Concierge Desk
                  </Link>
                </li>
              </ul>
            </div>

            {/* Col 4: Legal & Policies */}
            <div className="space-y-4">
              <h4 className="text-[11px] uppercase tracking-[0.22em] text-[var(--ts-text-primary)]">
                Maison &amp; Legal
              </h4>
              <ul className="space-y-2.5 text-xs">
                <li>
                  <Link to="/about" className="hover:text-[var(--ts-accent)] transition-colors">
                    About TIMESSELLERS
                  </Link>
                </li>
                <li>
                  <Link to="/shipping-policy" className="hover:text-[var(--ts-accent)] transition-colors">
                    Shipping &amp; Delivery Policy
                  </Link>
                </li>
                <li>
                  <Link to="/return-policy" className="hover:text-[var(--ts-accent)] transition-colors">
                    Return &amp; Refund Policy
                  </Link>
                </li>
                <li>
                  <Link to="/privacy-policy" className="hover:text-[var(--ts-accent)] transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-[var(--ts-accent)] transition-colors">
                    Terms &amp; Conditions
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[var(--ts-text-muted)]">
            <p>
              © {new Date().getFullYear()} {storeSettings.store_name || 'TIMESSELLERS'}. All rights
              reserved.
            </p>
            <p className="tracking-widest uppercase text-[10px]">
              Verified UPI QR • Cryptographic Webhook Payments • Pan-India Insured Dispatch
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
