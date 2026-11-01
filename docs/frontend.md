# Frontend (หน้าเว็บ)

หลักการที่ใช้กับทุกหน้า ยึดตามหน้า Home (`src/app/page.tsx`) เป็นต้นแบบ

## Design source

- Figma: file `NkG58ViKV5PVAY4rcDyeEC` — Home: Desktop node `3:2` (1440), Mobile node `3:333` (390)
- ทำทั้ง Desktop + Mobile ในหน้าเดียว (responsive), breakpoint หลัก `lg` (1024px): ต่ำกว่า = layout mobile
- Figma MCP เป็นแพลน Starter → **โควตาเรียกน้อยมาก**: เรียก `get_metadata` ทั้ง frame ครั้งเดียว แล้ว `get_design_context` เฉพาะ node เล็ก (component ตัวแทน 1 ชิ้นต่อแบบ) ห้ามเรียกทั้ง frame (timeout + เปลืองโควตา)
- Asset จาก Figma (URL ชั่วคราว 7 วัน) → ดาวน์โหลดเก็บใน `public/icons/` ทันที ห้ามใช้ URL ของ Figma ในโค้ด

## Design tokens & styling

- Tailwind v4, tokens อยู่ใน `@theme` ของ `src/app/globals.css` — **ใช้ token ห้าม hardcode สี** (`bg-surface`, `text-muted`, `bg-primary`, `text-gold`, `bg-hot`, `bg-free` ฯลฯ); สีใหม่ → เพิ่มเป็น token ก่อน
- Dark theme อย่างเดียว (`color-scheme: dark`)
- ฟอนต์ IBM Plex Sans Thai (400/600/700) ผ่าน `next/font` ใน `layout.tsx`; ข้อความไทยใช้ `leading-[1.4]` ตาม Figma
- ขนาดตาม Figma: เนื้อหา `max-w-[1440px]`, padding `px-4` (mobile) / `lg:px-12`; ระยะระหว่าง section `gap-8` / `lg:gap-12`; หัว section → เนื้อหา `gap-4`
- แถวที่ desktop เป็น grid แต่ mobile เลื่อนแนวนอน → ใช้ `Rail` (`src/components/home/section.tsx`)
- ถ้า dev server เสิร์ฟ CSS เก่า (class สีหาย) → ลบ `.next/dev` แล้ว restart

## Components

- ใช้ซ้ำก่อนสร้างใหม่: `Cover` (+ badge), `Section` / `Rail` / `SectionSkeleton`, การ์ดใน `src/components/home/cards.tsx`, ไอคอนใน `src/components/icons.tsx`
- Component ที่จะใช้หลายหน้า → ย้ายจาก `src/components/home/` ขึ้นไป `src/components/` (เช่น `TopBar`, `BottomTabBar` เมื่อทำหน้าถัดไป → ย้ายเข้า layout ร่วม)
- ปกเรื่อง: ตอนนี้เป็น placeholder (gradient + ตัวอักษรแรก ข้ามสระนำ เ แ โ ใ ไ) — `TODO` ใน `cover.tsx` เมื่อเสิร์ฟรูปจาก R2
- เป็น Server Component เป็นค่าเริ่มต้น; `"use client"` เฉพาะส่วนที่มี state/interaction (carousel, tabs) และส่ง ReactNode ที่ render บน server เข้าไปแทนการส่งข้อมูลดิบ (ดู `RankingSection`)

## Data & caching (Next.js `cacheComponents`)

- ดึงข้อมูลใน `src/lib/server/<page>.ts` (`server-only`) ไม่ query ตรงใน component
- อะไรที่อ่าน cookie/session ต้องอยู่ใต้ `<Suspense>` พร้อม skeleton ขนาดใกล้ของจริง (กัน layout shift); แยก Suspense ต่อ section
- **ข้อมูลสาธารณะ (catalog)**: ไม่ login → `'use cache'` + `createPublicClient()` + `cacheTag(CATALOG_TAG)` + `cacheLife` จาก `catalog-cache.ts`; login → query สดด้วย `createClient()` — รายละเอียด [server-integration.md](server-integration.md#cache-ข้อมูลสาธารณะ-catalog)
- **ข้อมูลส่วนตัว** (coin, แจ้งเตือน, progress, ชั้นหนังสือ) ไม่ cache
- อะไรที่ทำให้เนื้อหาสาธารณะเปลี่ยน (publish/unpublish, แก้ชื่อ/ปก/เรตอายุ, ลบ, hold, แบน) → เรียก `invalidateCatalog()` หลังสำเร็จ
- ห้ามเรียก `Date.now()` ใน component (lint `react-hooks/purity`) → คำนวณใน data layer แล้วส่ง `now` มา

## Mutations

- Server Actions ใน `src/app/actions/*.ts`: user id จาก `getUserId()` เท่านั้น, ไม่ login → `redirect("/login")`, validate input, คืน `{ ok }` (ดู `bookshelf.ts`)
- งานการเงิน/admin → ผ่าน RPC wrapper ใน `src/lib/server/rpc.ts` (กฎใน CLAUDE.md)

## Accessibility & UX

- ลิงก์ใช้ `next/link`; ปุ่มที่เป็น action ใช้ `<button>`
- ปุ่มไอคอนต้องมี `aria-label`; tabs ใช้ `role="tablist"/"tab"/"tabpanel"`; carousel หยุดเมื่อ hover/focus
- ส่วนที่ไม่มีข้อมูล: ซ่อน section (หรือข้อความว่างใน section ที่มี tab)
- รองรับ `prefers-reduced-motion` (ตั้งไว้ใน `globals.css`)

## Routes ที่ลิงก์ไว้แล้วแต่ยังไม่มีหน้า

`/series/[slug]`, `/series/[slug]/[number]` (หน้าอ่าน — เรียก `recordEpisodeView`), `/login`, `/search?q=`, `/ranking` (`?kind=trending`), `/genres`, `/bookshelf`, `/profile`, `/notifications`, `/coins`, `/updates`

## ตรวจงานก่อนส่ง

1. `npx tsc --noEmit` · `npm run lint` · `npm run build`
2. เปิดดูจริงทั้ง 1440 และ 390 เทียบกับ screenshot ของ Figma (headless Firefox: `firefox --headless --screenshot <out> --window-size=1440,2240 <url>`; snap firefox เขียนได้ใน `~/snap/firefox/common/`)
3. ทดสอบทั้งสถานะ login / ไม่ login
4. ข้อมูลทดสอบใส่ใน DB local เท่านั้น (ไม่ commit); user ที่ insert เองใน `auth.users` ต้องตั้งคอลัมน์ token เป็น `''` ไม่งั้น login ไม่ได้
