# Toon Universe

Web app สำหรับอ่านและอัพโหลด manga, manhwa ฯลฯ

- ผู้อ่าน (reader) เติมเงินซื้อ **coin** เพื่อ unlock ตอน (อ่านได้ 30 วัน)
- ผู้อัพโหลด (uploader) ได้รับรายได้จาก coin ที่ผู้อ่านใช้กับผลงานของตน
- บัญชีเดียวใช้ได้ทั้ง reader และ uploader

## Content structure

เรื่อง (Series) → Season (optional) → ตอน (Episode) → หน้า (Page)

## Docs

รายละเอียดแยกตามหัวข้อ อ่านไฟล์ที่เกี่ยวข้องก่อนทำงานในส่วนนั้น:

- [docs/features.md](docs/features.md) — Feature scope: Reader, Uploader, Admin, Report system
- [docs/coin-and-revenue.md](docs/coin-and-revenue.md) — Coin system, revenue split, withdrawal, refund, ban/suspend, coin pack pricing
- [docs/policies.md](docs/policies.md) — Terms of Service, Privacy Policy (PDPA), Copyright
- [docs/tech-stack.md](docs/tech-stack.md) — Tech stack ที่ใช้
- [docs/database.md](docs/database.md) — Migrations, schema/RLS/triggers, server-side functions (RPC), lock order, การตัดสินใจเรื่อง ban/withdrawal/content hold, pgTAP tests
- [docs/server-integration.md](docs/server-integration.md) — Next.js ↔ Supabase: clients, proxy, auth helpers, RPC wrapper, error mapping, ban sync กับ Auth

## Tech stack (สรุป)

TypeScript · Next.js · Supabase · Cloudflare R2 · Vercel Hobby (dev) → Cloudflare Workers (production) · Stripe (PromptPay only)

## สถานะปัจจุบัน (อัพเดต 2026-11-01)

**ขั้นตอน: เชื่อม Next.js กับ Supabase เสร็จแล้ว (client/proxy/RPC wrapper) → ถัดไปคือ Stripe PromptPay checkout + webhook**

เสร็จแล้ว (รายละเอียดใน docs):

- Next.js + Supabase client packages (`@supabase/ssr`, `@supabase/supabase-js`) ติดตั้งแล้ว ยังไม่มีหน้าเว็บ
- Schema + RLS + triggers (`supabase/migrations/`) — [docs/database.md](docs/database.md)
- Server-side functions (RPC): unlock, donate, remove + refund, withdrawal, sanction, content hold พร้อม pgTAP tests — [docs/database.md](docs/database.md)
- เชื่อม Next.js กับ Supabase (`src/lib/`): clients, proxy, auth, RPC wrapper, error mapping, ban sync — [docs/server-integration.md](docs/server-integration.md)

กฎสำคัญ (ห้ามพลาด):

- **Client อ่านข้อมูลการเงินได้เฉพาะของตัวเอง เขียนไม่ได้** — งานการเงิน/admin ทำฝั่ง server ด้วย `service_role` ผ่าน RPC
- **id ผู้ใช้/admin ต้องเอาจาก session ที่ verify แล้ว (`getClaims()`) ห้ามรับจาก request body**
- เพิ่ม error code ใหม่ใน SQL ต้องเพิ่มใน `src/lib/server/errors.ts` ด้วย
- แก้ schema แล้วรัน `npm run db:types` ใหม่ทุกครั้ง
- Push migration ไปที่ branch `dev` → Supabase GitHub integration apply ให้เอง

ยังไม่ได้ทำ (เรียงตามลำดับที่ควรทำ):

1. Stripe PromptPay checkout + webhook → `coin_purchases` / `coin_wallets` / `coin_ledger`
2. Cron: ตัด welcome coin ที่หมดอายุ, ปลด suspend ที่ครบ `ends_at` (`private.refresh_user_status`), ส่ง notification ตอนใหม่ที่ตั้งเวลาไว้
3. Ranking / recommendation (materialized views)
4. หน้าเว็บ Reader / Uploader / Admin

Local dev: `npx supabase start` (Studio: http://127.0.0.1:54323), `npx supabase db reset --local` เพื่อ apply migration ใหม่, `npx supabase test db` เพื่อรัน pgTAP tests
