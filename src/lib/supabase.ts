// ==============================================================================
// TIMESSELLERS — SUPABASE CLIENT CONFIGURATION
// Uses ONLY public environment variables (VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY).
// Service role keys or private credentials are NEVER imported or present here.
// ==============================================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('your-project-ref')
);

// Provide a valid syntactic fallback URL if env vars are not set yet so the app
// renders a clear configuration banner rather than crashing on import.
const effectiveUrl = isSupabaseConfigured ? supabaseUrl : 'https://placeholder-unconfigured.supabase.co';
const effectiveKey = isSupabaseConfigured ? supabaseAnonKey : 'public-anon-key-unconfigured';

export const supabase = createClient(effectiveUrl, effectiveKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'timessellers_auth_token',
  },
});

export const getEdgeFunctionsBaseUrl = (): string => {
  const customUrl = (import.meta.env.VITE_EDGE_FUNCTIONS_URL as string | undefined)?.trim();
  if (customUrl) return customUrl.replace(/\/$/, '');
  return `${effectiveUrl.replace(/\/$/, '')}/functions/v1`;
};
