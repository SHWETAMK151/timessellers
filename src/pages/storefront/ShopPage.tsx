// ==============================================================================
// TIMESSELLERS — SHOPPING & CATEGORY PAGE (/shop & /shop/:category)
// Supports search, category filtering, price range filtering, availability
// filtering, sorting (newest, popular, price asc, price desc), and pagination.
// ==============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { SlidersHorizontal, Search, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
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

  const handleSearchFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilterParams({ q: searchInput.trim() || null });
  };

  const handlePriceFilterApply = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilterParams({
      minPrice: minPriceInput.trim() || null,
      maxPrice: maxPriceInput.trim() || null,
    });
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setSearchParams(new URLSearchParams());
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      {/* Category / Shop Header Banner */}
      <div className="border-b border-[var(--ts-border-subtle)] pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
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
                <span className="text-[var(--ts-accent)]">{activeCategory.name}</span>
              </>
            )}
          </div>

          <h1 className="font-serif-luxury text-3xl sm:text-5xl text-[var(--ts-text-primary)]">
            {activeCategory ? activeCategory.name : 'The Complete Collection'}
          </h1>

          {activeCategory?.description && (
            <p className="text-xs sm:text-sm text-[var(--ts-text-secondary)] max-w-2xl">
              {activeCategory.description}
            </p>
          )}
        </div>

        {/* Sort & Mobile Filter Trigger */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            className="lg:hidden inline-flex items-center gap-2 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] px-4 py-2.5 text-xs uppercase tracking-[0.16em] text-[var(--ts-text-primary)] cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--ts-accent)]" />
            <span>Filters</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ts-text-muted)]">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => updateFilterParams({ sort: e.target.value })}
              className="bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] px-3.5 py-2.5 text-xs text-[var(--ts-text-primary)] focus:outline-none focus:border-[var(--ts-accent)]"
            >
              <option value="newest">Newest Arrivals</option>
              <option value="popular">Most Popular</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void loadCatalog()} />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Sidebar Filters */}
        <aside
          className={`lg:col-span-3 space-y-8 ${
            mobileFiltersOpen ? 'block' : 'hidden lg:block'
          }`}
        >
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
          <div className="space-y-3 border-t border-[var(--ts-border-subtle)] pt-6">
            <h3 className="text-[10px] uppercase tracking-[0.22em] text-[var(--ts-accent)]">
              Categories
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link
                  to="/shop"
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
            className="space-y-3 border-t border-[var(--ts-border-subtle)] pt-6"
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
                className="bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] px-3 py-2 text-xs text-[var(--ts-text-primary)] focus:outline-none focus:border-[var(--ts-accent)]"
              />
              <input
                type="number"
                min="0"
                placeholder="Max ₹"
                value={maxPriceInput}
                onChange={(e) => setMaxPriceInput(e.target.value)}
                className="bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] px-3 py-2 text-xs text-[var(--ts-text-primary)] focus:outline-none focus:border-[var(--ts-accent)]"
              />
            </div>
            <Button type="submit" variant="charcoal" size="sm" className="w-full">
              Apply Price Filter
            </Button>
          </form>

          {/* Availability Toggle */}
          <div className="space-y-3 border-t border-[var(--ts-border-subtle)] pt-6">
            <h3 className="text-[10px] uppercase tracking-[0.22em] text-[var(--ts-accent)]">
              Availability
            </h3>
            <label className="flex items-center gap-2.5 text-xs text-[var(--ts-text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) =>
                  updateFilterParams({ inStock: e.target.checked ? 'true' : null })
                }
                className="accent-[var(--ts-accent)]"
              />
              <span>In-Stock Pieces Only</span>
            </label>
          </div>

          {/* Reset Filters */}
          <div className="border-t border-[var(--ts-border-subtle)] pt-6">
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-2 text-xs text-[var(--ts-text-muted)] hover:text-[var(--ts-accent)] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset All Filters</span>
            </button>
          </div>
        </aside>

        {/* Product Grid */}
        <div className="lg:col-span-9 space-y-8">
          <div className="flex items-center justify-between text-xs text-[var(--ts-text-muted)]">
            <span>
              Showing <strong className="text-[var(--ts-text-primary)]">{products.length}</strong> of{' '}
              <strong className="text-[var(--ts-text-primary)]">{totalCount}</strong> pieces
            </span>
            {searchQuery && (
              <span>
                Search query: <strong className="text-[var(--ts-accent)]">"{searchQuery}"</strong>
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={idx} className="h-96" />
              ))}
            </div>
          ) : products.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="pt-8 border-t border-[var(--ts-border-subtle)] flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => updateFilterParams({ page: String(currentPage - 1) })}
                    leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
                  >
                    Previous
                  </Button>

                  <span className="px-4 text-xs text-[var(--ts-text-secondary)]">
                    Page <strong className="text-[var(--ts-text-primary)]">{currentPage}</strong> of{' '}
                    <strong className="text-[var(--ts-text-primary)]">{totalPages}</strong>
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => updateFilterParams({ page: String(currentPage + 1) })}
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
      </div>
    </div>
  );
};
