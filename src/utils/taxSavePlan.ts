import { RealizedTrade } from '../types/investment';
import {
  DEDUCTION_ITEMS,
  DeductionItem,
  DeductionMap,
  PERSONAL_ALLOWANCE,
  TAX_BRACKETS,
  TaxProfile,
  TaxYearFacts,
  sumDeductions,
} from '../types/tax';
import { UserProfile, ageInTaxYear } from '../types/userProfile';
import { adviseDeductions } from './deductionAdvice';
import { calculateTax, TaxBreakdown, TaxCalcOptions } from './taxCalc';

// ─────────────────────────────────────────────────────────────
// "สูตรลดหย่อนให้ภาษีเป็น 0" — จัดลำดับเครื่องมือลดหย่อนตามอายุ แล้วไล่ใส่จนภาษีถึง 0
//
// เป็นฟังก์ชันบริสุทธิ์ทั้งไฟล์ และ **ไม่เขียนอะไรลง profile.deductions** —
// แผนนี้คือการจำลอง ไม่ใช่ยอดที่จ่ายจริง ถ้าเอาไปเขียนลงช่องกรอกจะกลายเป็นการอ้างสิทธิ์
// ที่ยังไม่ได้จ่าย แล้วประมาณการภาษีจะต่ำกว่าความจริง (ผิดหลักเดียวกับ DEFAULT_GAIN_RULES
// ที่ตั้งเป็น taxable ไว้ก่อน: ประมาณสูงไปแล้วไม่ต้องจ่าย เสียหายน้อยกว่าประมาณต่ำไปแล้วเงินไม่พอ)
//
// สองอย่างที่ไฟล์นี้ตั้งใจ "ไม่" ทำ:
//   1. ไม่คิดเพดานลดหย่อนซ้ำเอง — ถามผ่าน sumDeductions ตัวจริงด้วยการ "หยั่ง" (probe)
//      ถ้าเขียนสูตรเพดานใหม่ที่นี่ วันที่กฎเปลี่ยน ทั้งสองที่จะเพี้ยนไม่ตรงกันเงียบ ๆ
//   2. ไม่เดายอดที่ต้องดูจากสลิป/ใบเสร็จ (PVD, ดอกเบี้ยบ้าน, ค่าคลอด, มาตรการรัฐ)
//      รายการพวกนี้ไปอยู่ใน fillFirst พร้อมเพดาน ไม่ถูกนับเป็นตัวเลขในแผน
// ─────────────────────────────────────────────────────────────

/** เงินที่ใส่ไปแล้ว "หายไปจากกระเป๋าหรือไม่" — เป็นแกนหลักของการจัดลำดับ */
export type SaveToolKind = 'have' | 'invest' | 'insure' | 'give';

export const SAVE_TOOL_KIND_LABELS: Record<SaveToolKind, string> = {
  have: 'มีสิทธิ์อยู่แล้ว ไม่ต้องจ่ายเพิ่ม',
  invest: 'เงินยังเป็นของเรา แต่ถอนไม่ได้ตามกำหนด',
  insure: 'จ่ายเบี้ย ได้ความคุ้มครองกลับมา',
  give: 'เงินออกจากกระเป๋าถาวร',
};

const KIND_ORDER: Record<SaveToolKind, number> = { have: 0, invest: 1, insure: 2, give: 3 };

/** เหมาะกับสถานะ/อายุของเราแค่ไหน — 'unknown' ต้องต่างจาก 'caution' (ยังไม่รู้ ≠ ไม่แนะนำ) */
export type ToolFitness = 'fit' | 'caution' | 'unknown';

