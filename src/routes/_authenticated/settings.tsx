import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { registerShopifyWebhooks, listWebhooksFn, backfillShopifyOrders } from "@/lib/shopify.functions";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const [s, setS] = useState<any>(null);
  const [hooks, setHooks] = useState<{ id: number; topic: string; address: string }[] | null>(null);
  const [callback, setCallback] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [sinceDays, setSinceDays] = useState<number>(90);

  const registerFn = useServerFn(registerShopifyWebhooks);
  const listFn = useServerFn(listWebhooksFn);
  const backfillFn = useServerFn(backfillShopifyOrders);

  const reload = () => supabase.from("app_settings").select("*").eq("id", 1).single().then(({ data }) => setS(data));

  useEffect(() => {
    reload();
    listFn({}).then((r) => { setHooks(r.webhooks); setCallback(r.callback); }).catch(() => {});
  }, []);

  if (!s) return <div>Loading…</div>;

  const save = async () => {
    const { error } = await supabase.from("app_settings").update({
      daily_send_limit: s.daily_send_limit, send_window_start: s.send_window_start, send_window_end: s.send_window_end,
      min_delay_sec: s.min_delay_sec, max_delay_sec: s.max_delay_sec, opt_out_keyword: s.opt_out_keyword,
    }).eq("id", 1);
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  const doRegister = async () => {
    setBusy("register");
    try {
      const r = await registerFn({});
      toast.success(`Registered ${r.registered} webhooks (removed ${r.removed} old)`);
      const list = await listFn({});
      setHooks(list.webhooks);
      setCallback(list.callback);
      reload();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    setBusy(null);
  };

  const doBackfill = async () => {
    setBusy("backfill");
    toast.info(`Importing last ${sinceDays} days... (yeh thoda time lega)`);
    try {
      const r = await backfillFn({ data: { sinceDays } });
      toast.success(`Imported ${r.imported} orders (${r.errors} errors). Notifications NOT sent.`);
      reload();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    setBusy(null);
  };

  const ourHooks = (hooks ?? []).filter((h) => h.address === callback);
  const expectedTopics = ["orders/create", "orders/updated", "orders/cancelled", "fulfillments/create", "fulfillments/update"];
  const allRegistered = expectedTopics.every((t) => ourHooks.some((h) => h.topic === t));

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2">Shopify Connection {hooks && (allRegistered ? <Badge className="bg-green-600">Connected</Badge> : <Badge variant="destructive">Not registered</Badge>)}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <Label>Webhook callback URL</Label>
            <code className="block bg-muted p-2 rounded break-all text-xs mt-1">{callback || "—"}</code>
          </div>
          <Button onClick={doRegister} disabled={busy === "register"}>
            {busy === "register" ? "Registering..." : allRegistered ? "Re-register webhooks" : "Register webhooks now"}
          </Button>
          {hooks && (
            <div className="text-xs text-muted-foreground">
              <div className="font-medium mb-1">Active webhooks pointing to us:</div>
              {ourHooks.length === 0 && <div>None yet.</div>}
              <ul className="list-disc list-inside">
                {ourHooks.map((h) => <li key={h.id}>{h.topic}</li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Import Old Orders (Backfill)</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Shopify se purane orders fetch karke DB me daal dega. <b>WhatsApp messages NAHI bhejega</b> — sirf data import.</p>
          <div className="flex gap-2 items-end">
            <div className="flex-1"><Label>Last N days</Label><Input type="number" min={1} max={3650} value={sinceDays} onChange={(e) => setSinceDays(Number(e.target.value) || 90)} /></div>
            <Button onClick={doBackfill} disabled={busy === "backfill"}>{busy === "backfill" ? "Importing..." : "Start import"}</Button>
          </div>
          {s.last_backfill_at && (
            <div className="text-xs text-muted-foreground">
              Last import: {new Date(s.last_backfill_at).toLocaleString()} — {s.last_backfill_count} orders. Status: {s.backfill_status}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sending limits</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Daily send limit</Label><Input type="number" value={s.daily_send_limit} onChange={(e) => setS({ ...s, daily_send_limit: Number(e.target.value) })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Window start</Label><Input type="time" value={s.send_window_start} onChange={(e) => setS({ ...s, send_window_start: e.target.value })} /></div>
            <div><Label>Window end</Label><Input type="time" value={s.send_window_end} onChange={(e) => setS({ ...s, send_window_end: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Min delay (sec)</Label><Input type="number" value={s.min_delay_sec} onChange={(e) => setS({ ...s, min_delay_sec: Number(e.target.value) })} /></div>
            <div><Label>Max delay (sec)</Label><Input type="number" value={s.max_delay_sec} onChange={(e) => setS({ ...s, max_delay_sec: Number(e.target.value) })} /></div>
          </div>
          <div><Label>Opt-out keyword</Label><Input value={s.opt_out_keyword} onChange={(e) => setS({ ...s, opt_out_keyword: e.target.value })} /></div>
          <Button onClick={save}>Save</Button>
        </CardContent>
      </Card>
    </div>
  );
}
