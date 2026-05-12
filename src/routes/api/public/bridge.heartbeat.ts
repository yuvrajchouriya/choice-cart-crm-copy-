import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function authBridge(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data } = await supabaseAdmin.from("app_settings").select("bridge_secret").eq("id", 1).single();
  return data?.bridge_secret === token;
}

export const Route = createFileRoute("/api/public/bridge/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authBridge(request))) return new Response("Unauthorized", { status: 401 });
        const body = (await request.json()) as { status: "online" | "qr" | "offline"; qr?: string | null };

        await supabaseAdmin
          .from("bridge_sessions")
          .update({
            status: body.status,
            qr_code: body.qr ?? null,
            last_seen_at: new Date().toISOString(),
          })
          .eq("session_name", "default");

        return new Response("ok");
      },
    },
  },
});
