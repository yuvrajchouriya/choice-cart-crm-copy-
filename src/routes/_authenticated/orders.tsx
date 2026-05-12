import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/orders")({ component: Orders });

function Orders() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    let qb = supabase.from("orders").select("id,shopify_order_number,customer_name,phone,total_price,currency,fulfillment_status,shopify_created_at").order("shopify_created_at", { ascending: false }).limit(100);
    if (q) qb = qb.or(`customer_name.ilike.%${q}%,phone.ilike.%${q}%,shopify_order_number.ilike.%${q}%`);
    qb.then(({ data }) => setRows(data ?? []));
  }, [q]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Orders</h1>
      <Input placeholder="Search by name, phone, order #" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left"><tr><th className="p-2">Order</th><th className="p-2">Customer</th><th className="p-2">Phone</th><th className="p-2">Total</th><th className="p-2">Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-accent/30">
                <td className="p-2"><Link to="/orders/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.shopify_order_number}</Link></td>
                <td className="p-2">{r.customer_name}</td>
                <td className="p-2">{r.phone}</td>
                <td className="p-2">{r.currency} {r.total_price}</td>
                <td className="p-2">{r.fulfillment_status ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No orders yet. Configure the Shopify webhook in Settings.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
