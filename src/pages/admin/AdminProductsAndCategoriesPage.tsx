// ==============================================================================
// TIMESSELLERS — ADMIN PRODUCT & CATEGORY MANAGEMENT
// (/admin/products & /admin/categories)
// Supports full CRUD, Supabase Storage image uploads with validation, image ordering,
// variants editor, specifications editor, scheduled discounts, and archive/publish.
// ==============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  Upload,
  Archive,
  Eye,
  ArrowUp,
  ArrowDown,
  X,
  Search,
  Instagram,
  Sparkles,
} from 'lucide-react';
import {
  fetchAllAdminProducts,
  fetchAllAdminCategories,
  saveAdminProduct,
  updateAdminProductStatus,
  deleteAdminProduct,
  saveAdminCategory,
  deleteAdminCategory,
  syncInstagramProducts,
  type UpsertProductInput,
  type InstagramSyncResult,
} from '@/services/adminService';
import { uploadFileToStorage } from '@/services/storageService';
import { extractInventory, formatINR, slugify } from '@/lib/utils';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  Select,
} from '@/components/ui/LuxuryPrimitives';
import type { Category, Product, ProductStatus } from '@/types/database';

// ==============================================================================
// 1. ADMIN PRODUCT MANAGEMENT PAGE (/admin/products)
// ==============================================================================
export const AdminProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showEditor, setShowEditor] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSyncingInstagram, setIsSyncingInstagram] = useState(false);
  const [igSyncResult, setIgSyncResult] = useState<InstagramSyncResult | null>(null);
  const [showIgGuide, setShowIgGuide] = useState(false);

  // Comprehensive Product Editor State
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [brand, setBrand] = useState('TIMESSELLERS');
  const [shortDesc, setShortDesc] = useState('');
  const [fullDesc, setFullDesc] = useState('');
  const [sellingPrice, setSellingPrice] = useState('0');
  const [originalPrice, setOriginalPrice] = useState('');
  const [scheduledDiscountPrice, setScheduledDiscountPrice] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [scheduledEnd, setScheduledEnd] = useState('');
  const [mainImageUrl, setMainImageUrl] = useState('');
  const [additionalImages, setAdditionalImages] = useState<
    { image_url: string; alt_text?: string; display_order: number }[]
  >([]);
  const [newImageUrlInput, setNewImageUrlInput] = useState('');
  const [availableStock, setAvailableStock] = useState('10');
  const [lowStockThreshold, setLowStockThreshold] = useState('5');
  const [isFeatured, setIsFeatured] = useState(false);
  const [isNewArrival, setIsNewArrival] = useState(false);
  const [isBestSeller, setIsBestSeller] = useState(false);
  const [isTrending, setIsTrending] = useState(false);
  const [collectionTag, setCollectionTag] = useState('');
  const [status, setStatus] = useState<ProductStatus>('active');

  const [variants, setVariants] = useState<UpsertProductInput['variants']>([]);
  const [specifications, setSpecifications] = useState<UpsertProductInput['specifications']>([]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [prods, cats] = await Promise.all([
        fetchAllAdminProducts(),
        fetchAllAdminCategories(),
      ]);
      setProducts(prods);
      setCategories(cats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openNewProductModal = () => {
    setEditId(undefined);
    setName('');
    setSlug('');
    setSku(`TS-${Math.random().toString(36).substring(2, 8).toUpperCase()}`);
    setCategoryId(categories[0]?.id || '');
    setBrand('TIMESSELLERS');
    setShortDesc('');
    setFullDesc('');
    setSellingPrice('');
    setOriginalPrice('');
    setScheduledDiscountPrice('');
    setScheduledStart('');
    setScheduledEnd('');
    setMainImageUrl('');
    setAdditionalImages([]);
    setAvailableStock('15');
    setLowStockThreshold('5');
    setIsFeatured(true);
    setIsNewArrival(true);
    setIsBestSeller(false);
    setIsTrending(true);
    setCollectionTag('');
    setStatus('active');
    setVariants([]);
    setSpecifications([
      { spec_group: 'General', spec_key: 'Material', spec_value: '', display_order: 0 },
      { spec_group: 'General', spec_key: 'Warranty', spec_value: '2 Years Maison Warranty', display_order: 1 },
    ]);
    setShowEditor(true);
  };

  const openEditProductModal = (prod: Product) => {
    const inv = extractInventory(prod);
    setEditId(prod.id);
    setName(prod.name);
    setSlug(prod.slug);
    setSku(prod.sku);
    setCategoryId(prod.category_id || '');
    setBrand(prod.brand);
    setShortDesc(prod.short_description);
    setFullDesc(prod.full_description);
    setSellingPrice(String(prod.selling_price));
    setOriginalPrice(prod.original_price ? String(prod.original_price) : '');
    setScheduledDiscountPrice(
      prod.scheduled_discount_price ? String(prod.scheduled_discount_price) : ''
    );
    setScheduledStart(
      prod.scheduled_discount_start ? prod.scheduled_discount_start.slice(0, 16) : ''
    );
    setScheduledEnd(prod.scheduled_discount_end ? prod.scheduled_discount_end.slice(0, 16) : '');
    setMainImageUrl(prod.main_image_url);
    setAdditionalImages(
      (prod.product_images || []).map((img, i) => ({
        image_url: img.image_url,
        alt_text: img.alt_text || prod.name,
        display_order: img.display_order ?? i,
      }))
    );
    setAvailableStock(String(inv?.available_quantity ?? 0));
    setLowStockThreshold(String(inv?.low_stock_threshold ?? 5));
    setIsFeatured(prod.is_featured);
    setIsNewArrival(prod.is_new_arrival);
    setIsBestSeller(prod.is_best_seller);
    setIsTrending(prod.is_trending);
    setCollectionTag(prod.collection_tag || '');
    setStatus(prod.status);
    setVariants(
      (prod.product_variants || []).map((v) => ({
        id: v.id,
        variant_sku: v.variant_sku,
        size: v.size,
        color: v.color,
        color_hex: v.color_hex,
        model: v.model,
        option_name: v.option_name,
        option_value: v.option_value,
        price_adjustment: Number(v.price_adjustment),
        available_stock: Number(v.available_stock),
        is_active: v.is_active,
      }))
    );
    setSpecifications(
      (prod.product_specifications || []).map((s, idx) => ({
        spec_group: s.spec_group,
        spec_key: s.spec_key,
        spec_value: s.spec_value,
        display_order: s.display_order ?? idx,
      }))
    );
    setShowEditor(true);
  };

  const handleMainImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsUploadingImage(true);
    try {
      const uploaded = await uploadFileToStorage('product-images', file);
      setMainImageUrl(uploaded.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleGalleryFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError(null);
    setIsUploadingImage(true);
    try {
      for (const file of files) {
        const uploaded = await uploadFileToStorage('product-images', file);
        setAdditionalImages((prev) => [
          ...prev,
          { image_url: uploaded.url, display_order: prev.length },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gallery upload failed');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const moveGalleryImage = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= additionalImages.length) return;
    const copy = [...additionalImages];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    setAdditionalImages(copy.map((item, idx) => ({ ...item, display_order: idx })));
  };

  const handleSaveProductForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !sku.trim() || !mainImageUrl.trim()) {
      setError('Product Name, SKU, and Main Image URL are required.');
      return;
    }

    const numSelling = Number(sellingPrice);
    const numOrig = originalPrice ? Number(originalPrice) : null;
    if (Number.isNaN(numSelling) || numSelling < 0) {
      setError('Please enter a valid selling price.');
      return;
    }
    if (numOrig !== null && numOrig < numSelling) {
      setError('Original price must be greater than or equal to the selling price.');
      return;
    }

    setIsSaving(true);
    try {
      await saveAdminProduct({
        id: editId,
        name,
        slug: slug.trim() || slugify(name),
        sku,
        category_id: categoryId || null,
        brand,
        short_description: shortDesc,
        full_description: fullDesc,
        selling_price: numSelling,
        original_price: numOrig,
        scheduled_discount_price: scheduledDiscountPrice ? Number(scheduledDiscountPrice) : null,
        scheduled_discount_start: scheduledStart ? new Date(scheduledStart).toISOString() : null,
        scheduled_discount_end: scheduledEnd ? new Date(scheduledEnd).toISOString() : null,
        main_image_url: mainImageUrl,
        is_featured: isFeatured,
        is_new_arrival: isNewArrival,
        is_best_seller: isBestSeller,
        is_trending: isTrending,
        collection_tag: collectionTag || null,
        status,
        available_stock: Number(availableStock || 0),
        low_stock_threshold: Number(lowStockThreshold || 5),
        additional_images: additionalImages,
        variants,
        specifications,
      });

      setShowEditor(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ts-border-subtle)] pb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
            Vault Catalogue Management
          </p>
          <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">
            Products ({products.length})
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="md"
            isLoading={isSyncingInstagram}
            onClick={async () => {
              setError(null);
              setIgSyncResult(null);
              setIsSyncingInstagram(true);
              try {
                const res = await syncInstagramProducts(12);
                setIgSyncResult(res);
                await loadData();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Instagram AI sync failed');
              } finally {
                setIsSyncingInstagram(false);
              }
            }}
            leftIcon={<Instagram className="w-4 h-4" />}
          >
            Sync Instagram (AI)
          </Button>
          <Button
            variant="outline"
            size="md"
            onClick={() => setShowIgGuide((v) => !v)}
            leftIcon={<Sparkles className="w-4 h-4" />}
          >
            IG Setup
          </Button>
          <Button
            variant="gold"
            size="md"
            onClick={openNewProductModal}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Create New Product
          </Button>
        </div>
      </div>

      {showIgGuide && (
        <div className="border border-[var(--ts-accent)]/40 bg-[var(--ts-bg-elevated)] p-6 space-y-3 text-xs text-[var(--ts-text-secondary)]">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--ts-accent)] font-medium">
              Instagram Graph API + Gemini AI Auto-Sync Setup
            </p>
            <button
              type="button"
              onClick={() => setShowIgGuide(false)}
              className="text-[var(--ts-text-muted)] hover:text-[var(--ts-text-primary)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p>
            Deploy the <code className="text-[var(--ts-accent)]">instagram-ai-sync</code> Edge Function and add these secrets in{' '}
            <strong>Supabase Dashboard → Edge Functions → Secrets</strong>:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><code>IG_USER_ID</code> — Your Instagram Business/Creator Account ID</li>
            <li><code>IG_ACCESS_TOKEN</code> — Long-lived Instagram Graph API access token</li>
            <li><code>GEMINI_API_KEY</code> — Google Gemini API key (extracts title, brand, INR price, category &amp; specs from captions)</li>
            <li><code>SERPER_API_KEY</code> (optional) — Google Image Search key for extra public product photos when Reels have no photo</li>
            <li><code>IG_SYNC_CRON_SECRET</code> (optional) — Secret header <code>x-cron-secret</code> for scheduled auto-sync</li>
          </ul>
          <p className="text-[var(--ts-text-muted)]">
            Every fetched Reel/Post uses its Reel cover (<code>thumbnail_url</code>) + public product photos, mirrors them to Supabase Storage, and saves the item as a <strong>Draft (inactive)</strong> here so you can review and publish live.
          </p>
        </div>
      )}

      {igSyncResult && (
        <div className="border border-[var(--ts-accent)]/50 bg-[var(--ts-bg-accent-tint)] p-5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <p className="font-medium text-[var(--ts-text-primary)]">
              Instagram AI Sync Complete: {igSyncResult.imported_count} Draft(s) Imported •{' '}
              {igSyncResult.skipped_count} Skipped • {igSyncResult.error_count} Error(s)
            </p>
            <button
              type="button"
              onClick={() => setIgSyncResult(null)}
              className="text-[var(--ts-text-muted)] hover:text-[var(--ts-text-primary)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[var(--ts-text-muted)]">
            Filter by <strong>Inactive</strong> status below to review and publish your newly imported Instagram drafts.
          </p>
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {/* Product Creation / Edit Drawer Modal */}
      {showEditor && (
        <form
          onSubmit={handleSaveProductForm}
          className="border border-[var(--ts-accent)]/50 bg-[var(--ts-bg-card)] p-6 sm:p-8 space-y-8"
        >
          <div className="flex items-center justify-between border-b border-[var(--ts-border-subtle)] pb-4">
            <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
              {editId ? `Edit Product: ${name}` : 'Create New Luxury Product'}
            </h2>
            <button
              type="button"
              onClick={() => setShowEditor(false)}
              className="p-1.5 text-[var(--ts-text-muted)] hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 1. Basic Information */}
          <div className="space-y-4">
            <h3 className="text-xs uppercase tracking-[0.22em] text-[var(--ts-accent)]">
              1. Basic Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Product Name *"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!editId) setSlug(slugify(e.target.value));
                }}
              />
              <Input
                label="URL Slug *"
                required
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
              />
              <Input
                label="SKU *"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Select
                label="Category *"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                options={[
                  { value: '', label: 'Select Category' },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              <Input
                label="Brand *"
                required
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
              <Select
                label="Publish Status *"
                value={status}
                onChange={(e) => setStatus(e.target.value as ProductStatus)}
                options={[
                  { value: 'active', label: 'Active (Published)' },
                  { value: 'inactive', label: 'Inactive (Draft)' },
                  { value: 'archived', label: 'Archived' },
                ]}
              />
            </div>

            <Input
              label="Short Description *"
              required
              value={shortDesc}
              onChange={(e) => setShortDesc(e.target.value)}
            />

            <div className="space-y-1.5">
              <label className="block text-[11px] uppercase tracking-[0.18em] text-[var(--ts-text-secondary)]">
                Full Editorial Description *
              </label>
              <textarea
                rows={4}
                required
                value={fullDesc}
                onChange={(e) => setFullDesc(e.target.value)}
                className="w-full bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] p-4 text-sm text-[var(--ts-text-primary)] focus:outline-none focus:border-[var(--ts-accent)]"
              />
            </div>
          </div>

          {/* 2. Pricing & Scheduled Discounts */}
          <div className="space-y-4 border-t border-[var(--ts-border-subtle)] pt-6">
            <h3 className="text-xs uppercase tracking-[0.22em] text-[var(--ts-accent)]">
              2. Pricing &amp; Scheduled Discount (INR)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Selling Price (₹) *"
                type="number"
                step="0.01"
                min="0"
                required
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
              />
              <Input
                label="Original MRP Price (₹)"
                type="number"
                step="0.01"
                min="0"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                hint="Discount percentage calculates automatically."
              />
              <Input
                label="Scheduled Flash Price (₹ Optional)"
                type="number"
                step="0.01"
                min="0"
                value={scheduledDiscountPrice}
                onChange={(e) => setScheduledDiscountPrice(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Scheduled Discount Start"
                type="datetime-local"
                value={scheduledStart}
                onChange={(e) => setScheduledStart(e.target.value)}
              />
              <Input
                label="Scheduled Discount End"
                type="datetime-local"
                value={scheduledEnd}
                onChange={(e) => setScheduledEnd(e.target.value)}
              />
            </div>
          </div>

          {/* 3. Images (Supabase Storage + Ordering + Deletion) */}
          <div className="space-y-4 border-t border-[var(--ts-border-subtle)] pt-6">
            <h3 className="text-xs uppercase tracking-[0.22em] text-[var(--ts-accent)]">
              3. Product Photography (Supabase Storage)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
              <div className="sm:col-span-8">
                <Input
                  label="Main Image URL *"
                  required
                  value={mainImageUrl}
                  onChange={(e) => setMainImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="sm:col-span-4">
                <label className="w-full flex items-center justify-center gap-2 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] px-4 py-3 text-xs uppercase tracking-widest text-[var(--ts-accent)] hover:border-[var(--ts-accent)] cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>{isUploadingImage ? 'Uploading...' : 'Upload Main Photo'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    onChange={handleMainImageFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Additional Gallery Images */}
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ts-text-secondary)]">
                Additional Gallery Images (Reorder or Delete)
              </p>
              <div className="flex flex-wrap gap-3">
                <input
                  type="url"
                  value={newImageUrlInput}
                  onChange={(e) => setNewImageUrlInput(e.target.value)}
                  placeholder="Paste additional image URL..."
                  className="flex-1 bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] px-3 py-2 text-xs text-[var(--ts-text-primary)]"
                />
                <Button
                  type="button"
                  variant="charcoal"
                  size="sm"
                  onClick={() => {
                    if (!newImageUrlInput.trim()) return;
                    setAdditionalImages((prev) => [
                      ...prev,
                      { image_url: newImageUrlInput.trim(), display_order: prev.length },
                    ]);
                    setNewImageUrlInput('');
                  }}
                >
                  Add URL
                </Button>
                <label className="inline-flex items-center gap-2 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] px-4 py-2 text-xs uppercase tracking-widest text-[var(--ts-accent)] cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Gallery Files</span>
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    onChange={handleGalleryFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {additionalImages.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 pt-2">
                  {additionalImages.map((img, idx) => (
                    <div
                      key={`${img.image_url}-${idx}`}
                      className="border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] p-2 space-y-2"
                    >
                      <img
                        src={img.image_url}
                        alt=""
                        className="w-full h-24 object-cover bg-[var(--ts-border-subtle)]"
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveGalleryImage(idx, -1)}
                            className="p-1 text-[var(--ts-text-muted)] hover:text-white cursor-pointer"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveGalleryImage(idx, 1)}
                            className="p-1 text-[var(--ts-text-muted)] hover:text-white cursor-pointer"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setAdditionalImages((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="p-1 text-red-400 hover:text-red-300 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 4. Inventory & Curation Flags */}
          <div className="space-y-4 border-t border-[var(--ts-border-subtle)] pt-6">
            <h3 className="text-xs uppercase tracking-[0.22em] text-[var(--ts-accent)]">
              4. Inventory &amp; Curation Placement
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Available Stock Quantity *"
                type="number"
                min="0"
                required
                value={availableStock}
                onChange={(e) => setAvailableStock(e.target.value)}
              />
              <Input
                label="Low-Stock Alert Threshold *"
                type="number"
                min="0"
                required
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
              />
              <Input
                label="Collection Tag (Optional)"
                value={collectionTag}
                onChange={(e) => setCollectionTag(e.target.value)}
                placeholder="e.g., Sovereign Edition"
              />
            </div>

            <div className="flex flex-wrap gap-6 pt-2 text-xs text-[var(--ts-text-secondary)]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                  className="accent-[var(--ts-accent)]"
                />
                <span>Featured Product</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isNewArrival}
                  onChange={(e) => setIsNewArrival(e.target.checked)}
                  className="accent-[var(--ts-accent)]"
                />
                <span>New Arrival</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isBestSeller}
                  onChange={(e) => setIsBestSeller(e.target.checked)}
                  className="accent-[var(--ts-accent)]"
                />
                <span>Best Seller</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTrending}
                  onChange={(e) => setIsTrending(e.target.checked)}
                  className="accent-[var(--ts-accent)]"
                />
                <span>Trending</span>
              </label>
            </div>
          </div>

          {/* 5. Configurable Variants (Size, Colour, Model) */}
          <div className="space-y-4 border-t border-[var(--ts-border-subtle)] pt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-[0.22em] text-[var(--ts-accent)]">
                5. Product Variants (Size, Colour, Model)
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setVariants((prev) => [
                    ...prev,
                    {
                      variant_sku: `${sku || 'TS'}-V${prev.length + 1}`,
                      color: '',
                      color_hex: '#C5A059',
                      size: '',
                      model: '',
                      price_adjustment: 0,
                      available_stock: Number(availableStock || 5),
                      is_active: true,
                    },
                  ])
                }
              >
                + Add Variant
              </Button>
            </div>

            {variants.map((v, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 sm:grid-cols-6 gap-3 p-3 border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-elevated)] items-end"
              >
                <Input
                  label="Variant SKU"
                  value={v.variant_sku}
                  onChange={(e) => {
                    const copy = [...variants];
                    copy[idx].variant_sku = e.target.value;
                    setVariants(copy);
                  }}
                />
                <Input
                  label="Colour"
                  value={v.color || ''}
                  onChange={(e) => {
                    const copy = [...variants];
                    copy[idx].color = e.target.value;
                    setVariants(copy);
                  }}
                  placeholder="Obsidian Gold"
                />
                <Input
                  label="Size"
                  value={v.size || ''}
                  onChange={(e) => {
                    const copy = [...variants];
                    copy[idx].size = e.target.value;
                    setVariants(copy);
                  }}
                  placeholder="42mm / EU 42"
                />
                <Input
                  label="Price Adj (₹)"
                  type="number"
                  value={String(v.price_adjustment)}
                  onChange={(e) => {
                    const copy = [...variants];
                    copy[idx].price_adjustment = Number(e.target.value);
                    setVariants(copy);
                  }}
                />
                <Input
                  label="Variant Stock"
                  type="number"
                  value={String(v.available_stock)}
                  onChange={(e) => {
                    const copy = [...variants];
                    copy[idx].available_stock = Number(e.target.value);
                    setVariants(copy);
                  }}
                />
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => setVariants((prev) => prev.filter((_, i) => i !== idx))}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>

          {/* 6. Custom Technical Specifications */}
          <div className="space-y-4 border-t border-[var(--ts-border-subtle)] pt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-[0.22em] text-[var(--ts-accent)]">
                6. Technical Specifications
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSpecifications((prev) => [
                    ...prev,
                    {
                      spec_group: 'Specifications',
                      spec_key: '',
                      spec_value: '',
                      display_order: prev.length,
                    },
                  ])
                }
              >
                + Add Specification Row
              </Button>
            </div>

            {specifications.map((s, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
              >
                <div className="sm:col-span-5">
                  <Input
                    label="Attribute Name"
                    value={s.spec_key}
                    onChange={(e) => {
                      const copy = [...specifications];
                      copy[idx].spec_key = e.target.value;
                      setSpecifications(copy);
                    }}
                    placeholder="e.g., Case Material / Movement"
                  />
                </div>
                <div className="sm:col-span-5">
                  <Input
                    label="Attribute Value"
                    value={s.spec_value}
                    onChange={(e) => {
                      const copy = [...specifications];
                      copy[idx].spec_value = e.target.value;
                      setSpecifications(copy);
                    }}
                    placeholder="e.g., Grade-5 Titanium / Sapphire"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      setSpecifications((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 pt-4 border-t border-[var(--ts-border-subtle)]">
            <Button type="submit" variant="gold" size="lg" isLoading={isSaving}>
              {editId ? 'Save Product Updates' : 'Publish Product to Vault'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowEditor(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Search & Status Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-[var(--ts-text-muted)] absolute left-3.5 top-3.5" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by product name, SKU, brand..."
            className="w-full bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] pl-10 pr-4 py-2.5 text-xs text-[var(--ts-text-primary)] focus:outline-none focus:border-[var(--ts-accent)]"
          />
        </div>

        <div className="flex items-center gap-2">
          {(['all', 'active', 'inactive', 'archived'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-[11px] uppercase tracking-widest border cursor-pointer ${
                statusFilter === st
                  ? 'border-[var(--ts-accent)] bg-[var(--ts-accent)]/15 text-[var(--ts-accent)]'
                  : 'border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] text-[var(--ts-text-muted)]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Products Table */}
      {isLoading ? (
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-12 text-center text-xs text-[var(--ts-text-muted)]">
          Loading product catalogue...
        </div>
      ) : filteredProducts.length > 0 ? (
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--ts-border-subtle)] text-[10px] uppercase tracking-widest text-[var(--ts-text-muted)]">
                <th className="p-4">Product</th>
                <th className="p-4">SKU / Category</th>
                <th className="p-4">Price</th>
                <th className="p-4">Stock</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ts-bg-subtle)]">
              {filteredProducts.map((prod) => {
                const inv = extractInventory(prod);
                const stockQty = inv?.available_quantity ?? 0;
                return (
                  <tr key={prod.id} className="hover:bg-[var(--ts-bg-elevated)]">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={prod.main_image_url}
                          alt={prod.name}
                          className="w-12 h-14 object-cover bg-[var(--ts-bg-subtle)] border border-[var(--ts-border-strong)]"
                        />
                        <div>
                          <p className="text-[var(--ts-text-primary)] font-medium">{prod.name}</p>
                          <p className="text-[11px] text-[var(--ts-text-muted)]">{prod.brand}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="font-mono text-[var(--ts-accent)]">{prod.sku}</p>
                      <p className="text-[11px] text-[var(--ts-text-muted)]">
                        {prod.categories?.name || 'Uncategorized'}
                      </p>
                    </td>
                    <td className="p-4">
                      <p className="text-[var(--ts-text-primary)] font-medium">
                        {formatINR(prod.selling_price)}
                      </p>
                      {prod.original_price && prod.original_price > prod.selling_price && (
                        <p className="text-[11px] text-[var(--ts-text-muted)] line-through">
                          {formatINR(prod.original_price)}
                        </p>
                      )}
                    </td>
                    <td className="p-4">
                      <Badge
                        tone={
                          stockQty <= 0
                            ? 'danger'
                            : stockQty <= (inv?.low_stock_threshold ?? 5)
                              ? 'warning'
                              : 'success'
                        }
                      >
                        {stockQty} Units
                      </Badge>
                    </td>
                    <td className="p-4">
                      <Badge
                        tone={
                          prod.status === 'active'
                            ? 'success'
                            : prod.status === 'archived'
                              ? 'danger'
                              : 'neutral'
                        }
                      >
                        {prod.status}
                      </Badge>
                    </td>
                    <td className="p-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditProductModal(prod)}
                          className="p-1.5 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] text-[var(--ts-text-secondary)] hover:border-[var(--ts-accent)] cursor-pointer"
                          title="Edit Product"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void updateAdminProductStatus(
                              prod.id,
                              prod.status === 'active' ? 'archived' : 'active'
                            ).then(loadData)
                          }
                          className="p-1.5 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] text-[var(--ts-text-secondary)] hover:border-[var(--ts-accent)] cursor-pointer"
                          title={prod.status === 'active' ? 'Archive' : 'Publish'}
                        >
                          {prod.status === 'active' ? (
                            <Archive className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void deleteAdminProduct(prod.id).then(loadData)
                          }
                          className="p-1.5 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] text-red-400 hover:border-red-500 cursor-pointer"
                          title="Delete Product (Preserves historical orders)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No Products in Vault"
          description="Click 'Create New Product' above to add your first luxury timepiece, leather purse, fragrance, or accessory."
          action={
            <Button variant="gold" size="sm" onClick={openNewProductModal}>
              Create First Product
            </Button>
          }
        />
      )}
    </div>
  );
};

// ==============================================================================
// 2. ADMIN CATEGORY MANAGEMENT PAGE (/admin/categories)
// ==============================================================================
export const AdminCategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editCatId, setEditCatId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [displayOrder, setDisplayOrder] = useState('1');
  const [isActive, setIsActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchAllAdminCategories();
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load categories');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const up = await uploadFileToStorage('category-images', file);
      setImageUrl(up.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Category image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await saveAdminCategory({
        id: editCatId,
        name,
        slug: slug.trim() || slugify(name),
        description,
        image_url: imageUrl || null,
        display_order: Number(displayOrder || 0),
        is_active: isActive,
        is_featured: isFeatured,
      });
      setShowForm(false);
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save category');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ts-border-subtle)] pb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
            Department Architecture
          </p>
          <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">
            Categories ({categories.length})
          </h1>
        </div>
        <Button
          variant="gold"
          size="md"
          onClick={() => {
            setEditCatId(undefined);
            setName('');
            setSlug('');
            setDescription('');
            setImageUrl('');
            setDisplayOrder(String(categories.length + 1));
            setIsActive(true);
            setIsFeatured(true);
            setShowForm(true);
          }}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Add Category
        </Button>
      </div>

      {error && <ErrorBanner message={error} />}

      {showForm && (
        <form
          onSubmit={handleSaveCategory}
          className="border border-[var(--ts-accent)]/40 bg-[var(--ts-bg-card)] p-6 space-y-5"
        >
          <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
            {editCatId ? 'Edit Category' : 'Create Category'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Category Name *"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!editCatId) setSlug(slugify(e.target.value));
              }}
            />
            <Input
              label="Slug *"
              required
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
            />
            <Input
              label="Display Order *"
              type="number"
              required
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
            />
          </div>

          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
            <div className="sm:col-span-8">
              <Input
                label="Category Image URL"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
            </div>
            <div className="sm:col-span-4">
              <label className="w-full flex items-center justify-center gap-2 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] px-4 py-3 text-xs uppercase tracking-widest text-[var(--ts-accent)] cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>{uploading ? 'Uploading...' : 'Upload Image'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs text-[var(--ts-text-secondary)]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="accent-[var(--ts-accent)]"
              />
              <span>Active (Visible in Storefront)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="accent-[var(--ts-accent)]"
              />
              <span>Featured on Landing Page</span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" variant="gold" size="md" isLoading={isSaving}>
              Save Category
            </Button>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-12 text-center text-xs text-[var(--ts-text-muted)]">
          Loading categories...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-5 flex flex-col justify-between space-y-4"
            >
              <div className="flex items-start gap-4">
                {cat.image_url ? (
                  <img
                    src={cat.image_url}
                    alt={cat.name}
                    className="w-16 h-20 object-cover bg-[var(--ts-bg-subtle)] border border-[var(--ts-border-strong)] shrink-0"
                  />
                ) : (
                  <div className="w-16 h-20 bg-[var(--ts-bg-elevated)] border border-[var(--ts-border-strong)] shrink-0" />
                )}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[var(--ts-accent)]">
                      #{cat.display_order}
                    </span>
                    <Badge tone={cat.is_active ? 'success' : 'neutral'}>
                      {cat.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <h3 className="font-serif-luxury text-xl text-[var(--ts-text-primary)]">{cat.name}</h3>
                  <p className="text-[11px] text-[var(--ts-text-muted)] line-clamp-2">{cat.description}</p>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--ts-border-subtle)] flex items-center justify-between text-xs">
                <span className="font-mono text-[11px] text-[var(--ts-text-muted)]">/shop/{cat.slug}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditCatId(cat.id);
                      setName(cat.name);
                      setSlug(cat.slug);
                      setDescription(cat.description || '');
                      setImageUrl(cat.image_url || '');
                      setDisplayOrder(String(cat.display_order));
                      setIsActive(cat.is_active);
                      setIsFeatured(cat.is_featured);
                      setShowForm(true);
                    }}
                    className="p-1.5 text-[var(--ts-text-secondary)] hover:text-[var(--ts-accent)] cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteAdminCategory(cat.id).then(loadCategories)}
                    className="p-1.5 text-[var(--ts-text-muted)] hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
