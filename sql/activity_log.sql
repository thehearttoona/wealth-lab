-- ตาราง "บันทึกความเคลื่อนไหว" (append-only audit log) — รันที่ Supabase SQL editor
-- idempotent: รันซ้ำได้ไม่พัง
--
-- ทำไมต้องมี: ก่อนหน้านี้แอปเก็บแต่ "สถานะปัจจุบัน" ฟีดในหน้าสรุปคำนวณสดจากแถวที่มีอยู่
-- พอแก้ราคาซื้อ อดีตถูกเขียนทับ พอลบรายการ เหตุการณ์หายไปจากอดีตด้วย
-- ตารางนี้เก็บ "เกิดอะไรขึ้นเมื่อไหร่" ไว้ต่างหาก เพื่อเอาไปคิดค่าเฉลี่ย/จังหวะ DCA/
-- เทียบว่าซื้อตามกฎแท่งแดงจริงไหม และเป็นไทม์ไลน์ให้ AI ประเมินทีหลัง
--
-- id เป็น text เพราะแอปสร้าง id ฝั่ง client (Date.now()+random) เหมือนตารางอื่นในโปรเจกต์
-- payload เป็น jsonb: create/update = snapshot หลังทำ, delete = snapshot ก่อนลบ
-- (เพิ่ม field ใหม่ในอนาคตจึงไม่ต้องแก้ SQL อีก — แก้แต่ mapper ฝั่งแอป)

create table if not exists public.activity_log (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  at         timestamptz not null default now(),
  entity     text not null,   -- investment | realized_trade | expense | income | ...
  entity_id  text,            -- id ของแถวที่ถูกทำ (bulk = ตัวแรก, ดูทั้งชุดใน payload)
  action     text not null,   -- create | update | delete
  summary    text,            -- ข้อความสั้นอ่านได้เลย ไม่ต้องแกะ payload
  payload    jsonb,
  created_at timestamptz not null default now()
);

-- เผื่อกรณีตารางมีอยู่แล้วแต่คอลัมน์ไม่ครบ
alter table public.activity_log add column if not exists at timestamptz not null default now();
alter table public.activity_log add column if not exists entity_id text;
alter table public.activity_log add column if not exists summary text;
alter table public.activity_log add column if not exists payload jsonb;
alter table public.activity_log add column if not exists created_at timestamptz not null default now();

-- อ่านย้อนหลังตามเวลา (คิวรีหลักของฟีเจอร์นี้)
create index if not exists activity_log_user_at_idx
  on public.activity_log (user_id, at desc);
-- ไล่ประวัติของรายการเดียว (เช่น ไม้นี้ถูกแก้อะไรมาบ้าง)
create index if not exists activity_log_entity_idx
  on public.activity_log (user_id, entity, entity_id);

-- ── RLS: เห็น/แก้ได้แค่ข้อมูลของตัวเอง (แบบเดียวกับตารางอื่นในโปรเจกต์) ──
alter table public.activity_log enable row level security;

drop policy if exists "activity_log_select_own" on public.activity_log;
create policy "activity_log_select_own" on public.activity_log
  for select using (auth.uid() = user_id);

drop policy if exists "activity_log_insert_own" on public.activity_log;
create policy "activity_log_insert_own" on public.activity_log
  for insert with check (auth.uid() = user_id);

-- log เป็น append-only ตามเจตนา แต่ยังให้ policy update/delete ไว้เหมือนตารางอื่น
-- (เผื่อต้องล้างข้อมูลทดสอบ / ลบตามคำขอเจ้าของข้อมูล) แอปไม่เรียกใช้สองอันนี้
drop policy if exists "activity_log_update_own" on public.activity_log;
create policy "activity_log_update_own" on public.activity_log
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "activity_log_delete_own" on public.activity_log;
create policy "activity_log_delete_own" on public.activity_log
  for delete using (auth.uid() = user_id);
