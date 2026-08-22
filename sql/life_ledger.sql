-- ตาราง "บัญชีให้พอร์ตจ่ายชีวิต" — ค่าใช้จ่ายสะสมรายเดือนที่กำไรจากการขายต้องจ่ายคืน
-- หนึ่งแถว = หนึ่งเดือนที่จดไว้ (ค่าเสื่อม + ค่าใช้จ่ายประจำของเดือนนั้น)
-- รันที่ Supabase SQL editor / idempotent: รันซ้ำได้ไม่พัง
-- id เป็น text เพราะแอปสร้าง id ด้วย Date.now().toString() เหมือนตารางอื่น

create table if not exists public.life_ledger (
  id               text primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  -- 'YYYY-MM' เก็บเป็น text ไม่ใช่ date เพราะบัญชีนี้ไม่มีอะไรถึงกำหนดเป็นวัน ๆ
  -- (และ text แบบ zero-padded เรียงตามเวลาได้เองอยู่แล้ว)
  month            text not null,
  -- ค่าเสื่อมของเดือนนั้น (ยอดที่ต้องกันตาม src/utils/lifeCost.ts)
  depreciation_thb numeric not null default 0,
  -- ค่าใช้จ่ายประจำของเดือนนั้น (บิลที่กรอกจริง ไม่ใช่ยอดอ้างอิงใน recurring_bills.amount)
  bills_thb        numeric not null default 0,
  note             text,
  recorded_at      timestamptz not null default now()
);

-- เผื่อกรณีตารางมีอยู่แล้วแต่คอลัมน์ไม่ครบ
alter table public.life_ledger add column if not exists depreciation_thb numeric not null default 0;
alter table public.life_ledger add column if not exists bills_thb numeric not null default 0;
alter table public.life_ledger add column if not exists note text;
alter table public.life_ledger add column if not exists recorded_at timestamptz not null default now();

-- ── หัวใจของตารางนี้: หนึ่งคน หนึ่งเดือน หนึ่งแถว ──
-- ไม่มีคีย์นี้ กดจดเดือนเดิมซ้ำจะได้สองแถว แล้วยอดสะสมจะเด้งขึ้นเป็นเท่าตัวเงียบ ๆ
-- (เหตุผลเดียวกับ red_signals_key_uniq — ดู sql/red_signals.sql)
create unique index if not exists life_ledger_month_uniq on public.life_ledger (user_id, month);
create index if not exists life_ledger_user_idx on public.life_ledger (user_id, month);

-- ── RLS: เห็น/แก้ได้แค่ข้อมูลของตัวเอง (ชุดเดียวกับตารางอื่นในโปรเจกต์) ──
alter table public.life_ledger enable row level security;

drop policy if exists "life_ledger_select_own" on public.life_ledger;
create policy "life_ledger_select_own" on public.life_ledger
  for select using (auth.uid() = user_id);

drop policy if exists "life_ledger_insert_own" on public.life_ledger;
create policy "life_ledger_insert_own" on public.life_ledger
  for insert with check (auth.uid() = user_id);

drop policy if exists "life_ledger_update_own" on public.life_ledger;
create policy "life_ledger_update_own" on public.life_ledger
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "life_ledger_delete_own" on public.life_ledger;
create policy "life_ledger_delete_own" on public.life_ledger
  for delete using (auth.uid() = user_id);