export interface PlanTool {
  item: DeductionItem;
  kind: SaveToolKind;
  fitness: ToolFitness;
  /**
   * สิทธิ์ตามข้อมูลที่กรอกไว้ (จาก deductionAdvice) — 'unknown' คือ "ยังไม่ได้ตอบ" ไม่ใช่ "ใช้ไม่ได้"
   * ของที่ยังไม่ตอบต้องพูดเป็นคำถาม ไม่ใช่สั่งให้ไปกรอก (ค่าคลอดบุตรของคนที่ยังไม่ได้ตอบ ฯลฯ)
   */
  eligibility: 'eligible' | 'unknown';
  /** เหตุผลของอันดับ/สถานะ อ้างอิงอายุและข้อเท็จจริงของปีนั้น */
  reason: string;
  /** ปีที่เงินถูกล็อก (null = ไม่ใช่เครื่องมือที่ล็อกเงิน หรือยังไม่รู้อายุ) */
  lockYears: number | null;
  /** ยอดที่ยังจ่ายเพิ่มได้ตามสิทธิ์ — null = ระบบไม่รู้เพดาน ห้ามเดายอด */
  headroom: number | null;
  /** ลดหย่อนที่ได้จาก headroom นั้น (บริจาค 2 เท่า → มากกว่ายอดที่จ่าย) */
  headroomDeductible: number | null;
  /** ยอดที่กรอกไว้แล้วในช่องนี้ */
  current: number;
  /** ต้องไปเอาตัวเลขจริงจากสลิป/ใบเสร็จ ระบบเดาแทนไม่ได้ */
  needsReceipt: boolean;
  order: number;
}

export interface PlanStep {
  tool: PlanTool;
  /** ยอดที่แนะนำให้ใส่เพิ่ม = เงินที่ต้องจ่าย (ไม่ใช่ยอดลดหย่อน) */
  amount: number;
  /** ลดหย่อนที่หักได้จริงจากขั้นนี้ */
  deductible: number;
  taxSaved: number;
  /** ภาษีที่ประหยัดต่อเงิน 1 บาทที่จ่ายในขั้นนี้ — ตัวเลขที่ตอบว่า "คุ้มไหม" */
  savedPerBaht: number;
  taxAfter: number;
  netIncomeAfter: number;
}

export interface TaxSavePlan {
  age: number | null;
  /** ปีนี้มีเงินได้ให้วางแผนไหม — ไม่มีก็ไม่ต้องโชว์แผน */
  hasIncome: boolean;
  taxNow: number;
  netIncomeNow: number;
  /** เงินได้สุทธิที่ทำให้ภาษี = 0 (อ่านจากขั้นบันได ไม่ใช่เลขฝัง) */
  zeroNet: number;
  /** ต่ำกว่าเงินได้สุทธินี้ ทุกบาทที่ลดหย่อนเพิ่มประหยัดภาษีแค่ lowValueRate */
  lowValueNet: number;
  lowValueRate: number;
  /** ลดหย่อนที่ต้องเพิ่มเพื่อให้ภาษี = 0 */
  needToZero: number;
  /** ลดหย่อนที่ต้องเพิ่มเพื่อลงมาถึงขั้นที่ประหยัดน้อย (จุดคุ้มสุด) */
  needToLowValue: number;
  /** ภาษีที่เหลือถ้าลดหย่อนแค่ถึงจุดคุ้มสุด */
  taxAtLowValue: number;
  /** ภาษีที่ประหยัดต่อ 1 บาท ในช่วง "คุ้ม" (จากตอนนี้ลงมาถึง lowValueNet) — เฉลี่ยจริง ไม่ใช่อัตราขั้นเดียว */
  savedPerBahtToLowValue: number;
  /** ภาษีที่ประหยัดต่อ 1 บาท ในช่วงท้ายที่ลากลงมาถึง 0 */
  savedPerBahtToZero: number;
  steps: PlanStep[];
  /** เงินที่ต้องจ่ายเพิ่มรวมทั้งแผน */
  planSpend: number;
  planDeductible: number;
  taxAfter: number;
  reachedZero: boolean;
  /** แยกตามชะตากรรมของเงิน — ตัวเลขที่บอกว่า "แผนนี้แลกอะไรไป" */
  keptTHB: number;
  goneTHB: number;
  freeTHB: number;
  /** มีสิทธิ์อยู่แล้วแต่ระบบไม่รู้ยอด — ไปกรอกก่อน แผนจะสั้นลง */
  fillFirst: PlanTool[];
  /** ยังเหลือสิทธิ์แต่แผนไม่ได้ใช้ (ถึง 0 ก่อน / ถูกกดปิด) */
  leftover: PlanTool[];
  notes: string[];
}

