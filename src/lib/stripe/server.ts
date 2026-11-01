import "server-only";
import Stripe from "stripe";

// Server-only Stripe client.
//
// - STRIPE_SECRET_KEY: prefer a restricted key (rk_…) with only
//   Checkout Sessions: write. Never prefix with NEXT_PUBLIC_.
// - The fetch HTTP client + SubtleCrypto (see webhook route) work on both
//   Node (Vercel) and Cloudflare Workers, so nothing changes when we move.
let client: Stripe | undefined;

export function getStripe(): Stripe {
  if (!client) {
    client = new Stripe(requiredEnv("STRIPE_SECRET_KEY"), {
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 2,
      appInfo: { name: "toon-universe" },
    });
  }
  return client;
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
