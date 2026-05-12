// Generic / VAPI Webhook — receives call transcripts and triggers Shopify updates
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { analyzeCallTranscript } from "@/lib/ai.server";
import { normalizePhone } from "@/lib/templates";

export const Route = createFileRoute("/api/public/call-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // VAPI sends webhooks without auth, but we can verify via secret in URL
        // or accept all and validate the structure
        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const vapiType = payload?.message?.type ?? payload?.type ?? "";
        let isEndEvent = false;
        let callId = null;
        let transcript = "";

        // Detect VAPI end report
        if (vapiType === "end-of-call-report" || vapiType === "call-ended") {
          isEndEvent = true;
          callId = payload?.message?.call?.id ?? payload?.call?.id ?? payload?.message?.callId ?? null;
          transcript = payload?.message?.transcript ?? payload?.transcript ?? "";
        }
        // Detect generic custom payload
        else if (payload?.call_id && payload?.status === "completed") {
          isEndEvent = true;
          callId = String(payload.call_id);
          transcript = payload.transcript ?? "";
        }

        if (!isEndEvent) {
          return Response.json({ ok: true, skipped: true });
        }

        if (!callId) return Response.json({ ok: true, no_call_id: true });

        // Find the call job
        const { data: callJob } = await supabaseAdmin
          .from("call_jobs")
          .select("*, orders(id, shopify_order_id, customer_name, line_items, phone)")
          .eq("provider_call_id", callId)
          .maybeSingle();

        if (!callJob) {
          console.error("No call_job found for VAPI call_id:", callId);
          return Response.json({ ok: true, not_found: true });
        }

        // Update call job with transcript
        await supabaseAdmin
          .from("call_jobs")
          .update({
            status: "completed",
            transcript,
            ended_at: new Date().toISOString(),
          })
          .eq("id", callJob.id);

        // AI analysis of transcript
        const order = callJob.orders as any;
        const items =
          (order?.line_items as any[])?.map(
            (li: any) => `${li.title} x${li.qty}`
          ) ?? [];

        let analysis;
        try {
          analysis = await analyzeCallTranscript({
            transcript,
            orderContext: {
              order_number: callJob.orders?.shopify_order_id ?? "",
              customer_name: order?.customer_name ?? "",
              items,
            },
          });
        } catch (e: any) {
          console.error("Transcript analysis failed:", e.message);
          return Response.json({ ok: true, analysis_error: e.message });
        }

        // Save analysis
        await supabaseAdmin
          .from("call_jobs")
          .update({ ai_analysis: analysis })
          .eq("id", callJob.id);

        // Handle cancellation
        if (analysis.cancellation_requested && order?.id) {
          // Pause notifications + flag for manual review
          await supabaseAdmin
            .from("orders")
            .update({ notifications_paused: true })
            .eq("id", order.id);

          // Queue WA message about cancellation review
          const phone = normalizePhone(order.phone);
          if (phone) {
            await supabaseAdmin.from("message_jobs").insert({
              order_id: order.id,
              event: "manual",
              phone,
              body: `Hi ${order.customer_name?.split(" ")[0] ?? "Customer"}! We received your cancellation request from our call. Our team will process it shortly and confirm via WhatsApp.`,
              status: "queued",
              scheduled_for: new Date().toISOString(),
            });
          }
        }

        // Handle address change — add note to Shopify order
        if (analysis.address_change && order?.shopify_order_id) {
          try {
            const shopifyDomain = process.env.SHOPIFY_DOMAIN ?? "7qjz9d-ys.myshopify.com";
            const apiVersion = "2025-07";
            const token = process.env.SHOPIFY_ACCESS_TOKEN;
            if (token) {
              // Add order note via Shopify Admin API
              await fetch(
                `https://${shopifyDomain}/admin/api/${apiVersion}/orders/${order.shopify_order_id}.json`,
                {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Shopify-Access-Token": token,
                  },
                  body: JSON.stringify({
                    order: {
                      id: order.shopify_order_id,
                      note: `[AI Call Update] New address requested: ${analysis.address_change}. Summary: ${analysis.summary}`,
                    },
                  }),
                }
              );
            }
          } catch (e: any) {
            console.error("Shopify order update failed:", e.message);
          }
        }

        return Response.json({ ok: true, analysis });
      },
    },
  },
});
