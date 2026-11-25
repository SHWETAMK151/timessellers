-- ==============================================================================
-- TIMESSELLERS LUXURY E-COMMERCE PLATFORM
-- Migration 0015: Update Live Store Contact Info & Instagram Handle
-- ==============================================================================

UPDATE public.store_settings
SET
  contact_phone = '+91 94151 25878',
  contact_email = 'singhshwetank151@gmail.com',
  instagram_handle = '@timeseller.in',
  updated_at = NOW()
WHERE singleton_key = 'default';
