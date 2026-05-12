// Server-only helpers for Shopify Admin API.
// Do NOT import this file from client/route components — *.server.ts is bundle-blocked from client.

const SHOP_DOMAIN = process.env.SHOPIFY_DOMAIN;
const ADMIN_API_VERSION = "2025-07";

function adminUrl(path: string) {
  return `https://${SHOP_DOMAIN}/admin/api/${ADMIN_API_VERSION}${path}`;
}

function adminHeaders() {
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!token) throw new Error("SHOPIFY_ACCESS_TOKEN not configured");
  return {
    "X-Shopify-Access-Token": token,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export const SHOPIFY_WEBHOOK_TOPICS = [
  "orders/create",
  "orders/updated",
  "orders/cancelled",
  "fulfillments/create",
  "fulfillments/update",
] as const;

export type ShopifyWebhook = {
  id: number;
  topic: string;
  address: string;
  created_at: string;
  updated_at: string;
};

export async function listShopifyWebhooks(): Promise<ShopifyWebhook[]> {
  const res = await fetch(adminUrl("/webhooks.json?limit=250"), { headers: adminHeaders() });
  if (!res.ok) throw new Error(`Shopify list webhooks failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { webhooks: ShopifyWebhook[] };
  return json.webhooks ?? [];
}

export async function deleteShopifyWebhook(id: number): Promise<void> {
  const res = await fetch(adminUrl(`/webhooks/${id}.json`), { method: "DELETE", headers: adminHeaders() });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Shopify delete webhook ${id} failed: ${res.status} ${await res.text()}`);
  }
}

export async function createShopifyWebhook(topic: string, address: string): Promise<ShopifyWebhook> {
  const res = await fetch(adminUrl("/webhooks.json"), {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
  });
  if (!res.ok) throw new Error(`Shopify create webhook ${topic} failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { webhook: ShopifyWebhook };
  return json.webhook;
}

export async function registerAllShopifyWebhooks(callbackUrl: string): Promise<{
  registered: ShopifyWebhook[];
  removed: number[];
}> {
  // Remove existing webhooks pointing to our callback url to avoid dupes
  const existing = await listShopifyWebhooks();
  const ours = existing.filter((w) => w.address === callbackUrl);
  const removed: number[] = [];
  for (const w of ours) {
    await deleteShopifyWebhook(w.id);
    removed.push(w.id);
  }

  const registered: ShopifyWebhook[] = [];
  for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
    const wh = await createShopifyWebhook(topic, callbackUrl);
    registered.push(wh);
  }
  return { registered, removed };
}

// --- Order fetching for backfill ---

export type ShopifyOrder = Record<string, any>;

function parseNextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // Link: <https://...page_info=XYZ&...>; rel="next", <...>; rel="previous"
  const parts = linkHeader.split(",");
  for (const p of parts) {
    const m = p.match(/<([^>]+)>;\s*rel="next"/);
    if (m) {
      const url = new URL(m[1]);
      return url.searchParams.get("page_info");
    }
  }
  return null;
}

export async function* iterateShopifyOrders(opts: {
  createdAtMin?: string;
  pageSize?: number;
}): AsyncGenerator<ShopifyOrder[], void, void> {
  const pageSize = opts.pageSize ?? 250;
  // First page uses filter params; subsequent pages use only page_info per Shopify spec.
  let url: string;
  const firstParams = new URLSearchParams({
    status: "any",
    limit: String(pageSize),
  });
  if (opts.createdAtMin) firstParams.set("created_at_min", opts.createdAtMin);
  url = adminUrl(`/orders.json?${firstParams.toString()}`);

  while (url) {
    const res = await fetch(url, { headers: adminHeaders() });
    if (!res.ok) throw new Error(`Shopify orders fetch failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { orders: ShopifyOrder[] };
    yield json.orders ?? [];
    const next = parseNextPageInfo(res.headers.get("link"));
    if (!next) break;
    url = adminUrl(`/orders.json?limit=${pageSize}&page_info=${encodeURIComponent(next)}`);
  }
}

// Upsert helpers (mirror shopify-webhook.ts logic)
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function upsertOrderFromShopify(o: ShopifyOrder) {
  const addr = o.shipping_address ?? o.billing_address ?? {};
  const phone =
    o.phone ||
    o.customer?.phone ||
    o.shipping_address?.phone ||
    o.billing_address?.phone ||
    null;
  const customerName =
    [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ") ||
    [addr.first_name, addr.last_name].filter(Boolean).join(" ") ||
    null;

  const payload = {
    shopify_order_id: String(o.id),
    shopify_order_number: o.name ?? String(o.order_number ?? ""),
    customer_name: customerName,
    phone,
    email: o.email ?? o.customer?.email ?? null,
    total_price: o.total_price ? Number(o.total_price) : null,
    currency: o.currency ?? null,
    financial_status: o.financial_status ?? null,
    fulfillment_status: o.fulfillment_status ?? null,
    payment_type: (o.payment_gateway_names ?? []).join(", ") || null,
    shipping_address: addr,
    line_items: (o.line_items ?? []).map((li: any) => ({
      title: li.title,
      qty: li.quantity,
      price: li.price,
      variant_title: li.variant_title,
    })),
    shopify_created_at: o.created_at ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("orders")
    .upsert(payload, { onConflict: "shopify_order_id" })
    .select("id")
    .single();
  if (error) throw error;

  // Upsert any embedded fulfillments. Backfill marks last_notified_status to current
  // shipment_status so we DON'T blast historical customers with WhatsApp messages.
  for (const f of o.fulfillments ?? []) {
    const trackingNumber = f.tracking_number || (f.tracking_numbers ?? [])[0] || null;
    const trackingUrl = f.tracking_url || (f.tracking_urls ?? [])[0] || null;
    const shipStatus: string | null = f.shipment_status ?? null;
    await supabaseAdmin.from("fulfillments").upsert(
      {
        order_id: data.id,
        shopify_fulfillment_id: String(f.id),
        tracking_number: trackingNumber,
        tracking_company: f.tracking_company ?? null,
        tracking_url: trackingUrl,
        shipment_status: shipStatus,
        current_status: shipStatus || f.status || null,
        last_notified_status: shipStatus, // suppress notify on backfill
      },
      { onConflict: "shopify_fulfillment_id" }
    );
  }
  return data.id as string;
}

export function getCallbackUrl(): string {
  const baseUrl = process.env.APP_URL || "https://choicecartcrm8989815459.lovable.app";
  return `${baseUrl}/api/public/shopify-webhook`;
}
