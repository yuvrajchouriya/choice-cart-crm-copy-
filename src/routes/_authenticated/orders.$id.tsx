import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MessageCircle, Phone, Package, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/orders/$id")({
  component: OrderDetail,
});

const STATUS_COLOR: Record<string, string> = {
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  queued: "bg-blue-100 text-blue-800",
  draft: "bg-yellow-100 text-yellow-800",
  sending: "bg-purple-100 text-purple-800",
  cancelled: "bg-gray-100 text-gray-800",
};

const INTENT_COLOR: Record<string, string> = {
  cancel_order: "destructive",
  change_address: "secondary",
  query_status: "outline",
  complaint: "destructive",
  stop: "secondary",
  confirmation: "default",
  other: "outline",
};

function OrderDetail() {
  const { id } = useParams({ from: "/_authenticated/orders/$id" });
  const [order, setOrder] = useState<any>(null);
  const [fulfillments, setFulfillments] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [replies, setReplies] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"messages" | "replies" | "calls" | "tracking">("messages");

  const load = async () => {
    const [
      { data: o },
      { data: f },
      { data: j },
      { data: r },
      { data: c },
    ] = await Promise.all([
      supabase.from("orders").select("*").eq("id", id).single(),
      supabase.from("fulfillments").select("*").eq("order_id", id),
      supabase.from("message_jobs").select("*").eq("order_id", id).order("created_at", { ascending: false }),
      supabase.from("incoming_messages").select("*").eq("order_id", id).order("created_at", { ascending: false }),
      supabase.from("call_jobs").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    ]);
    setOrder(o);
    setFulfillments(f ?? []);
    setJobs(j ?? []);
    setReplies(r ?? []);
    setCalls(c ?? []);
  };

  useEffect(() => { load(); }, [id]);

  if (!order) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const sendManual = async () => {
    if (!msg.trim() || !order.phone) return toast.error("Need message body and phone");
    const { error } = await supabase.from("message_jobs").insert({
      order_id: order.id,
      event: "manual",
      phone: order.phone.replace(/\D/g, ""),
      body: msg,
      status: "queued",
    });
    if (error) toast.error(error.message);
    else { toast.success("Queued"); setMsg(""); load(); }
  };

  const togglePause = async (v: boolean) => {
    await supabase.from("orders").update({ notifications_paused: v }).eq("id", order.id);
    setOrder({ ...order, notifications_paused: v });
  };

  const markReplyHandled = async (replyId: string) => {
    await supabase.from("incoming_messages").update({ handled: true }).eq("id", replyId);
    load();
  };

  const replyToCustomer = async (replyText: string, phone: string) => {
    await supabase.from("message_jobs").insert({
      order_id: order.id,
      event: "manual",
      phone: phone.replace(/\D/g, ""),
      body: replyText,
      status: "queued",
    });
    toast.success("Reply queued!");
  };

  const TABS = [
    { key: "messages", label: `Messages (${jobs.length})` },
    { key: "replies", label: `Customer Replies (${replies.filter(r => !r.handled).length} unread)` },
    { key: "calls", label: `AI Calls (${calls.length})` },
    { key: "tracking", label: `Tracking (${fulfillments.length})` },
  ];

  const lineItems = (order.line_items ?? []) as any[];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/orders" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold">Order {order.shopify_order_number}</h1>
        <Badge variant={order.fulfillment_status === "fulfilled" ? "default" : "secondary"}>
          {order.fulfillment_status ?? "unfulfilled"}
        </Badge>
        {order.notifications_paused && <Badge variant="destructive">Paused</Badge>}
      </div>

      {/* Order Info */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-md border p-4 space-y-1 text-sm">
          <div className="font-semibold mb-2 flex items-center gap-1"><Package className="h-4 w-4" /> Customer</div>
          <div><b>Name:</b> {order.customer_name ?? "—"}</div>
          <div><b>Phone:</b> {order.phone ?? "—"}</div>
          <div><b>Email:</b> {order.email ?? "—"}</div>
          <div><b>Total:</b> {order.currency} {order.total_price}</div>
          <div><b>Payment:</b> {order.payment_type ?? "—"}</div>
          <div className="flex items-center gap-2 pt-2">
            <Switch checked={order.notifications_paused} onCheckedChange={togglePause} />
            <span>Pause all notifications</span>
          </div>
        </div>

        <div className="rounded-md border p-4 space-y-1 text-sm">
          <div className="font-semibold mb-2">Shipping Address</div>
          {order.shipping_address ? (
            <>
              <div>{order.shipping_address.name}</div>
              <div>{order.shipping_address.address1}</div>
              <div>{order.shipping_address.address2}</div>
              <div>{order.shipping_address.city}, {order.shipping_address.province} {order.shipping_address.zip}</div>
              <div>{order.shipping_address.country}</div>
              <div>{order.shipping_address.phone}</div>
            </>
          ) : <div className="text-muted-foreground">No address</div>}
        </div>

        <div className="rounded-md border p-4 text-sm space-y-1">
          <div className="font-semibold mb-2">Items Ordered</div>
          {lineItems.length === 0 && <div className="text-muted-foreground">—</div>}
          {lineItems.map((li: any, i: number) => (
            <div key={i} className="flex justify-between">
              <span>{li.title} {li.variant_title ? `(${li.variant_title})` : ""}</span>
              <span className="text-muted-foreground">×{li.qty} @ ₹{li.price}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Manual WA Message */}
      <div className="rounded-md border p-4 space-y-2">
        <div className="font-semibold flex items-center gap-1"><MessageCircle className="h-4 w-4" /> Send Manual WhatsApp Message</div>
        <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} placeholder="Type your message..." />
        <Button onClick={sendManual}>Queue Message</Button>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b mb-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Messages Tab */}
        {tab === "messages" && (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-2">Event</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Message</th>
                  <th className="p-2">When</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-t">
                    <td className="p-2">{j.event}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[j.status] ?? ""}`}>{j.status}</span>
                    </td>
                    <td className="p-2 max-w-xs truncate">{j.body}</td>
                    <td className="p-2 text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {jobs.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No messages yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Customer Replies Tab */}
        {tab === "replies" && (
          <div className="space-y-3">
            {replies.length === 0 && <div className="text-muted-foreground text-sm">No customer replies yet.</div>}
            {replies.map((r) => (
              <div key={r.id} className={`rounded-md border p-4 space-y-2 text-sm ${!r.handled ? "border-orange-300 bg-orange-50" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={INTENT_COLOR[r.intent] as any ?? "outline"}>{r.intent}</Badge>
                    {!r.handled && <Badge variant="destructive">Unread</Badge>}
                    {r.auto_replied && <Badge className="bg-blue-500">Auto-replied</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <div className="bg-muted rounded p-2"><b>Customer:</b> {r.body}</div>
                {r.ai_reply && (
                  <div className="bg-green-50 border border-green-200 rounded p-2">
                    <b>AI Suggested Reply:</b> {r.ai_reply}
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" onClick={() => replyToCustomer(r.ai_reply, r.phone)}>Send This Reply</Button>
                      <Button size="sm" variant="outline" onClick={() => markReplyHandled(r.id)}>Mark Handled</Button>
                    </div>
                  </div>
                )}
                {r.entities && Object.keys(r.entities).length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Extracted: {JSON.stringify(r.entities)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* AI Calls Tab */}
        {tab === "calls" && (
          <div className="space-y-3">
            {calls.length === 0 && <div className="text-muted-foreground text-sm">No AI calls yet. Enable in Settings → AI Calling.</div>}
            {calls.map((c) => (
              <div key={c.id} className="rounded-md border p-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <Badge variant={c.status === "completed" ? "default" : c.status === "failed" ? "destructive" : "secondary"}>
                      {c.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {c.called_at ? new Date(c.called_at).toLocaleString() : new Date(c.created_at).toLocaleString()}
                  </span>
                </div>
                {c.ai_analysis && (
                  <div className="bg-muted rounded p-2 space-y-1">
                    <div><b>Summary:</b> {c.ai_analysis.summary}</div>
                    <div><b>Sentiment:</b> {c.ai_analysis.sentiment}</div>
                    {c.ai_analysis.address_change && <div className="text-orange-600"><b>Address Change Requested:</b> {c.ai_analysis.address_change}</div>}
                    {c.ai_analysis.cancellation_requested && <div className="text-red-600"><b>⚠ Cancellation Requested</b></div>}
                    {c.ai_analysis.special_notes && <div><b>Notes:</b> {c.ai_analysis.special_notes}</div>}
                  </div>
                )}
                {c.transcript && (
                  <details className="text-xs text-muted-foreground cursor-pointer">
                    <summary className="font-medium">View Transcript</summary>
                    <pre className="mt-2 whitespace-pre-wrap bg-muted p-2 rounded max-h-40 overflow-y-auto">{c.transcript}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tracking Tab */}
        {tab === "tracking" && (
          <div className="space-y-3">
            {fulfillments.length === 0 && <div className="text-muted-foreground text-sm">No fulfillments yet.</div>}
            {fulfillments.map((f) => (
              <div key={f.id} className="rounded-md border p-4 space-y-1 text-sm">
                <div><b>Carrier:</b> {f.tracking_company ?? "—"}</div>
                <div><b>Tracking #:</b> {f.tracking_number ?? "—"}</div>
                <div><b>Status:</b> <Badge variant="outline">{f.shipment_status ?? f.current_status ?? "—"}</Badge></div>
                <div><b>Last Notified:</b> {f.last_notified_status ?? "Not yet"}</div>
                {f.tracking_url && (
                  <a href={f.tracking_url} target="_blank" className="text-primary hover:underline text-xs">
                    Track Package →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
