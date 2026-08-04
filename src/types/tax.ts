import { InvestmentType } from './investment';

// ─────────────────────────────────────────────────────────────
// ภาษีเงินได้บุคคลธรรมดา (ภ.ง.ด.90/91) — เวอร์ชัน "พื้นฐาน"
//
// ⚠️ ตัวเลขในไฟล์นี้เป็นค่าเริ่มต้นเพื่อ "ประมาณการ" ไม่ใช่คำแนะนำทางภาษี
// กฎเงินได้ต่างประเทศและคริปโตเปลี่ยนบ่อย ผู้ใช้แก้ได้เองในหน้า "ภาษี"
// ทุกอย่างที่อาจเปลี่ยนตามปีภาษีถูกเก็บเป็น "ข้อมูล" ไม่ใช่เงื่อนไขใน if
// ─────────────────────────────────────────────────────────────

// ขั้นบันไดภาษี: upTo = เพดานของขั้นนั้น (null = ขั้นสูงสุด ไม่มีเพดาน)
export interface TaxBracket {
  upTo: number | null;
  rate: number; // 0.05 = 5%
}

// ขั้นบันไดที่ใช้อยู่ตั้งแต่ปีภาษี 2560 เป็นต้นมา (150,000 แรกได้รับยกเว้น)
export const TAX_BRACKETS: TaxBracket[] = [
  { upTo: 150_000, rate: 0 },
  { upTo: 300_000, rate: 0.05 },
  { upTo: 500_000, rate: 0.10 },
  { upTo: 750_000, rate: 0.15 },
  { upTo: 1_000_000, rate: 0.20 },
  { upTo: 2_000_000, rate: 0.25 },
  { upTo: 5_000_000, rate: 0.30 },
  { upTo: null, rate: 0.35 },
];

// หักค่าใช้จ่ายเงินได้จากการจ้างแรงงาน ม.40(1)(2): 50% ของเงินได้ แต่ไม่เกิน 100,000
export const SALARY_EXPENSE_RATE = 0.5;
export const SALARY_EXPENSE_CAP = 100_000;

// ลดหย่อนพื้นฐาน
export const PERSONAL_ALLOWANCE = 60_000;
export const SOCIAL_SECURITY_CAP = 9_000; // 750 × 12 เดือน

/**
 * วิธีปฏิบัติทางภาษีของ "กำไรจากการขาย" แยกตามชนิดสินทรัพย์
 * - exempt              ยกเว้นภาษี ไม่ต้องนำมารวมคำนวณ
 * - taxable             เป็นเงินได้ นำมารวมคำนวณทั้งจำนวน
 * - taxable_on_remit    เป็นเงินได้ "เมื่อนำเงินเข้าไทย" — นับเฉพาะส่วนที่ผู้ใช้ระบุว่านำเข้าแล้ว
 */
export type GainTaxRule = 'exempt' | 'taxable' | 'taxable_on_remit';

export interface GainRuleInfo {
  rule: GainTaxRule;
  label: string;
  note: string;
}

/**
 * ค่าเริ่มต้นตามกฎภาษีไทยสำหรับบุคคลธรรมดา — แก้ได้ในหน้า "ภาษี"
 *
 * ที่ตั้งเป็น taxable ทั้งที่อาจได้รับยกเว้น (crypto) เป็นการตั้งใจ:
 * ประมาณการภาษีสูงเกินไปแล้วพบว่าไม่ต้องจ่าย เสียหายน้อยกว่าประมาณต่ำไปแล้วเงินไม่พอจ่าย
 */
export const DEFAULT_GAIN_RULES: Record<InvestmentType, GainRuleInfo> = {
  stock_th: {
    rule: 'exempt',
    label: 'หุ้นไทย',
    note: 'กำไรจากการขายหุ้นในตลาดหลักทรัพย์ฯ ได้รับยกเว้นภาษีสำหรับบุคคลธรรมดา',
  },
  fund: {
    rule: 'exempt',
    label: 'กองทุน',
    note: 'กำไรจากการขายคืนหน่วยลงทุนกองทุนรวมไทย ได้รับยกเว้นภาษี (เงินปันผลคนละเรื่อง หัก ณ ที่จ่าย 10%)',
  },
  stock_foreign: {
    rule: 'taxable_on_remit',
    label: 'หุ้นต่างประเทศ',
    note: 'เงินได้จากต่างประเทศ — เสียภาษีเมื่อนำเงินเข้าไทย (กรณีอยู่ในไทยตั้งแต่ 180 วันในปีภาษีนั้น)',
  },
  crypto: {
    rule: 'taxable',
    label: 'Crypto',
    note: 'เป็นเงินได้ตาม ม.40(4)(ฌ) — อาจได้รับยกเว้นถ้าเทรดผ่านศูนย์ซื้อขายที่ได้รับใบอนุญาตในไทย ตรวจสอบแล้วเปลี่ยนเป็น "ยกเว้น" ได้',
  },
  gold: {
    rule: 'exempt',
    label: 'ทอง',
    note: 'ไม่มีการหักภาษี ณ ที่จ่าย และบุคคลธรรมดาที่ขายเป็นครั้งคราวโดยทั่วไปไม่ได้ยื่น — ถ้าซื้อขายเป็นอาชีพควรเปลี่ยนเป็น "เป็นเงินได้"',
  },
  other: {
    rule: 'taxable',
    label: 'อื่นๆ',
    note: 'ไม่ทราบชนิดแน่ชัด ตั้งเป็นเงินได้ไว้ก่อนเพื่อไม่ให้ประมาณการต่ำกว่าจริง',
  },
};

