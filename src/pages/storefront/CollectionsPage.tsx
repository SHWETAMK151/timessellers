// ==============================================================================
// TIMESSELLERS — CATEGORY SELECTION PAGE (/collections)
// Displays all active categories first; clicking any category opens /shop/:slug
// showing only the items of that selected category.
// ==============================================================================

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { fetchActiveCategories } from '@/services/catalogService';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Button, EmptyState, ErrorBanner, Skeleton } from '@/components/ui/LuxuryPrimitives';
import type { Category } from '@/types/database';

export const CollectionsPage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCategories = async () => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchActiveCategories();
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load collections');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-8 sm:space-y-10">
      <div className="border-b border-[var(--ts-border-subtle)] pb-6 sm:pb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[var(--ts-text-muted)]">
            <Link to="/" className="hover:text-[var(--ts-accent)]">
              Home
            </Link>
            <span>/</span>
            <span className="text-[var(--ts-accent)]">Collections</span>
          </div>
          <h1 className="font-serif-luxury text-3xl sm:text-5xl text-[var(--ts-text-primary)]">
            Select a Category
          </h1>
          <p className="text-xs sm:text-sm text-[var(--ts-text-secondary)] max-w-xl">
            Choose a department below to explore curated creations in that category.
          </p>
        </div>

        <Link to="/shop" className="shrink-0">
          <Button variant="outline" size="md" rightIcon={<ArrowRight className="w-4 h-4" />}>
            View All Items
          </Button>
        </Link>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void loadCategories()} />}

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : categories.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              to={`/shop/${cat.slug}`}
              className="group border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] hover:border-[var(--ts-accent)]/60 transition-all duration-300 flex flex-col overflow-hidden"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-[var(--ts-bg-elevated)]">
                {cat.image_url ? (
                  <img
                    src={cat.image_url}
                    alt={cat.name}
                    loading="lazy"
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs uppercase tracking-widest text-[var(--ts-text-muted)]">
                    {cat.name}
                  </div>
                )}
              </div>
              <div className="p-3.5 sm:p-5 flex-1 flex flex-col justify-between space-y-2">
                <div className="space-y-1">
                  <h2 className="font-serif-luxury text-base sm:text-xl text-[var(--ts-text-primary)] group-hover:text-[var(--ts-accent)] transition-colors">
                    {cat.name}
                  </h2>
                  {cat.description && (
                    <p className="text-[11px] sm:text-xs text-[var(--ts-text-muted)] line-clamp-2 hidden sm:block">
                      {cat.description}
                    </p>
                  )}
                </div>
                <div className="pt-1 flex items-center gap-1.5 text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-[var(--ts-accent)]">
                  <span>Explore</span>
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No Categories Available"
          description="Categories added in the admin panel will appear here."
          action={
            <Link to="/shop">
              <Button variant="gold" size="sm">
                Browse All Items
              </Button>
            </Link>
          }
        />
      )}
    </div>
  );
};
