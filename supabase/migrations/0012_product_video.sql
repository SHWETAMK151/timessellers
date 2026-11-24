-- ==============================================================================
-- TIMESSELLERS LUXURY E-COMMERCE PLATFORM
-- Migration 0012: Product Video Support (`video_url` + `product-videos` bucket)
-- ==============================================================================

-- 1. Add optional video_url column to public.products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS video_url TEXT;

-- 2. Create public `product-videos` storage bucket (max 50MB, MP4 / WebM / MOV)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-videos',
  'product-videos',
  TRUE,
  52428800,
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE
SET
  public = TRUE,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime'];

DROP POLICY IF EXISTS "Public read product videos" ON storage.objects;
CREATE POLICY "Public read product videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-videos');

DROP POLICY IF EXISTS "Admin upload product videos" ON storage.objects;
CREATE POLICY "Admin upload product videos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-videos'
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Admin update product videos" ON storage.objects;
CREATE POLICY "Admin update product videos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'product-videos'
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Admin delete product videos" ON storage.objects;
CREATE POLICY "Admin delete product videos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'product-videos'
    AND public.is_admin(auth.uid())
  );

NOTIFY pgrst, 'reload schema';
