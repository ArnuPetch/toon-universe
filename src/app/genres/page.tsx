import type { Metadata } from "next";
import Link from "next/link";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { PageMain, PageTitle } from "@/components/page";
import { TopBar } from "@/components/top-bar";
import { getGenres } from "@/lib/server/browse";

// Genre index. Genres are public and the same for everyone, so the whole page
// is static (cached, dropped with the catalog tag).

export const metadata: Metadata = {
  title: "หมวดหมู่ — Toon Universe",
  description: "เลือกอ่านมังงะ มังฮวา ตามแนวที่ชอบ",
};

// Same palette as the cover placeholders (cover.tsx).
const TILE = [
  "from-[#c04cfd]/70 to-[#3b1e7a]/40",
  "from-[#ff8fb1]/70 to-[#7a2c5b]/40",
  "from-[#5ec8ff]/70 to-[#1f3f7a]/40",
  "from-[#ffc46b]/70 to-[#7a4a1e]/40",
  "from-[#6bffc4]/70 to-[#1e6b5a]/40",
];

export default async function GenresPage() {
  const genres = await getGenres();
  return (
    <>
      <TopBar active="/genres" />
      <PageMain>
        <PageTitle sub="เลือกแนวที่ชอบ แล้วกรองต่อได้ตามสถานะ ราคา หรือยอดนิยม">หมวดหมู่</PageTitle>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-5">
          {genres.map((g) => (
            <li key={g.id}>
              <Link
                href={`/genres/${g.slug}`}
                className={`group relative flex h-24 flex-col justify-end overflow-hidden rounded-xl bg-linear-to-br p-4 transition-transform hover:-translate-y-0.5 lg:h-[120px] lg:p-5 ${
                  TILE[g.id % TILE.length]
                }`}
              >
                <span className="text-base font-bold leading-[1.4] lg:text-lg">{g.name}</span>
                <span className="text-xs leading-[1.4] text-text-2 lg:text-[13px]">{g.nameEn}</span>
              </Link>
            </li>
          ))}
        </ul>
      </PageMain>
      <BottomTabBar active="/genres" />
    </>
  );
}
