"use server";

import { redirect } from "next/navigation";
import { getUserId } from "@/lib/server/auth";
import { startCoinCheckout } from "@/lib/server/coin-checkout";
import { type ActionResult, fail } from "@/lib/server/errors";

/**
 * Start buying a coin pack. Returns the Stripe Checkout URL for the browser to
 * open. Coins are credited later by the webhook, never here.
 */
export async function buyCoinPackAction(packId: number): Promise<ActionResult<{ checkoutUrl: string }>> {
  if (!(await getUserId())) redirect("/login?next=/coins");
  if (typeof packId !== "number" || !Number.isSafeInteger(packId) || packId <= 0) {
    return fail("coin_pack_not_found");
  }
  const result = await startCoinCheckout(packId);
  if (!result.ok) return result;
  return { ok: true, data: { checkoutUrl: result.data.checkoutUrl } };
}
