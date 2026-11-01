# Frontend (หน้าเว็บ)

หลักการที่ใช้กับทุกหน้า ยึดตามหน้า Home (`src/app/page.tsx`) เป็นต้นแบบ

## Design source

- **ไม่ใช้ Figma แล้ว** (ไม่ต้องเรียก Figma MCP) — หน้าใหม่ให้ดูหน้า Home (`src/app/page.tsx` + `src/components/home/`) เป็นต้นแบบเรื่องหน้าตา, layout, spacing, component แล้วออกแบบให้เข้าชุดกัน
- ทำทั้ง Desktop + Mobile ในหน้าเดียว (responsive), breakpoint หลัก `lg` (1024px): ต่ำกว่า = layout mobile
- ไอคอนใหม่ → วาดเป็น SVG ใน `src/components/icons.tsx` ให้เข้ากับของเดิม

## Design tokens & styling

- Tailwind v4, tokens อยู่ใน `@theme` ของ `src/app/globals.css` — **ใช้ token ห้าม hardcode สี** (`bg-surface`, `text-muted`, `bg-primary`, `text-gold`, `bg-hot`, `bg-free` ฯลฯ); สีใหม่ → เพิ่มเป็น token ก่อน
- Dark theme อย่างเดียว (`color-scheme: dark`)
- ฟอนต์ IBM Plex Sans Thai (400/600/700) ผ่าน `next/font` ใน `layout.tsx`; ข้อความไทยใช้ `leading-[1.4]`
- ขนาด (ตามหน้า Home): เนื้อหา `max-w-[1440px]`, padding `px-4` (mobile) / `lg:px-12`; ระยะระหว่าง section `gap-8` / `lg:gap-12`; หัว section → เนื้อหา `gap-4`
- แถวที่ desktop เป็น grid แต่ mobile เลื่อนแนวนอน → ใช้ `Rail` (`src/components/home/section.tsx`)
- ถ้า dev server เสิร์ฟ CSS เก่า (class สีหาย) → ลบ `.next/dev` แล้ว restart

## Components

- ใช้ซ้ำก่อนสร้างใหม่: `Cover` (+ badge), `Section` / `Rail` / `SectionSkeleton`, การ์ดใน `src/components/home/cards.tsx`, ไอคอนใน `src/components/icons.tsx`
- Component ที่ใช้หลายหน้าอยู่ `src/components/`: `TopBar` (`active` = href ของเมนูปัจจุบัน, `search={false}` ซ่อนช่องค้นหา), `BottomTabBar`, `Section`/`Rail`/`SectionSkeleton`, `page.tsx` (`PageMain` — main ตามขนาดหน้า Home, `narrow` สำหรับหน้าฟอร์ม/รายการ; `PageTitle`; `EmptyState`; `SignInPrompt`), `form-styles.ts` (class ของ input/ปุ่ม/กล่อง error), `legal.tsx`, `format.ts` (วิว, เวลา, วันที่, label สถานะ/เรต/ชั้น); ของเฉพาะหน้าอยู่ `src/components/<page>/`
- หน้า browse: `browse/series-grid.tsx` (`SeriesGrid` ปก 3→8 คอลัมน์), `browse/link-tabs.tsx` (`LinkTabs` segmented, `ChipRow` chip กรอง — เป็นลิงก์ทั้งหมด ไม่ใช้ JS), `browse/filters.tsx` (URL ⇄ ตัวกรอง: `parseFilters`/`filterHref`/`BrowseFilters`), `browse/pagination.tsx`
- ค่าคงที่ที่ server component ใช้ด้วย **ห้าม export จากไฟล์ `"use client"`** (server จะได้ client reference ไม่ใช่ค่า) → ใส่ `format.ts`
- ปกเรื่อง: ตอนนี้เป็น placeholder (gradient + ตัวอักษรแรก ข้ามสระนำ เ แ โ ใ ไ) — `TODO` ใน `cover.tsx` เมื่อเสิร์ฟรูปจาก R2
- เป็น Server Component เป็นค่าเริ่มต้น; `"use client"` เฉพาะส่วนที่มี state/interaction (carousel, tabs) และส่ง ReactNode ที่ render บน server เข้าไปแทนการส่งข้อมูลดิบ (ดู `RankingSection`)

## Data & caching (Next.js `cacheComponents`)

