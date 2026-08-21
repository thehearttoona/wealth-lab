// ─────────────────────────────────────────────────────────────
// ข้อมูลส่วนตัว — เก็บ "ข้อเท็จจริงเกี่ยวกับตัวเรา" ที่ข้ามปี
//
// เส้นแบ่งกับ TaxProfile (types/tax.ts) มีข้อเดียว: "ข้อนี้เปลี่ยนได้ทุกปีไหม"
//   ข้ามปี  → อยู่ไฟล์นี้   วันเกิด / สถานภาพสมรส / จำนวนคนในอุปการะ / เราเป็นผู้พิการ
//   รายปี   → TaxYearFacts  ผ่อนบ้าน / ม.33 / กองทุนสำรองเลี้ยงชีพ / ฝากครรภ์ / อยู่ไทย 180 วัน
//
// เคยเก็บของรายปี 5 ข้อไว้ในนี้ด้วย แล้วเจอปัญหาว่าปีถัดไปผ่อนบ้านหมดแล้ว
// ข้อมูลปีเก่าเพี้ยนตามไปทั้งปี เพราะมีที่เก็บอยู่ที่เดียว — จึงย้ายไปอยู่กับปีภาษี
// (คอลัมน์เก่าใน user_profile ยังอยู่ แต่ไม่มีใครอ่านแล้ว ดู sql/tax_year_facts.sql)
//
// ทุกฟิลด์เป็น optional เพราะเป็นเรื่องส่วนตัว ผู้ใช้ต้องข้ามข้อที่ไม่อยากตอบได้
// และคำแนะนำต้องบอกได้ว่า "ยังไม่รู้" ต่างจาก "ไม่เข้าเกณฑ์"
// ─────────────────────────────────────────────────────────────

export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed';

export const MARITAL_LABELS: Record<MaritalStatus, string> = {
  single: 'โสด',
  married: 'สมรส',
  divorced: 'หย่า',
  widowed: 'หม้าย',
};

export interface UserProfile {
  /**
   * ชื่อที่ผู้ใช้ตั้งเอง — ว่าง = ใช้ชื่อจาก Google (user_metadata.full_name) แทน
   *
   * ไม่ใช่ข้อมูลภาษี และต้องไม่นับใน isUserProfileAnswered() ด้านล่าง
   * (ดู sql/user_profile_display_name.sql — เป็นคอลัมน์ทางเลือก)
   */
  displayName?: string;
  /** YYYY-MM-DD (ค.ศ.) — ใช้คำนวณอายุ และนับถอยหลังเงื่อนไข RMF ที่ต้องอายุ 55 */
  birthDate?: string;
  maritalStatus?: MaritalStatus;
  /** คู่สมรสมีเงินได้ไหม — ตัวชี้ว่าใช้สิทธิ์คู่สมรส 60,000 และพ่อแม่คู่สมรสได้หรือไม่ */
  spouseHasIncome?: boolean;

  /** บุตรที่เข้าเกณฑ์ (อายุ ≤20 หรือ ≤25 และกำลังศึกษา) ที่เกิดก่อนปี 2561 */
  childrenBefore2561?: number;
  /** บุตรที่เข้าเกณฑ์ ที่เกิดตั้งแต่ปี 2561 — คนที่ 2 ขึ้นไปของกลุ่มนี้ได้คนละ 60,000 */
  childrenFrom2561?: number;

  /** พ่อแม่ที่อายุ 60+ และมีเงินได้ไม่เกิน 30,000 ที่เราเป็นคนใช้สิทธิ์ (ตกลงกับพี่น้องแล้ว) */
  parentsSupported?: number;
  /** คนพิการ/ทุพพลภาพในอุปการะ (มีชื่อเราในบัตรคนพิการ) */
  disabledSupported?: number;

  /** ตัวเราเป็นผู้พิการที่มีบัตรประจำตัวคนพิการไหม — ได้ยกเว้นเงินได้ 190,000 ถ้าอายุไม่เกิน 65 */
  isDisabled?: boolean;
  notes?: string;
}

export const emptyUserProfile = (): UserProfile => ({});

