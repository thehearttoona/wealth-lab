import { InvestmentType, RealizedTrade } from '../types/investment';
import {
  TaxProfile,
  TaxBracket,
  TaxMonth,
  TAX_BRACKETS,
  SALARY_EXPENSE_RATE,
  SALARY_EXPENSE_CAP,
  PERSONAL_ALLOWANCE,
  SOCIAL_SECURITY_RATE,
  SOCIAL_SECURITY_BASE_MIN,
  socialSecurityLimits,
  DEFAULT_GAIN_RULES,
  GainTaxRule,
  sumTaxMonths,
  emptyTaxMonths,
  sumDeductions,
  DeductionResult,
} from '../types/tax';
import { convertToTHB, toChristianYear } from './constants';

// ─────────────────────────────────────────────────────────────
// คำนวณภาษีเงินได้บุคคลธรรมดา (ประมาณการ) — ฟังก์ชันบริสุทธิ์ทั้งไฟล์
// ทั้งหน้า "ภาษี", การ์ดในหน้าพอร์ต และฟอร์มขาย ใช้ตัวเดียวกันหมด
// จะได้ไม่มีทางที่ 3 จุดโชว์เลขไม่ตรงกัน
// ─────────────────────────────────────────────────────────────

/** ภาษีตามขั้นบันไดจากเงินได้สุทธิ */
export function taxFromNetIncome(netIncome: number, brackets: TaxBracket[] = TAX_BRACKETS): number {
  if (netIncome <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upTo ?? Infinity;
    if (netIncome <= lower) break;
    const taxableInBracket = Math.min(netIncome, upper) - lower;
    tax += taxableInBracket * b.rate;
    lower = upper;
  }
  return tax;
}

/** อัตราภาษีของขั้นที่เงินได้สุทธิตกอยู่ — ใช้บอกว่า "กำไรบาทถัดไปโดนกี่ %" */
export function marginalRate(netIncome: number, brackets: TaxBracket[] = TAX_BRACKETS): number {
  if (netIncome <= 0) return 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upTo ?? Infinity;
    if (netIncome > lower && netIncome <= upper) return b.rate;
    lower = upper;
  }
  return brackets[brackets.length - 1].rate;
}

export const gainRuleFor = (type: InvestmentType, profile?: TaxProfile | null): GainTaxRule =>
  profile?.gainRules?.[type] ?? DEFAULT_GAIN_RULES[type].rule;

/** กำไร (THB) ของดีลที่ขายแล้ว 1 ไม้ — สูตรเดียวกับที่หน้าพอร์ตใช้สรุปผลงานจริง */
export function realizedGainTHB(trade: RealizedTrade): number {
  const cost = convertToTHB(trade.buyPrice, trade.currency) * trade.quantity;
  const proceeds = convertToTHB(trade.sellPrice, trade.currency) * trade.quantity;
  return proceeds - cost - (trade.fees || 0);
}

/**
 * ปี พ.ศ. ของวันที่ (รับได้ทั้ง ค.ศ. และ พ.ศ. ที่ปนกันมาในข้อมูลเก่า)
 * toChristianYear ทำงานกับ "สตริงวันที่" ทั้งก้อน แปลงเป็น ค.ศ. ให้ก่อน แล้วค่อย +543 กลับ
 * เพื่อให้ปีที่ใช้จัดกลุ่มเป็น พ.ศ. เสมอ ไม่ว่าข้อมูลต้นทางจะเก็บมาแบบไหน
 */
export function taxYearOf(dateStr: string): number {
  if (!dateStr) return NaN;
  const year = parseInt(toChristianYear(dateStr).slice(0, 4), 10);
  return Number.isFinite(year) ? year + 543 : NaN;
}

export interface GainByType {
  type: InvestmentType;
  rule: GainTaxRule;
  gain: number;         // กำไร/ขาดทุนรวมของชนิดนี้ (THB)
  assessable: number;   // ส่วนที่ต้องนำมารวมคำนวณภาษี
  tradeCount: number;
}

/**
 * แยกกำไรที่ขายแล้วในปีภาษีหนึ่ง ออกเป็นรายชนิด พร้อมบอกว่าส่วนไหนต้องเสียภาษี
 *
 * ขาดทุนไม่ถูกนำไปหักกลบกับเงินได้อื่น (กฎไทยไม่ให้ carry loss ของบุคคลธรรมดา
 * ไปหักเงินเดือน) จึง clamp ที่ 0 ต่อชนิด — ไม่ใช่ปล่อยให้ติดลบไปลดภาษีเงินเดือน
 */
