// ==============================================================================
// TIMESSELLERS — CUSTOM 404 PAGE NOT FOUND
// ==============================================================================

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Compass } from 'lucide-react';
import { Button } from '@/components/ui/LuxuryPrimitives';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center space-y-6">
      <div className="w-14 h-14 mx-auto border border-[var(--ts-accent)]/40 bg-[var(--ts-bg-accent-tint)] flex items-center justify-center text-[var(--ts-accent)]">
        <Compass className="w-6 h-6" />
      </div>
      <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ts-accent)]">
        404 • Page Not Found
      </p>
      <h1 className="font-serif-luxury text-3xl sm:text-5xl text-[var(--ts-text-primary)] leading-tight">
        The Requested Destination Does Not Exist
      </h1>
      <p className="text-xs sm:text-sm text-[var(--ts-text-muted)] max-w-md mx-auto leading-relaxed">
        The page you are looking for may have been moved or retired. Explore our curated vault
        collections or track an existing order below.
      </p>
      <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
        <Link to="/">
          <Button variant="gold" size="md" rightIcon={<ArrowRight className="w-4 h-4" />}>
            Return Home
          </Button>
        </Link>
        <Link to="/collections">
          <Button variant="outline" size="md">
            Browse Collections
          </Button>
        </Link>
        <Link to="/track-order">
          <Button variant="outline" size="md">
            Track Order
          </Button>
        </Link>
      </div>
    </div>
  );
};
