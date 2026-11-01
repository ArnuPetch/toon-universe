import type { Metadata } from "next";
import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { timeAgo } from "@/components/format";
import { BellIcon } from "@/components/icons";
import {
  MarkAllReadButton,
  MarkReadButton,
  NotificationLink,
} from "@/components/notifications/notification-controls";
import { EmptyState, PageMain, SignInPrompt } from "@/components/page";
import { SectionSkeleton } from "@/components/section";
import { TopBar } from "@/components/top-bar";
import { getNotifications, NOTIFICATION_LIMIT, type NotificationItem } from "@/lib/server/library";

// In-web notifications (new episodes of followed series, refunds, …).
// Opening one marks it read; "อ่านแล้วทั้งหมด" clears the top bar badge.

export const metadata: Metadata = {
  title: "การแจ้งเตือน — Toon Universe",
  robots: { index: false },
};

export default function NotificationsPage() {
  return (
    <>
      <TopBar />
      <PageMain narrow>
        <Suspense
          fallback={
            <>
              <SectionSkeleton className="h-10 w-48" />
              <SectionSkeleton className="h-[480px] rounded-[20px]" />
            </>
          }
        >
          <Notifications />
        </Suspense>
      </PageMain>
      <BottomTabBar active="" />
    </>
  );
}

function Header({ unread }: { unread: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-[22px] font-bold leading-[1.4] lg:text-[28px]">
        การแจ้งเตือน
        {unread > 0 && <span className="ml-2 text-sm font-normal text-muted">ยังไม่อ่าน {unread}</span>}
      </h1>
      {unread > 0 && <MarkAllReadButton />}
    </div>
  );
}

async function Notifications() {
  const result = await getNotifications();
  if (!result) {
    return (
      <>
        <Header unread={0} />
        <SignInPrompt next="/notifications" text="ติดตามเรื่องที่ชอบ แล้วรับแจ้งเตือนทันทีเมื่อมีตอนใหม่" />
      </>
    );
  }
  const { items, now } = result;
  const unread = items.filter((n) => !n.read).length;
  return (
    <>
      <Header unread={unread} />
      {items.length === 0 ? (
        <EmptyState
          title="ยังไม่มีการแจ้งเตือน"
          text="กด “ติดตาม” ในหน้าเรื่อง แล้วเราจะแจ้งเตือนเมื่อมีตอนใหม่"
          action={{ href: "/", label: "หาเรื่องอ่าน" }}
        />
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-[20px] bg-surface">
            {items.map((n) => (
              <li key={n.id}>
                <Item n={n} now={now} />
              </li>
            ))}
          </ul>
          {items.length >= NOTIFICATION_LIMIT && (
            <p className="text-center text-[13px] leading-[1.4] text-muted">แสดง {NOTIFICATION_LIMIT} รายการล่าสุด</p>
          )}
        </>
      )}
    </>
  );
}

function Item({ n, now }: { n: NotificationItem; now: number }) {
  const className = `flex w-full items-start gap-3.5 px-4 py-4 text-left transition-colors hover:bg-surface-2 lg:px-6 ${
    n.read ? "" : "bg-primary/8"
  }`;
  const content = (
    <>
      <span
        className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${
          n.read ? "bg-white/8 text-muted" : "bg-primary/20 text-primary"
        }`}
      >
        <BellIcon size={18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[1.4]">
        <span className={`truncate text-[15px] ${n.read ? "text-text-2" : "font-semibold"}`}>{n.title}</span>
        {n.body && <span className="text-sm text-muted">{n.body}</span>}
        <span className="text-xs text-faint">{timeAgo(n.createdAt, now)}</span>
      </span>
      {!n.read && (
        <span className="mt-2 size-2 shrink-0 rounded-full bg-hot">
          <span className="sr-only">ยังไม่อ่าน</span>
        </span>
      )}
    </>
  );
  if (n.href) {
    return (
      <NotificationLink id={n.id} href={n.href} unread={!n.read} className={className}>
        {content}
      </NotificationLink>
    );
  }
  if (!n.read) {
    return (
      <MarkReadButton id={n.id} className={className}>
        {content}
      </MarkReadButton>
    );
  }
  return <div className={className}>{content}</div>;
}
