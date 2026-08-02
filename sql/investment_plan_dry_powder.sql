-- เงินรอลงทุนที่จดเอง (dry powder) — เก็บไว้ในแผนลงทุนของผู้ใช้
-- รันครั้งเดียวที่ Supabase SQL editor รันซ้ำได้ ไม่พัง
alter table public.investment_plan
  add column if not exists dry_powder numeric;

-- วันที่จดยอดล่าสุด — ใช้เตือนว่า "ซื้อไปแล้วกี่รายการหลังจากจด" ให้กลับมาอัปเดตยอด
alter table public.investment_plan
  add column if not exists dry_powder_as_of date;

-- จดแยกหลายรายการได้ (เช่น แยกตามโบรก/แหล่งเงิน) — [{ id, label, amount, asOf }]
-- dry_powder ด้านบนยังเก็บ "ยอดรวม" ไว้เสมอ ส่วนที่คำนวณต่อ (ลงได้ครั้งละ/คำเตือน) จึงใช้ตัวเดิมได้
-- ไม่รันบรรทัดนี้ก็ยังจดได้ แต่จะได้ยอดรวมก้อนเดียว ไม่แยกรายการ
alter table public.investment_plan
  add column if not exists dry_powder_items jsonb;
