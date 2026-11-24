-- ==============================================================================
-- TIMESSELLERS LUXURY E-COMMERCE PLATFORM
-- Migration 0011: Instagram AI Auto-Sync Schema & Logs
-- ==============================================================================

-- 1. Track imported Instagram media IDs on products to prevent duplicates
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS instagram_media_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS instagram_permalink TEXT;

CREATE INDEX IF NOT EXISTS idx_products_instagram_media_id
  ON public.products(instagram_media_id)
  WHERE instagram_media_id IS NOT NULL;

-- 2. Optional Instagram display metadata on store_settings
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS instagram_handle TEXT,
  ADD COLUMN IF NOT EXISTS instagram_auto_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Admin-only Instagram sync audit logs
CREATE TABLE IF NOT EXISTS public.instagram_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_source TEXT NOT NULL DEFAULT 'admin_manual',
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partial', 'failed')),
  fetched_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.instagram_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "instagram_sync_logs_admin_select" ON public.instagram_sync_logs;
CREATE POLICY "instagram_sync_logs_admin_select"
  ON public.instagram_sync_logs FOR SELECT
  USING (public.is_admin());

GRANT SELECT ON public.instagram_sync_logs TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.instagram_sync_logs TO service_role;

NOTIFY pgrst, 'reload schema';
