import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Inventory, Product } from '@/types/database';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatINR(amount: number | string | null | undefined, forceDecimals = false): string {
  const num = Number(amount ?? 0);
  if (Number.isNaN(num)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: forceDecimals ? 2 : num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function buildGatewayFreeUpiIntentUrl(params: {
  upiId: string;
  payeeName: string;
  exactAmount: number;
  orderNumber: string;
}): string {
  const cleanUpiId = params.upiId.trim();
  const cleanPayee = encodeURIComponent(params.payeeName.trim());
  const exactAmt = Number(params.exactAmount).toFixed(2);
  const note = encodeURIComponent(`Order ${params.orderNumber}`.slice(0, 40));
  return `upi://pay?pa=${cleanUpiId}&pn=${cleanPayee}&am=${exactAmt}&cu=INR&tn=${note}`;
}

export function formatDate(isoString: string | null | undefined, includeTime = false): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function normalizeIndianPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (input.startsWith('+') && digits.length >= 10) {
    return `+${digits}`;
  }
  return input.trim();
}

export function isValidIndianPhone(input: string): boolean {
  const normalized = normalizeIndianPhone(input);
  return /^\+91[6-9]\d{9}$/.test(normalized);
}

export function isValidIndianPinCode(pin: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pin.trim());
}

export function isValidUtrNumber(utr: string): boolean {
  return /^[A-Za-z0-9]{10,22}$/.test(utr.trim());
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function extractInventory(product: Product | null | undefined): Inventory | null {
  if (!product?.inventory) return null;
  if (Array.isArray(product.inventory)) {
    return product.inventory[0] ?? null;
  }
  return product.inventory;
}

export function getEffectivePrice(product: Product): number {
  if (
    product.scheduled_discount_price !== null &&
    product.scheduled_discount_price !== undefined &&
    product.scheduled_discount_price > 0
  ) {
    const now = Date.now();
    const startOk =
      !product.scheduled_discount_start || now >= new Date(product.scheduled_discount_start).getTime();
    const endOk =
      !product.scheduled_discount_end || now <= new Date(product.scheduled_discount_end).getTime();
    if (startOk && endOk) {
      return Number(product.scheduled_discount_price);
    }
  }
  return Number(product.selling_price);
}

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi (NCT)',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

export function sanitizeHttpUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function sanitizeRedirectPath(rawPath: string | null | undefined, fallback: string): string {
  if (!rawPath) return fallback;
  const trimmed = rawPath.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
    return trimmed;
  }
  return fallback;
}

const rawAdminPath = (import.meta.env.VITE_ADMIN_PATH as string | undefined)?.trim();
export const ADMIN_BASE_PATH =
  rawAdminPath && rawAdminPath.startsWith('/') && rawAdminPath !== '/admin'
    ? rawAdminPath.replace(/\/+$/, '')
    : '/vault-ts-9x4k';
export const ADMIN_LOGIN_PATH = `${ADMIN_BASE_PATH}/login`;