export function gainsByType(
  trades: RealizedTrade[],
  year: number,
  profile?: TaxProfile | null
): GainByType[] {
  const remittedRatio = Math.min(1, Math.max(0, profile?.remittedRatio ?? 1));
  const buckets = new Map<InvestmentType, { gain: number; count: number }>();

  trades
    .filter((t) => taxYearOf(t.sellDate) === year)
    .forEach((t) => {
      const b = buckets.get(t.assetType) ?? { gain: 0, count: 0 };
      b.gain += realizedGainTHB(t);
      b.count += 1;
      buckets.set(t.assetType, b);
    });

  return [...buckets.entries()].map(([type, b]) => {
    const rule = gainRuleFor(type, profile);
    const positive = Math.max(0, b.gain);
    const assessable =
      rule === 'exempt' ? 0 : rule === 'taxable_on_remit' ? positive * remittedRatio : positive;
    return { type, rule, gain: b.gain, assessable, tradeCount: b.count };
  });
}

export interface TaxBreakdown {
  // ฝั่งเงินได้
  salaryIncome: number;       // เงินเดือน + โบนัส (หักยกเว้น 190,000 ออกแล้วถ้าเข้าเกณฑ์)
  salaryExpense: number;      // หักค่าใช้จ่าย 50% (≤100,000)
  otherIncome: number;
  /** ยกเว้นเงินได้ 190,000 (อายุ 65+/ผู้พิการ) ที่ถูกหักออกจากเงินได้ไปแล้ว */
  incomeExemption: number;
  gainIncome: number;         // กำไรขายส่วนที่ต้องเสียภาษี
  // ฝั่งลดหย่อน
  personalAllowance: number;
  socialSecurity: number;
  extraDeductions: number;
  /** รายการที่กรอกเกินสิทธิ์แล้วถูกตัด — หน้าจอเอาไปเตือน */
  deductionsCapped: DeductionResult['capped'];
  totalDeductions: number;
  // ผลลัพธ์
  netIncome: number;          // เงินได้สุทธิ
  tax: number;                // ภาษีทั้งปี
  withheld: number;
  balance: number;            // > 0 = ต้องจ่ายเพิ่ม, < 0 = ได้คืน
  effectiveRate: number;      // ภาษี ÷ เงินได้พึงประเมิน
  marginalRate: number;       // อัตราขั้นที่อยู่
  // ภาษีที่มาจากกำไรขายโดยเฉพาะ = ภาษีทั้งปี − ภาษีถ้าไม่มีกำไรก้อนนี้
  taxFromGains: number;
  gains: GainByType[];
  /** กรอกไปแล้วกี่เดือนจาก 12 — ตัวเลขทั้งหมดข้างบนคิดจากเท่าที่กรอกจริง ไม่ได้เดาเดือนที่เหลือ */
  filledMonths: number;
}

/**
 * ประมาณการภาษีทั้งปี
 *
 * ลำดับตามแบบ ภ.ง.ด.91: เงินได้ → หักค่าใช้จ่าย → หักลดหย่อน → เงินได้สุทธิ → ขั้นบันได
 * ค่าใช้จ่าย 50% ใช้ได้กับเงินได้ ม.40(1)(2) เท่านั้น กำไรขาย/เงินได้อื่นไม่ได้หักส่วนนี้
 */
export interface TaxCalcOptions {
  /**
   * ยกเว้นเงินได้ 190,000 ของผู้อายุ 65+ / ผู้พิการ (ดู incomeExemptionFor ใน types/userProfile)
   * ส่งเข้ามาแทนที่จะอ่านเองจากโปรไฟล์ เพื่อให้ taxCalc ยังเป็นฟังก์ชันบริสุทธิ์ที่ไม่รู้จัก storage
   * — แต่ทุกจุดที่เรียกต้องส่งค่าเดียวกัน ไม่งั้นหน้าภาษีกับการ์ดในพอร์ตจะโชว์เลขไม่ตรงกัน
   */
  incomeExemption?: number;
}

