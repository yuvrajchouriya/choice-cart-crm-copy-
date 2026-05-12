
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS shopify_webhook_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_backfill_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_backfill_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS backfill_status text NOT NULL DEFAULT 'idle';
