# Full Plan — Shopify Live + Old Orders Backfill + End-to-End Checklist

## Status snapshot (abhi kya hai)

- ✅ Database schema ready (orders, fulfillments, message_jobs, templates x8, bridge_sessions, app_settings, opt_outs)
- ✅ WA Bridge **online** (heartbeat aa rahi hai)
- ✅ Shopify webhook endpoint deployed: `/api/public/shopify-webhook` (HMAC verify)
- ✅ Bridge poll/result/heartbeat endpoints live
- ✅ Dashboard pages: orders, orders/$id, templates, jobs, bridge, settings
- ❌ Shopify webhooks **register nahi hue** store me — isi liye 0 orders
- ❌ **Old orders backfill** missing (sirf naye orders aate webhook se)
- ❌ Manual send / pause-notifications buttons orders detail page pe missing
- ❌ Bulk promotional send missing
- ❌ Daily send-cap aur send-window enforcement code me hard-check missing

---

## Part A — Shopify ko LIVE karna (webhooks register)

Shopify Admin API se 5 webhooks register karne hain. Iske liye ek **one-time admin server function** banayenge jise dashboard se "Connect Shopify" button click karne par chalayenge.

### A1. Webhook registration server function
File: `src/lib/shopify-admin.functions.ts`
- `registerShopifyWebhooks()` — admin-only server fn
- Shopify Admin REST API call (`POST /admin/api/2025-07/webhooks.json`) for:
  - `orders/create`
  - `orders/updated`
  - `orders/cancelled`
  - `fulfillments/create`
  - `fulfillments/update`
- Address = `https://choicecartcrm8989815459.lovable.app/api/public/shopify-webhook`
- Uses `SHOPIFY_ACCESS_TOKEN` (already in secrets) + shop permanent domain
- Returns list of registered webhook IDs, stores them in `app_settings.shopify_webhook_ids` (new column)

### A2. HMAC secret sync
- Shopify ke har webhook ka HMAC secret = store ka **API secret key** (Admin app secret), not the access token. 
- Lovable Cloud me `SHOPIFY_API_SECRET` secret add karna hoga (user se maangenge agar missing hai)
- `app_settings.shopify_webhook_secret` ko isi value se sync karenge
- Webhook handler already verifies HMAC ✅

### A3. UI button
- `/settings` page pe naya section: **"Shopify Connection"**
  - "Register Webhooks" button → registerShopifyWebhooks() call
  - Status badge: green if registered, red if not
  - "Re-register" + "List active webhooks" actions

---

## Part B — Old orders backfill (purane orders fetch karna)

### B1. Backfill server function
File: `src/lib/shopify-backfill.functions.ts`
- `backfillShopifyOrders({ since?: string, limit?: number })` admin-only
- Loops through Shopify Admin REST: `GET /admin/api/2025-07/orders.json?status=any&limit=250&page_info=...` (cursor pagination via `Link` header)
- For each order: same `upsertOrder()` logic as webhook (dedupe by `shopify_order_id`)
- For each order's fulfillments: same upsert logic
- **Important:** backfill me `enqueueEvent` **NAHI** call karenge (warna purane sab customers ko WhatsApp blast ho jayega). Sirf DB me data populate hoga.
- Writes progress to `app_settings.last_backfill_at` + count

### B2. Backfill UI
- `/settings` me "Import Old Orders" panel:
  - Date picker (default: last 90 days)
  - "Start Import" button → calls backfillShopifyOrders
  - Live progress (orders fetched count, polling)
  - Toggle: "Send notifications for backfilled orders" (default OFF — safety)

### B3. Future scheduled re-sync
- Optional: pg_cron job daily at 3am to re-sync last 24h (catches missed webhooks). **Phase 2** — abhi skip.

---

## Part C — Missing dashboard features

### C1. Order detail page enhancements (`/orders/$id`)
- "Pause notifications" toggle → updates `orders.notifications_paused`
- "Send manual message" dialog:
  - Pick template OR free text
  - Preview rendered body
  - Submit → inserts `message_jobs` row directly (status=queued)
- Tracking timeline (read from fulfillments table)
- Message history (filter `message_logs`/`message_jobs` by order_id)

### C2. Bulk send (`/orders`)
- Checkbox column + "Send Promo" action
- Modal: pick template, confirm count, daily-cap warning
- Inserts message_jobs in batch with staggered `scheduled_for`

### C3. Hard rate-limit enforcement
Currently `bridge.poll.ts` returns due jobs without checking daily cap. Add:
- Before returning jobs, count `message_jobs WHERE status='sent' AND sent_at::date = today`
- If `>= app_settings.daily_send_limit`, return empty
- Also enforce `send_window_start/end` in store timezone
- Bridge stays idle silently — no error to customer

### C4. Opt-out auto-handling
- Bridge can POST inbound replies to `/api/public/bridge.inbound` (new endpoint)
- If body matches `opt_out_keyword`, insert into `opt_outs` table
- **Phase 2** if bridge inbound not wired yet

---

## Part D — Templates polish

8 templates already seeded. Verify:
- All have correct placeholders `{{customer_name}} {{order_number}} {{tracking_url}}` etc.
- `/templates` page has live preview with sample data
- Auto-send toggle visible per template

---

## Part E — Secrets needed from user

Before A1 runs, confirm these secrets exist (most already do):
- ✅ `SHOPIFY_ACCESS_TOKEN` (have)
- ❓ `SHOPIFY_API_SECRET` — **need from user** (Shopify Admin → Apps → your custom app → API credentials → "API secret key"). Used for HMAC verification.
- ✅ `SUPABASE_SERVICE_ROLE_KEY` (have)

---

## Execution order (jab plan approve ho)

1. Add `SHOPIFY_API_SECRET` secret (ask user)
2. Migration: add `shopify_webhook_ids jsonb`, `last_backfill_at timestamptz`, `last_backfill_count int` to `app_settings`
3. Build `shopify-admin.functions.ts` (register/list/delete webhooks)
4. Build `shopify-backfill.functions.ts` (paginated import, no enqueue)
5. Settings UI: Shopify Connection panel + Backfill panel
6. Order detail page: pause toggle + manual send dialog + timeline
7. Orders list: bulk send
8. `bridge.poll.ts`: daily cap + send window enforcement
9. **Test end-to-end:**
   - Register webhooks → place test order in Shopify → verify row in `orders` → verify job in `message_jobs` → verify bridge picks up → verify WhatsApp delivered
   - Trigger backfill for last 30 days → verify old orders appear, **no messages sent**

---

## What I need from you to start

1. **Shopify API Secret** (HMAC verify ke liye) — Shopify Admin → Settings → Apps and sales channels → Develop apps → [your app] → API credentials → "API secret key"
2. **Backfill window** — kitne purane orders chahiye? (last 30 days / 90 days / 1 year / all-time)
3. **Backfilled orders ke liye notifications?** Default = OFF (recommended). Confirm karo.
