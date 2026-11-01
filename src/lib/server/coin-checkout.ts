import "server-only";
import { getStripe, requiredEnv } from "@/lib/stripe/server";
import { getClaims, requireUserId } from "./auth";
import { type ActionResult, fail } from "./errors";
import { callRpc, guarded } from "./rpc";

// Coin pack checkout via Stripe Checkout (PromptPay).
//
// The wallet is credited ONLY by the webhook (src/app/api/stripe/webhook),
// never by the success page — the buyer may close the tab after paying.

type CreatePurchaseResult = { purchase_id: number; coins: number; amount_satang: number };

export type CoinCheckoutResult = { purchaseId: number; checkoutUrl: string };

// Tags these sessions in the Dashboard (integration_identifier needs an
// 8-letter random suffix; fixed so all coin-pack sessions group together).
const INTEGRATION_ID = "toon-coin-pack-qhxbtmrd";

// Shortest expiry Stripe allows. Expired sessions → purchase 'canceled'.
const CHECKOUT_TTL_SECONDS = 30 * 60;

/** Start buying a coin pack. Redirect the browser to `checkoutUrl`. */
export function startCoinCheckout(packId: number): Promise<ActionResult<CoinCheckoutResult>> {
  return guarded(async () => {
    const userId = await requireUserId();

    const purchase = await callRpc<CreatePurchaseResult>("create_coin_purchase", {
      p_user_id: userId,
      p_pack_id: packId,
    });
    if (!purchase.ok) return purchase;
    const { purchase_id: purchaseId, coins, amount_satang: amountSatang } = purchase.data;

    const appUrl = requiredEnv("APP_URL").replace(/\/+$/, "");
    const email = (await getClaims())?.email;
    const paymentMethodConfiguration = process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION;

    let session;
    try {
      session = await getStripe().checkout.sessions.create(
        {
          mode: "payment",
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "thb",
                unit_amount: amountSatang,
                product_data: { name: `${coins} coin` },
              },
            },
          ],
          // Payment methods come from the Dashboard (PromptPay only). Do not
          // pass payment_method_types; pin a configuration instead if needed.
          ...(paymentMethodConfiguration && {
            payment_method_configuration: paymentMethodConfiguration,
          }),
          client_reference_id: String(purchaseId),
          metadata: { purchase_id: String(purchaseId), user_id: userId },
          payment_intent_data: { metadata: { purchase_id: String(purchaseId) } },
          ...(typeof email === "string" && { customer_email: email }),
          locale: "th",
          expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS,
          success_url: `${appUrl}/coins?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/coins?checkout=canceled`,
          integration_identifier: INTEGRATION_ID,
        },
        // One Checkout Session per purchase row, even if this call is retried.
        { idempotencyKey: `coin-purchase-${purchaseId}` },
      );
    } catch (e) {
      console.error(`[stripe:checkout] purchase=${purchaseId}`, e);
      return fail("payment_unavailable");
    }

    if (!session.url) {
      console.error(`[stripe:checkout] purchase=${purchaseId} session=${session.id} has no url`);
      return fail("payment_unavailable");
    }

    // Best effort: the webhook finds the purchase via client_reference_id even
    // if this fails, and records the session id itself.
    const attached = await callRpc<null>("attach_checkout_session", {
      p_purchase_id: purchaseId,
      p_user_id: userId,
      p_session_id: session.id,
    });
    if (!attached.ok) {
      console.error(`[stripe:checkout] attach failed purchase=${purchaseId}`, attached);
    }

    return { ok: true, data: { purchaseId, checkoutUrl: session.url } };
  });
}
