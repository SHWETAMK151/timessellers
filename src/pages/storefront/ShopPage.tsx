// ==============================================================================
// TIMESSELLERS — SHOPPING & CATEGORY PAGE (/shop & /shop/:category)
// Desktop: Left product grid + Right-side filter sidebar + numbered pagination.
// Mobile: Top 2-button bar (Filter & Sort) + 2-column square item grid + drawers.
// ==============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  SlidersHorizontal,
  ArrowUpDown,
  Search,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
} from 'lucide-react';
import {
  fetchActiveCategories,
  fetchCategoryBySlug,
  fetchProducts,
} from '@/services/catalogService';
import { isSupabaseConfigured } from '@/lib/supabase';
import { ProductCard } from '@/components/product/ProductCard';
import {
  Button,
  EmptyState,
  ErrorBanner,
  Skeleton,
} from '@/components/ui/LuxuryPrimitives';
import type { Category, Product } from '@/types/database';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest Arrivals' },
  { value: 'popular', label: 'Most Popular' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
] as const;

export const ShopPage: React.FC = () => {
  const { category: categorySlugParam } = useParams<{ category?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states synced with URL query params
  const searchQuery = searchParams.get('q') || '';
  const sortBy =
    (searchParams.get('sort') as 'newest' | 'price_asc' | 'price_desc' | 'popular') || 'newest';
  const minPriceParam = searchParams.get('minPrice') || '';
  const maxPriceParam = searchParams.get('maxPrice') || '';
  const inStockOnly = searchParams.get('inStock') === 'true';
  const currentPage = Math.max(1, Number(searchParams.get('page') || 1));

  const [searchInput, setSearchInput] = useState(searchQuery);
  const [minPriceInput, setMinPriceInput] = useState(minPriceParam);
  const [maxPriceInput, setMaxPriceInput] = useState(maxPriceParam);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileSortOpen, setMobileSortOpen] = useState(false);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    fetchActiveCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  const loadCatalog = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      if (categorySlugParam) {
        const cat = await fetchCategoryBySlug(categorySlugParam);
        setActiveCategory(cat);
      } else {
        setActiveCategory(null);
      }

      const result = await fetchProducts({
        categorySlug: categorySlugParam,
        search: searchQuery || undefined,
        minPrice: minPriceParam ? Number(minPriceParam) : undefined,
        maxPrice: maxPriceParam ? Number(maxPriceParam) : undefined,
        inStockOnly,
        sortBy,
        page: currentPage,
        pageSize: 12,
      });

      setProducts(result.products);
      setTotalCount(result.totalCount);
      setTotalPages(Math.max(1, result.totalPages));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load catalog');
    } finally {
      setIsLoading(false);
    }
  }, [categorySlugParam, searchQuery, minPriceParam, maxPriceParam, inStockOnly, sortBy, currentPage]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const updateFilterParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, val]) => {
      if (val === null || val === '') {
        next.delete(key);
      } else {
        next.set(key, val);
      }
    });
    if (!('page' in updates)) {
      next.set('page', '1');
    }
    setSearchParams(next);
  };

  const handlePageChange = (nextPage: number) => {
    updateFilterParams({ page: String(nextPage) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilterParams({ q: searchInput.trim() || null });
    setMobileFiltersOpen(false);
  };

  const handlePriceFilterApply = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilterParams({
      minPrice: minPriceInput.trim() || null,
      maxPrice: maxPriceInput.trim() || null,
    });
    setMobileFiltersOpen(false);
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setSearchParams(new URLSearchParams());
    setMobileFiltersOpen(false);
  };

  const getVisiblePageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | 'ellipsis')[] = [1];
    if (currentPage > 3) pages.push('ellipsis');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let p = start; p <= end; p++) pages.push(p);
    if (currentPage < totalPages - 2) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
  };

  const renderFilterSections = (isMobileDrawer = false) => (
    <div className="space-y-6">
      {/* Search Input */}
      <form onSubmit={handleSearchFormSubmit} className="space-y-2">
        <label className="block text-[10px] uppercase tracking-[0.22em] text-[var(--ts-accent)]">
          Search Creation
        </label>
        <div className="flex">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Name, brand, SKU..."
            className="w-full bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] px-3.5 py-2.5 text-xs text-[var(--ts-text-primary)] placeholder:text-[var(--ts-text-faint)] focus:outline-none focus:border-[var(--ts-accent)]"
          />
          <button
            type="submit"
            className="bg-[var(--ts-bg-subtle)] border border-l-0 border-[var(--ts-border-strong)] px-3 text-[var(--ts-accent)] hover:bg-[var(--ts-accent)] hover:text-[var(--ts-on-accent)] transition-colors cursor-pointer"
            aria-label="Search"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>

      {/* Categories Filter List */}
      <div className="space-y-3 border-t border-[var(--ts-border-subtle)] pt-5">
        <h3 className="text-[10px] uppercase tracking-[0.22em] text-[var(--ts-accent)]">
          Categories
        </h3>
        <ul className="space-y-2 text-xs">
          <li>
            <Link
              to="/shop"
              onClick={() => isMobileDrawer && setMobileFiltersOpen(false)}
              className={`block py-1 transition-colors ${
                !categorySlugParam
                  ? 'text-[var(--ts-accent)] font-medium'
                  : 'text-[var(--ts-text-secondary)] hover:text-[var(--ts-text-primary)]'
              }`}
            >
              All Collections
            </Link>
          </li>
          {categories.map((cat) => (
            <li key={cat.id}>
              <Link
                to={`/shop/${cat.slug}`}
                onClick={() => isMobileDrawer && setMobileFiltersOpen(false)}
                className={`block py-1 transition-colors ${
                  categorySlugParam === cat.slug
                    ? 'text-[var(--ts-accent)] font-medium'
                    : 'text-[var(--ts-text-secondary)] hover:text-[var(--ts-text-primary)]'
                }`}
              >
                {cat.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Price Range Filter */}
      <form
        onSubmit={handlePriceFilterApply}
        className="space-y-3 border-t border-[var(--ts-border-subtle)] pt-5"
      >
        <h3 className="text-[10px] uppercase tracking-[0.22em] text-[var(--ts-accent)]">
          Price Range (₹)
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            min="0"
            placeholder="Min ₹"
            value={minPriceInput}
            onChange={(e) => setMinPriceInput(e.target.value)}
            className="w-full min-w-0 bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] px-3 py-2 text-xs text-[var(--ts-text-primary)] focus:outline-none focus:border-[var(--ts-accent)]"
          />
          <input
            type="number"
            min="0"
            placeholder="Max ₹"
            value={maxPriceInput}
            onChange={(e) => setMaxPriceInput(e.target.value)}
            className="w-full min-w-0 bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] px-3 py-2 text-xs text-[var(--ts-text-primary)] focus:outline-none focus:border-[var(--ts-accent)]"
          />
        </div>
        <Button type="submit" variant="charcoal" size="sm" className="w-full">
          Apply Price Filter
        </Button>
      </form>

      {/* Availability Toggle */}
      <div className="space-y-3 border-t border-[var(--ts-border-subtle)] pt-5">
        <h3 className="text-[10px] uppercase tracking-[0.22em] text-[var(--ts-accent)]">
          Availability
        </h3>
        <label className="flex items-center gap-2.5 text-xs text-[var(--ts-text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => {
              updateFilterParams({ inStock: e.target.checked ? 'true' : null });
              if (isMobileDrawer) setMobileFiltersOpen(false);
            }}
            className="accent-[var(--ts-accent)]"
          />
          <span>In-Stock Pieces Only</span>
        </label>
      </div>

      {/* Reset Filters */}
      <div className="border-t border-[var(--ts-border-subtle)] pt-5">
        <button
          type="button"
          onClick={handleResetFilters}
          className="inline-flex items-center gap-2 text-xs text-[var(--ts-text-muted)] hover:text-[var(--ts-accent)] transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset All Filters</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-6 sm:space-y-10">
      {/* Category / Shop Header Banner */}
      <div className="border-b border-[var(--ts-border-subtle)] pb-6 sm:pb-8 flex flex-col lg:flex-row lg:items-end justify-between gap-4 sm:gap-6">
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[var(--ts-text-muted)]">
            <Link to="/" className="hover:text-[var(--ts-accent)]">
              Home
            </Link>
            <span>/</span>
            <Link to="/shop" className="hover:text-[var(--ts-accent)]">
              Shop
            </Link>
            {activeCategory && (
              <>
                <span>/</span>
                <span className="text-[var(--ts-accent)] truncate">{activeCategory.name}</span>
              </>
            )}
          </div>

          <h1 className="font-serif-luxury text-2xl sm:text-5xl text-[var(--ts-text-primary)]">
            {activeCategory ? activeCategory.name : 'The Complete Collection'}
          </h1>

          {activeCategory?.description && (
            <p className="text-xs sm:text-sm text-[var(--ts-text-secondary)] max-w-2xl">
              {activeCategory.description}
            </p>
          )}
        </div>

        {/* Desktop Sort Selector */}
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ts-text-muted)]">
            Sort:
          </span>
          <select
            value={sortBy}
            onChange={(e) => updateFilterParams({ sort: e.target.value })}
            className="bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] px-3.5 py-2.5 text-xs text-[var(--ts-text-primary)] focus:outline-none focus:border-[var(--ts-accent)]"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Phone View: Top 2 Buttons Only (Filter & Sort) */}
        <div className="grid grid-cols-2 gap-3 lg:hidden w-full">
          <button
            type="button"
            onClick={() => {
              setMobileSortOpen(false);
              setMobileFiltersOpen(true);
            }}
            className="flex items-center justify-center gap-2 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] px-4 py-3 text-xs uppercase tracking-[0.18em] text-[var(--ts-text-primary)] cursor-pointer hover:border-[var(--ts-accent)]"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--ts-accent)]" />
            <span>Filter</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileFiltersOpen(false);
              setMobileSortOpen((v) => !v);
            }}
            className="flex items-center justify-center gap-2 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] px-4 py-3 text-xs uppercase tracking-[0.18em] text-[var(--ts-text-primary)] cursor-pointer hover:border-[var(--ts-accent)]"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-[var(--ts-accent)]" />
            <span>Sort</span>
          </button>
        </div>
      </div>

      {/* Mobile Sort Dropdown Sheet */}
      {mobileSortOpen && (
        <div className="lg:hidden border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] p-3 space-y-1">
          <div className="flex items-center justify-between px-2 pb-2 border-b border-[var(--ts-border-subtle)]">
            <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--ts-accent)]">
              Sort By
            </span>
            <button
              type="button"
              onClick={() => setMobileSortOpen(false)}
              className="text-[var(--ts-text-muted)] p-1 cursor-pointer"
              aria-label="Close Sort"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                updateFilterParams({ sort: opt.value });
                setMobileSortOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-xs text-left cursor-pointer ${
                sortBy === opt.value
                  ? 'text-[var(--ts-accent)] font-medium bg-[var(--ts-bg-elevated)]'
                  : 'text-[var(--ts-text-secondary)]'
              }`}
            >
              <span>{opt.label}</span>
              {sortBy === opt.value && <Check className="w-3.5 h-3.5 text-[var(--ts-accent)]" />}
            </button>
          ))}
        </div>
      )}

      {/* Mobile Filter Slide-Over Drawer */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex justify-end bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xs h-full bg-[var(--ts-bg-main)] border-l border-[var(--ts-border-strong)] p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-[var(--ts-border-subtle)] pb-4">
              <span className="text-xs uppercase tracking-[0.22em] text-[var(--ts-accent)] font-medium">
                Filters
              </span>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="p-1 text-[var(--ts-text-muted)] hover:text-[var(--ts-text-primary)] cursor-pointer"
                aria-label="Close Filters"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderFilterSections(true)}
          </div>
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={() => void loadCatalog()} />}

      {/* Main Content: Left Product Grid + Right Filter Sidebar on PC */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        {/* Product Grid (Left on PC) */}
        <div className="lg:col-span-9 lg:order-1 space-y-6 sm:space-y-8 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ts-text-muted)]">
            <span>
              Showing <strong className="text-[var(--ts-text-primary)]">{products.length}</strong> of{' '}
              <strong className="text-[var(--ts-text-primary)]">{totalCount}</strong> pieces
            </span>
            {searchQuery && (
              <span>
                Search: <strong className="text-[var(--ts-accent)]">"{searchQuery}"</strong>
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-6">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={idx} className="aspect-square sm:h-96" />
              ))}
            </div>
          ) : products.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-6">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {/* Numbered Page System (Pagination) */}
              {totalPages > 1 && (
                <div className="pt-8 border-t border-[var(--ts-border-subtle)] flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                    leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
                  >
                    Prev
                  </Button>

                  {getVisiblePageNumbers().map((item, idx) =>
                    item === 'ellipsis' ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-2 text-xs text-[var(--ts-text-muted)]"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => handlePageChange(item)}
                        className={`min-w-9 h-9 px-3 text-xs border transition-colors cursor-pointer ${
                          item === currentPage
                            ? 'bg-[var(--ts-accent)] border-[var(--ts-accent)] text-[var(--ts-on-accent)] font-semibold'
                            : 'bg-[var(--ts-bg-card)] border-[var(--ts-border-strong)] text-[var(--ts-text-secondary)] hover:border-[var(--ts-accent)]'
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                    rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              title="No Matching Creations Found"
              description="No products matched your current filter criteria, or no products have been published in this category yet."
              action={
                <Button variant="outline" size="sm" onClick={handleResetFilters}>
                  Clear Filters
                </Button>
              }
            />
          )}
        </div>

        {/* Right-Side Filter System (Desktop Only) */}
        <aside className="hidden lg:block lg:col-span-3 lg:order-2 lg:sticky lg:top-24 border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6">
          {renderFilterSections(false)}
        </aside>
      </div>
    </div>
  );
};
