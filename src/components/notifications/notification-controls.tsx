"use client";

import Link from "next/link";
import { useTransition, type ReactNode } from "react";
import { markNotificationsRead } from "@/app/actions/notifications";

/** Link that also marks its notification read (fire-and-forget). */
export function NotificationLink({
  id,
  href,
  unread,
  className,
  children,
}: {
  id: number;
  href: string;
  unread: boolean;
  className: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        if (unread) void markNotificationsRead([id]);
      }}
    >
      {children}
    </Link>
  );
}

/** Mark a notification without a link as read. */
export function MarkReadButton({ id, className, children }: { id: number; className: string; children: ReactNode }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() => startTransition(async () => void (await markNotificationsRead([id])))}
    >
      {children}
    </button>
  );
}

export function MarkAllReadButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => void (await markNotificationsRead()))}
      className="flex h-9 shrink-0 items-center rounded-full bg-surface px-4 text-sm leading-[1.4] text-text-2 transition-colors hover:text-text disabled:opacity-60"
    >
      {pending ? "กำลังบันทึก…" : "อ่านแล้วทั้งหมด"}
    </button>
  );
}
