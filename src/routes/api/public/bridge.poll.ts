import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function authBridge(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data } = await supabaseAdmin.from("app_settings").select("bridge_secret").eq("id", 1).single();
  return data?.bridge_secret === token;
}

function inSendWindow(now: Date, startStr: string, endStr: string): boolean {
  const [sh, sm] = startStr.split(":").map(Number);
  const [eh, em] = endStr.split(":").map(Number);
  const cur = now.getHours() * 60 + now.getMinutes();
  return cur >= sh * 60 + sm && cur <= eh * 60 + em;
}

export const Route = createFileRoute("/api/public/bridge/poll")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await authBridge(request))) return new Response("Unauthorized", { status: 401 });

        const { data: settings } = await supabaseAdmin
          .from("app_settings")
          .select("daily_send_limit,send_window_start,send_window_end,timezone")
          .eq("id", 1)
          .single();

        const now = new Date();
        if (settings && !inSendWindow(now, settings.send_window_start, settings.send_window_end)) {
          return Response.json({ jobs: [], reason: "outside_window" });
        }

        // Reset daily counter if new day
        const today = now.toISOString().slice(0, 10);
        const { data: session } = await supabaseAdmin
          .from("bridge_sessions")
          .select("*")
          .eq("session_name", "default")
          .single();

        let sentToday = session?.sent_today ?? 0;
        if (session?.sent_today_date !== today) {
          await supabaseAdmin
            .from("bridge_sessions")
            .update({ sent_today: 0, sent_today_date: today })
            .eq("session_name", "default");
          sentToday = 0;
        }

        const limit = settings?.daily_send_limit ?? 200;
        const remaining = Math.max(0, limit - sentToday);
        if (remaining <= 0) return Response.json({ jobs: [], reason: "daily_limit" });

        // Atomically claim up to N jobs
        const claimCount = Math.min(remaining, 5);
        const { data: due } = await supabaseAdmin
          .from("message_jobs")
          .select("id")
          .eq("status", "queued")
          .lte("scheduled_for", now.toISOString())
          .lt("attempts", 3)
          .order("scheduled_for", { ascending: true })
          .limit(claimCount);

        if (!due || due.length === 0) return Response.json({ jobs: [] });

        const ids = due.map((d) => d.id);
        const { data: claimed } = await supabaseAdmin
          .from("message_jobs")
          .update({ status: "sending" })
          .in("id", ids)
          .eq("status", "queued")
          .select("id,phone,body,attempts");

        return Response.json({ jobs: claimed ?? [] });
      },
    },
  },
});
