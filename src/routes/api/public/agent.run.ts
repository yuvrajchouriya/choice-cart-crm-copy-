// AI Agent — autonomous decision-making engine
// Can be triggered via cron (Cloudflare scheduled worker) or manual HTTP POST
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueEvent } from "@/lib/enqueue";
import { createOutboundCall, toE164 } from "@/lib/calling.server";
import { normalizePhone } from "@/lib/templates";

async function authBridge(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("bridge_secret")
    .eq("id", 1)
    .single();
  return data?.bridge_secret === token;
}

async function runAgent(): Promise<object> {
  const startTime = Date.now();
  const actions: string[] = [];
  const errors: string[] = [];
  let ordersProcessed = 0;
  let messagesQueued = 0;
  let callsScheduled = 0;
  let repliesHandled = 0;

  // Load settings
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (!settings?.agent_autopilot) {
    return { skipped: true, reason: "autopilot_disabled" };
  }

  // ── Task 1: Schedule AI calls for new orders ─────────────────────────────
  if (settings.ai_calls_enabled && settings.vapi_assistant_id) {
    const delayMs = (settings.ai_calls_delay_min ?? 5) * 60 * 1000;
    const cutoff = new Date(Date.now() - delayMs).toISOString();

    const { data: newOrders } = await supabaseAdmin
      .from("orders")
      .select("id, phone, customer_name, shopify_order_number, line_items, created_at")
      .gte("created_at", new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()) // last 4 hours
      .lte("created_at", cutoff)
      .eq("notifications_paused", false)
      .limit(10);

    for (const order of newOrders ?? []) {
      // Check if call already scheduled
      const { count } = await supabaseAdmin
        .from("call_jobs")
        .select("id", { count: "exact", head: true })
        .eq("order_id", order.id)
        .neq("status", "failed");

      if ((count ?? 0) > 0) continue;

      const phone = normalizePhone(order.phone);
      if (!phone) continue;

      try {
        const e164 = toE164(phone);
        const items = (order.line_items as any[])?.map(
          (li: any) => li.title
        ) ?? [];

        const callResult = await createOutboundCall({
          provider: settings.calling_provider ?? "vapi",
          assistantId: settings.vapi_assistant_id,
          endpoint: settings.custom_calling_endpoint,
          token: settings.custom_calling_token,
          customerPhone: e164,
          orderId: order.id,
          orderNumber: order.shopify_order_number ?? "",
          customerName: order.customer_name ?? "Customer",
          items,
        });

        await supabaseAdmin.from("call_jobs").insert({
          order_id: order.id,
          phone,
          status: "calling",
          provider_call_id: callResult.id,
          scheduled_at: new Date().toISOString(),
          called_at: new Date().toISOString(),
        });

        callsScheduled++;
        actions.push(`Call scheduled for order ${order.shopify_order_number}`);
      } catch (e: any) {
        errors.push(`Call failed for order ${order.shopify_order_number}: ${e.message}`);
      }

      ordersProcessed++;
    }
  }

  // ── Task 2: Handle unprocessed incoming messages ──────────────────────────
  if (settings.ai_auto_reply_enabled) {
    const { data: unhandled } = await supabaseAdmin
      .from("incoming_messages")
      .select("id, phone, body, intent, ai_reply, order_id, confidence")
      .eq("handled", false)
      .eq("auto_replied", false)
      .order("created_at", { ascending: true })
      .limit(20);

    for (const msg of unhandled ?? []) {
      try {
        if (msg.ai_reply && (msg.confidence ?? 0) > 0.5) {
          await supabaseAdmin.from("message_jobs").insert({
            order_id: msg.order_id ?? null,
            event: "auto_reply",
            phone: msg.phone,
            body: msg.ai_reply,
            status: "queued",
            scheduled_for: new Date().toISOString(),
          });

          await supabaseAdmin
            .from("incoming_messages")
            .update({ handled: true, auto_replied: true })
            .eq("id", msg.id);

          repliesHandled++;
          actions.push(`Auto-replied to ${msg.phone} (intent: ${msg.intent})`);
        }
      } catch (e: any) {
        errors.push(`Auto-reply failed for ${msg.phone}: ${e.message}`);
      }
    }
  }

  // ── Task 3: Retry stuck "sending" jobs older than 10 min ─────────────────
  const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: stuckJobs } = await supabaseAdmin
    .from("message_jobs")
    .select("id")
    .eq("status", "sending")
    .lt("updated_at", stuckCutoff);

  if (stuckJobs && stuckJobs.length > 0) {
    const ids = stuckJobs.map((j) => j.id);
    await supabaseAdmin
      .from("message_jobs")
      .update({ status: "queued", attempts: 0 })
      .in("id", ids);
    actions.push(`Reset ${ids.length} stuck sending jobs`);
  }

  // Log this agent run
  const duration = Date.now() - startTime;
  await supabaseAdmin.from("agent_logs").insert({
    actions_taken: actions,
    orders_processed: ordersProcessed,
    messages_queued: messagesQueued,
    calls_scheduled: callsScheduled,
    replies_handled: repliesHandled,
    errors,
    duration_ms: duration,
  });

  await supabaseAdmin
    .from("app_settings")
    .update({ last_agent_run_at: new Date().toISOString() })
    .eq("id", 1);

  return {
    ok: true,
    duration_ms: duration,
    ordersProcessed,
    messagesQueued,
    callsScheduled,
    repliesHandled,
    actions,
    errors,
  };
}

export const Route = createFileRoute("/api/public/agent/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authBridge(request)))
          return new Response("Unauthorized", { status: 401 });

        try {
          const result = await runAgent();
          return Response.json(result);
        } catch (e: any) {
          console.error("Agent run error:", e);
          return Response.json({ ok: false, error: e.message }, { status: 500 });
        }
      },
      GET: async ({ request }) => {
        if (!(await authBridge(request)))
          return new Response("Unauthorized", { status: 401 });
        try {
          const result = await runAgent();
          return Response.json(result);
        } catch (e: any) {
          return Response.json({ ok: false, error: e.message }, { status: 500 });
        }
      },
    },
  },
});
