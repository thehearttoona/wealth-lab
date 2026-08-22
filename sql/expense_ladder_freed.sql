-- ตาราง "ขั้นบันไดที่ปลดจริงแล้ว" — คนกดยืนยันเอง ระบบไม่ติ๊กให้
--
-- ทำไมต้องมีตารางแยก: บันไดเป็นมุมมองคร่อมสองตาราง (life_costs + recurring_bills)
-- สถานะของบันไดจึงเป็นของบันได ไม่ใช่ของรายการต้นทาง — ถ้าไปแปะคอลัมน์ทั้งสองที่
-- จะได้ความจริงสองชุดที่หลุดจากกันได้ และ recurring_bills เป็นตารางฐานที่ไม่มี SQL ในรีโป
--
-- ⚠️ ตารางนี้ **ไม่ใช่ input ของคณิตบันได** — ทุนที่ต้องมี/ขั้นที่ถึงแล้ว คิดจากมูลค่าพอร์ต
-- อย่างเดียว (ดู utils/expenseLadder.ts) ตารางนี้บันทึกแค่ "โลกจริงเกิดขึ้นแล้ว"
-- ถ้าเอาไปคุมคณิต ขั้นที่ถึงแล้วแต่ยังไม่กดจะทำให้ลำดับสะสมขาดกลาง
--
-- รันที่ Supabase SQL editor / idempotent: รันซ้ำได้ไม่พัง

create table if not exists public.expense_ladder_freed (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- 'life_cost' | 'bill' — ต้องเก็บด้วย เพราะ id ของสองตารางอาจชนกันได้
  item_kind  text not null,
  item_id    text not null,
  -- ปลดจริงวันไหน (วันที่คนกดยืนยัน) — ประทับครั้งเดียว ยกเลิกได้ด้วยการลบแถว
  freed_at   date not null,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.expense_ladder_freed add column if not exists note text;
alter table public.expense_ladder_freed add column if not exists created_at timestamptz not null default now();

-- หนึ่งคน หนึ่งรายการ หนึ่งแถว — กดซ้ำต้องทับ ไม่ใช่งอกแถวใหม่
create unique index if not exists expense_ladder_freed_item_uniq
  on public.expense_ladder_freed (user_id, item_kind, item_id);

-- ── RLS: เห็น/แก้ได้แค่ข้อมูลของตัวเอง (ชุดเดียวกับตารางอื่นในโปรเจกต์) ──
alter table public.expense_ladder_freed enable row level security;

drop policy if exists "expense_ladder_freed_select_own" on public.expense_ladder_freed;
create policy "expense_ladder_freed_select_own" on public.expense_ladder_freed
  for select using (auth.uid() = user_id);

drop policy if exists "expense_ladder_freed_insert_own" on public.expense_ladder_freed;
create policy "expense_ladder_freed_insert_own" on public.expense_ladder_freed
  for insert with check (auth.uid() = user_id);

drop policy if exists "expense_ladder_freed_update_own" on public.expense_ladder_freed;
create policy "expense_ladder_freed_update_own" on public.expense_ladder_freed
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "expense_ladder_freed_delete_own" on public.expense_ladder_freed;
create policy "expense_ladder_freed_delete_own" on public.expense_ladder_freed
  for delete using (auth.uid() = user_id);
