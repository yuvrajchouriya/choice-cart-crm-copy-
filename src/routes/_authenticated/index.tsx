import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, TrendingUp, MessageCircle, Phone, Bot, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function StatCard({
  label,
  value,
  sub,
  color = "text-foreground",
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: any;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-1 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${color}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const [stats, setStats] = useState({
    orders: 0,
    active: 0,
    sentToday: 0,
    failed: 0,
    draft: 0,
    bridge: "offline" as string,
    incomingUnhandled: 0,
    callsPending: 0,
    callsCompleted: 0,
    lastAgentRun: null as string | null,
    agentAutopilot: false,
  });

  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        { count: orders },
        { count: active },
        { count: sentToday },
        { count: failed },
        { count: draft },
        { count: incomingUnhandled },
        { count: callsPending },
        { count: callsCompleted },
        { data: br },
        { data: settings },
        { data: recentRaw },
      ] = await Promise.all([
        supabase.from("orders").select("*", { count: "exact", head: true }),
        supabase.from("fulfillments").select("*", { count: "exact", head: true }).neq("shipment_status", "delivered"),
        supabase.from("message_jobs").select("*", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", today.toISOString()),
        supabase.from("message_jobs").select("*", { count: "exact", head: true }).eq("status", "failed"),
        supabase.from("message_jobs").select("*", { count: "exact", head: true }).eq("status", "draft"),
        supabase.from("incoming_messages").select("*", { count: "exact", head: true }).eq("handled", false),
        supabase.from("call_jobs").select("*", { count: "exact", head: true }).in("status", ["pending", "calling"]),
        supabase.from("call_jobs").select("*", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("bridge_sessions").select("status,last_seen_at").eq("session_name", "default").single(),
        supabase.from("app_settings").select("last_agent_run_at,agent_autopilot").eq("id", 1).single(),
        supabase.from("orders").select("id,shopify_order_number,customer_name,fulfillment_status,total_price,currency,shopify_created_at").order("shopify_created_at", { ascending: false }).limit(5),
      ]);

      const online =
        br?.last_seen_at &&
        Date.now() - new Date(br.last_seen_at).getTime() < 90_000;

      setStats({
        orders: orders ?? 0,
        active: active ?? 0,
        sentToday: sentToday ?? 0,
        failed: failed ?? 0,
        draft: draft ?? 0,
        bridge: online ? (br?.status ?? "online") : "offline",
        incomingUnhandled: incomingUnhandled ?? 0,
        callsPending: callsPending ?? 0,
        callsCompleted: callsCompleted ?? 0,
        lastAgentRun: settings?.last_agent_run_at ?? null,
        agentAutopilot: settings?.agent_autopilot ?? false,
      });

      setRecentOrders(recentRaw ?? []);
    })();
  }, []);

  const bridgeColor =
    stats.bridge === "online"
      ? "text-green-600"
      : stats.bridge === "qr"
      ? "text-yellow-600"
      : "text-red-600";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6" /> Dashboard
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${stats.bridge === "online" ? "bg-green-500 animate-pulse" : stats.bridge === "qr" ? "bg-yellow-500" : "bg-red-500"}`} />
          <span className={bridgeColor}>WhatsApp {stats.bridge}</span>
          {stats.agentAutopilot && (
            <Badge className="bg-purple-600 text-white gap-1 ml-2">
              <Bot className="h-3 w-3" /> AI Agent Active
            </Badge>
          )}
        </div>
      </div>

      {/* Main stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard label="Total Orders" value={stats.orders} icon={TrendingUp} />
        <StatCard label="Active Shipments" value={stats.active} sub="Not yet delivered" icon={Zap} />
        <StatCard label="Messages Sent Today" value={stats.sentToday} color="text-green-600" icon={MessageCircle} />
        <StatCard label="Failed Messages" value={stats.failed} color={stats.failed > 0 ? "text-red-600" : "text-foreground"} />
        <StatCard label="Draft (Awaiting Approval)" value={stats.draft} color={stats.draft > 0 ? "text-yellow-600" : "text-foreground"} />
        <StatCard label="Unread Customer Replies" value={stats.incomingUnhandled} color={stats.incomingUnhandled > 0 ? "text-orange-600" : "text-foreground"} icon={MessageCircle} />
        <StatCard label="AI Calls Active" value={stats.callsPending} icon={Phone} />
        <StatCard label="Calls Completed" value={stats.callsCompleted} color="text-blue-600" icon={Phone} />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link to="/orders"><Button variant="outline" size="sm">View Orders</Button></Link>
        <Link to="/jobs"><Button variant="outline" size="sm">Message Queue {stats.draft > 0 && <Badge variant="secondary" className="ml-1">{stats.draft} drafts</Badge>}</Button></Link>
        <Link to="/replies"><Button variant="outline" size="sm">Customer Replies {stats.incomingUnhandled > 0 && <Badge variant="destructive" className="ml-1">{stats.incomingUnhandled}</Badge>}</Button></Link>
        <Link to="/calls"><Button variant="outline" size="sm">AI Calls {stats.callsPending > 0 && <Badge variant="secondary" className="ml-1">{stats.callsPending}</Badge>}</Button></Link>
        <Link to="/agent"><Button variant="outline" size="sm"><Bot className="h-3 w-3 mr-1" /> AI Agent</Button></Link>
        <Link to="/bridge"><Button variant="outline" size="sm">WA Bridge</Button></Link>
      </div>

      {/* Recent orders */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recent Orders</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-3">Order #</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Total</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id} className="border-t hover:bg-accent/30">
                  <td className="p-3">
                    <Link to="/orders/$id" params={{ id: o.id }} className="text-primary hover:underline font-medium">
                      {o.shopify_order_number}
                    </Link>
                  </td>
                  <td className="p-3">{o.customer_name ?? "—"}</td>
                  <td className="p-3">{o.currency} {o.total_price}</td>
                  <td className="p-3">
                    <Badge variant={o.fulfillment_status === "fulfilled" ? "default" : "secondary"}>
                      {o.fulfillment_status ?? "unfulfilled"}
                    </Badge>
                  </td>
                </tr>
              ))}
              {recentOrders.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No orders yet. Configure Shopify webhook in Settings.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {stats.lastAgentRun && (
        <p className="text-xs text-muted-foreground">
          Last AI Agent run: {new Date(stats.lastAgentRun).toLocaleString()}
        </p>
      )}
    </div>
  );
}
