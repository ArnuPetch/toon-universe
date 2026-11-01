# Next.js ↔ Supabase (`src/lib/`)

## Supabase clients

| ไฟล์ | ใช้ที่ไหน | สิทธิ์ |
|---|---|---|
| `supabase/client.ts` | Browser | anon key + session ผู้ใช้ |
| `supabase/server.ts` | Server Components / Server Actions | session ผู้ใช้ → RLS |
| `supabase/admin.ts` | Server เท่านั้น (`server-only`) | `service_role`, env `SUPABASE_SECRET_KEY` (ห้ามใช้ prefix `NEXT_PUBLIC_`) |

## Proxy

- `src/proxy.ts` (Next 16 เปลี่ยน middleware → proxy) refresh token ด้วย `getClaims()` — เป็นที่เดียวที่ refresh

## Server helpers

- `server/auth.ts`: `getClaims` (cache ต่อ request), `requireUserId`, `requireAdminId` (เช็ค `app_metadata.role`)
- `server/rpc.ts`: wrapper ทุก RPC (ดู [database.md](database.md))
  - **ดึง id จาก session เอง ไม่รับจาก caller**
  - คืน `ActionResult` (`{ok,data}` / `{ok:false,code,message}`) ไม่ throw
- `server/errors.ts`: map error code → ข้อความภาษาไทย
  - เพิ่ม code ใหม่ใน SQL ต้องเพิ่มที่นี่ด้วย
  - code ที่ไม่รู้จัก → `unexpected_error` + log

## Ban / lift กับ Supabase Auth

- `banUser`: เรียก RPC ก่อน แล้วค่อย Auth ban (`ban_duration`)
  - ถ้า Auth ban ล้มเหลวคืน `session_revoked: false` → เรียก `syncAuthBan` ซ้ำ
- `liftSanction`: ปลด Auth ban เมื่อ status ไม่ใช่ banned

## Types & Env

- Types: `npm run db:types` → `src/lib/supabase/database.types.ts` (รันใหม่ทุกครั้งที่แก้ schema)
- Env: ดู `.env.example`

## Tests

ทดสอบ e2e กับ local แล้ว: login ผ่าน cookie, cookie ปลอม → null, error mapping, ban → login ไม่ได้, lift → login ได้