export function calculateTax(
  profile: TaxProfile,
  trades: RealizedTrade[] = [],
  opts: TaxCalcOptions = {}
): TaxBreakdown {
  const gains = gainsByType(trades, profile.year, profile);
  const gainIncome = gains.reduce((s, g) => s + g.assessable, 0);

  // เงินเดือน/โบนัส/หัก ณ ที่จ่าย/ประกันสังคม มาจากตารางรายเดือนเท่านั้น
  // ภาษีไทยคิดจากยอดรวมทั้งปี ดังนั้นการรวมตรงนี้ให้ผลเท่ากับตอนที่เคยเก็บเป็นรายปี
  const m = sumTaxMonths(profile.months);
  const grossSalary = m.salary + m.bonus;

  // ── ยกเว้นเงินได้ 190,000 (อายุ 65+ / ผู้พิการ) ──
  // เป็น "ยกเว้นเงินได้" ไม่ใช่ลดหย่อน จึงต้องหักออกก่อนคิดค่าใช้จ่าย 50%
  // (ถ้าเอาไปหักตอนท้ายเหมือนลดหย่อน ภาษีจะออกมาต่ำกว่าจริง เพราะค่าใช้จ่าย 50% จะถูกคิดจากฐานที่ใหญ่เกิน)
  // หักจากเงินเดือนก่อนแล้วค่อยไปเงินได้อื่น — ทางเลือกที่ประมาณการสูงไว้ก่อน ไม่ใช่ต่ำกว่าจริง
  const exemption = Math.max(0, opts.incomeExemption || 0);
  const salaryIncome = Math.max(0, grossSalary - exemption);
  const otherIncome = Math.max(0, profile.otherIncome - Math.max(0, exemption - grossSalary));
  const incomeExemption = grossSalary + profile.otherIncome - (salaryIncome + otherIncome);

  const salaryExpense = Math.min(salaryIncome * SALARY_EXPENSE_RATE, SALARY_EXPENSE_CAP);

  // เพดานลดหย่อนขึ้นกับปีภาษี (2569 ขยับเป็น 10,500 ตามเพดานค่าจ้างใหม่)
  const socialSecurity = Math.min(m.socialSecurity, socialSecurityLimits(profile.year).annualCap);

  // ลดหย่อนแยกรายการ + ตัดเพดานทุกชั้น — ฐานของเพดานบริจาค 10% คือเงินได้หลังหักค่าใช้จ่าย
  // และลดหย่อนพื้นฐาน จึงต้องส่งเข้าไปให้ sumDeductions คิดต่อ ไม่ใช่คำนวณแยกกันคนละที่
  const afterExpenseBase = salaryIncome - salaryExpense + otherIncome;
  const deductionResult = sumDeductions(
    profile.deductions,
    salaryIncome + otherIncome,
    Math.max(0, afterExpenseBase - PERSONAL_ALLOWANCE - socialSecurity)
  );
  // แถวเก่าที่ยังไม่มี deductions (ไม่มีคีย์ไหนเลย) ให้ยึด extraDeductions ตัวเดิมไปก่อน
  const extraDeductions =
    profile.deductions && Object.keys(profile.deductions).length > 0
      ? deductionResult.total
      : profile.extraDeductions;
  const totalDeductions = PERSONAL_ALLOWANCE + socialSecurity + extraDeductions;

  const afterExpense = afterExpenseBase;
  const netIncome = Math.max(0, afterExpense + gainIncome - totalDeductions);
  const tax = taxFromNetIncome(netIncome);

  // ภาษีส่วนที่เกิดจากกำไรขาย = ส่วนต่างของภาษีเมื่อมี/ไม่มีกำไรก้อนนั้น
  // (ไม่ใช่ gainIncome × อัตราขั้น เพราะกำไรอาจพาดข้ามหลายขั้น)
  const netWithoutGains = Math.max(0, afterExpense - totalDeductions);
  const taxFromGains = tax - taxFromNetIncome(netWithoutGains);

  const assessableTotal = salaryIncome + otherIncome + gainIncome;

  return {
    salaryIncome,
    salaryExpense,
    otherIncome,
    incomeExemption,
    gainIncome,
    personalAllowance: PERSONAL_ALLOWANCE,
    socialSecurity,
    extraDeductions,
    deductionsCapped: deductionResult.capped,
    totalDeductions,
    netIncome,
    tax,
    withheld: m.withheld,
    balance: tax - m.withheld,
    effectiveRate: assessableTotal > 0 ? tax / assessableTotal : 0,
    marginalRate: marginalRate(netIncome),
    taxFromGains,
    gains,
    filledMonths: m.filledMonths,
  };
}