/**
 * รายการที่ระบบ "รู้ยอดสิทธิ์" จากจำนวนคน — ยอดมาจาก adviseDeductions ไม่ใช่เพดาน
 * (เพดานของบุตร/คนพิการไม่มีตัวเลขคงที่ ถ้าใช้เพดานเป็นยอดจะกลายเป็นแนะนำให้กรอกไม่จำกัด)
 */
const FAMILY_KNOWN = ['spouse', 'child', 'parentCare', 'disabledCare'];

/** ต้องดูตัวเลขจริงจากสลิป/ใบเสร็จ — แผนจะไม่ใส่ยอดให้ แต่ต้องเตือนว่าอย่าลืม */
const RECEIPT_KEYS = ['pvd', 'homeLoanInterest', 'maternity', 'stimulus'];

/** สิทธิ์ที่ตัดสินจาก TaxYearFacts ของปีนั้น — ยังไม่ตอบ = ยังไม่รู้ ต้องถาม ไม่ใช่สั่ง */
const FACT_KEYS = ['pvd', 'homeLoanInterest', 'maternity'];

/** ช่องรวมก้อนที่ไม่มีเพดานและไม่รู้ว่าคืออะไร — วางแผนด้วยไม่ได้ */
const SKIP_KEYS = ['other'];

const PROBE = 10_000_000;

interface CapCtx {
  assessable: number;
  netBeforeDonation: number;
}

/**
 * ฐานของเพดานทั้งสองแบบ ต้องตรงกับที่ calculateTax ส่งเข้า sumDeductions เป๊ะ ๆ
 * (เพดาน % ของเงินได้ ใช้เงินได้พึงประเมินที่ยังไม่รวมกำไรขาย · เพดานบริจาค 10% ใช้ยอดหลังหักค่าใช้จ่าย+พื้นฐาน)
 */
const ctxOf = (bd: TaxBreakdown): CapCtx => ({
  assessable: bd.salaryIncome + bd.otherIncome,
  netBeforeDonation: Math.max(
    0,
    bd.salaryIncome - bd.salaryExpense + bd.otherIncome - PERSONAL_ALLOWANCE - bd.socialSecurity
  ),
});

const deductibleOf = (map: DeductionMap, ctx: CapCtx): number =>
  sumDeductions(map, ctx.assessable, ctx.netBeforeDonation).total;

/**
 * ใส่เงินเพิ่มในช่องนี้อีก add บาท แล้วลดหย่อนที่หักได้จริงเพิ่มขึ้นเท่าไหร่
 * ถามผ่าน sumDeductions ตัวจริง จึงได้เพดานทั้งสามชั้น (รายรายการ → กลุ่ม → บริจาค 10%) ฟรี
 */
const gainFrom = (map: DeductionMap, key: string, add: number, ctx: CapCtx): number =>
  Math.max(0, deductibleOf({ ...map, [key]: (map[key] || 0) + add }, ctx) - deductibleOf(map, ctx));

/**
 * สิทธิ์ที่เหลือของรายการนี้ ณ ตอนนี้ — คืน null เมื่อ "ไม่มีเพดานในระบบ"
 * ต้องหยั่งใหม่ทุกครั้งที่แผนใส่เงินไปแล้ว เพราะเพดานกลุ่ม 500,000 กับเพดานบริจาค 10%
 * หดลงตามลดหย่อนตัวอื่นที่ใส่ไปก่อนหน้า
 */
const roomFor = (
  map: DeductionMap,
  item: DeductionItem,
  ctx: CapCtx
): { spend: number; deductible: number } | null => {
  const mult = item.multiplier ?? 1;
  const gain = gainFrom(map, item.key, PROBE, ctx);
  if (gain >= PROBE * mult - 1) return null; // ไม่มีเพดาน — ห้ามเดายอดให้
  return { spend: gain / mult, deductible: gain };
};

/** ขั้นบันไดที่ทำให้ภาษีเป็น 0 และขั้นถัดไปที่ "ประหยัดน้อย" — อ่านจากตาราง ไม่ฝังเลข */
const bracketBands = (): { zeroNet: number; lowValueNet: number; lowValueRate: number } => {
  let lower = 0;
  for (const b of TAX_BRACKETS) {
    if (b.rate > 0) {
      return { zeroNet: lower, lowValueNet: b.upTo ?? Infinity, lowValueRate: b.rate };
    }
    lower = b.upTo ?? Infinity;
  }
  return { zeroNet: Infinity, lowValueNet: Infinity, lowValueRate: 0 };
};

