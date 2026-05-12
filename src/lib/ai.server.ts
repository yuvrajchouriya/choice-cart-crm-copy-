// AI helper lib — OpenAI integration for reply analysis + call transcript
// Server-only: do NOT import in client components

export type ReplyIntent =
  | "cancel_order"
  | "change_address"
  | "query_status"
  | "complaint"
  | "stop"
  | "confirmation"
  | "other";

export interface ReplyAnalysis {
  intent: ReplyIntent;
  entities: Record<string, string>;
  ai_reply: string;
  confidence: number;
}

export interface TranscriptAnalysis {
  confirmed_items: string[];
  address_change: string | null;
  special_notes: string;
  cancellation_requested: boolean;
  sentiment: "positive" | "neutral" | "negative";
  summary: string;
}

function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set in environment");
  return key;
}

function getModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
}

async function chatComplete(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIKey()}`,
    },
    body: JSON.stringify({
      model: getModel(),
      messages,
      temperature: 0.3,
      max_tokens: 500,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }
  const data = (await res.json()) as any;
  return data.choices?.[0]?.message?.content ?? "";
}

// ─── Analyze Customer WhatsApp Reply ─────────────────────────────────────────
export async function analyzeCustomerReply(opts: {
  phone: string;
  body: string;
  orderContext?: { order_number: string; customer_name: string; status: string } | null;
  optOutKeyword: string;
}): Promise<ReplyAnalysis> {
  const { phone, body, orderContext, optOutKeyword } = opts;

  // Fast path: opt-out keyword
  if (body.trim().toUpperCase() === optOutKeyword.toUpperCase()) {
    return {
      intent: "stop",
      entities: {},
      ai_reply: `You have been unsubscribed. You will no longer receive WhatsApp updates from us. Reply START to re-subscribe.`,
      confidence: 1.0,
    };
  }

  const systemPrompt = `You are a customer service AI for ChoiceCart, an Indian e-commerce store.
Analyze the customer's WhatsApp reply and return a JSON object with:
- intent: one of [cancel_order, change_address, query_status, complaint, stop, confirmation, other]
- entities: extracted key info as key-value pairs (e.g. new_address, item_name)
- ai_reply: a short, friendly reply in the same language as the customer (Hindi/English/Hinglish)
- confidence: 0.0 to 1.0

Customer phone: ${phone}
${orderContext ? `Recent order: #${orderContext.order_number}, Status: ${orderContext.status}, Customer: ${orderContext.customer_name}` : "No recent order context."}

Return ONLY valid JSON. No markdown.`;

  const raw = await chatComplete([
    { role: "system", content: systemPrompt },
    { role: "user", content: body },
  ]);

  try {
    const parsed = JSON.parse(raw.trim());
    return {
      intent: parsed.intent ?? "other",
      entities: parsed.entities ?? {},
      ai_reply: parsed.ai_reply ?? "",
      confidence: parsed.confidence ?? 0.5,
    };
  } catch {
    return {
      intent: "other",
      entities: {},
      ai_reply: "Thank you for your message! Our team will get back to you shortly.",
      confidence: 0.2,
    };
  }
}

// ─── Analyze VAPI Call Transcript ────────────────────────────────────────────
export async function analyzeCallTranscript(opts: {
  transcript: string;
  orderContext: { order_number: string; customer_name: string; items: string[] };
}): Promise<TranscriptAnalysis> {
  const { transcript, orderContext } = opts;

  const systemPrompt = `You are an AI analyzing a customer service call transcript for ChoiceCart e-commerce.
Order: #${orderContext.order_number} | Customer: ${orderContext.customer_name}
Items: ${orderContext.items.join(", ")}

Extract from the transcript and return ONLY valid JSON with:
- confirmed_items: array of items customer confirmed they ordered
- address_change: new delivery address if requested, null otherwise  
- special_notes: any special instructions or notes from customer
- cancellation_requested: boolean
- sentiment: "positive" | "neutral" | "negative"
- summary: 1-2 sentence summary of the call

Return ONLY valid JSON. No markdown.`;

  const raw = await chatComplete([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Call transcript:\n${transcript}` },
  ]);

  try {
    const parsed = JSON.parse(raw.trim());
    return {
      confirmed_items: parsed.confirmed_items ?? [],
      address_change: parsed.address_change ?? null,
      special_notes: parsed.special_notes ?? "",
      cancellation_requested: parsed.cancellation_requested ?? false,
      sentiment: parsed.sentiment ?? "neutral",
      summary: parsed.summary ?? "",
    };
  } catch {
    return {
      confirmed_items: [],
      address_change: null,
      special_notes: "",
      cancellation_requested: false,
      sentiment: "neutral",
      summary: "Call transcript could not be analyzed.",
    };
  }
}