- ดึงข้อมูลใน `src/lib/server/<page>.ts` (`server-only`) ไม่ query ตรงใน component
- อะไรที่อ่าน cookie/session ต้องอยู่ใต้ `<Suspense>` พร้อม skeleton ขนาดใกล้ของจริง (กัน layout shift); แยก Suspense ต่อ section
- **ข้อมูลสาธารณะ (catalog)**: ไม่ login → `'use cache'` + `createPublicClient()` + `cacheTag(CATALOG_TAG)` + `cacheLife` จาก `catalog-cache.ts`; login → query สดด้วย `createClient()` — รายละเอียด [server-integration.md](server-integration.md#cache-ข้อมูลสาธารณะ-catalog)
- **ข้อมูลส่วนตัว** (coin, แจ้งเตือน, progress, ชั้นหนังสือ) ไม่ cache
- อะไรที่ทำให้เนื้อหาสาธารณะเปลี่ยน (publish/unpublish, แก้ชื่อ/ปก/เรตอายุ, ลบ, hold, แบน) → เรียก `invalidateCatalog()` หลังสำเร็จ
- ห้ามเรียก `Date.now()` ใน component (lint `react-hooks/purity`) → คำนวณใน data layer แล้วส่ง `now` มา
- อ่านเวลา (`Date.now()`/`new Date()`) นอก `'use cache'` ได้เฉพาะหลัง `await connection()` ไม่งั้น Next ฟ้อง "unstable value while prerendering" — `getClaims()` เรียก `connection()` ให้แล้ว ดังนั้นโค้ดที่อยู่หลัง `getUserId()` ใช้เวลาได้เลย
- ส่วนที่มี side effect ตอน render (เช่นนับวิว) → `await connection()` ก่อน กันถูก prerender/prefetch
- Dynamic route: page ไม่ await `params` เอง ส่ง `params.then(...)` เข้า `<Suspense>` (ดูหน้าเรื่อง); `notFound()` ใช้ได้ (`src/app/not-found.tsx`)

## Mutations

- Server Actions ใน `src/app/actions/*.ts`: user id จาก `getUserId()` เท่านั้น, ไม่ login → `redirect("/login")`, validate input, คืน `{ ok }` (ดู `bookshelf.ts`)
- งานการเงิน/admin → ผ่าน RPC wrapper ใน `src/lib/server/rpc.ts` (กฎใน CLAUDE.md)

## Accessibility & UX

- ลิงก์ใช้ `next/link`; ปุ่มที่เป็น action ใช้ `<button>`
- ปุ่มไอคอนต้องมี `aria-label`; tabs ใช้ `role="tablist"/"tab"/"tabpanel"`; carousel หยุดเมื่อ hover/focus
- ส่วนที่ไม่มีข้อมูล: ซ่อน section (หรือข้อความว่างใน section ที่มี tab)
- รองรับ `prefers-reduced-motion` (ตั้งไว้ใน `globals.css`)

## หน้าที่ทำแล้ว

- `/` Home — ต้นแบบของทุกหน้า
- `/login`
- `/series/[slug]`, `/series/[slug]/[number]` (ดูด้านล่าง)
- `/coins` (ดูด้านล่าง)
- คอมเมนต์ + รีวิว บนหน้าเรื่อง/หน้าอ่าน (ดูด้านล่าง)
- หน้าอื่นของ Reader (ดู "หน้า Browse / ส่วนตัว" ด้านล่าง): `/search`, `/ranking`, `/genres`, `/genres/[slug]`, `/updates`, `/bookshelf`, `/notifications`, `/profile`, `/forgot-password`, `/reset-password`, `/terms`, `/privacy`

## หน้าเรื่อง / หน้าอ่าน

- ข้อมูล: `src/lib/server/series.ts` — `getSeries(slug)` (เรื่อง + ตอนที่ปล่อยแล้ว + season + สถิติ; cache เมื่อไม่ login แบบ `UPDATES_LIFE`), `getViewerState` (ติดตาม, ชั้น, progress, unlock ที่ยังไม่หมดอายุ, ผ่านเรตอายุไหม — ไม่ cache), `getEpisodePages`, `getReadingPreference`, `getRecommendations`
- สถิติ (วิว/ผู้ติดตาม/คะแนนทั้งหมด) จาก RPC `get_series_stats` (MV, ช้าได้ ≤ 10 นาที); เรตอายุจาก RPC `viewer_meets_age_rating` — series RLS ไม่กรองอายุ จึงต้องแสดง `AgeGate` แทนปุ่มอ่าน/หน้า (RLS ของ `episode_pages` กันซ้ำอีกชั้น)
- หน้าอ่าน: อ่านได้ = เจ้าของ / ฟรี / unlock ยังไม่หมดอายุ → ดึงหน้า + `recordEpisodeView`; ไม่งั้นแสดง `UnlockPanel` (Server Action `unlockEpisodeAction` → RPC → `router.refresh()`; coin ไม่พอ → ลิงก์ `/coins`)
- `Reader` (client): โหมดเลื่อนลง/พลิกหน้า + ซ้าย→ขวา/ขวา→ซ้าย (ปุ่มลูกศร, คลิกครึ่งซ้าย/ขวา), จำค่าต่อเรื่อง (`saveReadingPreference`), บันทึก progress แบบ debounce (`saveReadingProgress` — ย้ายเรื่องเข้าชั้น "กำลังอ่าน" ด้วยถ้ายังไม่อยู่หรืออยู่ "อยากอ่าน")
- รูปหน้า/ปกยังเป็น placeholder ตาม width/height — รอ R2 + signed URL
- รายชื่อตอน: ล่าสุดก่อน (สลับได้), แสดง 30 ตอนแรกแล้วกด "ดูทั้งหมด", แยกตาม season ถ้ามี

## คอมเมนต์ + รีวิว

- ข้อมูล: `src/lib/server/social.ts` — `loadComments` (คอมเมนต์หลัก 20 อันล่าสุด keyset ด้วย `id` + คำตอบทั้งหมดเรียงเก่า→ใหม่), `countComments`, `getReviewSummary`, `loadReviews` (เฉพาะที่มีข้อความ ไม่รวมของตัวเอง 10 อัน), `getMyReview` — อ่านในนามผู้ใช้ (RLS) **ไม่ cache**
- Actions: `src/app/actions/social.ts` — `postComment`, `editComment`, `deleteComment`, `loadMoreComments`, `saveReview` (update ก่อน ไม่มีค่อย insert — upsert ไม่ได้เพราะไม่มีสิทธิ์ UPDATE คอลัมน์ key), `deleteReview`, `loadMoreReviews`, `reportContent`; คืน `ActionResult`, error จาก trigger แปลงด้วย `writeError()` (42501 = บัญชีถูกระงับ)
- UI `src/components/social/`: `discussion.tsx` (server: `SeriesDiscussion` แท็บรีวิว→ความคิดเห็น, `EpisodeDiscussion` แท็บความคิดเห็น→ให้คะแนน แบบ `compact`), `discussion-tabs.tsx` (section `#comments` — ลิงก์แจ้งเตือนตอบกลับมาที่นี่ แล้วสลับไปแท็บความคิดเห็น), `review-panel.tsx`, `comment-panel.tsx`, `bits.tsx` (ดาว, spoiler, composer, report dialog)
- หน้าเรื่อง: ใต้รายชื่อตอน; หน้าอ่าน: ใต้หน้าของตอน (กว้าง 800) — แสดงเมื่อผ่านเรตอายุ, ใน `<Suspense>`
- Spoiler: ข้อความถูกบังจนกด "แตะเพื่อดู"; รายงาน = `<dialog>` เลือกเหตุผล spam / คำหยาบ / สปอยล์ไม่ซ่อน
- บันทึก/ลบรีวิว → `router.refresh()` ให้คะแนนบนหัวเรื่อง + สรุปอัพเดต
- ยังไม่มี: ไลก์คอมเมนต์, เรียงคอมเมนต์แบบอื่น, admin ซ่อนคอมเมนต์ (รอหน้า Admin — ตั้ง `hidden_at` ด้วย `service_role`)

## หน้าเติม coin (`/coins`)

- ข้อมูล: `src/lib/server/coins.ts` — `getCoinPacks()` (cache, คำนวณราคา/coin + ส่วนประหยัดเทียบแพ็กที่แพงสุดต่อ coin), `getWallet()` (welcome coin หมดอายุ = 0), `getCoinHistory()` (`coin_ledger` 20 รายการล่าสุด), `getPurchaseBySession()` — ส่วนตัวไม่ cache
- ซื้อ: `PackList` (client) → Server Action `buyCoinPackAction` (`src/app/actions/coins.ts`) → `startCoinCheckout` → `window.location.assign(checkoutUrl)`; ไม่ login → แสดงราคา + ปุ่ม "เข้าสู่ระบบเพื่อเติม coin" (`/login?next=/coins`)
- กลับจาก Stripe: `?checkout=success&session_id=…` → banner ตามสถานะ purchase (`succeeded` / `pending` = `RefreshWhilePending` เรียก `router.refresh()` ทุก 3 วิ ≤ 1 นาที / อื่นๆ = ไม่สำเร็จ); `?checkout=canceled` → banner ยกเลิก — **หน้านี้แค่แสดงสถานะ ไม่เติม coin**

## หน้า Browse / ส่วนตัว

- ข้อมูล browse: `src/lib/server/browse.ts` — `getGenres`/`getGenre` (cache เสมอ), `searchSeries` (RPC `search_series`; ไม่ login + ไม่มีคำค้น → cache ตามตัวกรอง, **มีคำค้น → ไม่ cache** เพราะ key เป็น input อิสระ), `getRanking` (RPC `get_series_ranking` 50 อันดับ, cache ตาม kind/period เมื่อไม่ login)
- ตัวกรองทั้งหมดอยู่ใน URL (`?q=&genre=&status=&price=&sort=&page=`) ค่าที่ไม่รู้จักถูกทิ้งใน `parseFilters`; เปลี่ยนตัวกรอง → กลับหน้า 1; หน้าละ 24 เรื่อง
- `/search`: ช่องค้นหาของหน้าเอง (TopBar `search={false}`), ค่าเริ่มต้นเรียง "ตรงที่สุด" เมื่อมีคำค้น / "ยอดนิยม" เมื่อไม่มี; `/genres/[slug]` ใช้ตัวกรองชุดเดียวกัน (ไม่มีแถวแนว); `/updates` = `search_series` เรียง `updated` ลิงก์ไปตอนล่าสุด
- `/ranking?kind=views|rating|trending|new&period=day|week|month|all` — ค่าเริ่มต้น period ต่อ kind ใน `DEFAULT_PERIOD`, trending ไม่มี "ทั้งหมด"; desktop 2 คอลัมน์ (1–25 ซ้าย)
- ข้อมูลส่วนตัว: `src/lib/server/library.ts` — `getLibrary` (ชั้น + progress + ติดตาม; "ตอนใหม่" = `last_episode_at` ใหม่กว่า progress ล่าสุด), `getNotifications` (50 รายการล่าสุด แปลง `type`+`payload` เป็นข้อความ/ลิงก์ใน `describe()` — เพิ่ม type ใหม่ต้องเพิ่มที่นี่), `getProfile`
- `/bookshelf?tab=reading|plan_to_read|completed|following` — ย้ายชั้น/เลิกติดตามด้วย action เดิมใน `bookshelf.ts` แล้ว `router.refresh()`
- `/notifications` — กดรายการ = mark read (`markNotificationsRead([id])`) + ไปหน้าที่เกี่ยวข้อง; "อ่านแล้วทั้งหมด"; action เรียก `refresh()` ให้ badge บน TopBar อัพเดต
- `/profile` — แก้ชื่อที่แสดง/ชื่อผู้ใช้/แนะนำตัว (`updateProfile`), วันเกิด **ตั้งได้ครั้งเดียว** (`setBirthDate` อัพเดตเฉพาะเมื่อยังเป็น null; DB บังคับซ้ำด้วย trigger `lock_birth_date` → `birth_date_locked` แม้เรียก API ตรง — แก้ได้เฉพาะ `service_role`), เปลี่ยนรหัสผ่าน, ลิงก์ terms/privacy, ออกจากระบบ (`signOut`)
- ลืมรหัสผ่าน: `/forgot-password` → `requestPasswordReset` (`resetPasswordForEmail`, redirect `/auth/confirm?next=/reset-password` — ข้อความเหมือนกันทุกกรณีกันเดาอีเมล) → `/auth/confirm` แลก code เป็น session → `/reset-password` (`updatePassword`); ลิงก์ "ลืมรหัสผ่าน?" อยู่ในฟอร์มเข้าสู่ระบบ; `/login`, `/forgot-password`, `/reset-password` ใช้ `AuthShell`
- `/terms`, `/privacy` เป็นหน้า static จาก `docs/policies.md` + `coin-and-revenue.md` — **ร่าง ต้องให้ฝ่ายกฎหมายตรวจก่อนเปิดจริง**

## ตรวจงานก่อนส่ง

1. `npx tsc --noEmit` · `npm run lint` · `npm run build`
2. เปิดดูจริงทั้ง 1440 และ 390 ให้หน้าตาเข้าชุดกับหน้า Home (headless Firefox: `firefox --headless --screenshot <out> --window-size=1440,2240 <url>`; snap firefox เขียนได้ใน `~/snap/firefox/common/`)
3. ทดสอบทั้งสถานะ login / ไม่ login
4. ข้อมูลทดสอบใส่ใน DB local เท่านั้น (ไม่ commit); user ที่ insert เองใน `auth.users` ต้องตั้งคอลัมน์ token เป็น `''` ไม่งั้น login ไม่ได้
