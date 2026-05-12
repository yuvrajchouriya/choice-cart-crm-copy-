// Generic AI Calling Provider integration (VAPI + Custom Webhook)
// Server-only: do NOT import in client components

export interface CallResult {
  id: string;
  status: string;
}

export async function createOutboundCall(opts: {
  provider: "vapi" | "custom";
  assistantId?: string;
  endpoint?: string;
  token?: string;
  customerPhone: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  items: string[];
}): Promise<CallResult> {
  const firstMessage = buildCallFirstMessage({
    customerName: opts.customerName,
    orderNumber: opts.orderNumber,
    items: opts.items,
  });

  if (opts.provider === "custom") {
    if (!opts.endpoint) throw new Error("Custom calling endpoint is required");

    const payload = {
      action: "make_call",
      order_id: opts.orderId,
      order_number: opts.orderNumber,
      customer_name: opts.customerName,
      phone: opts.customerPhone,
      items: opts.items,
      first_message: firstMessage,
      webhook_url: `${process.env.APP_URL}/api/public/call-webhook`
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.token) {
      headers["Authorization"] = `Bearer ${opts.token}`;
    }

    const res = await fetch(opts.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Custom calling endpoint failed ${res.status}: ${err}`);
    }

    let callId = `custom_${Date.now()}`;
    try {
      const data = await res.json();
      if (data && data.call_id) callId = String(data.call_id);
      else if (data && data.id) callId = String(data.id);
    } catch (e) {
      // ignore parsing error, fallback to generated ID
    }

    return { id: callId, status: "pending" };

  } else {
    // VAPI.ai logic
    const vapiKey = process.env.VAPI_API_KEY;
    if (!vapiKey) throw new Error("VAPI_API_KEY not set in environment");
    if (!opts.assistantId) throw new Error("VAPI Assistant ID not set");

    const body = {
      type: "outboundPhoneCall",
      assistantId: opts.assistantId,
      customer: { number: opts.customerPhone },
      assistantOverrides: {
        firstMessage,
        variableValues: {
          customer_name: opts.customerName,
          order_number: opts.orderNumber,
          items: opts.items.join(", "),
        },
      },
    };

    const res = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${vapiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`VAPI call creation failed ${res.status}: ${err}`);
    }

    const data = await res.json();
    return { id: data.id, status: data.status ?? "pending" };
  }
}

// Build the first message for the AI to say when customer picks up
export function buildCallFirstMessage(opts: {
  customerName: string;
  orderNumber: string;
  items: string[];
}): string {
  const firstName = (opts.customerName || "Customer").split(" ")[0];
  const itemList = opts.items.slice(0, 3).join(", ");
  return (
    `Hello! Am I speaking with ${firstName}? ` +
    `I'm calling from ChoiceCart regarding your order number ${opts.orderNumber}. ` +
    `You've ordered ${itemList}. ` +
    `I just wanted to quickly confirm your order details and delivery address. ` +
    `Do you have a moment?`
  );
}

// Format phone to E.164 for providers (Indian numbers)
export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("+")) return phone;
  return `+${digits}`;
}
