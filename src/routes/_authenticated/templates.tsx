import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/templates")({ component: Templates });

function Templates() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => supabase.from("message_templates").select("*").order("event").then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);

  const save = async (r: any) => {
    const { error } = await supabase.from("message_templates").update({ body: r.body, enabled: r.enabled, auto_send: r.auto_send }).eq("id", r.id);
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Message Templates</h1>
      <p className="text-sm text-muted-foreground">Use placeholders: {"{{customer_name}}"}, {"{{order_number}}"}, {"{{total}}"}, {"{{currency}}"}, {"{{tracking_number}}"}, {"{{tracking_company}}"}, {"{{tracking_url}}"}</p>
      {rows.map((r, i) => (
        <div key={r.id} className="rounded-md border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{r.label} <span className="text-xs text-muted-foreground">({r.event})</span></div>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2"><Switch checked={r.enabled} onCheckedChange={(v) => { const c = [...rows]; c[i] = { ...r, enabled: v }; setRows(c); }} /> Enabled</label>
              <label className="flex items-center gap-2"><Switch checked={r.auto_send} onCheckedChange={(v) => { const c = [...rows]; c[i] = { ...r, auto_send: v }; setRows(c); }} /> Auto-send</label>
            </div>
          </div>
          <Textarea rows={4} value={r.body} onChange={(e) => { const c = [...rows]; c[i] = { ...r, body: e.target.value }; setRows(c); }} />
          <Button size="sm" onClick={() => save(r)}>Save</Button>
        </div>
      ))}
    </div>
  );
}
