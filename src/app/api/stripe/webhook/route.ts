import Stripe from "stripe";
import { callRpc } from "@/lib/server/rpc";
import { getStripe, requiredEnv } from "@/lib/stripe/server";

// Stripe webhook → credit coins for paid coin-pack Checkout Sessions.
//
// Subscribe the endpoint to:
//   checkout.session.completed
//   checkout.session.async_payment_succeeded
//   checkout.session.async_payment_failed
//   checkout.session.expired
//
// Response codes: 2xx = handled or permanently ignored (Stripe stops retrying);
// 5xx = transient failure (Stripe retries with backoff). Every RPC here is
// idempotent, so retries and duplicate deliveries are safe.

const cryptoProvider = Stripe.createSubtleCryptoProvider();

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  // Signature is computed over the raw body: read it as text, never parse first.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      payload,
      signature,
      requiredEnv("STRIPE_WEBHOOK_SECRET"),
      undefined,
      cryptoProvider,
    );
  } catch (e) {
    console.warn("[stripe:webhook] invalid signature", e);
    return new Response("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return handlePaid(event.data.object);
    case "checkout.session.async_payment_failed":
      return handleFailed(event.data.object, "failed");
    case "checkout.session.expired":
      return handleFailed(event.data.object, "canceled");
    default:
      return ok();
  }
}

async function handlePaid(session: Stripe.Checkout.Session): Promise<Response> {
  const purchaseId = purchaseIdOf(session);
  if (purchaseId === null) return ok();

  // With delayed payment methods `completed` arrives unpaid; the matching
  // async_payment_succeeded / _failed event follows.
  if (session.payment_status !== "paid") return ok();

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId || session.amount_total == null || !session.currency) {
    console.error(`[stripe:webhook] paid session ${session.id} missing payment fields`);
    return ok();
  }

  const result = await callRpc<unknown>("complete_coin_purchase", {
    p_purchase_id: purchaseId,
    p_session_id: session.id,
    p_payment_intent_id: paymentIntentId,
    p_amount_satang: session.amount_total,
    p_currency: session.currency,
  });
  return respond(result, `complete purchase=${purchaseId} session=${session.id}`);
}

async function handleFailed(
  session: Stripe.Checkout.Session,
  status: "failed" | "canceled",
): Promise<Response> {
  const purchaseId = purchaseIdOf(session);
  if (purchaseId === null) return ok();

  const result = await callRpc<unknown>("fail_coin_purchase", {
    p_purchase_id: purchaseId,
    p_session_id: session.id,
    p_status: status,
  });
  return respond(result, `${status} purchase=${purchaseId} session=${session.id}`);
}

/** Our sessions carry the coin_purchases id; anything else isn't ours. */
function purchaseIdOf(session: Stripe.Checkout.Session): number | null {
  const ref = session.client_reference_id;
  if (session.mode !== "payment" || !ref || !/^\d+$/.test(ref)) return null;
  return Number(ref);
}

function respond(
  result: Awaited<ReturnType<typeof callRpc<unknown>>>,
  context: string,
): Response {
  if (result.ok) return ok();
  if (result.code === "unexpected_error") {
    // DB/network trouble — let Stripe retry.
    return new Response("Temporary failure", { status: 500 });
  }
  // Business-rule rejection (amount/session mismatch, unknown purchase…):
  // retrying won't help. Needs a human look.
  console.error(`[stripe:webhook] rejected ${context}: ${result.code}`, result.detail);
  return ok();
}

function ok(): Response {
  return new Response(null, { status: 200 });
}
