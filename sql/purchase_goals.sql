-- ตาราง "เป้าหมายของที่อยากได้" — ต้องทำกำไรที่ขายจริงให้ได้ N เท่าของราคาของก่อนจะซื้อได้
-- รันที่ Supabase SQL editor / idempotent: รันซ้ำได้ไม่พัง
-- id เป็น text เพราะแอปสร้าง id ด้วย Date.now().toString() เหมือนตาราง investments

create table if not exists public.purchase_goals (
  id           text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  price        numeric not null,
  currency     text not null default 'THB',
  -- ต้องทำกำไรกี่เท่าของราคาของ — ค่าเริ่มต้น 10 ตามกฎที่ตั้งไว้ แต่ปรับรายชิ้นได้
  multiplier   numeric not null default 10,
  -- ลำดับคิว: เลขน้อยมาก่อน และ "กินกำไร" ก่อนชิ้นที่อยู่ล่างกว่า
  sort_order   integer not null default 0,
  note         text,
  -- null = ยังไม่ซื้อ / มีค่า = ซื้อแล้ว (โควตากำไรของชิ้นนี้ถือว่าใช้ไปแล้ว)
  purchased_at timestamptz,
  created_at   timestamptz not null default now()
);

-- เผื่อกรณีตารางมีอยู่แล้วแต่คอลัมน์ไม่ครบ
alter table public.purchase_goals add column if not exists currency text not null default 'THB';
alter table public.purchase_goals add column if not exists multiplier numeric not null default 10;
alter table public.purchase_goals add column if not exists sort_order integer not null default 0;
alter table public.purchase_goals add column if not exists note text;
alter table public.purchase_goals add column if not exists purchased_at timestamptz;
alter table public.purchase_goals add column if not exists created_at timestamptz not null default now();

create index if not exists purchase_goals_user_order_idx
  on public.purchase_goals (user_id, sort_order);

-- ── RLS: เห็น/แก้ได้แค่ข้อมูลของตัวเอง (แบบเดียวกับตารางอื่นในโปรเจกต์) ──
alter table public.purchase_goals enable row level security;

drop policy if exists "purchase_goals_select_own" on public.purchase_goals;
create policy "purchase_goals_select_own" on public.purchase_goals
  for select using (auth.uid() = user_id);

drop policy if exists "purchase_goals_insert_own" on public.purchase_goals;
create policy "purchase_goals_insert_own" on public.purchase_goals
  for insert with check (auth.uid() = user_id);

drop policy if exists "purchase_goals_update_own" on public.purchase_goals;
create policy "purchase_goals_update_own" on public.purchase_goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "purchase_goals_delete_own" on public.purchase_goals;
create policy "purchase_goals_delete_own" on public.purchase_goals
  for delete using (auth.uid() = user_id);
