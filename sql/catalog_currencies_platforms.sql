-- รายการสกุลเงิน + แพลตฟอร์มการลงทุนที่ผู้ใช้จัดการเอง — รันที่ Supabase SQL editor
-- idempotent: รันซ้ำได้ไม่พัง
-- id เป็น text เพราะแอปสร้าง id ด้วย Date.now().toString() เหมือนตารางอื่น

-- ── สกุลเงิน ──
create table if not exists public.user_currencies (
  id           text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  code         text not null,          -- THB, USD, ...
  symbol       text,                   -- ฿, $, €
  rate_to_thb  numeric,                -- 1 หน่วย = กี่บาท (null = ยังไม่ตั้ง จะคิดเป็น 1:1)
  created_at   timestamptz not null default now()
);

-- ห้ามมีโค้ดซ้ำในผู้ใช้คนเดียวกัน
create unique index if not exists user_currencies_user_code_idx
  on public.user_currencies (user_id, code);

alter table public.user_currencies enable row level security;

drop policy if exists "user_currencies_select_own" on public.user_currencies;
create policy "user_currencies_select_own" on public.user_currencies
  for select using (auth.uid() = user_id);

drop policy if exists "user_currencies_insert_own" on public.user_currencies;
create policy "user_currencies_insert_own" on public.user_currencies
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_currencies_update_own" on public.user_currencies;
create policy "user_currencies_update_own" on public.user_currencies
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_currencies_delete_own" on public.user_currencies;
create policy "user_currencies_delete_own" on public.user_currencies
  for delete using (auth.uid() = user_id);

-- ── แพลตฟอร์มการลงทุน ──
create table if not exists public.user_platforms (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

create unique index if not exists user_platforms_user_name_idx
  on public.user_platforms (user_id, name);

alter table public.user_platforms enable row level security;

drop policy if exists "user_platforms_select_own" on public.user_platforms;
create policy "user_platforms_select_own" on public.user_platforms
  for select using (auth.uid() = user_id);

drop policy if exists "user_platforms_insert_own" on public.user_platforms;
create policy "user_platforms_insert_own" on public.user_platforms
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_platforms_update_own" on public.user_platforms;
create policy "user_platforms_update_own" on public.user_platforms
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_platforms_delete_own" on public.user_platforms;
create policy "user_platforms_delete_own" on public.user_platforms
  for delete using (auth.uid() = user_id);
