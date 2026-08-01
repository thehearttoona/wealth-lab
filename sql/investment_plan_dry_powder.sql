-- เงินรอลงทุนที่จดเอง (dry powder) — เก็บไว้ในแผนลงทุนของผู้ใช้
-- รันครั้งเดียวที่ Supabase SQL editor รันซ้ำได้ ไม่พัง
alter table public.investment_plan
  add column if not exists dry_powder numeric;

-- วันที่จดยอดล่าสุด — ใช้เตือนว่า "ซื้อไปแล้วกี่รายการหลังจากจด" ให้กลับมาอัปเดตยอด
alter table public.investment_plan
  add column if not exists dry_powder_as_of date;
