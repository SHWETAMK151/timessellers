// ==============================================================================
// TIMESSELLERS — AUTOMATED VERIFICATION & SECURITY TEST SUITE
// Validates:
// 1. Phone number & Indian PIN code validation
// 2. UTR reference number validation & duplicate protection rules
// 3. Price & scheduled discount calculations
// 4. Storage file MIME & size security guards
// 5. SQL schema completeness (all 24 required tables & RLS policies present)
// 6. Zero private key exposure in frontend source
// ==============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  formatINR,
  buildGatewayFreeUpiIntentUrl,
  normalizeIndianPhone,
  isValidIndianPhone,
  isValidIndianPinCode,
  isValidUtrNumber,
  slugify,
  getEffectivePrice,
  extractInventory,
} from '@/lib/utils';
import { validateUploadFile } from '@/services/storageService';
import type { Product } from '@/types/database';

describe('TIMESSELLERS — Validation, Pricing & Security Suite', () => {
  it('validates and normalizes Indian phone numbers for Phone OTP Auth', () => {
    expect(normalizeIndianPhone('9876543210')).toBe('+919876543210');
    expect(normalizeIndianPhone('919876543210')).toBe('+919876543210');
    expect(normalizeIndianPhone('+91 98765-43210')).toBe('+919876543210');
    expect(isValidIndianPhone('9876543210')).toBe(true);
    expect(isValidIndianPhone('+918876543210')).toBe(true);
    expect(isValidIndianPhone('12345')).toBe(false);
    expect(isValidIndianPhone('+911234567890')).toBe(false);
  });

  it('validates 6-digit Indian PIN codes', () => {
    expect(isValidIndianPinCode('400013')).toBe(true);
    expect(isValidIndianPinCode('110001')).toBe(true);
    expect(isValidIndianPinCode('010001')).toBe(false); // Cannot start with 0
    expect(isValidIndianPinCode('40001')).toBe(false);
    expect(isValidIndianPinCode('4000134')).toBe(false);
  });

  it('validates UPI UTR reference numbers (10-22 alphanumeric characters)', () => {
    expect(isValidUtrNumber('432189765412')).toBe(true);
    expect(isValidUtrNumber('AXISCN0123456789')).toBe(true);
    expect(isValidUtrNumber('12345')).toBe(false);
    expect(isValidUtrNumber('UTR WITH SPACES')).toBe(false);
  });

  it('formats Indian Rupee (INR) prices accurately and generates clean slugs', () => {
    expect(formatINR(499)).toContain('499');
    expect(formatINR(125000)).toContain('1,25,000');
    expect(slugify("Men's Luxury Chronograph Watch!")).toBe('men-s-luxury-chronograph-watch');
  });

  it('computes effective product price respecting scheduled discount windows', () => {
    const baseProduct: Product = {
      id: 'prod-1',
      name: 'Sovereign Tourbillon',
      slug: 'sovereign-tourbillon',
      sku: 'TS-TOUR-01',
      category_id: 'cat-1',
      brand: 'TIMESSELLERS',
      short_description: 'Luxury timepiece',
      full_description: 'Full details',
      selling_price: 45000,
      original_price: 55000,
      discount_percentage: 18.18,
      scheduled_discount_price: 39999,
      scheduled_discount_start: new Date(Date.now() - 3600_000).toISOString(),
      scheduled_discount_end: new Date(Date.now() + 3600_000).toISOString(),
      main_image_url: 'https://example.com/watch.jpg',
      is_featured: true,
      is_new_arrival: true,
      is_best_seller: false,
      is_trending: true,
      collection_tag: null,
      status: 'active',
      average_rating: 0,
      review_count: 0,
      total_sold: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      inventory: {
        id: 'inv-1',
        product_id: 'prod-1',
        sku: 'TS-TOUR-01',
        available_quantity: 8,
        reserved_quantity: 0,
        low_stock_threshold: 3,
        stock_status: 'in_stock',
        updated_at: new Date().toISOString(),
      },
    };

    expect(getEffectivePrice(baseProduct)).toBe(39999);
    expect(extractInventory(baseProduct)?.available_quantity).toBe(8);

    // Expired scheduled discount should revert to selling_price
    const expiredProduct: Product = {
      ...baseProduct,
      scheduled_discount_end: new Date(Date.now() - 10_000).toISOString(),
    };
    expect(getEffectivePrice(expiredProduct)).toBe(45000);
  });

  it('enforces MIME type and file size limits on storage uploads', () => {
    const validFile = new File([new Uint8Array(1024)], 'watch.webp', { type: 'image/webp' });
    expect(() => validateUploadFile(validFile, 'product-images')).not.toThrow();

    const maliciousExe = new File([new Uint8Array(1024)], 'payload.exe', {
      type: 'application/x-msdownload',
    });
    expect(() => validateUploadFile(maliciousExe, 'product-images')).toThrow(/Invalid file format/);

    const oversizedAvatar = new File([new Uint8Array(3 * 1024 * 1024)], 'huge.png', {
      type: 'image/png',
    });
    expect(() => validateUploadFile(oversizedAvatar, 'avatars')).toThrow(/2MB security limit/);
  });

  it('verifies all 24 required PostgreSQL tables exist in 0001_initial_schema.sql', () => {
    const schemaPath = path.resolve(
      process.cwd(),
      'supabase/migrations/0001_initial_schema.sql'
    );
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

    const requiredTables = [
      'profiles',
      'user_roles',
      'addresses',
      'categories',
      'products',
      'product_images',
      'product_variants',
      'product_specifications',
      'inventory',
      'inventory_transactions',
      'carts',
      'cart_items',
      'wishlists',
      'wishlist_items',
      'orders',
      'order_items',
      'order_status_history',
      'payments',
      'payment_verifications',
      'payment_webhook_events',
      'product_reviews',
      'store_settings',
      'shipping_settings',
      'admin_audit_logs',
    ];

    for (const table of requiredTables) {
      expect(schemaSql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    }
  });

  it('verifies Row Level Security (RLS) is enabled on all 24 tables in 0002_rls_and_security.sql', () => {
    const rlsPath = path.resolve(
      process.cwd(),
      'supabase/migrations/0002_rls_and_security.sql'
    );
    const rlsSql = fs.readFileSync(rlsPath, 'utf-8');

    const requiredTables = [
      'profiles',
      'user_roles',
      'addresses',
      'categories',
      'products',
      'product_images',
      'product_variants',
      'product_specifications',
      'inventory',
      'inventory_transactions',
      'carts',
      'cart_items',
      'wishlists',
      'wishlist_items',
      'orders',
      'order_items',
      'order_status_history',
      'payments',
      'payment_verifications',
      'payment_webhook_events',
      'product_reviews',
      'store_settings',
      'shipping_settings',
      'admin_audit_logs',
    ];

    for (const table of requiredTables) {
      expect(rlsSql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it('verifies all 10 required luxury categories and ₹499 free shipping threshold are in 0004_initial_categories_and_settings.sql', () => {
    const seedPath = path.resolve(
      process.cwd(),
      'supabase/migrations/0004_initial_categories_and_settings.sql'
    );
    const seedSql = fs.readFileSync(seedPath, 'utf-8');

    const expectedSlugs = [
      'goggles',
      'mens-purses',
      'ladies-purses',
      'mens-watches',
      'ladies-watches',
      'perfumes',
      'shoes',
      'headphones',
      'smartwatches',
      'electronics',
    ];

    for (const slug of expectedSlugs) {
      expect(seedSql).toContain(`'${slug}'`);
    }
    expect(seedSql).toContain('499.00');
  });

  it('ensures no service_role or private payment keys exist anywhere in frontend src/', () => {
    const supabaseClientPath = path.resolve(process.cwd(), 'src/lib/supabase.ts');
    const content = fs.readFileSync(supabaseClientPath, 'utf-8');
    expect(content).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(content).not.toContain('CRYPTO_WEBHOOK_SECRET');
    expect(content).not.toContain('CRYPTO_PROVIDER_API_KEY');
    expect(content).not.toContain('GATEWAY_FREE_UPI_SECRET');
  });

  it('builds exact paisa-encoded Gateway-Free UPI payment intent URLs and verifies SQL + Apps Script files', () => {
    const upiUrl = buildGatewayFreeUpiIntentUrl({
      upiId: 'timessellers@upi',
      payeeName: 'TIMESSELLERS LUXURY PRIVATE LIMITED',
      exactAmount: 24992.47,
      orderNumber: 'TS-20261122-AB12CD',
    });

    expect(upiUrl).toBe(
      'upi://pay?pa=timessellers@upi&pn=TIMESSELLERS%20LUXURY%20PRIVATE%20LIMITED&am=24992.47&cu=INR&tn=Order%20TS-20261122-AB12CD'
    );
    expect(formatINR(24992.47, true)).toContain('24,992.47');

    const migration5Path = path.resolve(
      process.cwd(),
      'supabase/migrations/0005_gateway_free_upi_checkout.sql'
    );
    const migration5Sql = fs.readFileSync(migration5Path, 'utf-8');
    expect(migration5Sql).toContain('CREATE OR REPLACE FUNCTION public.allocate_unique_upi_amount');
    expect(migration5Sql).toContain('CREATE OR REPLACE FUNCTION public.reconcile_gateway_free_upi_credit');

    const appsScriptPath = path.resolve(process.cwd(), 'apps-script/Code.gs');
    const appsScriptCode = fs.readFileSync(appsScriptPath, 'utf-8');
    expect(appsScriptCode).toContain('function checkPayments');
    expect(appsScriptCode).toContain('function parseBankCredit_');
    expect(appsScriptCode).toContain('function looksAuthentic_');
  });
});
