import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { signOut } from "@/app/actions/auth";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { coverInitial } from "@/components/cover";
import { formatDate } from "@/components/format";
import { BellIcon, CheckIcon, ChevronRightIcon, CoinIcon, PenIcon, ShelfIcon, ShieldIcon } from "@/components/icons";
import { PageMain, PageTitle, SignInPrompt } from "@/components/page";
import { BirthDateForm, PasswordForm, ProfileForm } from "@/components/profile/profile-forms";
import { Section, SectionSkeleton } from "@/components/section";
import { TopBar } from "@/components/top-bar";
import { getClaims } from "@/lib/server/auth";
import { getWallet } from "@/lib/server/coins";
import { getProfile } from "@/lib/server/library";

// Profile: who you are, coin balance, profile fields, birth date (age rating),
// password, policies and sign out. Personal, never cached.

export const metadata: Metadata = {
  title: "โปรไฟล์ — Toon Universe",
  robots: { index: false },
};

export default function ProfilePage() {
  return (
    <>
      <TopBar />
      <PageMain narrow>
        <PageTitle>โปรไฟล์</PageTitle>
        <Suspense
          fallback={
            <>
              <SectionSkeleton className="h-[136px] rounded-[20px]" />
              <SectionSkeleton className="h-[88px] rounded-[20px]" />
              <SectionSkeleton className="h-[360px] rounded-[20px]" />
            </>
          }
        >
          <ProfileContent />
        </Suspense>
      </PageMain>
      <BottomTabBar active="/profile" />
    </>
  );
}

const card = "rounded-[20px] bg-surface p-5 lg:p-6";

async function ProfileContent() {
  const [profile, wallet, claims] = await Promise.all([getProfile(), getWallet(), getClaims()]);
  if (!profile) {
    return <SignInPrompt next="/profile" text="จัดการโปรไฟล์ ดู coin และชั้นหนังสือของคุณ" />;
  }
  const name = profile.displayName || profile.username || profile.email?.split("@")[0] || "ผู้อ่าน";
  const coins = wallet ? wallet.purchased + wallet.welcome : 0;

  return (
    <>
      {profile.status !== "active" && (
        <p role="status" className="rounded-xl bg-hot/10 px-4 py-3 text-sm leading-[1.4] text-hot">
          {profile.status === "suspended"
            ? "บัญชีนี้ถูกระงับชั่วคราว บางการใช้งาน เช่น ปลดล็อกตอน จะใช้ไม่ได้จนกว่าจะครบกำหนด"
            : "บัญชีนี้ถูกแบน"}
        </p>
      )}

      <section aria-label="ข้อมูลบัญชี" className={`${card} flex items-center gap-4 lg:gap-5`}>
        <span
          aria-hidden="true"
          className="grid size-16 shrink-0 place-items-center rounded-full bg-linear-to-br from-primary to-[#c04cfd] text-2xl font-bold text-white lg:size-20 lg:text-[32px]"
        >
          {coverInitial(name).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5 leading-[1.4]">
          <p className="flex items-center gap-1.5 text-lg font-bold lg:text-[22px]">
            <span className="truncate">{name}</span>
            {profile.verified && (
              <span title="ยืนยันตัวตนแล้ว" className="grid size-[18px] shrink-0 place-items-center rounded-full bg-primary text-white">
                <CheckIcon size={12} strokeWidth={3} />
                <span className="sr-only">ยืนยันตัวตนแล้ว</span>
              </span>
            )}
          </p>
          {profile.username && <p className="truncate text-sm text-text-2">@{profile.username}</p>}
          <p className="truncate text-[13px] text-muted">
            {profile.email && <>{profile.email} · </>}สมาชิกตั้งแต่ {formatDate(profile.joinedAt)}
          </p>
        </div>
      </section>

      <nav aria-label="ทางลัด" className="grid gap-3 sm:grid-cols-2">
        <QuickLink href="/coins" icon={<CoinIcon className="size-5" />} label="coin ของฉัน" value={coins.toLocaleString("th-TH")} />
        <QuickLink href="/bookshelf" icon={<ShelfIcon size={20} className="text-primary" />} label="ชั้นหนังสือ" />
        <QuickLink href="/notifications" icon={<BellIcon size={20} className="text-primary" />} label="การแจ้งเตือน" />
        <QuickLink href="/studio" icon={<PenIcon size={20} className="text-primary" />} label="สตูดิโอ · อัพโหลดผลงาน" />
        {claims?.app_metadata?.role === "admin" && (
          <QuickLink href="/admin" icon={<ShieldIcon size={20} className="text-primary" />} label="ผู้ดูแลระบบ" />
        )}
      </nav>

      <Section title="ข้อมูลโปรไฟล์">
        <div className={card}>
          <ProfileForm displayName={profile.displayName} username={profile.username} bio={profile.bio} />
        </div>
      </Section>

      <Section title="วันเกิด">
        <div className={card}>
          {profile.birthDate ? (
            <div className="flex flex-col gap-1 leading-[1.4]">
              <p className="text-[15px] font-semibold">{formatDate(profile.birthDate)}</p>
              <p className="text-[13px] text-muted">
                ใช้ตรวจสิทธิ์อ่านเรื่องเรต 13+ / 18+ · ต้องการแก้ไขกรุณาติดต่อผู้ดูแล
              </p>
            </div>
          ) : (
            <BirthDateForm today={profile.today} />
          )}
        </div>
      </Section>

      <Section title="เปลี่ยนรหัสผ่าน">
        <div className={card}>
          <PasswordForm />
        </div>
      </Section>

      <Section title="อื่นๆ">
        <ul className="divide-y divide-line rounded-[20px] bg-surface px-5 lg:px-6">
          <MenuLink href="/terms" label="ข้อกำหนดการใช้งาน" />
          <MenuLink href="/privacy" label="นโยบายความเป็นส่วนตัว" />
          <li>
            <form action={signOut}>
              <button
                type="submit"
                className="flex h-14 w-full items-center text-[15px] leading-[1.4] text-hot transition-colors hover:text-hot/80"
              >
                ออกจากระบบ
              </button>
            </form>
          </li>
        </ul>
      </Section>
    </>
  );
}

function QuickLink({ href, icon, label, value }: { href: string; icon: ReactNode; label: string; value?: string }) {
  return (
    <Link
      href={href}
      className="flex h-16 items-center gap-3 rounded-[20px] bg-surface px-5 transition-colors hover:bg-surface-2"
    >
      {icon}
      <span className="flex-1 text-[15px] leading-[1.4]">{label}</span>
      {value && <span className="text-[15px] font-semibold text-gold">{value}</span>}
      <ChevronRightIcon size={18} className="text-muted" />
    </Link>
  );
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link href={href} className="flex h-14 items-center justify-between text-[15px] leading-[1.4] transition-colors hover:text-text-2">
        {label}
        <ChevronRightIcon size={18} className="text-muted" />
      </Link>
    </li>
  );
}