/**
 * แถวเก่าที่ยังไม่มี deductions แต่มี extraDeductions ก้อนเดียว —
 * ต้องย้ายมาเป็นคีย์ 'other' ก่อนจำลอง ไม่งั้นการใส่คีย์แรกจะทำให้ calculateTax
 * สลับไปใช้ทางลดหย่อนแยกรายการ แล้วลดหย่อนก้อนเก่าหายทั้งก้อน ภาษีในแผนจะกระโดดขึ้น
 */
const seedMap = (profile: TaxProfile): DeductionMap => {
  const map = { ...(profile.deductions || {}) };
  if (Object.keys(map).length === 0 && profile.extraDeductions > 0) {
    map.other = profile.extraDeductions;
  }
  return map;
};

const roundUp100 = (n: number): number => (n <= 0 ? 0 : Math.ceil(n / 100) * 100);

/**
 * จัดอันดับ + เหตุผลตามอายุ/สถานะ
 *
 * แกนของการเรียง: เงินที่ "ยังเป็นของเรา" มาก่อนเงินที่ "หายไป" เสมอ
 * แล้วในกลุ่มลงทุนเรียงตาม "ปลดล็อกเร็วสุดก่อน" ซึ่งทำให้อันดับขึ้นกับอายุเอง —
 * RMF ขายได้ตอนอายุ 55 คนอายุ 52 จึงล็อกแค่ 5 ปี (เท่า Thai ESG) แต่คนอายุ 30 ล็อก 25 ปี
 */
