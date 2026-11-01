/**
 * Sanitises a post-login redirect target (`?next=`). Only same-site paths are
 * allowed — "//evil.com", "/\evil.com" and absolute URLs fall back to "/" so
 * the login page can't be used as an open redirect.
 */
export function safeNext(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value.startsWith("/login") || value.startsWith("/auth/")) return "/";
  return value;
}
