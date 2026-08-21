-- ตาราง "ค่าเสื่อมของชีวิต" — ของที่จะต้องจ่ายอีกแน่ ๆ แค่ยังไม่ถึงวัน
-- (โน้ตบุ๊ก 4 ปีครั้ง · ตรวจสุขภาพปีละครั้ง · ประกันรถปีละครั้ง)
-- รันที่ Supabase SQL editor / idempotent: รันซ้ำได้ไม่พัง
-- id เป็น text เพราะแอปสร้าง id ด้วย Date.now().toString() เหมือนตารางอื่น

create table if not exists public.life_costs (
  id            text primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  -- equipment | health | insurance | vehicle | home | other (ดู src/types/lifeCost.ts)
  kind          text not null default 'other',
  -- ยอดที่ต้องจ่ายเมื่อถึงรอบ (บาท)
  cost          numeric not null,
  -- ขายต่อได้เท่าไหร่ — หักออกก่อนเฉลี่ย เพราะเงินก้อนนี้ไม่ต้องเก็บใหม่
  salvage       numeric,
  -- รอบละกี่เดือน: โน้ตบุ๊ก 48 · ตรวจสุขภาพ 12 · ทำฟัน 6
  cycle_months  integer not null default 12,
  -- เริ่มรอบนี้เมื่อไหร่ = วันที่ซื้อ / วันที่ทำครั้งล่าสุด
  started_at    date not null,
  -- เก็บเงินไว้แล้วเท่าไหร่ — จดเอง ระบบไม่หักให้อัตโนมัติ (หลักการเดียวกับเงินรอลงทุน)
  reserved      numeric,
  note          text,
  created_at    timestamptz not null default now()
);

-- เผื่อกรณีตารางมีอยู่แล้วแต่คอลัมน์ไม่ครบ
alter table public.life_costs add column if not exists kind text not null default 'other';
alter table public.life_costs add column if not exists salvage numeric;
alter table public.life_costs add column if not exists cycle_months integer not null default 12;
alter table public.life_costs add column if not exists reserved numeric;
alter table public.life_costs add column if not exists note text;
alter table public.life_costs add column if not exists created_at timestamptz not null default now();

create index if not exists life_costs_user_idx on public.life_costs (user_id, created_at);

-- ── RLS: เห็น/แก้ได้แค่ข้อมูลของตัวเอง (ชุดเดียวกับตารางอื่นในโปรเจกต์) ──
alter table public.life_costs enable row level security;

drop policy if exists "life_costs_select_own" on public.life_costs;
create policy "life_costs_select_own" on public.life_costs
  for select using (auth.uid() = user_id);

drop policy if exists "life_costs_insert_own" on public.life_costs;
create policy "life_costs_insert_own" on public.life_costs
  for insert with check (auth.uid() = user_id);

drop policy if exists "life_costs_update_own" on public.life_costs;
create policy "life_costs_update_own" on public.life_costs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "life_costs_delete_own" on public.life_costs;
create policy "life_costs_delete_own" on public.life_costs
  for delete using (auth.uid() = user_id);
