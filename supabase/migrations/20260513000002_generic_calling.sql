-- ============================================================
-- GENERIC CALLING PROVIDER MIGRATION
-- ============================================================

-- Rename the column so it's not VAPI-specific
ALTER TABLE public.call_jobs RENAME COLUMN vapi_call_id TO provider_call_id;

-- Add generic provider settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS calling_provider TEXT NOT NULL DEFAULT 'vapi',
  ADD COLUMN IF NOT EXISTS custom_calling_endpoint TEXT,
  ADD COLUMN IF NOT EXISTS custom_calling_token TEXT;
