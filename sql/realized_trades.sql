-- ตารางเก็บ "การขายที่เกิดขึ้นจริง" (realized) — รันที่ Supabase SQL editor
-- idempotent: รันซ้ำได้ไม่พัง
-- id เป็น text เพราะแอปสร้าง id ด้วย Date.now().toString() เหมือนตาราง investments

create table if not exists public.realized_trades (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  symbol      text not null,
  name        text,
  asset_type  text not null,
  currency    text not null default 'THB',
  quantity    numeric not null,
  buy_price   numeric not null,
  sell_price  numeric not null,
  buy_date    date not null,
  sell_date   date not null,
  fees        numeric default 0,
  notes       text,
  created_at  timestamptz not null default now()
);

-- เผื่อกรณีตารางมีอยู่แล้วแต่คอลัมน์ไม่ครบ
alter table public.realized_trades add column if not exists name text;
alter table public.realized_trades add column if not exists currency text not null default 'THB';
alter table public.realized_trades add column if not exists fees numeric default 0;
alter table public.realized_trades add column if not exists notes text;
alter table public.realized_trades add column if not exists created_at timestamptz not null default now();

create index if not exists realized_trades_user_sell_date_idx
  on public.realized_trades (user_id, sell_date desc);

-- ── RLS: เห็น/แก้ได้แค่ข้อมูลของตัวเอง (แบบเดียวกับตารางอื่นในโปรเจกต์) ──
alter table public.realized_trades enable row level security;

drop policy if exists "realized_trades_select_own" on public.realized_trades;
create policy "realized_trades_select_own" on public.realized_trades
  for select using (auth.uid() = user_id);

drop policy if exists "realized_trades_insert_own" on public.realized_trades;
create policy "realized_trades_insert_own" on public.realized_trades
  for insert with check (auth.uid() = user_id);

drop policy if exists "realized_trades_update_own" on public.realized_trades;
create policy "realized_trades_update_own" on public.realized_trades
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "realized_trades_delete_own" on public.realized_trades;
create policy "realized_trades_delete_own" on public.realized_trades
  for delete using (auth.uid() = user_id);
