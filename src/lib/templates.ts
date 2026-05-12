export function renderTemplate(body: string, vars: Record<string, string | number | undefined | null>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  return digits;
}

export const EVENT_LABELS: Record<string, string> = {
  order_placed: "Order Placed",
  shipped: "Shipped",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  delayed: "Delayed",
  returned: "Returned",
  failure: "Delivery Failed",
};

// Map Shopify shipment_status -> our internal event
export function mapShopifyShipmentStatus(s: string | null | undefined): string | null {
  if (!s) return null;
  const k = s.toLowerCase();
  if (k === "label_purchased" || k === "label_printed" || k === "ready_for_pickup" || k === "confirmed") return "shipped";
  if (k === "in_transit" || k === "picked_up") return "in_transit";
  if (k === "out_for_delivery") return "out_for_delivery";
  if (k === "attempted_delivery") return "failure";
  if (k === "delivered") return "delivered";
  if (k === "failure") return "failure";
  return null;
}
