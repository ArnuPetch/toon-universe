# Database (Supabase / Postgres)

## Migrations

- ใช้ imperative migrations ใน `supabase/migrations/` (ไม่ใช้ declarative schemas)
- Supabase GitHub integration ผูกกับ branch `dev`: push migration ไปที่ `dev` แล้ว integration จะ apply ให้เอง
- แก้ schema แล้วต้องรัน `npm run db:types` ใหม่ทุกครั้ง (→ `src/lib/supabase/database.types.ts`)

| ไฟล์ | เนื้อหา |
|---|---|
| `20261101081833_init_schema.sql` | Schema ต้นแบบ, RLS, triggers, helper functions |
| `20261101085756_server_functions.sql` | Server-side functions (RPC) |
| `20261101120000_coin_checkout.sql` | เติม coin ผ่าน Stripe Checkout (PromptPay) |

## Schema ต้นแบบ (`init_schema`)

- ผ่าน `supabase db advisors` แล้ว และทดสอบ RLS/trigger กับ local Supabase (Docker) แล้ว
- RLS เปิดทุกตาราง; ถอน default grants แล้วให้สิทธิ์ทีละตาราง/คอลัมน์
- **Client อ่านข้อมูลการเงินได้เฉพาะของตัวเอง เขียนไม่ได้** — unlock, donate, refund, withdrawal, ban, ชดเชย content hold ต้องทำฝั่ง server ด้วย `service_role`; งาน admin ก็ทำผ่าน server
- Helper functions อยู่ใน schema `private` (ไม่ expose ผ่าน API)

### Triggers

- สร้าง profile/wallet ตอนสมัคร
- Welcome coin 5 coin ตอนยืนยัน email (ครั้งเดียว)
- จำกัดการเปลี่ยนราคาตอนเดือนละครั้งหลังปล่อยตอน

## Server-side functions (`server_functions`)

- เป็น Postgres function (1 call = 1 transaction) ใน `public` แต่ **EXECUTE ให้เฉพาะ `service_role`** (anon/authenticated ได้ 42501); เป็น `security invoker`
- ส่ง id ผู้ใช้/admin เป็น parameter (`p_user_id`, `p_admin_id`) — **server ต้องเอาจาก session ที่ verify แล้ว (`getClaims()`) ห้ามรับจาก request body**; ฟังก์ชัน admin เช็ค `app_metadata.role = 'admin'` ซ้ำใน DB
- Error: SQLSTATE `P0001` + message เป็นรหัส เช่น `insufficient_coins`, `not_admin`, `below_minimum_withdrawal` (server แปลงเป็นข้อความให้ผู้ใช้ — ดู [server-integration.md](server-integration.md))
- Lock order กัน deadlock: profiles → series → episodes → coin_wallets (wallet เรียงตาม user_id)
- Welcome coin หมดอายุถูกตัดแบบ lazy ตอนแตะ wallet (`private.lock_wallet`)

### รายการฟังก์ชัน

| กลุ่ม | ฟังก์ชัน |
|---|---|
| Reader | `unlock_episode`, `donate` |
| ลบผลงาน + refund | `remove_series`, `remove_episode` (soft delete) |
| ถอนเงิน | `request_withdrawal` → `review_withdrawal` (approve/reject) → `mark_withdrawal_paid` |
| Sanction | `suspend_user`, `ban_user`, `lift_sanction` |
| ปิดตรวจ | `start_content_hold`, `end_content_hold` (ชดเชยเวลาตอนปิด hold) |
| เติม coin | `create_coin_purchase`, `attach_checkout_session`, `complete_coin_purchase`, `fail_coin_purchase` (ดู [server-integration.md](server-integration.md#stripe-checkout-promptpay)) |

### การตัดสินใจที่เลือกไว้

- ถอนเงิน = ถอนยอดที่ถอนได้ทั้งหมดในครั้งเดียว (ไม่แบ่งยอด)
- Ban uploader → ซ่อนทุกเรื่อง (`moderation_status = 'removed'`), คืน coin เฉพาะรายได้ที่ยังถอนไม่ได้, รายได้ที่เหลือ + คำขอถอนที่ค้างถูกยึด
- รายได้จากเรื่องที่กำลังปิดตรวจถอนไม่ได้จนกว่าจะเปิด
- ปลด ban ไม่คืน coin/เรื่องที่ถูกยึด
- เติม coin:
  - `complete_coin_purchase` idempotent (webhook ซ้ำไม่เติมซ้ำ) และชนะสถานะ failed/canceled ที่มาก่อน (เงินเข้าแล้ว)
  - `fail_coin_purchase` แก้ได้เฉพาะ `pending` — ไม่ downgrade รายการที่สำเร็จแล้ว
  - หา purchase ด้วย id (`client_reference_id`) ไม่ใช่ session id — webhook มาก่อน attach ก็ยังเจอ; ถ้า attach แล้ว session id ต้องตรง
  - ตรวจยอด + สกุลเงิน (`thb`) กับราคา snapshot ทุกครั้ง
  - จ่ายสำเร็จหลังโดน ban → บันทึกการจ่าย + เติม แล้วยึดทันที (`ban_forfeit`) ให้ wallet ของคนโดน ban เป็น 0 เสมอ

### Schema ที่เพิ่มใน migration นี้

- `episodes.deleted_at`
- ห้ามเลื่อน `publish_at` ของตอนที่ปล่อยแล้ว
- Open content hold ได้ 1 อันต่อเรื่อง

## Tests

- pgTAP: `supabase/tests/database/server_functions.test.sql`, `coin_checkout.test.sql` — ผ่าน 78/78, ผ่าน `supabase db advisors`
- รัน: `npx supabase test db`
