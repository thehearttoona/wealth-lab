-- ตาราง "รอบลงทุน" (cycle) — ตะกร้าไม้ที่เปิดพร้อมกันและปิดพร้อมกัน
-- รันที่ Supabase SQL editor / idempotent: รันซ้ำได้ไม่พัง
--
-- กลยุทธ์ที่ตารางนี้รองรับ: DCA ลงไม้ตอนราคาร่วง (กฎแท่งแดง) เรื่อย ๆ
-- แล้ว "ปิดทั้งตะกร้า" เมื่อกำไรรวมของรอบถึงเป้า จากนั้นเปิดรอบใหม่
--
-- ทำไมแยกเป็นตะกร้าตามประเภทสินทรัพย์ ไม่ใช่ตะกร้าเดียวทั้งพอร์ต:
--   1) ภาษี — กำไรหุ้นไทยยกเว้น แต่คริปโตไม่ยกเว้น ปิดรวมกันจะรับรู้ขาดทุนที่ใช้ประโยชน์ไม่ได้
--   2) ราคาเคลื่อนไหวคนละทาง — BTC วิ่งจนตะกร้าถึงเป้าจะลากให้ต้องปิดหุ้นที่ยังติดลบไปด้วย
-- (ถ้าอยากได้ตะกร้าเดียวจริง ๆ ก็สร้างแถวเดียว basket = 'all' ได้ โค้ดรองรับ)
--
-- id เป็น text เพราะแอปสร้าง id ด้วย Date.now().toString() เหมือนตารางอื่น

create table if not exists public.investment_cycles (
  id                    text primary key,
  user_id               uuid not null references auth.users (id) on delete cascade,
  -- ตะกร้า = ประเภทสินทรัพย์ ('crypto' | 'stock_th' | 'stock_foreign' | 'fund' | 'gold' | 'other')
  -- หรือ 'all' ถ้าตั้งใจใช้ตะกร้าเดียวรวมทั้งพอร์ต
  basket                text not null,
  -- รอบที่เท่าไหร่ของตะกร้านี้ — โชว์บนการ์ดและใช้อ่านประวัติ ("รอบที่ 3 ใช้ 91 วัน")
  cycle_no              integer not null default 1,
  -- เป้ากำไรรวม % คิดบน "ต้นทุนของรอบ" ไม่ใช่บนมูลค่าพอร์ต
  -- (ถ้าคิดบนมูลค่า การเติมไม้จะทำให้เป้าขยับเองโดยไม่มีเหตุผล)
  target_profit_percent numeric not null default 15,
  -- งบสูงสุดของรอบ (THB) — ตัวเลขที่สำคัญที่สุดของกลยุทธ์นี้
  -- กริดไม่ตายเพราะต้นทุนเฉลี่ยไม่ลง มันตายเพราะกระสุนหมดตอนติดลบมากสุด
  budget_thb            numeric,
  -- เพดานจำนวนไม้ต่อสินทรัพย์ในหนึ่งรอบ — กันการเติมไม้ไม่สิ้นสุดในของที่พังทางโครงสร้าง
  max_legs_per_symbol   integer,
  started_at            date not null default current_date,
  -- null = รอบที่ยังเปิดอยู่
  closed_at             date,
  -- สรุปตอนปิด: เก็บเป็น snapshot เพราะ realized_trades ย้อนคืนได้
  -- ถ้าไม่เก็บ ผลของรอบที่จบไปแล้วจะเปลี่ยนย้อนหลังเมื่อมีการแก้ประวัติ
  closed_invested_thb   numeric,
  closed_profit_thb     numeric,
  closed_days           integer,
  notes                 text,
  created_at            timestamptz not null default now()
);

-- เผื่อตารางมีอยู่แล้วแต่คอลัมน์ไม่ครบ
alter table public.investment_cycles add column if not exists cycle_no integer not null default 1;
alter table public.investment_cycles add column if not exists target_profit_percent numeric not null default 15;
alter table public.investment_cycles add column if not exists budget_thb numeric;
alter table public.investment_cycles add column if not exists max_legs_per_symbol integer;
alter table public.investment_cycles add column if not exists started_at date not null default current_date;
alter table public.investment_cycles add column if not exists closed_at date;
alter table public.investment_cycles add column if not exists closed_invested_thb numeric;
alter table public.investment_cycles add column if not exists closed_profit_thb numeric;
alter table public.investment_cycles add column if not exists closed_days integer;
alter table public.investment_cycles add column if not exists notes text;
alter table public.investment_cycles add column if not exists created_at timestamptz not null default now();

-- ⚠️ หนึ่งตะกร้ามี "รอบที่เปิดอยู่" ได้ทีละรอบเดียว
-- ถ้ามีสองรอบเปิดพร้อมกัน คำถามที่ตอบไม่ได้คือ "ไม้ที่ซื้อใหม่เข้ารอบไหน"
create unique index if not exists investment_cycles_open_per_basket
  on public.investment_cycles (user_id, basket) where closed_at is null;

create index if not exists investment_cycles_user_basket_idx
  on public.investment_cycles (user_id, basket, cycle_no desc);

-- ── ผูกไม้เข้ารอบ ──
-- nullable ตั้งใจ: null = "ไม่อยู่ในระบบรอบ" (ถือยาว) ซึ่งเป็นทางหนีที่ต้องมี
-- ไม่ใช่ทุกไม้ควรถูกปิดตามรอบ — ของที่เหตุผลซื้อพังต้องถอนออกจากตะกร้าได้
alter table public.investments add column if not exists cycle_id text;
create index if not exists investments_cycle_idx on public.investments (cycle_id);

-- realized_trades อาจยังไม่ถูกสร้าง (ยังไม่ได้รัน sql/realized_trades.sql) — ห้ามให้ไฟล์นี้พังทั้งไฟล์
do $$
begin
  if to_regclass('public.realized_trades') is not null then
    alter table public.realized_trades add column if not exists cycle_id text;
    create index if not exists realized_trades_cycle_idx on public.realized_trades (cycle_id);
  end if;
end $$;

-- ── RLS: เห็น/แก้ได้แค่ข้อมูลของตัวเอง (บล็อกเดียวกับตารางอื่นในโปรเจกต์) ──
alter table public.investment_cycles enable row level security;

drop policy if exists "investment_cycles_select_own" on public.investment_cycles;
create policy "investment_cycles_select_own" on public.investment_cycles
  for select using (auth.uid() = user_id);

drop policy if exists "investment_cycles_insert_own" on public.investment_cycles;
create policy "investment_cycles_insert_own" on public.investment_cycles
  for insert with check (auth.uid() = user_id);

drop policy if exists "investment_cycles_update_own" on public.investment_cycles;
create policy "investment_cycles_update_own" on public.investment_cycles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "investment_cycles_delete_own" on public.investment_cycles;
create policy "investment_cycles_delete_own" on public.investment_cycles
  for delete using (auth.uid() = user_id);
