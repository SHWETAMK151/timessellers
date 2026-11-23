// ==============================================================================
// TIMESSELLERS — SUPABASE CLIENT CONFIGURATION
// Uses ONLY public configuration (VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY),
// with built-in project defaults for the `time seller` (youixtxcfluaskmylqmp)
// Supabase instance so Vercel/Netlify deployments work out of the box.
// Service role keys or private credentials are NEVER imported or present here.
// ==============================================================================

import { createClient } from '@supabase/supabase-js';

const DEFAULT_PROJECT_SUPABASE_URL = 'https://youixtxcfluaskmylqmp.supabase.co';
const DEFAULT_PROJECT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdWl4dHhjZmx1YXNrbXlscW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzMTUxNzQsImV4cCI6MjExMDg5MTE3NH0.mKVZ4-kQmnbIEdHkuI24qX2_VCgDKFCzw0LvG_B97U0';

const envSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const envSupabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

const supabaseUrl =
  envSupabaseUrl && envSupabaseUrl.startsWith('http') && !envSupabaseUrl.includes('your-project-ref')
    ? envSupabaseUrl
    : DEFAULT_PROJECT_SUPABASE_URL;

const supabaseAnonKey =
  envSupabaseAnonKey && !envSupabaseAnonKey.includes('your-public-anon-key')
    ? envSupabaseAnonKey
    : DEFAULT_PROJECT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('your-project-ref')
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;
};
