// ==============================================================================
// TIMESSELLERS — STORE, SHIPPING & LUXURY THEME CONTEXT
// Provides live store branding, UPI settings, shipping threshold, and active
// Maison Theme (`light_luxury_editorial`, `obsidian_gold`, `midnight_royal_platinum`,
// `emerald_gold_heritage`, `minimalist_monochrome`) synced with Supabase & DOM.
// ==============================================================================

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { isSupabaseConfigured } from '@/lib/supabase';
import { fetchStoreAndShippingSettings } from '@/services/orderService';
import type { LuxuryThemeId, ShippingSettings, StoreSettings } from '@/types/database';

export interface LuxuryThemeMeta {
  id: LuxuryThemeId;
  name: string;
  subtitle: string;
  description: string;
  swatches: [string, string, string, string];
}

export const LUXURY_THEMES: LuxuryThemeMeta[] = [
  {
    id: 'light_luxury_editorial',
    name: 'Light Luxury Editorial',
    subtitle: 'Hermès • Cartier • Loro Piana',
    description:
      'Warm Ivory & Alabaster Cream backgrounds with Deep Espresso typography and Burnished Champagne Gold accents.',
    swatches: ['#FAF7F2', '#F3ECE1', '#1C1917', '#9E7732'],
  },
  {
    id: 'obsidian_gold',
    name: 'Obsidian & Champagne Gold',
    subtitle: 'Audemars Piguet • Hublot',
    description:
      'Deep Obsidian Black and Charcoal surfaces with Crisp Alabaster typography and Champagne Gold highlights.',
    swatches: ['#070707', '#121212', '#F5F5F0', '#C5A059'],
  },
  {
    id: 'midnight_royal_platinum',
    name: 'Midnight Royal & Platinum',
    subtitle: 'Patek Philippe • Vacheron Constantin',
    description:
      'Deep Royal Sapphire Navy surfaces paired with Ice-White typography and Brushed Platinum silver accents.',
    swatches: ['#080E1A', '#132038', '#F2F6FC', '#C8D6EA'],
  },
  {
    id: 'emerald_gold_heritage',
    name: 'Emerald & Gold Heritage',
    subtitle: 'Rolex • Ralph Lauren Collection',
    description:
      'Deep Forest & British Racing Green surfaces with Warm Cream typography and Sovereign Gold accents.',
    swatches: ['#071710', '#112D21', '#F6F4EE', '#D4AF37'],
  },
  {
    id: 'minimalist_monochrome',
    name: 'Minimalist Monochrome Gallery',
    subtitle: 'Chanel • Saint Laurent',
    description:
      'Pure Crisp White and Gallery Grey surfaces with High-Contrast Jet Black architectural typography.',
    swatches: ['#FFFFFF', '#F3F3F3', '#0A0A0A', '#111111'],
  },
];

const DEFAULT_STORE_SETTINGS: StoreSettings = {
  id: 'default',
  singleton_key: 'default',
  store_name: 'TIMESSELLERS',
  store_tagline: 'Haute Horlogerie & Luxury Objects',
  active_theme: 'light_luxury_editorial',
  logo_url: null,
  upi_id: 'shw2100@ibl',
  upi_display_name: 'TIMESSELLERS',
  upi_qr_image_url: null,
  upi_payment_instructions:
    'Scan the official TIMESSELLERS UPI QR code or transfer the exact invoice amount to our corporate UPI ID. Enter the 12-digit UTR / Reference Number below for verification by our treasury desk.',
  gateway_free_upi_enabled: true,
  gateway_free_apps_script_url:
    'https://script.google.com/macros/s/AKfycby28shsj7oDv2Wlkmoo_ihuQ0BvezuSnaNB85QTOwv-5ymQTba6KTMV9u4LOfESP1ZKew/exec',
  gateway_free_max_paise_window: 899,
  crypto_enabled: true,
  crypto_provider_name: 'NOWPayments',
  supported_crypto_currencies: ['USDT (TRC20)', 'USDT (ERC20)', 'BTC', 'ETH', 'SOL'],
  currency_code: 'INR',
  currency_symbol: '₹',
  contact_email: 'concierge@timessellers.com',
  contact_phone: '+91 22 6000 8800',
  contact_address:
    'Level 14, Prestige Palladium Bayan, Lower Parel, Mumbai, Maharashtra 400013, India',
  about_story: null,
  shipping_policy_text: null,
  return_policy_text: null,
  privacy_policy_text: null,
  terms_text: null,
  updated_at: new Date().toISOString(),
};

const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = {
  id: 'default',
  singleton_key: 'default',
  free_shipping_threshold: 499,
  standard_shipping_charge: 79,
  pan_india_delivery_enabled: true,
  estimated_delivery_days_min: 2,
  estimated_delivery_days_max: 5,
  updated_at: new Date().toISOString(),
};

interface StoreSettingsContextValue {
  storeSettings: StoreSettings;
  shippingSettings: ShippingSettings;
  activeTheme: LuxuryThemeId;
  setActiveThemePreview: (themeId: LuxuryThemeId) => void;
  isLoading: boolean;
  refreshSettings: () => Promise<void>;
}

const StoreSettingsContext = createContext<StoreSettingsContextValue>({
  storeSettings: DEFAULT_STORE_SETTINGS,
  shippingSettings: DEFAULT_SHIPPING_SETTINGS,
  activeTheme: 'light_luxury_editorial',
  setActiveThemePreview: () => {},
  isLoading: false,
  refreshSettings: async () => {},
});

export const StoreSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [shippingSettings, setShippingSettings] =
    useState<ShippingSettings>(DEFAULT_SHIPPING_SETTINGS);
  const [activeTheme, setActiveTheme] = useState<LuxuryThemeId>(() => {
    const cached = localStorage.getItem('timessellers_active_theme') as LuxuryThemeId | null;
    return cached || 'light_luxury_editorial';
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const applyThemeToDom = useCallback((themeId: LuxuryThemeId) => {
    document.documentElement.setAttribute('data-theme', themeId);
    localStorage.setItem('timessellers_active_theme', themeId);
  }, []);

  useEffect(() => {
    applyThemeToDom(activeTheme);
  }, [activeTheme, applyThemeToDom]);

  const loadSettings = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }
    try {
      const { store, shipping } = await fetchStoreAndShippingSettings();
      if (store) {
        setStoreSettings(store);
        const dbTheme = (store.active_theme as LuxuryThemeId | undefined) || 'light_luxury_editorial';
        setActiveTheme(dbTheme);
        applyThemeToDom(dbTheme);
      }
      if (shipping) setShippingSettings(shipping);
    } catch {
      // Keep defaults if database is not yet migrated
    } finally {
      setIsLoading(false);
    }
  }, [applyThemeToDom]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const setActiveThemePreview = (themeId: LuxuryThemeId) => {
    setActiveTheme(themeId);
    applyThemeToDom(themeId);
  };

  return (
    <StoreSettingsContext.Provider
      value={{
        storeSettings,
        shippingSettings,
        activeTheme,
        setActiveThemePreview,
        isLoading,
        refreshSettings: loadSettings,
      }}
    >
      {children}
    </StoreSettingsContext.Provider>
  );
};

export function useStoreSettings(): StoreSettingsContextValue {
  return useContext(StoreSettingsContext);
}
