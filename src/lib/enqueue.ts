import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { renderTemplate, normalizePhone } from "./templates";

type OrderRow = {
  id: string;
  shopify_order_number: string | null;
  customer_name: string | null;
  phone: string | null;
  total_price: number | null;
  currency: string | null;
  notifications_paused: boolean;
};

type FulfillmentRow = {
  tracking_number: string | null;
  tracking_company: string | null;
  tracking_url: string | null;
};

export async function enqueueEvent(opts: {
  order: OrderRow;
  fulfillment?: FulfillmentRow | null;
  event: string;
  forceManual?: boolean;
}): Promise<{ enqueued: boolean; reason?: string }> {
  const { order, fulfillment, event, forceManual } = opts;
  const phone = normalizePhone(order.phone);
  if (!phone) return { enqueued: false, reason: "no_phone" };
  if (order.notifications_paused) return { enqueued: false, reason: "paused" };

  // opt-out check
  const { data: opt } = await supabaseAdmin.from("opt_outs").select("phone").eq("phone", phone).maybeSingle();
  if (opt) return { enqueued: false, reason: "opted_out" };

  // template
  const { data: tpl } = await supabaseAdmin
    .from("message_templates")
    .select("body,enabled,auto_send")
    .eq("event", event)
    .maybeSingle();
  if (!tpl || !tpl.enabled) return { enqueued: false, reason: "template_disabled" };

  const { data: settings } = await supabaseAdmin.from("app_settings").select("min_delay_sec,max_delay_sec").eq("id", 1).single();
  const minD = settings?.min_delay_sec ?? 8;
  const maxD = settings?.max_delay_sec ?? 25;
  const delay = Math.floor(Math.random() * (maxD - minD + 1)) + minD;
  const scheduledFor = new Date(Date.now() + delay * 1000).toISOString();

  const body = renderTemplate(tpl.body, {
    customer_name: order.customer_name?.split(" ")[0] ?? "Customer",
    order_number: order.shopify_order_number ?? "",
    total: order.total_price ?? "",
    currency: order.currency ?? "",
    tracking_number: fulfillment?.tracking_number ?? "",
    tracking_company: fulfillment?.tracking_company ?? "",
    tracking_url: fulfillment?.tracking_url ?? "",
  });

  const status = forceManual || !tpl.auto_send ? "draft" : "queued";

  const { error } = await supabaseAdmin.from("message_jobs").insert({
    order_id: order.id,
    event,
    phone,
    body,
    status,
    scheduled_for: scheduledFor,
  });
  if (error) return { enqueued: false, reason: error.message };
  return { enqueued: true };
}
