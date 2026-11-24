// ==============================================================================
// TIMESSELLERS — SUPABASE EDGE FUNCTION: instagram-ai-sync
// Fetches Reels & Posts from Instagram Graph API, extracts structured product
// metadata from captions via Google Gemini AI, sources Reel covers + public
// product images into Supabase Storage (`product-images`), and saves products
// as Drafts (`status = 'inactive'`) for Admin review.
// ==============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

interface IgMediaItem {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  children?: {
    data?: Array<{
      id: string;
      media_type: string;
      media_url?: string;
      thumbnail_url?: string;
    }>;
  };
}

interface ExtractedProduct {
  is_product_post: boolean;
  name: string;
  brand: string;
  category_slug: string;
  selling_price: number;
  original_price: number | null;
  short_description: string;
  full_description: string;
  stock_quantity: number;
  image_search_query: string;
  specifications: Array<{
    spec_group: string;
    spec_key: string;
    spec_value: string;
  }>;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function timingSafeEqual(a: string, b: string): boolean {
  const cleanA = a.trim();
  const cleanB = b.trim();
  if (!cleanA || cleanA.length !== cleanB.length) return false;
  let diff = 0;
  for (let i = 0; i < cleanA.length; i++) {
    diff |= cleanA.charCodeAt(i) ^ cleanB.charCodeAt(i);
  }
  return diff === 0;
}

async function extractProductWithGemini(
  geminiApiKey: string,
  caption: string,
  categories: Array<{ slug: string; name: string }>
): Promise<ExtractedProduct> {
  const categoryList = categories.map((c) => `${c.slug} (${c.name})`).join(', ');
  const prompt = `You are a luxury e-commerce catalog manager for TIMESSELLERS.
Analyze the following Instagram post/reel caption and extract structured product details.
Available category slugs: ${categoryList}.

Caption:
"""
${caption}
"""

Return ONLY valid JSON matching this schema:
{
  "is_product_post": boolean (true if this caption describes a product for sale, false for memes/announcements/non-products),
  "name": string (clean luxury product name, max 90 chars),
  "brand": string (brand name if mentioned, otherwise "TIMESSELLERS"),
  "category_slug": string (must be one of the available category slugs above; pick the closest match),
  "selling_price": number (INR numeric price without commas/symbols; 0 if not mentioned),
  "original_price": number | null (MRP in INR if mentioned and >= selling_price, otherwise null),
  "short_description": string (concise 1-2 sentence luxury summary, max 220 chars),
  "full_description": string (well-formatted multi-line product description based on the caption),
  "stock_quantity": integer (default 1 if not explicitly stated),
  "image_search_query": string (clean product photo search query e.g. "Rolex Submariner Date black dial watch product photo"),
  "specifications": [
    { "spec_group": "General", "spec_key": "string", "spec_value": "string" }
  ]
}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Gemini returned empty extraction output.');
  }

  return JSON.parse(rawText) as ExtractedProduct;
}

async function searchPublicProductImages(query: string): Promise<string[]> {
  if (!query.trim()) return [];
  const serperKey = Deno.env.get('SERPER_API_KEY');
  const googleKey = Deno.env.get('GOOGLE_CSE_API_KEY');
  const googleCx = Deno.env.get('GOOGLE_CSE_CX');

  try {
    if (serperKey) {
      const res = await fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, num: 4 }),
      });
      if (res.ok) {
        const data = await res.json();
        return (data.images || [])
          .map((img: { imageUrl?: string }) => img.imageUrl)
          .filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('https://'))
          .slice(0, 3);
      }
    }

    if (googleKey && googleCx) {
      const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(googleKey)}&cx=${encodeURIComponent(googleCx)}&q=${encodeURIComponent(query)}&searchType=image&num=3`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        return (data.items || [])
          .map((item: { link?: string }) => item.link)
          .filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('https://'))
          .slice(0, 3);
      }
    }

    // Zero-key public fallback via Wikimedia Commons API
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url|mime&format=json`;
    const res = await fetch(wikiUrl);
    if (res.ok) {
      const data = await res.json();
      const pages = Object.values(data?.query?.pages || {}) as Array<{
        imageinfo?: Array<{ url?: string; mime?: string }>;
      }>;
      return pages
        .map((p) => p.imageinfo?.[0])
        .filter(
          (info) =>
            info?.url &&
            info.url.startsWith('https://') &&
            info.mime &&
            ['image/jpeg', 'image/png', 'image/webp'].includes(info.mime)
        )
        .map((info) => info!.url!)
        .slice(0, 2);
    }
  } catch {
    // Non-fatal: caller handles empty public results
  }

  return [];
}

async function mirrorImageToSupabase(
  adminClient: ReturnType<typeof createClient>,
  sourceUrl: string,
  storagePathPrefix: string
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const ext = extMap[contentType];
    if (!ext) return null;

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 8 * 1024 * 1024) return null;

    const path = `${storagePathPrefix}.${ext}`;
    const { error: uploadErr } = await adminClient.storage
      .from('product-images')
      .upload(path, bytes, {
        contentType,
        upsert: true,
      });

    if (uploadErr) return null;

    const { data: pub } = adminClient.storage.from('product-images').getPublicUrl(path);
    return pub.publicUrl;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const igAccessToken = Deno.env.get('IG_ACCESS_TOKEN');
    const igUserId = Deno.env.get('IG_USER_ID');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const cronSecret = Deno.env.get('IG_SYNC_CRON_SECRET') || '';

    if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseAnonKey) {
      throw new Error('Server Supabase environment variables are not configured.');
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Verify authorization: either valid Admin JWT or IG_SYNC_CRON_SECRET
    let triggeredBy: string | null = null;
    let triggerSource = 'admin_manual';
    const providedCronSecret = req.headers.get('x-cron-secret') || '';
    const isCronAuth = Boolean(cronSecret && timingSafeEqual(providedCronSecret, cronSecret));

    if (isCronAuth) {
      triggerSource = 'scheduled_cron';
    } else {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Authorization required.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Invalid session.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: isAdmin } = await adminClient.rpc('is_admin', {
        check_user_id: userData.user.id,
      });

      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Administrator privileges required.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      triggeredBy = userData.user.id;
    }

    if (!igAccessToken || !igUserId || !geminiApiKey) {
      return new Response(
        JSON.stringify({
          error:
            'Missing Supabase Edge Function Secrets: IG_ACCESS_TOKEN, IG_USER_ID, and GEMINI_API_KEY must be configured in Supabase.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const limit = Math.min(Math.max(Number(body.limit || 12), 1), 25);

    // 1. Fetch store categories for accurate AI mapping
    const { data: categoriesData } = await adminClient
      .from('categories')
      .select('id, name, slug')
      .eq('is_active', true);

    const categories = (categoriesData || []) as Array<{
      id: string;
      name: string;
      slug: string;
    }>;

    // 2. Fetch recent Reels & Posts from Instagram / Meta Graph API
    const graphHost = igAccessToken.startsWith('IG')
      ? 'https://graph.instagram.com'
      : 'https://graph.facebook.com';
    const igEndpoint = `${graphHost}/v21.0/${encodeURIComponent(igUserId)}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}&limit=${limit}&access_token=${encodeURIComponent(igAccessToken)}`;
    const igRes = await fetch(igEndpoint);
    if (!igRes.ok) {
      const igErr = await igRes.text();
      throw new Error(`Instagram Graph API failed (${igRes.status}): ${igErr}`);
    }

    const igJson = await igRes.json();
    const mediaList = (igJson.data || []) as IgMediaItem[];

    // 3. Check already-imported Instagram media IDs
    const mediaIds = mediaList.map((m) => m.id);
    const { data: existingRows } = await adminClient
      .from('products')
      .select('instagram_media_id')
      .in('instagram_media_id', mediaIds.length > 0 ? mediaIds : ['__none__']);

    const existingSet = new Set(
      (existingRows || []).map((r: { instagram_media_id: string }) => r.instagram_media_id)
    );

    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const media of mediaList) {
      if (existingSet.has(media.id)) {
        skippedCount++;
        details.push({ media_id: media.id, status: 'skipped', reason: 'Already imported' });
        continue;
      }

      const caption = (media.caption || '').trim();
      if (!caption) {
        skippedCount++;
        details.push({ media_id: media.id, status: 'skipped', reason: 'Empty caption' });
        continue;
      }

      try {
        const extracted = await extractProductWithGemini(geminiApiKey, caption, categories);
        if (!extracted.is_product_post || !extracted.name) {
          skippedCount++;
          details.push({
            media_id: media.id,
            status: 'skipped',
            reason: 'AI classified as non-product post',
          });
          continue;
        }

        // Gather image candidates:
        // 1) Reel cover (`thumbnail_url`) or Image `media_url` + carousel children
        const candidateUrls: string[] = [];
        if (media.media_type === 'VIDEO' && media.thumbnail_url) {
          candidateUrls.push(media.thumbnail_url);
        } else if (media.media_type === 'IMAGE' && media.media_url) {
          candidateUrls.push(media.media_url);
        } else if (media.media_type === 'CAROUSEL_ALBUM') {
          for (const child of media.children?.data || []) {
            if (child.media_type === 'VIDEO' && child.thumbnail_url) {
              candidateUrls.push(child.thumbnail_url);
            } else if (child.media_url) {
              candidateUrls.push(child.media_url);
            }
          }
          if (candidateUrls.length === 0 && media.media_url) {
            candidateUrls.push(media.media_url);
          }
        }

        // 2) Public source fallback / supplemental product photos using AI search query
        if (candidateUrls.length === 0 || media.media_type === 'VIDEO') {
          const publicUrls = await searchPublicProductImages(
            extracted.image_search_query || `${extracted.brand} ${extracted.name}`
          );
          for (const u of publicUrls) {
            if (!candidateUrls.includes(u)) candidateUrls.push(u);
          }
        }

        // Mirror up to 4 images into Supabase Storage (`product-images`)
        const storedUrls: string[] = [];
        for (let i = 0; i < Math.min(candidateUrls.length, 4); i++) {
          const mirrored = await mirrorImageToSupabase(
            adminClient,
            candidateUrls[i],
            `ig/${media.id}/img-${i + 1}`
          );
          if (mirrored) storedUrls.push(mirrored);
        }

        if (storedUrls.length === 0) {
          errorCount++;
          details.push({
            media_id: media.id,
            status: 'error',
            reason: 'No downloadable Reel cover or public product photo found',
          });
          continue;
        }

        const matchedCat =
          categories.find((c) => c.slug === extracted.category_slug) || categories[0] || null;

        const baseSlug = slugify(extracted.name) || `ig-item-${media.id.slice(-6)}`;
        const uniqueSuffix = media.id.slice(-5).toLowerCase();
        const productSlug = `${baseSlug}-${uniqueSuffix}`;
        const sku = `IG-${media.id.slice(-8).toUpperCase()}`;

        const sellingPrice = Math.max(0, Number(extracted.selling_price || 0));
        const originalPrice =
          extracted.original_price && Number(extracted.original_price) >= sellingPrice
            ? Number(extracted.original_price)
            : null;

        // Insert as Draft (`status = 'inactive'`) for admin review
        const { data: insertedProduct, error: prodErr } = await adminClient
          .from('products')
          .insert({
            name: extracted.name.slice(0, 120),
            slug: productSlug,
            sku,
            category_id: matchedCat?.id ?? null,
            brand: (extracted.brand || 'TIMESSELLERS').slice(0, 60),
            short_description: (extracted.short_description || '').slice(0, 260),
            full_description: extracted.full_description || caption,
            selling_price: sellingPrice,
            original_price: originalPrice,
            main_image_url: storedUrls[0],
            is_new_arrival: true,
            status: 'inactive',
            instagram_media_id: media.id,
            instagram_permalink: media.permalink || null,
          })
          .select('id')
          .single();

        if (prodErr || !insertedProduct) {
          throw new Error(prodErr?.message || 'Failed to insert draft product');
        }

        const productId = insertedProduct.id as string;

        await adminClient.from('product_images').insert(
          storedUrls.map((url, idx) => ({
            product_id: productId,
            image_url: url,
            alt_text: extracted.name,
            display_order: idx,
            is_primary: idx === 0,
          }))
        );

        if (Array.isArray(extracted.specifications) && extracted.specifications.length > 0) {
          await adminClient.from('product_specifications').insert(
            extracted.specifications.slice(0, 12).map((spec, idx) => ({
              product_id: productId,
              spec_group: spec.spec_group || 'General',
              spec_key: spec.spec_key,
              spec_value: spec.spec_value,
              display_order: idx,
            }))
          );
        }

        await adminClient.from('inventory').insert({
          product_id: productId,
          stock_quantity: Math.max(0, Math.round(Number(extracted.stock_quantity ?? 1))),
          low_stock_threshold: 2,
        });

        importedCount++;
        details.push({
          media_id: media.id,
          product_id: productId,
          name: extracted.name,
          images_count: storedUrls.length,
          status: 'imported_draft',
        });
      } catch (itemErr) {
        errorCount++;
        details.push({
          media_id: media.id,
          status: 'error',
          reason: itemErr instanceof Error ? itemErr.message : 'Unknown extraction error',
        });
      }
    }

    const logStatus =
      errorCount > 0 && importedCount === 0
        ? 'failed'
        : errorCount > 0
          ? 'partial'
          : 'completed';

    await adminClient.from('instagram_sync_logs').insert({
      triggered_by: triggeredBy,
      trigger_source: triggerSource,
      status: logStatus,
      fetched_count: mediaList.length,
      imported_count: importedCount,
      skipped_count: skippedCount,
      error_count: errorCount,
      details,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        fetched_count: mediaList.length,
        imported_count: importedCount,
        skipped_count: skippedCount,
        error_count: errorCount,
        details,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : 'Instagram AI sync failed.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
