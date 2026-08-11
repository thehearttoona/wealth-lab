-- ค่าลดหย่อนแยกรายการ (ปีภาษี 2569)
-- เดิมเก็บเป็นก้อนเดียวใน extra_deductions ซึ่งกรอกเกินสิทธิ์ได้โดยไม่มีอะไรเตือน
-- ตอนนี้เก็บเป็น jsonb: { "rmf": 50000, "lifeInsurance": 20000, ... }
-- คีย์ตรงกับ DEDUCTION_ITEMS ใน src/types/tax.ts
--
-- extra_deductions เดิมยังอยู่และยังถูกเขียนต่อ (เป็นยอดรวมที่ derive มา)
-- แถวเก่าที่มีแต่ extra_deductions จะถูกอ่านเป็นคีย์ 'other' ให้อัตโนมัติ ไม่ต้อง migrate ข้อมูล
--
-- รันที่ Supabase SQL editor ครั้งเดียว (idempotent รันซ้ำได้)

alter table public.tax_profiles
  add column if not exists deductions jsonb;

comment on column public.tax_profiles.deductions is
  'ค่าลดหย่อนแยกรายการ คีย์ตรงกับ DEDUCTION_ITEMS ใน src/types/tax.ts — แหล่งความจริง ส่วน extra_deductions เป็นยอดรวมที่ derive มา';