/**
 * กรอกอะไรไว้แล้วอย่างน้อย 1 ข้อไหม — หน้าภาษีใช้ตัวนี้เป็นประตูของหัวข้อค่าลดหย่อน
 *
 * ต้องเช็กที่ "มีคำตอบ" ไม่ใช่ที่ "มีแถวในตาราง": แถวว่างเปล่าเกิดขึ้นได้จากการกดบันทึกทั้งที่ไม่กรอกอะไร
 * ถ้านับแถวว่างว่ากรอกแล้ว หน้าภาษีจะปลดล็อกโดยที่ทุกสิทธิ์ยังเป็น "ยังไม่รู้" ซึ่งช่วยอะไรไม่ได้
 * `notes` กับ `displayName` ไม่นับ — เป็นข้อมูลของ "ตัวตนในแอป" ไม่มีผลกับการตัดสินสิทธิ์
 * (ถ้านับ แค่ตั้งชื่อเล่นก็จะปลดล็อกหัวข้อค่าลดหย่อนทั้งที่ยังไม่ได้ตอบคำถามภาษีสักข้อ)
 */
export const isUserProfileAnswered = (profile: UserProfile | null | undefined): boolean => {
  if (!profile) return false;
  const { notes, displayName, ...answers } = profile;
  return Object.values(answers).some((v) => v !== undefined && v !== null && v !== '');
};

// ยกเว้นเงินได้ 190,000 สำหรับผู้มีอายุ 65 ปีบริบูรณ์ขึ้นไป (ตั้งแต่ปีภาษี 2548)
// และผู้พิการที่มีบัตรประจำตัวคนพิการซึ่งอายุไม่ถึง 65 (ตั้งแต่ปีภาษี 2553)
// เป็น "ยกเว้นเงินได้" ไม่ใช่ "ลดหย่อน" — ต้องหักออกจากเงินได้ก่อนหักค่าใช้จ่าย 50%
// จึงอยู่คนละขั้นกับ DEDUCTION_ITEMS และใส่ในช่องลดหย่อนแทนกันไม่ได้
export const ELDERLY_DISABLED_EXEMPTION = 190_000;
export const ELDERLY_EXEMPTION_AGE = 65;

/**
 * อายุเมื่อสิ้นปีภาษีนั้น (พ.ศ.) — กฎใช้คำว่า "อายุครบ 65 ปีบริบูรณ์ในปีภาษีนั้น"
 * จึงต้องนับ ณ สิ้นปี ไม่ใช่ ณ วันนี้ ไม่งั้นคนที่เกิดเดือน ธ.ค. จะเสียสิทธิ์ไปทั้งปี
 */
export const ageInTaxYear = (birthDate: string | undefined, buddhistYear: number): number | null =>
  ageFromBirthDate(birthDate, new Date(buddhistYear - 543, 11, 31));

/** ยอดยกเว้นเงินได้ของปีภาษีนั้น (0 = ไม่เข้าเกณฑ์ / ยังไม่ได้กรอกวันเกิด) */
export const incomeExemptionFor = (
  profile: UserProfile | null | undefined,
  buddhistYear: number
): { amount: number; reason: string } => {
  const age = ageInTaxYear(profile?.birthDate, buddhistYear);
  if (age != null && age >= ELDERLY_EXEMPTION_AGE) {
    return { amount: ELDERLY_DISABLED_EXEMPTION, reason: `อายุ ${age} ปีในปีภาษี ${buddhistYear}` };
  }
  // ผู้พิการได้สิทธิ์เฉพาะช่วงที่อายุยังไม่ถึง 65 — เกิน 65 ไปใช้สิทธิ์ผู้สูงอายุแทน (ได้ยอดเท่ากัน ไม่ซ้อนกัน)
  if (profile?.isDisabled) {
    return { amount: ELDERLY_DISABLED_EXEMPTION, reason: 'ผู้พิการที่มีบัตรประจำตัวคนพิการ' };
  }
  return { amount: 0, reason: '' };
};

/** อายุเต็มปี ณ วันที่อ้างอิง (ค่าเริ่มต้น = วันนี้) — null เมื่อยังไม่ได้กรอกวันเกิด */
export const ageFromBirthDate = (birthDate?: string, at: Date = new Date()): number | null => {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  let age = at.getFullYear() - d.getFullYear();
  const beforeBirthday =
    at.getMonth() < d.getMonth() || (at.getMonth() === d.getMonth() && at.getDate() < d.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
};
