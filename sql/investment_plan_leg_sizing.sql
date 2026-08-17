-- ขนาดไม้ของเงินรอลงทุน
-- สูตร: ไม้ถัดไป = เงินทุนปัจจุบัน ÷ (จำนวนหุ้น × จำนวนครั้งต่อหุ้น)
--       จำนวนหุ้น = นับอัตโนมัติจากพอร์ต (ไม่เก็บลง DB)
--       จำนวนครั้งต่อหุ้น = powder_span_days ÷ powder_every_days
-- ตัวหารที่โค้ดใช้จริงคือ "ไม้ที่ยังเหลือ" = ไม้ทั้งก้อน − powder_legs_used
-- ตอนเริ่มก้อนสองอย่างนี้เท่ากัน แต่พอลงไม้แล้วมาแก้ยอดให้ตรงจริง ถ้าหารด้วยไม้ทั้งก้อนเสมอ
-- ตัวตั้งลดแต่ตัวหารไม่ลด ขนาดไม้จะหดลงเรื่อย ๆ และเงินไม่มีวันหมด (10 ไม้ใช้จริงแค่ 65%)
-- รันครั้งเดียวที่ Supabase SQL editor รันซ้ำได้ ไม่พัง

-- ลงไปแล้วกี่ไม้ในก้อนนี้ — ตัวนับที่กดเอง (เหมือนยอดเงินที่ไม่หักอัตโนมัติ)
alter table public.investment_plan
  add column if not exists powder_legs_used integer;

-- ทุนตั้งต้นของก้อน + วันที่เริ่มก้อน — คนละเรื่องกับ dry_powder (ยอดที่เหลือตอนนี้)
-- แก้ยอดให้ตรงจริง = ไม่แตะสองตัวนี้ / เติมเงินหรือเริ่มใหม่ = ตั้งใหม่ทั้งคู่แล้วรีเซ็ตตัวนับ
alter table public.investment_plan
  add column if not exists powder_base_thb numeric;

alter table public.investment_plan
  add column if not exists powder_started_at date;

-- ระยะห่างต่อไม้ (%) — ใช้แปลง "เหลือกี่ครั้งต่อหุ้น" เป็น "รับดิ่งได้อีกกี่ %"
alter table public.investment_plan
  add column if not exists powder_step_percent numeric;

-- ช่วงเวลาที่จะกระจายก้อนนี้ให้หมด (วัน) — "สไตล์" ของก้อน
-- 1 = ยิงทีเดียว (ไม้ละ เงินทุน ÷ จำนวนหุ้น) ... 365 = ทยอยทั้งปี
alter table public.investment_plan
  add column if not exists powder_span_days integer;

-- ซื้อทุกกี่วันในช่วงเวลานั้น — ครั้งต่อหุ้น = span ÷ every (อย่างน้อย 1)
alter table public.investment_plan
  add column if not exists powder_every_days integer;

-- เลิกใช้แล้ว (สูตรบันได/รูปแบบไล่ขนาดไม้ ถูกแทนด้วยสูตรด้านบน) แต่ไม่ drop ทิ้ง
-- เพราะการลบคอลัมน์ทำลายข้อมูลเก่าโดยไม่มีอะไรได้กลับมา — โค้ดแค่เลิกอ่าน/เลิกเขียน
alter table public.investment_plan
  add column if not exists powder_legs_planned integer;

alter table public.investment_plan
  add column if not exists powder_shape text;
