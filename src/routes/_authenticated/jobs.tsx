import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/jobs")({ component: Jobs });

function Jobs() {
  const [filter, setFilter] = useState<string>("all");
  const [rows, setRows] = useState<any[]>([]);

  const load = async () => {
    let q = supabase.from("message_jobs").select("*").order("created_at", { ascending: false }).limit(200);
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, [filter]);

  const action = async (id: string, status: string) => {
    const { error } = await supabase.from("message_jobs").update({ status, attempts: 0, scheduled_for: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Message Queue</h1>
      <div className="flex gap-2">
        {["all", "draft", "queued", "sending", "sent", "failed"].map((s) => (
          <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>{s}</Button>
        ))}
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left"><tr><th className="p-2">Status</th><th className="p-2">Phone</th><th className="p-2">Body</th><th className="p-2">Event</th><th className="p-2">When</th><th className="p-2">Action</th></tr></thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.id} className="border-t">
                <td className="p-2">{j.status}</td>
                <td className="p-2">{j.phone}</td>
                <td className="p-2 max-w-md truncate">{j.body}</td>
                <td className="p-2">{j.event}</td>
                <td className="p-2">{new Date(j.created_at).toLocaleString()}</td>
                <td className="p-2 space-x-1">
                  {j.status === "draft" && <Button size="sm" onClick={() => action(j.id, "queued")}>Approve</Button>}
                  {j.status === "failed" && <Button size="sm" variant="outline" onClick={() => action(j.id, "queued")}>Retry</Button>}
                  {(j.status === "queued" || j.status === "draft") && <Button size="sm" variant="ghost" onClick={() => action(j.id, "cancelled")}>Cancel</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
