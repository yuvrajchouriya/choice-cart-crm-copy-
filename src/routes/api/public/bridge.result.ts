import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function authBridge(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data } = await supabaseAdmin.from("app_settings").select("bridge_secret").eq("id", 1).single();
  return data?.bridge_secret === token;
}

export const Route = createFileRoute("/api/public/bridge/result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authBridge(request))) return new Response("Unauthorized", { status: 401 });
        const body = (await request.json()) as {
          id: string;
          status: "sent" | "failed";
          error?: string;
          waMessageId?: string;
        };

        const { data: job } = await supabaseAdmin
          .from("message_jobs")
          .select("*")
          .eq("id", body.id)
          .single();
        if (!job) return new Response("not found", { status: 404 });

        if (body.status === "sent") {
          await supabaseAdmin
            .from("message_jobs")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              wa_message_id: body.waMessageId ?? null,
              attempts: (job.attempts ?? 0) + 1,
            })
            .eq("id", body.id);

          // increment session counter
          const today = new Date().toISOString().slice(0, 10);
          const { data: sess } = await supabaseAdmin
            .from("bridge_sessions")
            .select("sent_today,sent_today_date")
            .eq("session_name", "default")
            .single();
          const sent = sess?.sent_today_date === today ? (sess?.sent_today ?? 0) + 1 : 1;
          await supabaseAdmin
            .from("bridge_sessions")
            .update({ sent_today: sent, sent_today_date: today })
            .eq("session_name", "default");
        } else {
          const attempts = (job.attempts ?? 0) + 1;
          const failed = attempts >= 3;
          // backoff: 60s * attempts
          const next = new Date(Date.now() + 60_000 * attempts).toISOString();
          await supabaseAdmin
            .from("message_jobs")
            .update({
              status: failed ? "failed" : "queued",
              attempts,
              last_error: body.error ?? null,
              scheduled_for: failed ? job.scheduled_for : next,
            })
            .eq("id", body.id);
        }
        return new Response("ok");
      },
    },
  },
});
