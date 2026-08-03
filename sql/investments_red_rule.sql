-- กฎ "ถึงคิวลงไม้" ตั้งแยกรายตัวได้ — รันที่ Supabase SQL editor
-- idempotent: รันซ้ำได้ไม่พัง
--
-- red_interval: กรอบเวลาแท่งเทียนที่ใช้นับ — 'day' | 'week' | 'month'
-- red_every   : เตือนเมื่อแดงติดกันครบทุก ๆ N แท่ง (N, 2N, 3N…)
--
-- ทั้งคู่เป็น null ได้ = ใช้ค่าเริ่มต้นของแอป (รายวัน / ทุก 2 แท่ง) ซึ่งเป็นพฤติกรรมเดิม
-- ยังไม่รันไฟล์นี้แอปก็ใช้งานได้ปกติ — investmentStorage จะตัดสองคอลัมน์นี้ทิ้งเองตอนบันทึก

alter table public.investments add column if not exists red_interval text;
alter table public.investments add column if not exists red_every integer;

-- กันค่าเพี้ยนจากการแก้ข้อมูลตรง ๆ ใน console (แอปตรวจให้อยู่แล้ว)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'investments_red_interval_check'
  ) then
    alter table public.investments
      add constraint investments_red_interval_check
      check (red_interval is null or red_interval in ('day', 'week', 'month'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'investments_red_every_check'
  ) then
    alter table public.investments
      add constraint investments_red_every_check
      check (red_every is null or (red_every >= 1 and red_every <= 12));
  end if;
end $$;
