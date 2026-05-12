import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { MessageCircle, CheckCircle, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/replies")({
  component: RepliesPage,
});

const INTENT_LABELS: Record<string, string> = {
  cancel_order: "🚫 Cancel Order",
  change_address: "📍 Change Address",
  query_status: "❓ Status Query",
  complaint: "😤 Complaint",
  stop: "🔕 Opt-Out",
  confirmation: "✅ Confirmation",
  other: "💬 Other",
};

const INTENT_VARIANT: Record<string, any> = {
  cancel_order: "destructive",
  change_address: "secondary",
  query_status: "outline",
  complaint: "destructive",
  stop: "secondary",
  confirmation: "default",
  other: "outline",
};

function RepliesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("unhandled");
  const [search, setSearch] = useState("");
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  const load = async () => {
    let q = supabase
      .from("incoming_messages")
      .select("*, orders(shopify_order_number, customer_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (filter === "unhandled") q = q.eq("handled", false);
    else if (filter === "handled") q = q.eq("handled", true);
    if (search) q = q.or(`phone.ilike.%${search}%,body.ilike.%${search}%`);
    const { data } = await q;
    setRows(data ?? []);
  };

  useEffect(() => { load(); }, [filter, search]);

  const markHandled = async (id: string) => {
    await supabase.from("incoming_messages").update({ handled: true }).eq("id", id);
    toast.success("Marked as handled");
    load();
  };

  const sendReply = async (row: any) => {
    const text = replyTexts[row.id] ?? row.ai_reply ?? "";
    if (!text.trim()) return toast.error("Enter a reply message");
    const { error } = await supabase.from("message_jobs").insert({
      order_id: row.order_id ?? null,
      event: "manual",
      phone: row.phone.replace(/\D/g, ""),
      body: text,
      status: "queued",
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Reply queued!");
      await supabase.from("incoming_messages").update({ handled: true, auto_replied: true }).eq("id", row.id);
      load();
    }
  };

  const unhandledCount = rows.filter((r) => !r.handled).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-green-500" />
          Customer Replies
          {unhandledCount > 0 && (
            <Badge variant="destructive">{unhandledCount} unread</Badge>
          )}
        </h1>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["unhandled", "all", "handled"].map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "unhandled" ? "Unread" : f === "all" ? "All" : "Handled"}
          </Button>
        ))}
        <Input
          className="max-w-xs"
          placeholder="Search phone or message..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {rows.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            No customer replies yet. Once customers reply on WhatsApp, they'll appear here.
          </div>
        )}
        {rows.map((row) => (
          <div
            key={row.id}
            className={`rounded-md border p-4 space-y-3 ${!row.handled ? "border-orange-300 bg-orange-50/50" : "bg-muted/30"}`}
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{row.phone}</span>
                <Badge variant={INTENT_VARIANT[row.intent] ?? "outline"}>
                  {INTENT_LABELS[row.intent] ?? row.intent}
                </Badge>
                {!row.handled && <Badge variant="destructive" className="text-xs">Unread</Badge>}
                {row.auto_replied && <Badge className="bg-blue-500 text-xs">Auto-replied</Badge>}
                {row.orders?.shopify_order_number && (
                  <span className="text-xs text-muted-foreground">
                    Order #{row.orders.shopify_order_number} ({row.orders.customer_name})
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(row.created_at).toLocaleString()}
              </span>
            </div>

            {/* Customer message */}
            <div className="bg-white border rounded p-3 text-sm">
              <div className="text-xs text-muted-foreground mb-1">Customer said:</div>
              {row.body}
            </div>

            {/* Extracted entities */}
            {row.entities && Object.keys(row.entities).length > 0 && (
              <div className="text-xs bg-yellow-50 border border-yellow-200 rounded p-2">
                <b>Extracted info:</b> {JSON.stringify(row.entities)}
              </div>
            )}

            {/* AI suggested reply */}
            {row.ai_reply && !row.handled && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground font-medium">AI Suggested Reply:</div>
                <textarea
                  className="w-full border rounded p-2 text-sm resize-none"
                  rows={3}
                  defaultValue={row.ai_reply}
                  onChange={(e) => setReplyTexts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => sendReply(row)}>
                    Send Reply
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => markHandled(row.id)}>
                    <CheckCircle className="h-3 w-3 mr-1" /> Mark Handled (no reply)
                  </Button>
                </div>
              </div>
            )}

            {row.handled && (
              <div className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> Handled
                {row.auto_replied ? " (auto-replied)" : ""}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
