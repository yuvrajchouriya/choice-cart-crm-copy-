// Enhanced shopify webhook — now also triggers AI calls after order_placed
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueEvent } from "@/lib/enqueue";
import { mapShopifyShipmentStatus } from "@/lib/templates";
import { normalizePhone } from "@/lib/templates";

async function verifyHmac(rawBody: string, headerHmac: string | null): Promise<boolean> {
  if (!headerHmac) return false;
  let secret = process.env.SHOPIFY_API_SECRET ?? "";
  if (!secret) {
    const { data: s } = await supabaseAdmin
      .from("app_settings")
      .select("shopify_webhook_secret")
      .eq("id", 1)
      .single();
    secret = s?.shopify_webhook_secret ?? "";
  }
  if (!secret) return false;
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(headerHmac));
  } catch {
    return false;
  }
}

async function upsertOrder(o: any) {
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
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function scheduleAiCallIfEnabled(order: any) {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("ai_calls_enabled, ai_calls_delay_min, calling_provider, vapi_assistant_id, custom_calling_endpoint")
    .eq("id", 1)
    .single();

  if (!settings?.ai_calls_enabled) return;
  
  if (settings.calling_provider === "custom" && !settings.custom_calling_endpoint) return;
  if (settings.calling_provider !== "custom" && !settings.vapi_assistant_id) return;

  const phone = normalizePhone(order.phone);
  if (!phone) return;

  const delayMin = settings.ai_calls_delay_min ?? 5;
  const scheduledAt = new Date(Date.now() + delayMin * 60 * 1000).toISOString();

  await supabaseAdmin.from("call_jobs").insert({
    order_id: order.id,
    phone,
    status: "pending",
    trigger_delay_min: delayMin,
    scheduled_at: scheduledAt,
  });
}

async function handleOrderCreate(o: any) {
  const order = await upsertOrder(o);
  await enqueueEvent({ order, event: "order_placed" });
  // Schedule AI confirmation call after delay
  await scheduleAiCallIfEnabled(order);
}

async function handleOrderUpdate(o: any) {
  await upsertOrder(o);
}

async function handleFulfillment(f: any) {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("shopify_order_id", String(f.order_id))
    .maybeSingle();
  if (!order) return;

  const trackingNumber = f.tracking_number || (f.tracking_numbers ?? [])[0] || null;
  const trackingUrl = f.tracking_url || (f.tracking_urls ?? [])[0] || null;
  const shipStatus: string | null = f.shipment_status ?? null;

  const payload = {
    order_id: order.id,
    shopify_fulfillment_id: String(f.id),
    tracking_number: trackingNumber,
    tracking_company: f.tracking_company ?? null,
    tracking_url: trackingUrl,
    shipment_status: shipStatus,
    current_status: shipStatus || f.status || null,
  };

  const { data: existing } = await supabaseAdmin
    .from("fulfillments")
    .select("*")
    .eq("shopify_fulfillment_id", String(f.id))
    .maybeSingle();

  let fulfillmentRow;
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("fulfillments")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    fulfillmentRow = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from("fulfillments")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;
    fulfillmentRow = data;
  }

  const event = mapShopifyShipmentStatus(shipStatus);
  if (!event) return;
  if (fulfillmentRow.last_notified_status === shipStatus) return;

  const result = await enqueueEvent({ order, fulfillment: fulfillmentRow, event });
  if (result.enqueued) {
    await supabaseAdmin
      .from("fulfillments")
      .update({ last_notified_status: shipStatus })
      .eq("id", fulfillmentRow.id);
  }
}

export const Route = createFileRoute("/api/public/shopify-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const hmac = request.headers.get("x-shopify-hmac-sha256");
        const topic = request.headers.get("x-shopify-topic") ?? "";

        const ok = await verifyHmac(raw, hmac);
        if (!ok) return new Response("Invalid signature", { status: 401 });

        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        try {
          if (topic === "orders/create") await handleOrderCreate(payload);
          else if (topic === "orders/updated" || topic === "orders/cancelled")
            await handleOrderUpdate(payload);
          else if (topic.startsWith("fulfillments/")) await handleFulfillment(payload);
          else return new Response(`Unsupported topic: ${topic}`, { status: 200 });
        } catch (err) {
          console.error("Webhook error:", err);
          return new Response("Server error", { status: 500 });
        }
        return new Response("ok");
      },
    },
  },
});
