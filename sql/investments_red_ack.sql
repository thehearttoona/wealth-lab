-- "ซื้อเพิ่มแล้วรอบนี้" — ปิดแจ้งเตือน "ถึงคิวลงไม้" จนกว่าจะแดงครบรอบใหม่
-- รันที่ Supabase SQL editor · idempotent: รันซ้ำได้ไม่พัง
--
-- red_ack_count    : จำนวนแท่งแดงติดกัน ณ ตอนที่กดปิด (เช่น 2) — แดงต่อจนครบรอบถัดไป (4) จะเตือนใหม่
-- red_ack_streak_at: เวลาเปิดของแท่งแดง "แท่งแรก" ในสตรีคที่กดปิดไว้
--
-- ต้องมีสองคอลัมน์คู่กัน ไม่ใช่แค่นับแท่ง:
-- ถ้าเทียบด้วยจำนวนแท่งอย่างเดียว สตรีคใหม่ที่ยาวเท่ากันพอดี (แดง 2 วันอีกรอบ)
-- จะถูกนับว่าเป็นรอบเดิมที่ปิดไปแล้ว แล้วสัญญาณจริงจะหายไปเงียบ ๆ
--
-- ทั้งคู่เป็น null ได้ = ไม่ได้ปิดแจ้งเตือนไว้ (พฤติกรรมเดิม)
-- ยังไม่รันไฟล์นี้แอปก็ใช้งานได้ปกติ — investmentStorage จะตัดสองคอลัมน์นี้ทิ้งเองตอนบันทึก
-- (แต่ปุ่ม "ซื้อเพิ่มแล้ว" จะฟ้องให้มารันไฟล์นี้ก่อน)

alter table public.investments add column if not exists red_ack_count integer;
alter table public.investments add column if not exists red_ack_streak_at timestamptz;

-- กันค่าเพี้ยนจากการแก้ข้อมูลตรง ๆ ใน console (แอปตรวจให้อยู่แล้ว)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'investments_red_ack_count_check'
  ) then
    alter table public.investments
      add constraint investments_red_ack_count_check
      check (red_ack_count is null or red_ack_count >= 1);
  end if;
end $$;