export interface FullYearProjection {
  filledMonths: number;
  /** เดือนที่ใช้เป็นฐานประมาณ (1–12) */
  basedOnMonth: number;
  /** ผลลัพธ์ถ้าเดือนที่เหลือได้เท่าเดือนฐาน — null = กรอกครบ 12 เดือนแล้ว หรือยังไม่กรอกเลย */
  projected: TaxBreakdown | null;
}

/**
 * ประมาณการ "ทั้งปี" จากเดือนที่กรอกไปแล้ว
 *
 * ทำไมต้องมี: ถ้าเดือน ส.ค. กรอกไป 8 เดือน แล้วเอายอด 8 เดือนไปคิดขั้นบันไดตรง ๆ
 * ภาษีจะออกมาต่ำกว่าความจริงหลายเท่า เพราะขั้นบันไดไม่เป็นเชิงเส้น
 * (เงินเดือน 50,000: 8 เดือน → ฿4,200 แต่ทั้งปีจริง → ฿20,600 ต่ำไป ~5 เท่า)
 * หน้าจอจึงต้องโชว์แยกกันสองเลข ไม่ใช่เลขเดียวที่กำกวม
 *
 * วิธีประมาณ: เดือนที่ยังไม่มีเงินเดือน ใช้ค่าของ "เดือนล่าสุดที่กรอก" (เงินเดือน/หัก ณ ที่จ่าย/ประกันสังคม)
 * โบนัสไม่ประมาณให้ เพราะไม่ได้รับทุกเดือน — เดาให้จะทำให้ตัวเลขสูงเกินจริง
 */
export function projectFullYear(
  profile: TaxProfile,
  trades: RealizedTrade[] = [],
  opts: TaxCalcOptions = {}
): FullYearProjection {
  const t = sumTaxMonths(profile.months);
  if (t.filledMonths === 0 || t.lastSalaryMonth === 0 || t.filledMonths >= 12) {
    return { filledMonths: t.filledMonths, basedOnMonth: t.lastSalaryMonth, projected: null };
  }

  const base = profile.months.find((x) => x.month === t.lastSalaryMonth);
  if (!base) {
    return { filledMonths: t.filledMonths, basedOnMonth: 0, projected: null };
  }

  const projectedMonths: TaxMonth[] = profile.months.map((x) =>
    (x.salary || 0) > 0
      ? x
      : {
          month: x.month,
          salary: base.salary,
          bonus: 0,
          withheld: base.withheld,
          socialSecurity: base.socialSecurity,
        }
  );

  return {
    filledMonths: t.filledMonths,
    basedOnMonth: t.lastSalaryMonth,
    projected: calculateTax({ ...profile, months: projectedMonths }, trades, opts),
  };
}

// ─────────────────────────────────────────────────────────────
// เติมประกันสังคม / หัก ณ ที่จ่าย ให้อัตโนมัติจากเงินเดือนที่กรอกไว้
//
// เป็น "ตัวช่วยเติมครั้งเดียว" เหมือนปุ่มเติมจากรายรับ ไม่ใช่การผูกข้อมูล —
// ค่าที่ได้ถูกเขียนลง months ทันที ฝั่งภาษีจึงยังมีแหล่งความจริงเดียวคือตารางรายเดือน
// (ถ้าทำเป็นค่าคำนวณสด ๆ ตอนแสดงผล จะกลายเป็นเลขสองชุดที่ทับกันเงียบ ๆ กับเลขจากสลิปจริง)
// ─────────────────────────────────────────────────────────────

/**
 * ประกันสังคมของเดือนนั้นจากเงินเดือน — 5% ของฐาน 1,650 ถึงเพดานของ "ปีภาษีนั้น"
 * (2568 = 15,000 → 750 · 2569 = 17,500 → 875) จึงต้องรับ year เข้ามาด้วยเสมอ
 * ปัดเศษสตางค์ทิ้ง ตามที่ประกันสังคมหักจริง และเพื่อไม่ให้ลดหย่อนเกินของจริง
 * เงินเดือน 0 = ไม่ได้ทำงานเดือนนั้น ไม่ใช่ฐานขั้นต่ำ 1,650
 */
