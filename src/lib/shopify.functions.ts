import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  registerAllShopifyWebhooks,
  listShopifyWebhooks,
  iterateShopifyOrders,
  upsertOrderFromShopify,
  getCallbackUrl,
} from "./shopify.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("Forbidden: admin role required");
}

export const registerShopifyWebhooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const callback = getCallbackUrl();
    const { registered, removed } = await registerAllShopifyWebhooks(callback);
    const ids = registered.map((w) => w.id);
    await supabaseAdmin
      .from("app_settings")
      .update({ shopify_webhook_ids: ids })
      .eq("id", 1);
    return { registered: registered.length, removed: removed.length, ids, callback };
  });

export const listWebhooksFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const callback = getCallbackUrl();
    const all = await listShopifyWebhooks();
    return { callback, webhooks: all.map((w) => ({ id: w.id, topic: w.topic, address: w.address })) };
  });

export const backfillShopifyOrders = createServerFn({ method: "POST" })
  .inputValidator((input: { sinceDays?: number }) =>
    z.object({ sinceDays: z.number().int().min(1).max(3650).optional() }).parse(input)
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    await supabaseAdmin.from("app_settings").update({ backfill_status: "running" }).eq("id", 1);

    const since = data.sinceDays
      ? new Date(Date.now() - data.sinceDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    let count = 0;
    let errors = 0;
    try {
      for await (const batch of iterateShopifyOrders({ createdAtMin: since, pageSize: 250 })) {
        for (const o of batch) {
          try {
            await upsertOrderFromShopify(o);
            count++;
          } catch (e) {
            errors++;
            console.error("backfill upsert error", e);
          }
        }
      }
      await supabaseAdmin
        .from("app_settings")
        .update({
          backfill_status: "idle",
          last_backfill_at: new Date().toISOString(),
          last_backfill_count: count,
        })
        .eq("id", 1);
    } catch (e) {
      await supabaseAdmin
        .from("app_settings")
        .update({ backfill_status: "error" })
        .eq("id", 1);
      throw e;
    }

    return { imported: count, errors };
  });
