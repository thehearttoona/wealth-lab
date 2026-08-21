-- ประวัติสัญญาณ "ถึงคิวลงไม้" (กฎแท่งแดงติดกันครบรอบ)
-- รันที่ Supabase SQL editor · idempotent: รันซ้ำได้ไม่พัง
--
-- ทำไมต้องมีตาราง ไม่ใช่คิดสด ๆ จาก API:
--   แท่งเทียนย้อนหลังยังดึงได้ แต่ "บริบทตอนนั้น" ดึงย้อนหลังไม่ได้เลย — เงินต่อไม้ตามแผน
--   วันนั้น, รอบที่เปิดอยู่, ชนเพดานไม้ของสินทรัพย์นั้นหรือยัง, และเราลงจริงไหม
--   นี่คือของที่หายไปทุกครั้งที่สตรีคขาด และเป็นของที่ต้องใช้ตอบว่า
--   "แผนที่ตั้งไว้แคบเกินไปหรือเปล่า" กับ "เราทำตามกฎตัวเองกี่ %"
--
-- id เป็น text เพราะแอปสร้าง id ด้วย Date.now().toString() เหมือนตารางอื่นในโปรเจกต์

create table if not exists public.red_signals (
  id              text primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  -- ⚠️ กันบันทึกซ้ำ: หน้าพอร์ตเช็คแท่งเทียนใหม่ทุกครั้งที่โฟกัส + auto refresh ทุก 5 นาที
  -- ไม่มีคีย์นี้ สัญญาณเดียวจะกลายเป็นหลายสิบแถวในวันเดียว (ดู utils/redSignalLog#buildRedSignalKey)
  signal_key      text not null,
  -- ไม้ที่ทำให้สัญญาณถูกบันทึก — ไม่มี FK ตั้งใจ: ขายไม้ทิ้ง/ลบไม้ ประวัติต้องอยู่ต่อ
  investment_id   text,
  asset_type      text not null,
  symbol          text not null default '',
  name            text not null default '',
  -- กฎที่ใช้ ณ ตอนนั้น — เก็บเป็น snapshot เพราะกฎรายตัวแก้ทีหลังได้
  -- ('day' | 'week' | 'month' + ทุก ๆ กี่แท่ง) ไม่เก็บ ประวัติเก่าจะถูกอ่านด้วยกฎใหม่
  red_interval    text not null default 'day',
  red_every       integer not null default 2,
  red_count       integer not null default 0,
  -- สัญญาณครั้งที่เท่าไหร่ของสตรีคนี้ (แดง 2 = 1, แดง 4 = 2)
  round_no        integer not null default 1,
  drop_percent    numeric not null default 0,
  -- ราคาต่ำสุดที่ลงไปแตะในสตรีค + สกุลของมัน — เลขที่เอาไปตั้ง limit ได้จริง
  low_price       numeric,
  low_currency    text,
  currency        text not null default 'THB',
  streak_start_at timestamptz,
  fired_at        timestamptz not null default now(),
  -- ── "เข้าได้/เข้าไม่ได้" ตอนสัญญาณเกิด (จาก utils/cycles#canAddLeg) ──
  -- null = ไม้นี้ไม่อยู่ในรอบ จึงไม่มีกฎของรอบมากั้น — สามสถานะ ไม่ใช่สอง
  enterable       boolean,
  blocked_reason  text,
  cycle_id        text,
  cycle_no        integer,
  -- เงินต่อไม้ตามแผน ณ ตอนนั้น (THB) — แผนเปลี่ยนทีหลังประวัติต้องไม่เปลี่ยนตาม
  plan_leg_thb    numeric,
  -- 'pending' (ยังไม่บันทึกผล) | 'taken' (ลงไม้แล้ว) | 'skipped' (ปล่อยผ่าน)
  -- ค่าเริ่มต้นต้องเป็น pending ไม่ใช่ skipped: "ยังไม่บันทึก" ไม่เท่ากับ "ตั้งใจไม่ลง"
  outcome         text not null default 'pending',
  acted_at        timestamptz,
  note            text,
  created_at      timestamptz not null default now()
);

-- เผื่อตารางมีอยู่แล้วแต่คอลัมน์ไม่ครบ
alter table public.red_signals add column if not exists investment_id text;
alter table public.red_signals add column if not exists asset_type text not null default 'other';
alter table public.red_signals add column if not exists symbol text not null default '';
alter table public.red_signals add column if not exists name text not null default '';
alter table public.red_signals add column if not exists red_interval text not null default 'day';
alter table public.red_signals add column if not exists red_every integer not null default 2;
alter table public.red_signals add column if not exists red_count integer not null default 0;
alter table public.red_signals add column if not exists round_no integer not null default 1;
alter table public.red_signals add column if not exists drop_percent numeric not null default 0;
alter table public.red_signals add column if not exists low_price numeric;
alter table public.red_signals add column if not exists low_currency text;
alter table public.red_signals add column if not exists currency text not null default 'THB';
alter table public.red_signals add column if not exists streak_start_at timestamptz;
alter table public.red_signals add column if not exists fired_at timestamptz not null default now();
alter table public.red_signals add column if not exists enterable boolean;
alter table public.red_signals add column if not exists blocked_reason text;
alter table public.red_signals add column if not exists cycle_id text;
alter table public.red_signals add column if not exists cycle_no integer;
alter table public.red_signals add column if not exists plan_leg_thb numeric;
alter table public.red_signals add column if not exists outcome text not null default 'pending';
alter table public.red_signals add column if not exists acted_at timestamptz;
alter table public.red_signals add column if not exists note text;
alter table public.red_signals add column if not exists created_at timestamptz not null default now();

-- ⚠️ หัวใจของตารางนี้ — upsert ของแอปใช้คอลัมน์คู่นี้เป็น onConflict
-- ไม่มี index นี้ upsert จะ error และประวัติจะบันทึกซ้ำทุกครั้งที่เปิดหน้าพอร์ต
create unique index if not exists red_signals_key_uniq
  on public.red_signals (user_id, signal_key);

create index if not exists red_signals_user_fired_idx
  on public.red_signals (user_id, fired_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'red_signals_outcome_check') then
    alter table public.red_signals
      add constraint red_signals_outcome_check
      check (outcome in ('pending', 'taken', 'skipped'));
  end if;
end $$;

-- ── RLS: เห็น/แก้ได้แค่ข้อมูลของตัวเอง (บล็อกเดียวกับตารางอื่นในโปรเจกต์) ──
alter table public.red_signals enable row level security;

drop policy if exists "red_signals_select_own" on public.red_signals;
create policy "red_signals_select_own" on public.red_signals
  for select using (auth.uid() = user_id);

drop policy if exists "red_signals_insert_own" on public.red_signals;
create policy "red_signals_insert_own" on public.red_signals
  for insert with check (auth.uid() = user_id);

drop policy if exists "red_signals_update_own" on public.red_signals;
create policy "red_signals_update_own" on public.red_signals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "red_signals_delete_own" on public.red_signals;
create policy "red_signals_delete_own" on public.red_signals
  for delete using (auth.uid() = user_id);