export function socialSecurityForSalary(monthlySalary: number, year: number): number {
  if (!monthlySalary || monthlySalary <= 0) return 0;
  const { baseCap } = socialSecurityLimits(year);
  const base = Math.min(Math.max(monthlySalary, SOCIAL_SECURITY_BASE_MIN), baseCap);
  return Math.floor(base * SOCIAL_SECURITY_RATE);
}

export interface WithholdingEstimate {
  months: TaxMonth[];
  /** หัก ณ ที่จ่ายรวมทั้งปีที่ประมาณได้ */
  totalWithheld: number;
  // ── ค่ากลางทาง: หน้าจอเอาไปกางให้ดูว่าเลขแต่ละก้อนมาจากไหน ──
  // ต้องคืนออกมาจากที่นี่ ไม่ใช่ให้หน้าจอคำนวณเอง ไม่งั้นสูตรที่โชว์กับสูตรที่ใช้จริงจะหลุดกันได้
  /** ฐานเงินได้ทั้งปีที่นายจ้างใช้ = เงินเดือนเดือนแรก × 12 */
  annualBase: number;
  /** ค่าใช้จ่าย 50% (ไม่เกิน 100,000) ที่หักจากฐานนั้น */
  expense: number;
  /** เงินได้สุทธิตามวิธีนายจ้าง (ยังไม่หักประกันสังคม) */
  netForEmployer: number;
  /** ภาษีทั้งปีตามฐานนั้น */
  annualTax: number;
  /** ยอดหักคงที่ต่อเดือน (ยังไม่รวมส่วนของโบนัส) */
  flatMonthly: number;
}

/**
 * ประมาณภาษีหัก ณ ที่จ่ายรายเดือน แล้วคืน months ชุดใหม่ที่เติมคอลัมน์ withheld ให้
 *
 * ⚠️ ตัวนี้จำลอง "วิธีที่ฝ่ายบุคคลหักจริง" ไม่ใช่ภาษีที่ถูกต้องตามกฎหมาย — คนละหน้าที่กัน
 * ภาษีที่ต้องจ่ายจริงคำนวณโดย calculateTax (หักลดหย่อนครบ) ส่วนตัวนี้ตอบว่า
 * "เงินจะถูกหักออกจากสลิปเดือนละเท่าไหร่" ซึ่งขึ้นกับวิธีของนายจ้าง ไม่ใช่ของสรรพากร
 * ส่วนต่างระหว่างสองอันคือยอด "ได้คืน/ต้องจ่ายเพิ่ม" ตอนยื่นภาษี ซึ่งเป็นหัวใจของหน้านี้
 *
 * วิธีที่ใช้ (ตรงกับสลิปจริงที่ตรวจสอบแล้ว 2 จุด: เงินเดือน 34,000 และหลังขึ้นเป็น 37,000):
 *   1. ประมาณเงินได้ทั้งปีจาก "เงินเดือนเดือนแรกที่มีข้อมูล × 12" แล้ว **ใช้ยอดหักเท่ากันทุกเดือน**
 *      ฝ่ายบุคคลตั้งยอดหักไว้ต้นปีครั้งเดียว ขึ้นเงินเดือนกลางปีก็ไม่ได้คำนวณใหม่
 *      (ยืนยันแล้ว: ขึ้นจาก 34,000 → 37,000 เดือน ก.ค. แต่ยังหัก 409 เท่าเดิม)
 *      ภาษีส่วนที่ขาดไปจะไปโผล่เป็น "ต้องจ่ายเพิ่ม" ตอนยื่นปลายปี
 *   2. หักค่าใช้จ่าย 50% (≤100,000) + ลดหย่อนส่วนตัว 60,000 เท่านั้น
 *      **ไม่เอาเงินสมทบประกันสังคมมาลดหย่อน** เพราะลดหย่อนตัวนั้นต้องยื่น ล.ย.01 ก่อน
 *      ระบบ payroll ส่วนใหญ่จึงหักเผื่อไว้
 *   3. ภาษีทั้งปี ÷ 12 แล้วปัดขึ้น — นายจ้างปัดขึ้นให้ครบ ไม่หักขาด (4,900/12 = 408.33 → 409)
 *   4. โบนัสถูกคิดภาษีส่วนเพิ่มเต็มก้อนในเดือนที่ได้รับ ไม่ใช่เฉลี่ย 12 เดือน
 *
 * ตัดกำไรขาย + เงินได้อื่นออกจากฐาน — นายจ้างไม่รู้เรื่องพวกนั้น หักให้ไม่ได้
 */
