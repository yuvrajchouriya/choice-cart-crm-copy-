import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Phone, Clock, CheckCircle, XCircle, Mic } from "lucide-react";

export const Route = createFileRoute("/_authenticated/calls")({
  component: CallsPage,
});

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  calling: { label: "Calling", color: "bg-blue-100 text-blue-800 animate-pulse", icon: Phone },
  completed: { label: "Completed", color: "bg-green-100 text-green-800", icon: CheckCircle },
  failed: { label: "Failed", color: "bg-red-100 text-red-800", icon: XCircle },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-800", icon: XCircle },
};

function CallsPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, failed: 0 });

  const load = async () => {
    let q = supabase
      .from("call_jobs")
      .select("*, orders(shopify_order_number, customer_name, phone)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    setCalls(data ?? []);

    // Stats
    const [
      { count: total },
      { count: completed },
      { count: pending },
      { count: failed },
    ] = await Promise.all([
      supabase.from("call_jobs").select("*", { count: "exact", head: true }),
      supabase.from("call_jobs").select("*", { count: "exact", head: true }).eq("status", "completed"),
      supabase.from("call_jobs").select("*", { count: "exact", head: true }).in("status", ["pending", "calling"]),
      supabase.from("call_jobs").select("*", { count: "exact", head: true }).eq("status", "failed"),
    ]);
    setStats({ total: total ?? 0, completed: completed ?? 0, pending: pending ?? 0, failed: failed ?? 0 });
  };

  useEffect(() => { load(); }, [filter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Phone className="h-6 w-6 text-blue-500" /> AI Calls
        </h1>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Calls</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.total}</div></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Completed</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{stats.completed}</div></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Active / Pending</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-blue-600">{stats.pending}</div></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Failed</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-600">{stats.failed}</div></CardContent></Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {["all", "pending", "calling", "completed", "failed"].map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {/* Calls list */}
      <div className="space-y-3">
        {calls.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            No calls yet. Enable AI calling in <a href="/agent" className="text-primary underline">AI Agent settings</a>.
          </div>
        )}
        {calls.map((call) => {
          const cfg = STATUS_CONFIG[call.status] ?? STATUS_CONFIG.pending;
          const StatusIcon = cfg.icon;
          const order = call.orders as any;
          return (
            <div key={call.id} className="rounded-md border p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <StatusIcon className="h-4 w-4" />
                  <span className="font-medium">{order?.customer_name ?? call.phone}</span>
                  {order?.shopify_order_number && (
                    <span className="text-xs text-muted-foreground">Order #{order.shopify_order_number}</span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {call.called_at
                    ? `Called: ${new Date(call.called_at).toLocaleString()}`
                    : `Scheduled: ${call.scheduled_at ? new Date(call.scheduled_at).toLocaleString() : "—"}`}
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                📞 {call.phone} {call.duration_sec && `• Duration: ${call.duration_sec}s`}
              </div>

              {/* AI Analysis */}
              {call.ai_analysis && (
                <div className="bg-muted rounded p-3 space-y-1 text-sm">
                  <div className="font-medium flex items-center gap-1"><Mic className="h-3 w-3" /> AI Analysis</div>
                  <div><b>Summary:</b> {call.ai_analysis.summary}</div>
                  <div className="flex gap-3 text-xs">
                    <span>Sentiment: <Badge variant="outline">{call.ai_analysis.sentiment}</Badge></span>
                    {call.ai_analysis.cancellation_requested && (
                      <span className="text-red-600 font-medium">⚠ Cancellation Requested</span>
                    )}
                  </div>
                  {call.ai_analysis.address_change && (
                    <div className="text-orange-600 text-xs"><b>Address Change:</b> {call.ai_analysis.address_change}</div>
                  )}
                  {call.ai_analysis.special_notes && (
                    <div className="text-xs"><b>Notes:</b> {call.ai_analysis.special_notes}</div>
                  )}
                  {(call.ai_analysis.confirmed_items ?? []).length > 0 && (
                    <div className="text-xs"><b>Confirmed Items:</b> {call.ai_analysis.confirmed_items.join(", ")}</div>
                  )}
                </div>
              )}

              {/* Transcript */}
              {call.transcript && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground font-medium">View Full Transcript</summary>
                  <pre className="mt-2 whitespace-pre-wrap bg-muted p-2 rounded max-h-48 overflow-y-auto text-xs">{call.transcript}</pre>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
