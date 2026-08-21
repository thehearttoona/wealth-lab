-- ตาราง "เป้าหมายใหญ่สุดของชีวิต" — บันไดเงินก้อนที่ตั้งเป็นด่าน ๆ
-- วัดจากความมั่งคั่งสุทธิ (พอร์ต + เงินสด − หนี้) ไม่ใช่เฉพาะมูลค่าพอร์ต
-- รันที่ Supabase SQL editor / idempotent: รันซ้ำได้ไม่พัง

create table if not exists public.life_goals (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  -- ยอดความมั่งคั่งสุทธิที่ถือว่าผ่านด่านนี้ (บาท)
  target_thb  numeric not null,
  -- ลำดับด่าน เลขน้อยมาก่อน
  level       integer not null default 0,
  -- null = ยังไม่ผ่าน / มีค่า = ผ่านแล้ววันไหน
  -- ประทับครั้งเดียวแล้วอยู่อย่างนั้น: ยอดตกทีหลังห้ามถอยด่าน (ดู utils/lifeGoal.ts)
  achieved_at date,
  note        text,
  created_at  timestamptz not null default now()
);

-- เผื่อกรณีตารางมีอยู่แล้วแต่คอลัมน์ไม่ครบ
alter table public.life_goals add column if not exists level integer not null default 0;
alter table public.life_goals add column if not exists achieved_at date;
alter table public.life_goals add column if not exists note text;
alter table public.life_goals add column if not exists created_at timestamptz not null default now();

create index if not exists life_goals_user_level_idx on public.life_goals (user_id, level);

-- ── RLS: เห็น/แก้ได้แค่ข้อมูลของตัวเอง (ชุดเดียวกับตารางอื่นในโปรเจกต์) ──
alter table public.life_goals enable row level security;

drop policy if exists "life_goals_select_own" on public.life_goals;
create policy "life_goals_select_own" on public.life_goals
  for select using (auth.uid() = user_id);

drop policy if exists "life_goals_insert_own" on public.life_goals;
create policy "life_goals_insert_own" on public.life_goals
  for insert with check (auth.uid() = user_id);

drop policy if exists "life_goals_update_own" on public.life_goals;
create policy "life_goals_update_own" on public.life_goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "life_goals_delete_own" on public.life_goals;
create policy "life_goals_delete_own" on public.life_goals
  for delete using (auth.uid() = user_id);