const fitOf = (
  key: string,
  age: number | null,
  person: UserProfile,
  facts: TaxYearFacts,
  hasDependants: boolean
): { kind: SaveToolKind; fitness: ToolFitness; reason: string; lockYears: number | null; order: number } => {
  const yearsTo55 = age == null ? null : Math.max(0, 55 - age);

  switch (key) {
    // ── มีอยู่แล้ว ──
    case 'spouse':
    case 'child':
    case 'parentCare':
    case 'disabledCare':
      return {
        kind: 'have',
        fitness: 'fit',
        reason: 'สิทธิ์ที่มีอยู่แล้วจากจำนวนคน — กดปุ่ม "เติมจากข้อมูลส่วนตัว" ได้เลย ไม่ต้องจ่ายอะไรเพิ่ม',
        lockYears: null,
        order: 10,
      };
    case 'pvd':
      return {
        kind: 'have',
        fitness: 'fit',
        reason: 'ถูกหักจากสลิปทุกเดือนอยู่แล้ว — เอายอดสะสมส่วนของเราทั้งปีมากรอก ไม่ใช่เงินก้อนใหม่',
        lockYears: null,
        order: 20,
      };
    case 'homeLoanInterest':
      return {
        kind: 'have',
        fitness: 'fit',
        reason: 'ดอกเบี้ยที่จ่ายไปแล้วทั้งปี — ขอหนังสือรับรองดอกเบี้ยจากธนาคารมากรอก',
        lockYears: null,
        order: 30,
      };
    case 'maternity':
      return {
        kind: 'have',
        fitness: 'fit',
        reason: 'ค่าที่จ่ายไปแล้ว — หักส่วนที่เบิกประกันสังคม/สวัสดิการได้ออกก่อน',
        lockYears: null,
        order: 40,
      };
    case 'stimulus':
      return {
        kind: 'have',
        fitness: 'unknown',
        reason: 'เพดานเปลี่ยนทุกปีตามประกาศ ระบบไม่ตัดให้ — ถ้าปีนี้ใช้จ่ายไปแล้วให้กรอกตามสิทธิ์จริง',
        lockYears: null,
        order: 50,
      };

    // ── เงินยังเป็นของเรา ──
    case 'thaiEsg':
      return {
        kind: 'invest',
        fitness: 'fit',
        reason: 'ล็อก 5 ปี สั้นสุดในกลุ่มนี้ และมีเพดานแยก ไม่กินโควตากลุ่มเกษียณ 500,000',
        lockYears: 5,
        order: 10,
      };
    case 'ssf':
      return {
        kind: 'invest',
        fitness: yearsTo55 != null && yearsTo55 < 10 ? 'caution' : 'fit',
        reason:
          yearsTo55 != null && yearsTo55 < 10
            ? `ล็อก 10 ปีนับรายก้อน — อายุ ${age} RMF ปลดล็อกเร็วกว่า (${yearsTo55} ปี) และเพดานใหญ่กว่า`
            : 'ล็อก 10 ปีนับรายก้อน ไม่ต้องซื้อต่อเนื่องทุกปี — ยืดหยุ่นกว่า RMF',
        lockYears: 10,
        order: 20,
      };
    case 'rmf':
      if (yearsTo55 == null) {
        return {
          kind: 'invest',
          fitness: 'unknown',
          reason: 'ต้องถือถึงอายุ 55 — ยังไม่ได้กรอกวันเกิด จึงยังบอกไม่ได้ว่าล็อกอีกกี่ปี',
          lockYears: null,
          order: 30,
        };
      }
      return {
        kind: 'invest',
        fitness: yearsTo55 <= 10 ? 'fit' : 'caution',
        reason:
          yearsTo55 <= 5
            ? `อายุ ${age} — เหลืออีก ${yearsTo55} ปีถึง 55 ถือครบ 5 ปีก็ขายได้ เพดานใหญ่สุด (30% ไม่เกิน 500,000)`
            : `อายุ ${age} — เงินถูกล็อกอีก ${yearsTo55} ปี และต้องซื้อต่อเนื่อง เว้นได้ไม่เกิน 1 ปีติดกัน`,
        lockYears: Math.max(5, yearsTo55),
        order: 30,
      };
    case 'nsf':
      return {
        kind: 'invest',
        fitness: 'caution',
        reason:
          yearsTo55 == null
            ? 'สำหรับคนที่ไม่ได้อยู่ ม.33 — รับบำนาญตอนอายุ 60'
            : `รับบำนาญตอนอายุ 60 (อีก ${Math.max(0, 60 - (age as number))} ปี) เพดานแค่ 30,000`,
        lockYears: age == null ? null : Math.max(0, 60 - age),
        order: 40,
      };

    // ── จ่ายเบี้ย ได้ความคุ้มครอง ──
    case 'healthInsurance':
      return {
        kind: 'insure',
        fitness: 'fit',
        reason:
          age != null && age >= 40
            ? `อายุ ${age} เบี้ยขึ้นทุกปีและตรวจสุขภาพยากขึ้น — เพดาน 25,000 ใช้ก่อนได้เปรียบ`
            : 'เพดาน 25,000 เบี้ยยังถูก — ได้ค่ารักษากลับมา ไม่ใช่เงินออม',
        lockYears: null,
        order: 10,
      };
    case 'parentHealthInsurance':
      return {
        kind: 'insure',
        fitness: 'fit',
        reason: 'เพดาน 15,000 แยกจากเพดาน 100,000 — ไม่กินโควตาประกันของตัวเอง',
        lockYears: null,
        order: 20,
      };
    case 'pensionInsurance':
      return {
        kind: 'insure',
        fitness: age != null && age >= 45 ? 'fit' : 'caution',
        reason:
          age == null
            ? 'เริ่มรับบำนาญตอนอายุ 55 ขึ้นไป และต้องจ่ายเบี้ยต่อเนื่องจนครบสัญญา'
            : age >= 45
              ? `อายุ ${age} — อีก ${Math.max(0, 55 - age)} ปีเริ่มรับบำนาญ และยังกินโควตาประกันชีวิตที่เหลือได้`
              : `อายุ ${age} — ผูกยาวมากและต้องจ่ายเบี้ยทุกปี ถ้าหยุดกลางทางเสียทั้งเบี้ยและสิทธิ์`,
        lockYears: age == null ? null : Math.max(0, 55 - age),
        order: age != null && age >= 45 ? 15 : 40,
      };
    case 'lifeInsurance':
      return {
        kind: 'insure',
        fitness: hasDependants ? 'fit' : 'caution',
        reason: hasDependants
          ? 'มีคนที่ต้องดูแล — ทุนประกันมีประโยชน์ในตัวเอง ไม่ใช่ซื้อเพื่อลดหย่อนอย่างเดียว'
          : 'ยังไม่มีคนที่ต้องดูแล — ซื้อเพื่อลดหย่อนอย่างเดียวได้ผลตอบแทนต่ำกว่ากองทุน และผูก 10 ปี',
        lockYears: 10,
        order: 30,
      };

    // ── เงินหายถาวร ──
    case 'donationDouble':
      return {
        kind: 'give',
        fitness: 'caution',
        reason: 'จ่าย 1 ได้ลดหย่อน 2 — คุ้มสุดในกลุ่มบริจาค แต่เงินไม่กลับมา คุ้มเฉพาะถ้าจะบริจาคอยู่แล้ว',
        lockYears: null,
        order: 10,
      };
    case 'donationGeneral':
      return {
        kind: 'give',
        fitness: 'caution',
        reason: 'หักตามจริงไม่เกิน 10% ของยอดหลังหักลดหย่อนอื่น — เงินไม่กลับมา',
        lockYears: null,
        order: 20,
      };
    case 'donationParty':
      return {
        kind: 'give',
        fitness: 'caution',
        reason: 'เพดาน 10,000 และเงินไม่กลับมา',
        lockYears: null,
        order: 30,
      };
    default:
      return { kind: 'give', fitness: 'unknown', reason: '', lockYears: null, order: 99 };
  }
};

