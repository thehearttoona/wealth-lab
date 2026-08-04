import { InvestmentType, RealizedTrade } from '../types/investment';
import {
  TaxProfile,
  TaxBracket,
  TaxMonth,
  TAX_BRACKETS,
  SALARY_EXPENSE_RATE,
  SALARY_EXPENSE_CAP,
  PERSONAL_ALLOWANCE,
  SOCIAL_SECURITY_CAP,
  DEFAULT_GAIN_RULES,
  GainTaxRule,
  sumTaxMonths,
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
  salaryIncome: number;       // เงินเดือน × เดือน + โบนัส
  salaryExpense: number;      // หักค่าใช้จ่าย 50% (≤100,000)
  otherIncome: number;
  gainIncome: number;         // กำไรขายส่วนที่ต้องเสียภาษี
  // ฝั่งลดหย่อน
  personalAllowance: number;
  socialSecurity: number;
  extraDeductions: number;
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
export function calculateTax(
  profile: TaxProfile,
  trades: RealizedTrade[] = []
): TaxBreakdown {
  const gains = gainsByType(trades, profile.year, profile);
  const gainIncome = gains.reduce((s, g) => s + g.assessable, 0);

  // เงินเดือน/โบนัส/หัก ณ ที่จ่าย/ประกันสังคม มาจากตารางรายเดือนเท่านั้น
  // ภาษีไทยคิดจากยอดรวมทั้งปี ดังนั้นการรวมตรงนี้ให้ผลเท่ากับตอนที่เคยเก็บเป็นรายปี
  const m = sumTaxMonths(profile.months);
  const salaryIncome = m.salary + m.bonus;
  const salaryExpense = Math.min(salaryIncome * SALARY_EXPENSE_RATE, SALARY_EXPENSE_CAP);
  const otherIncome = profile.otherIncome;

  const socialSecurity = Math.min(m.socialSecurity, SOCIAL_SECURITY_CAP);
  const totalDeductions = PERSONAL_ALLOWANCE + socialSecurity + profile.extraDeductions;

  const afterExpense = salaryIncome - salaryExpense + otherIncome;
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
    gainIncome,
    personalAllowance: PERSONAL_ALLOWANCE,
    socialSecurity,
    extraDeductions: profile.extraDeductions,
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
  trades: RealizedTrade[] = []
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
    projected: calculateTax({ ...profile, months: projectedMonths }, trades),
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
  tradesThisYear: RealizedTrade[] = []
): GainTaxEstimate {
  const rule = gainRuleFor(assetType, profile);
  if (!profile || gain <= 0 || rule === 'exempt') {
    return { rule, taxableGain: 0, tax: 0, rate: 0 };
  }

  const remittedRatio = Math.min(1, Math.max(0, profile.remittedRatio ?? 1));
  const taxableGain = rule === 'taxable_on_remit' ? gain * remittedRatio : gain;

  const before = calculateTax(profile, tradesThisYear);
  // ยัดกำไรก้อนใหม่เข้าไปเป็นเงินได้อื่น (ผ่านการคำนวณชุดเดียวกัน ไม่เขียนสูตรซ้ำ)
  const after = calculateTax(
    { ...profile, otherIncome: profile.otherIncome + taxableGain },
    tradesThisYear
  );
  const tax = Math.max(0, after.tax - before.tax);

  return { rule, taxableGain, tax, rate: gain > 0 ? tax / gain : 0 };
}
