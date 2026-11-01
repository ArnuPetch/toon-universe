# Next.js ↔ Supabase (`src/lib/`)

## Supabase clients

| ไฟล์ | ใช้ที่ไหน | สิทธิ์ |
|---|---|---|
| `supabase/client.ts` | Browser | anon key + session ผู้ใช้ |
| `supabase/server.ts` | Server Components / Server Actions | session ผู้ใช้ → RLS |
| `supabase/admin.ts` | Server เท่านั้น (`server-only`) | `service_role`, env `SUPABASE_SECRET_KEY` (ห้ามใช้ prefix `NEXT_PUBLIC_`) |

## Proxy

- `src/proxy.ts` (Next 16 เปลี่ยน middleware → proxy) refresh token ด้วย `getClaims()` — เป็นที่เดียวที่ refresh
- ตั้ง cookie `tu_vid` (UUID สุ่ม, httpOnly, 1 ปี) ให้ผู้เข้าชมที่ยังไม่มี — ใช้นับวิวของคนที่ไม่ได้ login; ตั้งใน request ด้วยเพื่อให้ Server Components ใน request แรกเห็น

## Server helpers

- `server/auth.ts`: `getClaims` (cache ต่อ request), `requireUserId`, `requireAdminId` (เช็ค `app_metadata.role`)
- `server/rpc.ts`: wrapper ทุก RPC (ดู [database.md](database.md))
  - **ดึง id จาก session เอง ไม่รับจาก caller**
  - คืน `ActionResult` (`{ok,data}` / `{ok:false,code,message}`) ไม่ throw
- `server/ranking.ts`: `getSeriesRanking`, `getSeriesRecommendations` (ใช้ client ผู้ใช้ → RLS + เรตอายุ), `recordEpisodeView` (service_role; viewer = user id จาก `getClaims()` หรือ cookie `tu_vid`) — เรียกตอน server ส่งหน้าของตอนจริง
- `server/errors.ts`: map error code → ข้อความภาษาไทย
  - เพิ่ม code ใหม่ใน SQL ต้องเพิ่มที่นี่ด้วย
  - code ที่ไม่รู้จัก → `unexpected_error` + log

## Ban / lift กับ Supabase Auth

- `banUser`: เรียก RPC ก่อน แล้วค่อย Auth ban (`ban_duration`)
  - ถ้า Auth ban ล้มเหลวคืน `session_revoked: false` → เรียก `syncAuthBan` ซ้ำ
- `liftSanction`: ปลด Auth ban เมื่อ status ไม่ใช่ banned

## Stripe Checkout (PromptPay)

| ไฟล์ | หน้าที่ |
|---|---|
| `stripe/server.ts` | Stripe client (server only), fetch HTTP client — ใช้ได้ทั้ง Node และ Cloudflare Workers |
| `server/coin-checkout.ts` | `startCoinCheckout(packId)` → สร้าง purchase (pending) + Checkout Session → คืน `checkoutUrl` ให้ redirect |
| `app/api/stripe/webhook/route.ts` | verify signature (`constructEventAsync` + SubtleCrypto) → เติม coin |

- **เติม coin เฉพาะใน webhook** ห้ามเติมจากหน้า success (ผู้ใช้อาจปิดแท็บหลังจ่าย)
- Webhook events ที่ต้อง subscribe: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`
  - `completed` เติมเฉพาะเมื่อ `payment_status = 'paid'`
- Response: 200 = จัดการแล้ว/ไม่เกี่ยว/ถูกปฏิเสธถาวร (log ไว้ให้คนดู), 500 = DB/network ขัดข้อง → Stripe retry เอง
- PromptPay อย่างเดียว: เปิดเฉพาะ PromptPay ใน Dashboard (หรือ payment method configuration → `STRIPE_PAYMENT_METHOD_CONFIGURATION`) — **ไม่ใช้ `payment_method_types`**
- Session หมดอายุ 30 นาที (ขั้นต่ำของ Stripe) → purchase เป็น `canceled`
- Idempotency key `coin-purchase-<id>` → 1 purchase = 1 session
- Proxy ข้าม `/api/stripe/webhook` (ไม่มี session)
- ทดสอบ local: `stripe listen --forward-to localhost:3000/api/stripe/webhook` แล้วใส่ `whsec_…` ที่ได้ใน `STRIPE_WEBHOOK_SECRET`

## Types & Env

- Types: `npm run db:types` → `src/lib/supabase/database.types.ts` (รันใหม่ทุกครั้งที่แก้ schema)
- Env: ดู `.env.example`

## Tests

ทดสอบ e2e กับ local แล้ว: login ผ่าน cookie, cookie ปลอม → null, error mapping, ban → login ไม่ได้, lift → login ได้

Stripe webhook (event ที่ sign เองกับ local dev server): signature ผิด → 400, unpaid → ไม่เติม, ยอดไม่ตรง → ปฏิเสธ + log, paid → เติม 1 ครั้ง, event ซ้ำ → ไม่เติมซ้ำ, expired หลังจ่ายแล้ว → ไม่ downgrade
- ยังไม่ได้ทดสอบกับ Stripe sandbox จริง (ยังไม่มี key) — `startCoinCheckout` ยังไม่เคยเรียก API จริง