export interface TaxSavePlanInput {
  /** ฐานที่จะวางแผน — ถ้ากรอกยังไม่ครบ 12 เดือน หน้าจอต้องส่งเวอร์ชันประมาณทั้งปีมา ไม่ใช่ยอดที่กรอกจริง */
  profile: TaxProfile;
  trades?: RealizedTrade[];
  person?: UserProfile | null;
  opts?: TaxCalcOptions;
  /** คีย์ที่ผู้ใช้กดปิด — ไม่ถูกใช้ในแผน แต่ยังโชว์เป็นทางเลือก */
  exclude?: string[];
}

export function buildTaxSavePlan(input: TaxSavePlanInput): TaxSavePlan {
  const { profile, trades = [], opts = {} } = input;
  const person = input.person ?? {};
  const facts = profile.yearFacts ?? {};
  const exclude = new Set(input.exclude ?? []);
  const age = ageInTaxYear(person.birthDate, profile.year);

  const { zeroNet, lowValueNet, lowValueRate } = bracketBands();

  let map = seedMap(profile);
  let bd = calculateTax({ ...profile, deductions: map }, trades, opts);
  const ctx = ctxOf(bd);
  const start = bd;

  const hasIncome = ctx.assessable + bd.gainIncome > 0;

  const hasDependants =
    (person.childrenBefore2561 ?? 0) + (person.childrenFrom2561 ?? 0) > 0 ||
    (person.parentsSupported ?? 0) > 0 ||
    (person.disabledSupported ?? 0) > 0 ||
    (person.maritalStatus === 'married' && person.spouseHasIncome === false);

  // สิทธิ์ที่ใช้ไม่ได้ตามข้อมูลส่วนตัว/ข้อเท็จจริงของปี ถูกตัดออกก่อนเลย
  const advice = new Map(adviseDeductions(person, facts).map((a) => [a.item.key, a]));

  const tools: PlanTool[] = [];
  DEDUCTION_ITEMS.forEach((item) => {
    if (SKIP_KEYS.includes(item.key)) return;
    const adv = advice.get(item.key);
    if (adv?.status === 'not_eligible') return;
    // จ่ายประกันสังคมอยู่ = อยู่ ม.33 = สมัคร กอช. ไม่ได้ (อนุมานจากตารางรายเดือน ไม่ต้องรอผู้ใช้ตอบ)
    if (item.key === 'nsf' && bd.socialSecurity > 0) return;

    const fit = fitOf(item.key, age, person, facts, hasDependants);
    const current = map[item.key] || 0;
    const room = roomFor(map, item, ctx);

    let headroom = room ? room.spend : null;
    let headroomDeductible = room ? room.deductible : null;
    // รายการที่นับหัวได้ ใช้ "ยอดสิทธิ์จริง" ไม่ใช่เพดาน — เพดานของบุตร/คนพิการไม่มีตัวเลขคงที่
    if (FAMILY_KNOWN.includes(item.key)) {
      const entitled = Math.max(0, (adv?.suggestedAmount ?? 0) - current);
      headroom = room ? Math.min(entitled, room.spend) : entitled;
      headroomDeductible = headroom;
    }

    // ข้อที่ยังไม่ได้ตอบในการ์ด "ปีนี้..." → พูดเป็นคำถาม ไม่ใช่บอกว่าจ่ายไปแล้วให้ไปกรอก
    // (เฉพาะรายการที่สิทธิ์ผูกกับ TaxYearFacts จริง ๆ — มาตรการรัฐไม่ได้ถามใครอยู่แล้ว)
    const unanswered = adv?.status === 'unknown' && FACT_KEYS.includes(item.key);

    tools.push({
      item,
      kind: fit.kind,
      fitness: fit.fitness,
      eligibility: adv?.status === 'eligible' ? 'eligible' : 'unknown',
      reason: unanswered ? `${adv?.reason ?? 'ยังไม่ได้ตอบข้อนี้ของปีนี้'} — ถ้าปีนี้มี ให้ใส่ยอดที่จ่ายจริง` : fit.reason,
      lockYears: fit.lockYears,
      headroom,
      headroomDeductible,
      current,
      needsReceipt: RECEIPT_KEYS.includes(item.key),
      order: fit.order,
    });
  });

  // เรียง: กลุ่มก่อน → ในกลุ่มลงทุนเรียงตามปีที่ล็อก (สั้นก่อน) → ที่เหลือตามอันดับของกลุ่ม
  tools.sort((a, b) => {
    if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (a.kind === 'invest') {
      const la = a.lockYears ?? 99;
      const lb = b.lockYears ?? 99;
      if (la !== lb) return la - lb;
    }
    return a.order - b.order;
  });

  const needToZero = Math.max(0, bd.netIncome - zeroNet);
  const needToLowValue = Math.max(0, bd.netIncome - lowValueNet);
  const taxAtLowValue = (() => {
    if (needToLowValue <= 0) return bd.tax;
    // คิดผ่าน calculateTax ชุดเดิมโดยยัดลดหย่อนสมมติเข้าไป จะได้เลขที่ตรงกับที่หน้าจออื่นคิด
    const trial = calculateTax(
      { ...profile, deductions: { ...map, other: (map.other || 0) + needToLowValue } },
      trades,
      opts
    );
    return trial.tax;
  })();

  // ── ไล่ใส่ตามลำดับจนภาษีถึง 0 ──
  const steps: PlanStep[] = [];
  const used = new Set<string>();
  for (const tool of tools) {
    if (bd.netIncome <= zeroNet) break;
    if (exclude.has(tool.item.key)) continue;
    if (tool.needsReceipt) continue; // ไม่รู้ยอดจริง — เดาแทนไม่ได้ ไปอยู่ fillFirst

    const room = roomFor(map, tool.item, ctx);
    const mult = tool.item.multiplier ?? 1;
    let spendRoom = room ? room.spend : Infinity;
    if (FAMILY_KNOWN.includes(tool.item.key)) {
      const entitled = Math.max(0, (advice.get(tool.item.key)?.suggestedAmount ?? 0) - (map[tool.item.key] || 0));
      spendRoom = Math.min(spendRoom, entitled);
    }
    if (!Number.isFinite(spendRoom) || spendRoom <= 0) continue;

    const need = bd.netIncome - zeroNet;
    const amount = Math.min(spendRoom, roundUp100(need / mult));
    if (amount <= 0) continue;

    map = { ...map, [tool.item.key]: (map[tool.item.key] || 0) + amount };
    const after = calculateTax({ ...profile, deductions: map }, trades, opts);
    const deductible = Math.max(0, bd.netIncome - after.netIncome);
    if (deductible <= 0) continue; // ไม่ได้ลดหย่อนเพิ่มจริง (เพดานเต็มแล้ว) — ไม่ต้องขึ้นเป็นขั้นในแผน
    const taxSaved = Math.max(0, bd.tax - after.tax);
    steps.push({
      tool,
      amount,
      deductible,
      taxSaved,
      savedPerBaht: amount > 0 ? taxSaved / amount : 0,
      taxAfter: after.tax,
      netIncomeAfter: after.netIncome,
    });
    used.add(tool.item.key);
    bd = after;
  }

  const sumBy = (kinds: SaveToolKind[]) =>
    steps.filter((s) => kinds.includes(s.tool.kind)).reduce((t, s) => t + s.amount, 0);

  // "จ่ายไปแล้ว ยังไม่ได้กรอก" — เรียงข้อที่รู้ว่ามีสิทธิ์ไว้ก่อนข้อที่ยังไม่ได้ตอบ
  const fillFirst = tools
    .filter((t) => t.needsReceipt && (t.headroom == null || t.headroom > 0))
    .sort((a, b) => (a.eligibility === b.eligibility ? a.order - b.order : a.eligibility === 'eligible' ? -1 : 1));

  // สิทธิ์ที่เหลือต้องคิดบน "แผนที่ใส่ไปแล้ว" ไม่ใช่ตอนเริ่ม — ไม่งั้นประกันบำนาญจะยังโชว์ว่าเหลือ 200,000
  // ทั้งที่โควตากลุ่มเกษียณ 500,000 ถูก SSF+RMF ในแผนกินไปหมดแล้ว
  const leftover = tools
    .filter((t) => !used.has(t.item.key) && !t.needsReceipt)
    .map((t) => {
      const room = roomFor(map, t.item, ctx);
      let headroom = room ? room.spend : null;
      let headroomDeductible = room ? room.deductible : null;
      if (FAMILY_KNOWN.includes(t.item.key)) {
        const entitled = Math.max(0, (advice.get(t.item.key)?.suggestedAmount ?? 0) - (map[t.item.key] || 0));
        headroom = room ? Math.min(entitled, room.spend) : entitled;
        headroomDeductible = headroom;
      }
      return { ...t, headroom, headroomDeductible };
    })
    .filter((t) => t.headroom == null || t.headroom > 0);

  const notes: string[] = [];
  if (start.taxFromGains > 0) {
    notes.push(
      `ในภาษีก้อนนี้มี ${Math.round(start.taxFromGains).toLocaleString('th-TH')} บาทที่มาจากกำไรขายปีนี้ — ` +
        'ถ้าเลื่อนการขายไม้ถัดไปไปปีหน้า จะลดส่วนนี้ได้โดยไม่ต้องจ่ายเงินซื้อสิทธิ์ลดหย่อน'
    );
  }
  if (fillFirst.length > 0) {
    notes.push(
      'กรอกรายการที่ "จ่ายไปแล้ว" ให้ครบก่อน (PVD/ดอกเบี้ยบ้าน/ค่าคลอด/มาตรการรัฐ) แผนที่ต้องจ่ายเพิ่มจะสั้นลง'
    );
  }
  if (age == null) {
    notes.push(
      'ยังไม่ได้กรอกวันเกิดที่ โปรไฟล์ → ข้อมูลส่วนตัว — RMF กับประกันบำนาญจึงยังจัดอันดับตามอายุให้ไม่ได้'
    );
  }
  if (!hasIncome) {
    notes.push('ปีนี้ยังไม่ได้กรอกเงินได้ — ไปกรอกที่หน้า "เงินได้รายเดือน" ก่อน แผนจะคำนวณให้เอง');
  }

  return {
    age,
    hasIncome,
    taxNow: start.tax,
    netIncomeNow: start.netIncome,
    zeroNet,
    lowValueNet,
    lowValueRate,
    needToZero,
    needToLowValue,
    taxAtLowValue,
    savedPerBahtToLowValue: needToLowValue > 0 ? (start.tax - taxAtLowValue) / needToLowValue : 0,
    savedPerBahtToZero:
      needToZero - needToLowValue > 0 ? taxAtLowValue / (needToZero - needToLowValue) : 0,
    steps,
    planSpend: steps.reduce((t, s) => t + s.amount, 0),
    planDeductible: steps.reduce((t, s) => t + s.deductible, 0),
    taxAfter: bd.tax,
    reachedZero: bd.tax <= 0,
    keptTHB: sumBy(['invest']),
    goneTHB: sumBy(['insure', 'give']),
    freeTHB: sumBy(['have']),
    fillFirst,
    leftover,
    notes,
  };
}
