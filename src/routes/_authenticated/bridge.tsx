import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/bridge")({ component: BridgePage });

function BridgePage() {
  const [session, setSession] = useState<any>(null);
  const [secret, setSecret] = useState<string>("");

  const load = async () => {
    const { data: s } = await supabase.from("bridge_sessions").select("*").eq("session_name", "default").single();
    setSession(s);
    const { data: cfg } = await supabase.from("app_settings").select("bridge_secret").eq("id", 1).single();
    setSecret(cfg?.bridge_secret ?? "");
  };
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const rotate = async () => {
    const newSecret = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, "0")).join("");
    await supabase.from("app_settings").update({ bridge_secret: newSecret }).eq("id", 1);
    toast.success("Rotated. Update your bridge .env"); load();
  };

  const online = session?.last_seen_at && Date.now() - new Date(session.last_seen_at).getTime() < 90_000;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">WhatsApp Bridge</h1>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${online ? "bg-green-500" : "bg-red-500"}`} /> {online ? "Online" : "Offline"}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>Status: <b>{session?.status ?? "—"}</b></div>
          <div>Last seen: {session?.last_seen_at ? new Date(session.last_seen_at).toLocaleString() : "Never"}</div>
          <div>Sent today: {session?.sent_today ?? 0}</div>
          {session?.qr_code && session.status === "qr" && (
            <div>
              <div className="text-muted-foreground mb-2">Scan this QR with WhatsApp on your phone:</div>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(session.qr_code)}`} alt="QR" />
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Bridge Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>Bridge URL: <code className="bg-muted px-2 py-1 rounded">{typeof window !== "undefined" ? window.location.origin : ""}</code></div>
          <div>Bridge Secret: <code className="bg-muted px-2 py-1 rounded break-all">{secret}</code></div>
          <Button size="sm" variant="outline" onClick={rotate}>Rotate secret</Button>
          <p className="text-muted-foreground pt-2">Run the wa-bridge Node script (see /wa-bridge/README.md in your project) on a PC or VPS that stays online.</p>
        </CardContent>
      </Card>
    </div>
  );
}
