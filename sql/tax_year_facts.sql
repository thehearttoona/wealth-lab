-- ข้อเท็จจริงของปีภาษี (ผ่อนบ้าน / ม.33 / กองทุนสำรองเลี้ยงชีพ / ฝากครรภ์ / อยู่ไทย 180 วัน)
--
-- ทำไมย้ายมาที่นี่: 5 ข้อนี้เคยอยู่ใน user_profile ซึ่งเก็บแถวเดียวข้ามทุกปี
-- ผลคือปีถัดไปผ่อนบ้านหมดแล้วกดแก้ ข้อมูลของปีเก่าเปลี่ยนตามไปด้วยทั้งหมด
-- ตอนนี้ผูกกับปีภาษีเป็น jsonb: { "hasHomeLoan": true, "isSocialSecurityMember": false, ... }
-- คีย์ตรงกับ TaxYearFacts ใน src/types/tax.ts
--
-- คอลัมน์เดิมใน user_profile ไม่ได้ drop ทิ้ง (เผื่อย้อนดู/ย้อนกลับ) แต่โค้ดไม่อ่านแล้ว
--
-- รันที่ Supabase SQL editor ครั้งเดียว (idempotent รันซ้ำได้)

alter table public.tax_profiles
  add column if not exists year_facts jsonb;

comment on column public.tax_profiles.year_facts is
  'ข้อเท็จจริงรายปีที่ใช้ตัดสินสิทธิ์ลดหย่อน คีย์ตรงกับ TaxYearFacts ใน src/types/tax.ts — ไม่มีคีย์ = ยังไม่ตอบ ซึ่งต่างจาก false';

-- ── ย้ายค่าที่เคยกรอกไว้ใน user_profile มาที่ "ปีภาษีปัจจุบัน" เท่านั้น ──
-- ลงแค่ปีปัจจุบันโดยตั้งใจ: ค่าเดิมถูกกรอกตอนไหนไม่มีใครรู้ การเอาไปใส่ปีเก่าทุกปี
-- คือการเดาแทนผู้ใช้ ปีเก่าจึงปล่อยเป็น "ยังไม่ตอบ" ให้ไปตอบเองถ้าอยากย้อนดู
-- jsonb_strip_nulls ตัดข้อที่ยังไม่เคยตอบออก ไม่ให้ null กลายเป็น false
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'user_profile'
  ) then
    update public.tax_profiles t
    set year_facts = jsonb_strip_nulls(jsonb_build_object(
      'hasHomeLoan',             p.has_home_loan,
      'isSocialSecurityMember',  p.is_social_security_member,
      'hasProvidentFund',        p.has_provident_fund,
      'hasMaternity',            p.has_maternity_this_year,
      'residentInThailand',      p.resident_in_thailand
    ))
    from public.user_profile p
    where p.user_id = t.user_id
      and t.year = extract(year from now())::int + 543
      and t.year_facts is null;
  end if;
end $$;
