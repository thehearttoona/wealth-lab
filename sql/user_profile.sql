-- ข้อมูลส่วนตัว (1 แถวต่อ 1 ผู้ใช้) — เก็บ "ตัวเรา" ที่ข้ามปี
-- แยกจาก tax_profiles เพราะ tax_profiles เก็บของ "ปีภาษีนั้น"
-- ถ้ารวมกันจะต้องกรอกวันเกิด/จำนวนบุตรซ้ำใหม่ทุกปี
--
-- ⚠️ 5 คอลัมน์นี้ไม่ได้ใช้แล้ว: has_home_loan, is_social_security_member, has_provident_fund,
-- has_maternity_this_year, resident_in_thailand — ย้ายไป tax_profiles.year_facts เพราะเปลี่ยนได้ทุกปี
-- (ดู sql/tax_year_facts.sql) ยังไม่ drop ทิ้งเพื่อไม่ให้ข้อมูลเก่าหาย
--
-- รันที่ Supabase SQL editor ครั้งเดียว (idempotent รันซ้ำได้)

create table if not exists public.user_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date,
  marital_status text,
  spouse_has_income boolean,
  children_before_2561 integer,
  children_from_2561 integer,
  parents_supported integer,
  disabled_supported integer,
  has_home_loan boolean,
  is_social_security_member boolean,
  has_provident_fund boolean,
  has_maternity_this_year boolean,
  resident_in_thailand boolean,
  is_disabled boolean,
  notes text,
  updated_at timestamptz default now()
);

-- เผื่อเคยรันเวอร์ชันก่อนหน้าไปแล้ว (create table if not exists จะไม่เพิ่มคอลัมน์ให้)
alter table public.user_profile
  add column if not exists is_disabled boolean;

alter table public.user_profile enable row level security;

-- แยกข้อมูลรายผู้ใช้ 100% ด้วย RLS — โค้ดฝั่งอ่านไม่ได้ .eq('user_id') เอง
drop policy if exists "user_profile select own" on public.user_profile;
create policy "user_profile select own" on public.user_profile
  for select using (auth.uid() = user_id);

drop policy if exists "user_profile insert own" on public.user_profile;
create policy "user_profile insert own" on public.user_profile
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_profile update own" on public.user_profile;
create policy "user_profile update own" on public.user_profile
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_profile delete own" on public.user_profile;
create policy "user_profile delete own" on public.user_profile
  for delete using (auth.uid() = user_id);
