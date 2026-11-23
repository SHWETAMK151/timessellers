-- ==============================================================================
-- TIMESSELLERS LUXURY E-COMMERCE PLATFORM
-- Migration 0007: Dynamic Luxury Theme System
-- Default Theme: 'light_luxury_editorial' (Warm Ivory / Cream, Deep Espresso, Burnished Gold)
-- Supports 5 Curated Maison Themes switchable from /admin/settings
-- ==============================================================================

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS active_theme TEXT NOT NULL DEFAULT 'light_luxury_editorial'
  CHECK (
    active_theme IN (
      'light_luxury_editorial',
      'obsidian_gold',
      'midnight_royal_platinum',
      'emerald_gold_heritage',
      'minimalist_monochrome'
    )
  );

UPDATE public.store_settings
SET active_theme = 'light_luxury_editorial'
WHERE singleton_key = 'default';
