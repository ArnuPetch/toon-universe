# Feature Scope

บัญชีเดียวใช้ได้ทั้งฝั่ง reader และ uploader
โครงสร้างผลงาน: เรื่อง → Season (optional) → ตอน → หน้า

## Reader

- **Reading modes** — vertical scroll (manhwa) / page flip (manga) / left-to-right หรือ right-to-left; จำค่าแยกตามเรื่อง
- **Reading history / Continue reading** — กลับไปหน้าที่ค้างไว้, sync ข้ามอุปกรณ์
- **Bookshelf / Bookmark** — แยกหมวด: กำลังอ่าน, อ่านจบ, อยากอ่าน
- **New episode notification** — แจ้งเตือนตอนใหม่ของเรื่องที่ติดตาม (in-web notification)
- **Search & filter** — ตามแนว (genre), สถานะ (จบ/ยังไม่จบ), ฟรี/เสียเงิน, ยอดนิยม
- **Comments** — รายตอนและรายเรื่อง, มีปุ่มซ่อน spoiler
- **Rating & review** — ทั้งรายตอนและรายเรื่อง
- **Recommendation** — "คนที่อ่านเรื่องนี้ก็อ่าน..."
- **Data saver mode** — เลือกคุณภาพรูป และ preload ตอนถัดไปล่วงหน้า
- **Ranking** — แยกตาม: ยอดวิว, คะแนนรีวิว, มาใหม่/อัพเดตล่าสุด, กำลังมาแรง; รายวัน / รายสัปดาห์ / รายเดือน
- **Access period** — ซื้อตอนแล้วอ่านได้ 30 วัน หมดอายุแล้วต้องซื้อใหม่
- **Age rating** — ผู้ใช้กรอกวันเกิดเอง ใช้ตรวจสิทธิ์อ่านเรื่องเรตผู้ใหญ่

## Uploader

- **Upload multiple files / zip** — เรียงหน้าให้อัตโนมัติ
- **Scheduled release** — ตั้งเวลาปล่อยตอนล่วงหน้า
- **Season** — เพิ่มได้, ไม่บังคับ
- **Genre & age rating** — เลือกได้หลายแนวต่อเรื่อง และกำหนดเรตอายุ
- **Per-episode pricing**
  - ตั้งได้อิสระเป็นจำนวนเต็มของ coin (ตอนฟรี = 0) เช่น ตอนแรกๆ ฟรี ตอนหลังเสีย coin
  - เปลี่ยนราคาได้เดือนละ 1 ครั้ง
  - ราคาใหม่ไม่กระทบคนที่ซื้อไปแล้ว; การซื้อซ้ำหลังหมดอายุใช้ราคาใหม่
- **Stats dashboard** — ยอดวิว, ยอดซื้อ, ผู้ติดตาม, รายได้
- **Withdraw earnings** เป็นเงินจริง (เงื่อนไขดู [coin-and-revenue.md](coin-and-revenue.md))
- **Automatic watermark** บนรูป กันขโมยงาน
- **Verified badge** สำหรับผู้เขียนหรือสำนักพิมพ์ที่มีลิขสิทธิ์

## Admin

- **Content review** — ปิดผลงานชั่วคราวเพื่อตรวจสอบได้; ระหว่างปิด:
  - ชดเชย access period ให้ reader เท่าเวลาที่ปิด
  - ขยายเวลารอถอนของ uploader เท่ากัน
- **Report management** — ดูรายงาน, ซ่อนคอมเมนต์/รีวิว, แบนหรือระงับผู้ใช้
- **Approve withdrawal requests**
- **Grant verified badge**

## Report System

- **Report content (ผลงาน)** — ละเมิดลิขสิทธิ์, เนื้อหาไม่เหมาะสม, เรตอายุผิด, spam
- **Report comment / review** — spam, คำหยาบหรือคุกคาม, spoiler ไม่ซ่อน
- **Report user** — บัญชีปลอม, แอบอ้างตัวตน
