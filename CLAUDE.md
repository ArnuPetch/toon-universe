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

## Tech stack (สรุป)

TypeScript · Next.js · Supabase · Cloudflare R2 · Vercel Hobby (dev) → Cloudflare Workers (production) · Stripe (PromptPay only)

## สถานะปัจจุบัน (อัพเดต 2026-11-01)

**ขั้นตอน: Database schema + server-side functions (Postgres RPC) ต้นแบบเสร็จแล้ว → ถัดไปคือเชื่อม Next.js กับ Supabase (เรียก RPC ฝั่ง server)**

เสร็จแล้ว:

- Next.js + Supabase client packages (`@supabase/ssr`, `@supabase/supabase-js`) ติดตั้งแล้ว ยังไม่มีหน้าเว็บ/โค้ดฝั่งแอป
- Supabase GitHub integration ผูกกับ branch `dev`: push migration ไปที่ `dev` แล้ว integration จะ apply ให้เอง
- Schema ต้นแบบ: `supabase/migrations/20261101081833_init_schema.sql` (imperative migrations, ไม่ใช้ declarative schemas)
  - ผ่าน `supabase db advisors` แล้ว และทดสอบ RLS/trigger กับ local Supabase (Docker) แล้ว
  - RLS เปิดทุกตาราง; ถอน default grants แล้วให้สิทธิ์ทีละตาราง/คอลัมน์
  - **Client อ่านข้อมูลการเงินได้เฉพาะของตัวเอง เขียนไม่ได้** — unlock, donate, refund, withdrawal, ban, ชดเชย content hold ต้องทำฝั่ง server ด้วย `service_role`; งาน admin ก็ทำผ่าน server
  - Trigger ที่มีแล้ว: สร้าง profile/wallet ตอนสมัคร, welcome coin 5 coin ตอนยืนยัน email (ครั้งเดียว), จำกัดการเปลี่ยนราคาตอนเดือนละครั้งหลังปล่อยตอน
  - Helper functions อยู่ใน schema `private` (ไม่ expose ผ่าน API)
- Server-side functions ต้นแบบ: `supabase/migrations/20261101085756_server_functions.sql`
  - เป็น Postgres function (1 call = 1 transaction) ใน `public` แต่ **EXECUTE ให้เฉพาะ `service_role`** (anon/authenticated ได้ 42501); เป็น `security invoker`
  - Reader: `unlock_episode`, `donate`
  - ลบผลงาน + refund: `remove_series`, `remove_episode` (soft delete)
  - ถอนเงิน: `request_withdrawal` → `review_withdrawal` (approve/reject) → `mark_withdrawal_paid`
  - Sanction: `suspend_user`, `ban_user`, `lift_sanction`
  - ปิดตรวจ: `start_content_hold`, `end_content_hold` (ชดเชยเวลาตอนปิด hold)
  - ส่ง id ผู้ใช้/admin เป็น parameter (`p_user_id`, `p_admin_id`) — **server ต้องเอาจาก session ที่ verify แล้ว (`getClaims()`) ห้ามรับจาก request body**; ฟังก์ชัน admin เช็ค `app_metadata.role = 'admin'` ซ้ำใน DB
  - Error: SQLSTATE `P0001` + message เป็นรหัส เช่น `insufficient_coins`, `not_admin`, `below_minimum_withdrawal` (server แปลงเป็นข้อความให้ผู้ใช้)
  - Lock order กัน deadlock: profiles → series → episodes → coin_wallets (wallet เรียงตาม user_id)
  - Welcome coin หมดอายุถูกตัดแบบ lazy ตอนแตะ wallet (`private.lock_wallet`)
  - การตัดสินใจที่เลือกไว้:
    - ถอนเงิน = ถอนยอดที่ถอนได้ทั้งหมดในครั้งเดียว (ไม่แบ่งยอด)
    - Ban uploader → ซ่อนทุกเรื่อง (`moderation_status = 'removed'`), คืน coin เฉพาะรายได้ที่ยังถอนไม่ได้, รายได้ที่เหลือ + คำขอถอนที่ค้างถูกยึด
    - รายได้จากเรื่องที่กำลังปิดตรวจถอนไม่ได้จนกว่าจะเปิด
    - ปลด ban ไม่คืน coin/เรื่องที่ถูกยึด
  - Schema ที่เพิ่ม: `episodes.deleted_at`, ห้ามเลื่อน `publish_at` ของตอนที่ปล่อยแล้ว, open content hold ได้ 1 อันต่อเรื่อง
  - Tests (pgTAP): `supabase/tests/database/server_functions.test.sql` — ผ่าน 51/51, ผ่าน `supabase db advisors`

ยังไม่ได้ทำ (เรียงตามลำดับที่ควรทำ):

1. เชื่อม Next.js กับ Supabase: service-role client (server only, ห้าม `NEXT_PUBLIC_`), wrapper เรียก RPC + map error code; `ban_user` ต้องเรียก `auth.admin.updateUserById(id, { ban_duration })` เพิ่มเพื่อตัด session
2. Stripe PromptPay checkout + webhook → `coin_purchases` / `coin_wallets` / `coin_ledger`
3. Cron: ตัด welcome coin ที่หมดอายุ, ปลด suspend ที่ครบ `ends_at` (`private.refresh_user_status`), ส่ง notification ตอนใหม่ที่ตั้งเวลาไว้
4. Ranking / recommendation (materialized views)
5. หน้าเว็บ Reader / Uploader / Admin

Local dev: `npx supabase start` (Studio: http://127.0.0.1:54323), `npx supabase db reset --local` เพื่อ apply migration ใหม่, `npx supabase test db` เพื่อรัน pgTAP tests