export function estimateWithholding(profile: TaxProfile): WithholdingEstimate {
  // เงินได้สุทธิตามวิธีนายจ้าง: หักค่าใช้จ่าย 50% + ลดหย่อนส่วนตัว (ไม่มีประกันสังคม)
  const employerNet = (annualIncome: number): number =>
    Math.max(
      0,
      annualIncome - Math.min(annualIncome * SALARY_EXPENSE_RATE, SALARY_EXPENSE_CAP) - PERSONAL_ALLOWANCE
    );

  const list = profile.months ?? emptyTaxMonths();
  // ฐานตั้งต้น = เดือนแรกที่มีเงินเดือน (เดือนที่ payroll ตั้งยอดหักไว้) ไม่ใช่เงินเดือนของแต่ละเดือน
  const annualBase = (list.find((m) => (m.salary || 0) > 0)?.salary ?? 0) * 12;
  const expense = Math.min(annualBase * SALARY_EXPENSE_RATE, SALARY_EXPENSE_CAP);
  const baseTax = taxFromNetIncome(employerNet(annualBase));
  const flatMonthly = Math.ceil(baseTax / 12);

  let totalWithheld = 0;
  const months = list.map((m) => {
    const salary = m.salary || 0;
    const bonus = m.bonus || 0;
    // เดือนที่ยังไม่กรอกเงินเดือน ปล่อยว่างไว้ ไม่เดาให้ — "ที่กรอกจริง" ต้องไม่ปนกับ "คาด"
    if (salary + bonus <= 0) return m;

    // ภาษีส่วนที่โบนัสทำให้เพิ่ม — หักทั้งก้อนในเดือนที่ได้ ตามที่ payroll ทำ
    const bonusTax =
      bonus > 0 ? Math.max(0, taxFromNetIncome(employerNet(annualBase + bonus)) - baseTax) : 0;

    const withheld = flatMonthly + Math.ceil(bonusTax);
    totalWithheld += withheld;
    return { ...m, withheld };
  });

  return {
    months,
    totalWithheld,
    annualBase,
    expense,
    netForEmployer: employerNet(annualBase),
    annualTax: baseTax,
    flatMonthly,
  };
}

export interface GainTaxEstimate {
  rule: GainTaxRule;
  taxableGain: number;  // ส่วนของกำไรที่นำมารวมคำนวณ
  tax: number;          // ภาษีที่เพิ่มขึ้นจากการขายก้อนนี้
  rate: number;         // ภาษีที่เพิ่ม ÷ กำไร (อัตราที่รู้สึกจริง)
}

/**
 * ภาษีที่จะเพิ่มขึ้น "ถ้าขายก้อนนี้เดี๋ยวนี้" — ใช้ในฟอร์มขายและการ์ดหน้าพอร์ต
 *
 * คิดเป็นส่วนต่าง (marginal) บนฐานของปีนั้นจริง ๆ ไม่ใช่คูณอัตราขั้นตรง ๆ
 * เพราะกำไรก้อนใหญ่ดันข้ามขั้นได้ — เลขที่ได้จึงตรงกับที่จะเห็นในหน้า "ภาษี"
 */
export function estimateGainTax(
  gain: number,
  assetType: InvestmentType,
  profile: TaxProfile | null,
  tradesThisYear: RealizedTrade[] = [],
  opts: TaxCalcOptions = {}
): GainTaxEstimate {
  const rule = gainRuleFor(assetType, profile);
  if (!profile || gain <= 0 || rule === 'exempt') {
    return { rule, taxableGain: 0, tax: 0, rate: 0 };
  }

  const remittedRatio = Math.min(1, Math.max(0, profile.remittedRatio ?? 1));
  const taxableGain = rule === 'taxable_on_remit' ? gain * remittedRatio : gain;

  const before = calculateTax(profile, tradesThisYear, opts);
  // ยัดกำไรก้อนใหม่เข้าไปเป็นเงินได้อื่น (ผ่านการคำนวณชุดเดียวกัน ไม่เขียนสูตรซ้ำ)
  const after = calculateTax(
    { ...profile, otherIncome: profile.otherIncome + taxableGain },
    tradesThisYear,
    opts
  );
  const tax = Math.max(0, after.tax - before.tax);

  return { rule, taxableGain, tax, rate: gain > 0 ? tax / gain : 0 };
}
