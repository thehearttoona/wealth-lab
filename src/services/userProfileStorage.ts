import { supabase, getUserId } from './supabase';
import { UserProfile, MaritalStatus } from '../types/userProfile';

// ข้อมูลส่วนตัว 1 แถวต่อ 1 ผู้ใช้ (singleton) — แพตเทิร์นเดียวกับ investment_plan / portfolio_goals
// คือ .maybeSingle() + upsert ไม่ใช่ list
// ต้องรัน sql/user_profile.sql ที่ Supabase ก่อน 1 ครั้ง

const numOrUndef = (v: any): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const boolOrUndef = (v: any): boolean | undefined =>
  v === null || v === undefined ? undefined : Boolean(v);

// ⚠️ mapper สองทางต้องแก้คู่กันเสมอ — เพิ่มฟิลด์ที่เดียวจะหายเงียบ ๆ ทั้งตอนบันทึกและตอนอ่าน
//
// คอลัมน์รายปีเดิม (has_home_loan / is_social_security_member / has_provident_fund /
// has_maternity_this_year / resident_in_thailand) ยังอยู่ในตารางแต่ไม่ถูกอ่านหรือเขียนแล้ว
// ย้ายไป tax_profiles.year_facts เพราะทุกข้อเปลี่ยนได้ทุกปี (ดู TaxYearFacts ใน types/tax.ts)
// ไม่ได้ drop คอลัมน์ทิ้งเพื่อไม่ให้ข้อมูลที่เคยกรอกหายก่อน migrate — upsert แตะแค่คอลัมน์ที่ส่งไป
const mapFromDb = (row: any): UserProfile => ({
  displayName: row.display_name || undefined,
  birthDate: row.birth_date || undefined,
  maritalStatus: (row.marital_status as MaritalStatus) || undefined,
  spouseHasIncome: boolOrUndef(row.spouse_has_income),
  childrenBefore2561: numOrUndef(row.children_before_2561),
  childrenFrom2561: numOrUndef(row.children_from_2561),
  parentsSupported: numOrUndef(row.parents_supported),
  disabledSupported: numOrUndef(row.disabled_supported),
  isDisabled: boolOrUndef(row.is_disabled),
  notes: row.notes || undefined,
});

const mapToDb = (p: UserProfile, userId: string): Record<string, any> => ({
  user_id: userId,
  display_name: p.displayName ?? null,
  birth_date: p.birthDate ?? null,
  marital_status: p.maritalStatus ?? null,
  spouse_has_income: p.spouseHasIncome ?? null,
  children_before_2561: p.childrenBefore2561 ?? null,
  children_from_2561: p.childrenFrom2561 ?? null,
  parents_supported: p.parentsSupported ?? null,
  disabled_supported: p.disabledSupported ?? null,
  is_disabled: p.isDisabled ?? null,
  notes: p.notes ?? null,
  updated_at: new Date().toISOString(),
});

/** ยังไม่ได้รัน SQL — ให้หน้าจอบอกวิธีแก้ แทนที่จะเด้ง error ดิบ */
export const isUserProfileTableMissing = (error: any): boolean =>
  /user_profile/i.test(error?.message || '') &&
  /(does not exist|schema cache|relation)/i.test(error?.message || '');

/** null = ยังไม่เคยกรอก (ต่างจาก {} ที่แปลว่ากรอกแล้วแต่เว้นว่างทุกช่อง) */
export const getUserProfile = async (): Promise<UserProfile | null> => {
  const { data, error } = await supabase.from('user_profile').select('*').maybeSingle();
  if (error) throw error;
  return data ? mapFromDb(data) : null;
};

// คอลัมน์ที่เพิ่มทีหลัง — ยังไม่ได้รัน SQL ก็ยังต้องบันทึกช่องที่เหลือได้
// ตัดเฉพาะคอลัมน์ที่ error ฟ้องชื่อมา แล้วลองใหม่ (แพตเทิร์นเดียวกับ investmentPlanStorage)
const OPTIONAL_COLUMNS = ['display_name'] as const;

export const saveUserProfile = async (profile: UserProfile): Promise<void> => {
  const userId = await getUserId();
  let payload = mapToDb(profile, userId);

  for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt++) {
    const { error } = await supabase
      .from('user_profile')
      .upsert(payload, { onConflict: 'user_id' });
    if (!error) return;
    const missing = OPTIONAL_COLUMNS.find(
      (c) => c in payload && new RegExp(c, 'i').test(error.message || '')
    );
    // ตารางหายทั้งใบ / error อื่น ๆ ต้องโยนต่อ ให้หน้าจอบอกว่าต้องรัน sql/user_profile.sql
    if (!missing) throw error;
    const next = { ...payload };
    delete next[missing];
    payload = next;
  }
  throw new Error('บันทึกข้อมูลส่วนตัวไม่สำเร็จ');
};
