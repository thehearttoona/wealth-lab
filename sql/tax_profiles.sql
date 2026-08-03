-- ข้อมูลภาษีเงินได้บุคคลธรรมดา 1 แถวต่อ 1 ปีภาษี (พ.ศ.) ต่อ 1 ผู้ใช้
-- รันที่ Supabase SQL editor 1 ครั้ง — idempotent รันซ้ำได้ไม่พัง
create table if not exists public.tax_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  year integer not null,                        -- ปีภาษี พ.ศ. เช่น 2569
  monthly_salary numeric not null default 0,
  salary_months integer not null default 12,
  bonus numeric not null default 0,
  other_income numeric not null default 0,
  social_security numeric not null default 0,
  withheld numeric not null default 0,          -- ภาษีหัก ณ ที่จ่ายทั้งปี
  extra_deductions numeric not null default 0,  -- ลดหย่อนอื่นรวมก้อนเดียว
  gain_rules jsonb,                             -- กฎกำไรขายรายชนิด (null = ใช้ค่าเริ่มต้นในแอป)
  remitted_ratio numeric,                       -- สัดส่วนกำไรต่างประเทศที่นำเงินเข้าไทย (0–1)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tax_profiles_user_year_unique unique (user_id, year)
);

-- เผื่อรันบนตารางที่สร้างไว้ก่อนหน้าแล้วยังไม่มีคอลัมน์เหล่านี้
alter table public.tax_profiles add column if not exists gain_rules jsonb;
alter table public.tax_profiles add column if not exists remitted_ratio numeric;
alter table public.tax_profiles add column if not exists extra_deductions numeric not null default 0;

create index if not exists tax_profiles_user_year_idx on public.tax_profiles (user_id, year desc);

-- RLS: เห็นและแก้ได้แค่แถวของตัวเอง (แบบเดียวกับตารางอื่นในโปรเจกต์)
alter table public.tax_profiles enable row level security;

drop policy if exists "tax_profiles_select_own" on public.tax_profiles;
create policy "tax_profiles_select_own" on public.tax_profiles
  for select using (auth.uid() = user_id);

drop policy if exists "tax_profiles_insert_own" on public.tax_profiles;
create policy "tax_profiles_insert_own" on public.tax_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "tax_profiles_update_own" on public.tax_profiles;
create policy "tax_profiles_update_own" on public.tax_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "tax_profiles_delete_own" on public.tax_profiles;
create policy "tax_profiles_delete_own" on public.tax_profiles
  for delete using (auth.uid() = user_id);
