import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "./auth";
import { CATALOG_TAG } from "./catalog-cache";

// Data for the coin top-up page (src/app/coins/page.tsx).
//
// Packs are the same for everyone → cached. Wallet / history / purchase status
// are personal → read live as the user (RLS: owner select only).

type Enums = Database["public"]["Enums"];

export type CoinPack = {
  id: number;
  coins: number;
  priceSatang: number;
  /** Baht per coin, e.g. 1.21. */
  perCoin: number;
  /** Saving vs. the most expensive pack per coin; null for that pack itself. */
  saving: { percent: number; baht: number } | null;
};

export type Wallet = {
  purchased: number;
  /** Welcome coins still usable (0 once expired). */
  welcome: number;
  welcomeExpiresAt: string | null;
};

export type LedgerEntry = {
  id: number;
  kind: Enums["coin_kind"];
  delta: number;
  reason: Enums["coin_ledger_reason"];
  createdAt: string;
};

export type PurchaseStatus = {
  id: number;
  coins: number;
  status: Enums["payment_status"];
};

export async function getCoinPacks(): Promise<CoinPack[]> {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife("hours");

  const { data, error } = await createPublicClient()
    .from("coin_packs")
    .select("id, coins, price_satang")
    .eq("is_active", true)
    .order("sort_order");
  if (error) {
    console.error("[coins:getCoinPacks]", error);
    return [];
  }

  const perCoin = (p: { coins: number; price_satang: number }) => p.price_satang / 100 / p.coins;
  const base = Math.max(...data.map(perCoin));
  return data.map((p) => {
    const rate = perCoin(p);
    const baht = Math.round(base * p.coins - p.price_satang / 100);
    return {
      id: p.id,
      coins: p.coins,
      priceSatang: p.price_satang,
      perCoin: rate,
      saving: rate < base ? { percent: Math.round((1 - rate / base) * 1000) / 10, baht } : null,
    };
  });
}

/** null when signed out. */
export async function getWallet(): Promise<Wallet | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const { data } = await (await createClient())
    .from("coin_wallets")
    .select("purchased_balance, welcome_balance, welcome_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  const welcomeValid =
    data?.welcome_expires_at == null || Date.parse(data.welcome_expires_at) > Date.now();
  return {
    purchased: data?.purchased_balance ?? 0,
    welcome: welcomeValid ? (data?.welcome_balance ?? 0) : 0,
    welcomeExpiresAt: welcomeValid && data?.welcome_balance ? data.welcome_expires_at : null,
  };
}

/** Latest coin movements of the signed-in user. */
export async function getCoinHistory(limit = 20): Promise<LedgerEntry[]> {
  const userId = await getUserId();
  if (!userId) return [];
  const { data, error } = await (await createClient())
    .from("coin_ledger")
    .select("id, kind, delta, reason, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[coins:getCoinHistory]", error);
    return [];
  }
  return data.map((r) => ({
    id: r.id,
    kind: r.kind,
    delta: r.delta,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

/**
 * Status of the purchase behind a Checkout Session (the success page only
 * *shows* it — coins are credited by the webhook). RLS limits it to the owner.
 */
export async function getPurchaseBySession(sessionId: string): Promise<PurchaseStatus | null> {
  if (!/^cs_[A-Za-z0-9_]{1,255}$/.test(sessionId)) return null;
  const userId = await getUserId();
  if (!userId) return null;
  const { data } = await (await createClient())
    .from("coin_purchases")
    .select("id, coins, status")
    .eq("user_id", userId)
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  return data;
}
