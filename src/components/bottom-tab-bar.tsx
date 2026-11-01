import Link from "next/link";
import { CategoryIcon, HomeIcon, RankIcon, ShelfIcon, UserIcon } from "./icons";

const TABS = [
  { href: "/", label: "หน้าแรก", Icon: HomeIcon },
  { href: "/ranking", label: "Ranking", Icon: RankIcon },
  { href: "/genres", label: "หมวดหมู่", Icon: CategoryIcon },
  { href: "/bookshelf", label: "ชั้นหนังสือ", Icon: ShelfIcon },
  { href: "/profile", label: "โปรไฟล์", Icon: UserIcon },
];

/** Mobile-only bottom navigation. `active` is the current tab's href. */
export function BottomTabBar({ active }: { active: string }) {
  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid h-16 grid-cols-5">
        {TABS.map(({ href, label, Icon }) => {
          const current = href === active;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[10px] leading-[1.3] ${
                  current ? "font-semibold text-primary" : "text-muted"
                }`}
              >
                <Icon size={24} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