export const GAIN_RULE_LABELS: Record<GainTaxRule, string> = {
  exempt: 'ยกเว้นภาษี',
  taxable: 'เป็นเงินได้',
  taxable_on_remit: 'เสียเมื่อนำเงินเข้าไทย',
};

export const MONTH_LABELS_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
] as const;

/**
 * ข้อมูลรายเดือนจากสลิปเงินเดือน — 1 แถวต่อ 1 เดือน (มี 12 แถวเสมอ)
 *
 * ทำไมต้องรายเดือน: ภาษีทั้งปีคิดจาก "ยอดรวม" อยู่แล้ว ดังนั้นรายเดือนไม่ได้ทำให้ภาษีแม่นขึ้น
 * แต่ 3 อย่างนี้ทำได้แค่ตอนเก็บเป็นรายเดือน —
 *   1. หัก ณ ที่จ่ายไม่เท่ากันทุกเดือน (เดือนโบนัสโดนหนัก) กรอกจากสลิปตรง ๆ ไม่ต้องรวมเอง
 *   2. เงินเดือนขึ้นกลางปี / เข้างานกลางปี เก็บได้ตรงตามจริง ไม่ต้องเฉลี่ย
 *   3. แยก "ที่เกิดจริงแล้ว" ออกจาก "คาดทั้งปี" ได้ (ดู projectFullYear ใน utils/taxCalc.ts)
 */
export interface TaxMonth {
  month: number;          // 1–12
  salary: number;         // เงินเดือน ม.40(1) ของเดือนนั้น
  bonus: number;          // โบนัส/เงินได้ ม.40(1) อื่นที่ได้ในเดือนนั้น
  withheld: number;       // ภาษีหัก ณ ที่จ่ายของเดือนนั้น
  socialSecurity: number; // ประกันสังคมที่จ่ายในเดือนนั้น
}

export const emptyTaxMonths = (): TaxMonth[] =>
  Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    salary: 0,
    bonus: 0,
    withheld: 0,
    socialSecurity: 0,
  }));

export interface TaxMonthTotals {
  salary: number;
  bonus: number;
  withheld: number;
  socialSecurity: number;
  /** จำนวนเดือนที่กรอกอะไรไว้แล้ว — ใช้เตือนว่าประมาณการยังไม่ครบปี */
  filledMonths: number;
  /** เดือนล่าสุด (1–12) ที่มีเงินเดือน — ใช้เป็นฐานประมาณเดือนที่เหลือ, 0 = ยังไม่กรอกเลย */
  lastSalaryMonth: number;
}

export const sumTaxMonths = (months: TaxMonth[] | undefined): TaxMonthTotals => {
  const list = months ?? [];
  const t: TaxMonthTotals = {
    salary: 0, bonus: 0, withheld: 0, socialSecurity: 0, filledMonths: 0, lastSalaryMonth: 0,
  };
  list.forEach((m) => {
    t.salary += m.salary || 0;
    t.bonus += m.bonus || 0;
    t.withheld += m.withheld || 0;
    t.socialSecurity += m.socialSecurity || 0;
    if ((m.salary || 0) > 0 || (m.bonus || 0) > 0 || (m.withheld || 0) > 0 || (m.socialSecurity || 0) > 0) {
      t.filledMonths += 1;
    }
    if ((m.salary || 0) > 0 && m.month > t.lastSalaryMonth) t.lastSalaryMonth = m.month;
  });
  return t;
};

/**
 * ข้อมูลภาษีที่ผู้ใช้กรอก — 1 แถวต่อ 1 ปีภาษี (พ.ศ.)
 * เก็บเป็น "ต่อปี" เพราะทั้งเงินเดือนและกฎเปลี่ยนได้ทุกปี ถ้าเก็บก้อนเดียวจะย้อนดูปีเก่าไม่ได้
 *
 * เงินเดือน/โบนัส/หัก ณ ที่จ่าย/ประกันสังคม เก็บใน `months` เท่านั้น — ตารางนี้เป็นแหล่งความจริงเดียว
 * ของฝั่งภาษี โดยตั้งใจไม่อ่านจาก incomes เพื่อไม่ให้มีเลขสองที่แล้วไม่ตรงกัน
 */
export interface TaxProfile {
  year: number;                 // ปีภาษี พ.ศ. (เช่น 2569)
  months: TaxMonth[];           // 12 แถว (ดู emptyTaxMonths)
  otherIncome: number;          // เงินได้อื่นที่ต้องนำมารวม (ไม่ได้หักค่าใช้จ่าย 50%)
  extraDeductions: number;      // ลดหย่อนอื่น ๆ รวมก้อนเดียว (RMF/SSF/ประกัน/บุตร ฯลฯ)
  // กฎกำไรขายรายชนิด — ไม่ระบุ = ใช้ DEFAULT_GAIN_RULES
  gainRules?: Partial<Record<InvestmentType, GainTaxRule>>;
  // สัดส่วนกำไรหุ้นต่างประเทศที่นำเงินเข้าไทยแล้ว (0–1) ใช้กับกฎ taxable_on_remit
  remittedRatio?: number;
}

export const emptyTaxProfile = (year: number): TaxProfile => ({
  year,
  months: emptyTaxMonths(),
  otherIncome: 0,
  extraDeductions: 0,
});
