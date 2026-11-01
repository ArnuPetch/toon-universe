"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The webhook may land a few seconds after Stripe redirects back, so re-render
 * the page every few seconds (up to ~1 minute) until the purchase settles.
 */
export function RefreshWhilePending({ intervalMs = 3000, maxTries = 20 }) {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      if (tries > maxTries) clearInterval(id);
      else router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, maxTries]);
  return null;
}
