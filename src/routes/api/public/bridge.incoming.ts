// Incoming WA message handler — receives customer replies from the bridge
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { analyzeCustomerReply } from "@/lib/ai.server";
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

export const Route = createFileRoute("/api/public/bridge/incoming")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authBridge(request)))
          return new Response("Unauthorized", { status: 401 });

        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const phone = normalizePhone(body.phone);
        const messageBody: string = body.body ?? "";
        const waMessageId: string | null = body.wa_message_id ?? null;

        if (!phone || !messageBody) {
          return new Response("Missing phone or body", { status: 400 });
        }

        // Load settings
        const { data: settings } = await supabaseAdmin
          .from("app_settings")
          .select(
            "opt_out_keyword,ai_auto_reply_enabled,bridge_secret"
          )
          .eq("id", 1)
          .single();

        const optOutKeyword = settings?.opt_out_keyword ?? "STOP";
        const autoReplyEnabled = settings?.ai_auto_reply_enabled ?? false;

        // Find the most recent order for this phone
        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("id,shopify_order_number,customer_name,fulfillment_status")
          .eq("phone", phone)
          .order("shopify_created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // AI analysis
        let analysis = {
          intent: "other" as string,
          entities: {} as Record<string, string>,
          ai_reply: "",
          confidence: 0,
        };

        try {
          analysis = await analyzeCustomerReply({
            phone,
            body: messageBody,
            orderContext: order
              ? {
                  order_number: order.shopify_order_number ?? "",
                  customer_name: order.customer_name ?? "",
                  status: order.fulfillment_status ?? "pending",
                }
              : null,
            optOutKeyword,
          });
        } catch (e: any) {
          console.error("AI analysis failed:", e.message);
          analysis.ai_reply =
            "Thank you for your message! Our team will get back to you shortly.";
        }

        // Handle opt-out
        if (analysis.intent === "stop") {
          await supabaseAdmin
            .from("opt_outs")
            .upsert({ phone }, { onConflict: "phone" });

          // Also pause order notifications
          if (order?.id) {
            await supabaseAdmin
              .from("orders")
              .update({ notifications_paused: true })
              .eq("id", order.id);
          }
        }

        // Store the incoming message
        const { data: savedMsg, error: insertErr } = await supabaseAdmin
          .from("incoming_messages")
          .insert({
            phone,
            body: messageBody,
            wa_message_id: waMessageId,
            order_id: order?.id ?? null,
            intent: analysis.intent,
            entities: analysis.entities,
            ai_reply: analysis.ai_reply,
            handled: analysis.intent === "stop", // opt-outs auto-handled
            auto_replied: false,
          })
          .select("id")
          .single();

        if (insertErr) console.error("Failed to store incoming message:", insertErr.message);

        // Auto-reply if enabled and we have a reply
        if (
          autoReplyEnabled &&
          analysis.ai_reply &&
          analysis.confidence > 0.6 &&
          savedMsg?.id
        ) {
          // Queue an auto-reply WA message
          await supabaseAdmin.from("message_jobs").insert({
            order_id: order?.id ?? null,
            event: "auto_reply",
            phone,
            body: analysis.ai_reply,
            status: "queued",
            scheduled_for: new Date().toISOString(),
          });

          // Mark as auto-replied
          await supabaseAdmin
            .from("incoming_messages")
            .update({ auto_replied: true, handled: true })
            .eq("id", savedMsg.id);
        }

        return Response.json({
          ok: true,
          intent: analysis.intent,
          auto_replied: autoReplyEnabled && analysis.confidence > 0.6,
        });
      },
    },
  },
});
