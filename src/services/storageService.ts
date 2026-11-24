// ==============================================================================
// TIMESSELLERS — SUPABASE STORAGE SERVICE
// Validates file MIME types and file size limits before upload.
// ==============================================================================

import { supabase } from '@/lib/supabase';

export type StorageBucketName =
  | 'product-images'
  | 'product-videos'
  | 'category-images'
  | 'store-assets'
  | 'avatars'
  | 'payment-proofs';

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const ALLOWED_PROOF_MIME_TYPES = [...ALLOWED_IMAGE_MIME_TYPES, 'application/pdf'];
const MAX_STANDARD_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_AVATAR_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_VIDEO_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

export function validateUploadFile(file: File, bucket: StorageBucketName): void {
  const maxBytes =
    bucket === 'avatars'
      ? MAX_AVATAR_FILE_BYTES
      : bucket === 'product-videos'
        ? MAX_VIDEO_FILE_BYTES
        : MAX_STANDARD_FILE_BYTES;
  const allowedMimes =
    bucket === 'payment-proofs'
      ? ALLOWED_PROOF_MIME_TYPES
      : bucket === 'product-videos'
        ? ALLOWED_VIDEO_MIME_TYPES
        : bucket === 'store-assets'
          ? [...ALLOWED_IMAGE_MIME_TYPES, 'image/svg+xml']
          : ALLOWED_IMAGE_MIME_TYPES;

  if (!allowedMimes.includes(file.type)) {
    throw new Error(
      `Invalid file format (${file.type || 'unknown'}). Allowed formats: ${allowedMimes.join(', ')}`
    );
  }

  if (file.size > maxBytes) {
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
    throw new Error(`File size exceeds the ${maxMb}MB security limit.`);
  }
}

export async function uploadFileToStorage(
  bucket: StorageBucketName,
  file: File,
  folderPrefix?: string
): Promise<{ path: string; url: string }> {
  validateUploadFile(file, bucket);

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeBaseName = file.name
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .slice(0, 40);

  const uniqueName = `${Date.now()}-${ crypto.randomUUID().slice(0, 8) }-${safeBaseName}.${ext}`;
  const objectPath = folderPrefix ? `${folderPrefix}/${uniqueName}` : uniqueName;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  if (bucket === 'payment-proofs') {
    // payment-proofs is a private bucket; create a signed URL or store path
    const { data: signedData, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(objectPath, 60 * 60 * 24 * 30); // 30 days for admin review

    if (signedError || !signedData?.signedUrl) {
      return { path: objectPath, url: objectPath };
    }
    return { path: objectPath, url: signedData.signedUrl };
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return {
    path: objectPath,
    url: publicUrlData.publicUrl,
  };
}

export async function deleteFileFromStorage(
  bucket: StorageBucketName,
  fileUrlOrPath: string
): Promise<void> {
  let objectPath = fileUrlOrPath;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = fileUrlOrPath.indexOf(marker);
  if (idx !== -1) {
    objectPath = decodeURIComponent(fileUrlOrPath.slice(idx + marker.length));
  }
  await supabase.storage.from(bucket).remove([objectPath]);
}
