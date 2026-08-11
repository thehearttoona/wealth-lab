import { UserProfile, ageFromBirthDate } from '../types/userProfile';
import { DEDUCTION_ITEMS, DeductionMap, DeductionItem, TaxYearFacts } from '../types/tax';

// ─────────────────────────────────────────────────────────────
// จับคู่ข้อมูลที่กรอกไว้ กับ "รายการลดหย่อน" → บอกว่าอันไหนใช้ได้ ใช้ไม่ได้ หรือยังไม่รู้
//
// รับ 2 แหล่งเพราะข้อมูลอยู่ 2 ที่ตามอายุการใช้งานของมัน:
//   UserProfile   ตัวตนที่ข้ามปี   วันเกิด / สถานภาพ / จำนวนคนในอุปการะ
//   TaxYearFacts  ของปีภาษีนั้น    ผ่อนบ้าน / ม.33 / PVD / ฝากครรภ์
// จึงต้องส่ง facts ของ "ปีที่กำลังดูอยู่" มาด้วย ไม่ใช่ปีปัจจุบันเสมอ ไม่งั้นย้อนดูปี 2568
// แล้วได้คำแนะนำของปี 2569
//
// สามสถานะไม่ใช่สองสถานะโดยตั้งใจ: "ยังไม่รู้" (ไม่ได้กรอกข้อมูล) ต้องแยกจาก "ใช้ไม่ได้"
// ไม่งั้นคนที่ยังไม่กรอกโปรไฟล์จะเห็นว่าตัวเองไม่มีสิทธิ์อะไรเลย แล้วเสียสิทธิ์จริง ๆ
//
// ฟังก์ชันทั้งไฟล์เป็น pure — ไม่มี React ไม่มี network
// ─────────────────────────────────────────────────────────────

export type EligibilityStatus = 'eligible' | 'not_eligible' | 'unknown';

export interface DeductionAdvice {
  item: DeductionItem;
  status: EligibilityStatus;
  /** เหตุผลสั้น ๆ ว่าทำไมถึงได้สถานะนี้ */
  reason: string;
  /** ยอดที่คำนวณให้ได้เลยจากข้อมูลส่วนตัว (หัวละเท่าไหร่ × จำนวนคน) — undefined = ต้องกรอกเอง */
  suggestedAmount?: number;
}

const has = (v: any): boolean => v !== undefined && v !== null;

/**
 * ลดหย่อนบุตร: คนแรก 30,000 · คนที่ 2 ขึ้นไป "ที่เกิดตั้งแต่ปี 2561" คนละ 60,000
 * ลำดับนับรวมบุตรทุกคน ไม่ได้แยกนับในกลุ่ม — บุตรคนแรกจึงได้ 30,000 เสมอไม่ว่าเกิดปีไหน
 */
export const childDeductionAmount = (before2561 = 0, from2561 = 0): number => {
  const total = Math.max(0, before2561) + Math.max(0, from2561);
  if (total <= 0) return 0;
  // คนแรกได้ 30,000 ที่เหลือได้ 30,000 ยกเว้นคนที่เกิดตั้งแต่ 2561 ซึ่งได้ 60,000
  // ให้บุตรที่เกิดก่อน 2561 เรียงก่อนเสมอ (เกิดก่อนย่อมมาก่อน) คนที่ 2+ ที่เป็นกลุ่มใหม่จึงได้เต็ม
  const olderCount = Math.max(0, before2561);
  const newerCount = Math.max(0, from2561);
  let amount = 0;
  let index = 0; // ลำดับที่ (0-based)
  for (let i = 0; i < olderCount; i++, index++) amount += 30_000;
  for (let i = 0; i < newerCount; i++, index++) amount += index === 0 ? 30_000 : 60_000;
  return amount;
};

export function adviseDeductions(
  profile: UserProfile | null,
  yearFacts?: TaxYearFacts | null
): DeductionAdvice[] {
  const p = profile ?? {};
  const f = yearFacts ?? {};
  const age = ageFromBirthDate(p.birthDate);

  const byKey: Record<string, Omit<DeductionAdvice, 'item'>> = {};

  // ── คู่สมรส ──
  if (!has(p.maritalStatus)) {
    byKey.spouse = { status: 'unknown', reason: 'ยังไม่ได้ระบุสถานภาพสมรส' };
  } else if (p.maritalStatus !== 'married') {
    byKey.spouse = { status: 'not_eligible', reason: 'ใช้ได้เฉพาะผู้ที่จดทะเบียนสมรส' };
  } else if (!has(p.spouseHasIncome)) {
    byKey.spouse = { status: 'unknown', reason: 'ยังไม่ได้ระบุว่าคู่สมรสมีเงินได้ไหม' };
  } else if (p.spouseHasIncome) {
    byKey.spouse = { status: 'not_eligible', reason: 'คู่สมรสมีเงินได้ จึงใช้สิทธิ์นี้ไม่ได้' };
  } else {
    byKey.spouse = { status: 'eligible', reason: 'สมรสและคู่สมรสไม่มีเงินได้', suggestedAmount: 60_000 };
  }

  // ── บุตร ──
  const childCount = (p.childrenBefore2561 ?? 0) + (p.childrenFrom2561 ?? 0);
  if (!has(p.childrenBefore2561) && !has(p.childrenFrom2561)) {
    byKey.child = { status: 'unknown', reason: 'ยังไม่ได้ระบุจำนวนบุตร' };
  } else if (childCount <= 0) {
    byKey.child = { status: 'not_eligible', reason: 'ไม่มีบุตรที่เข้าเกณฑ์' };
  } else {
    const amount = childDeductionAmount(p.childrenBefore2561, p.childrenFrom2561);
    byKey.child = { status: 'eligible', reason: `บุตรเข้าเกณฑ์ ${childCount} คน`, suggestedAmount: amount };
  }

  // ── อุปการะบิดามารดา ──
  if (!has(p.parentsSupported)) {
    byKey.parentCare = { status: 'unknown', reason: 'ยังไม่ได้ระบุจำนวนพ่อแม่ที่เราใช้สิทธิ์' };
  } else if ((p.parentsSupported ?? 0) <= 0) {
    byKey.parentCare = { status: 'not_eligible', reason: 'ไม่มีพ่อแม่ที่เข้าเกณฑ์ หรือพี่น้องใช้สิทธิ์ไปแล้ว' };
  } else {
    const n = Math.min(4, p.parentsSupported ?? 0);
    byKey.parentCare = {
      status: 'eligible',
      reason: `ใช้สิทธิ์ ${n} คน × 30,000`,
      suggestedAmount: n * 30_000,
    };
  }

  // ── คนพิการในอุปการะ ──
  if (!has(p.disabledSupported)) {
    byKey.disabledCare = { status: 'unknown', reason: 'ยังไม่ได้ระบุ' };
  } else if ((p.disabledSupported ?? 0) <= 0) {
    byKey.disabledCare = { status: 'not_eligible', reason: 'ไม่มีคนพิการในอุปการะ' };
  } else {
    byKey.disabledCare = {
      status: 'eligible',
      reason: `${p.disabledSupported} คน × 60,000`,
      suggestedAmount: (p.disabledSupported ?? 0) * 60_000,
    };
  }

  // ── ฝากครรภ์/คลอดบุตร (รายปี) ──
  if (!has(f.hasMaternity)) {
    byKey.maternity = { status: 'unknown', reason: 'ยังไม่ได้ระบุ' };
  } else {
    byKey.maternity = f.hasMaternity
      ? { status: 'eligible', reason: 'ปีนี้มีค่าฝากครรภ์/คลอดบุตร — ใส่ยอดที่จ่ายจริงหลังหักส่วนที่เบิกได้' }
      : { status: 'not_eligible', reason: 'ปีนี้ไม่มีค่าฝากครรภ์/คลอดบุตร' };
  }

  // ── ประกันสุขภาพบิดามารดา — ผูกกับ "มีพ่อแม่ให้ดูแล" ไม่ใช่เกณฑ์อายุ 60 ──
  if (!has(p.parentsSupported)) {
    byKey.parentHealthInsurance = { status: 'unknown', reason: 'ยังไม่ได้ระบุข้อมูลพ่อแม่' };
  } else if ((p.parentsSupported ?? 0) > 0) {
    byKey.parentHealthInsurance = {
      status: 'eligible',
      reason: 'มีพ่อแม่ในอุปการะ — เบี้ยประกันสุขภาพใช้ได้อีกไม่เกิน 15,000 (ไม่มีเงื่อนไขอายุ 60)',
    };
  }

  // ── ดอกเบี้ยบ้าน (รายปี) ──
  if (!has(f.hasHomeLoan)) {
    byKey.homeLoanInterest = { status: 'unknown', reason: 'ยังไม่ได้ระบุว่าปีนี้ผ่อนบ้านไหม' };
  } else {
    byKey.homeLoanInterest = f.hasHomeLoan
      ? { status: 'eligible', reason: 'ปีนี้ผ่อนบ้าน — ขอหนังสือรับรองดอกเบี้ยจากธนาคารได้เลย' }
      : { status: 'not_eligible', reason: 'ปีนี้ไม่ได้ผ่อนบ้าน' };
  }

  // ── กอช. (รายปี) ── ผู้ประกันตน ม.33 สมัคร กอช. ไม่ได้
  if (!has(f.isSocialSecurityMember)) {
    byKey.nsf = { status: 'unknown', reason: 'ยังไม่ได้ระบุว่าปีนี้เป็นผู้ประกันตน ม.33 ไหม' };
  } else {
    byKey.nsf = f.isSocialSecurityMember
      ? { status: 'not_eligible', reason: 'เป็นผู้ประกันตน ม.33 อยู่แล้ว จึงสมัคร กอช. ไม่ได้' }
      : { status: 'eligible', reason: 'ไม่ได้อยู่ในระบบประกันสังคม ม.33 — สมัคร กอช. ได้' };
  }

  // ── กองทุนสำรองเลี้ยงชีพ (รายปี) ──
  if (!has(f.hasProvidentFund)) {
    byKey.pvd = { status: 'unknown', reason: 'ยังไม่ได้ระบุว่าปีนี้มีกองทุนสำรองเลี้ยงชีพไหม' };
  } else {
    byKey.pvd = f.hasProvidentFund
      ? { status: 'eligible', reason: 'มีกองทุนสำรองเลี้ยงชีพ — ดูยอดเงินสะสมส่วนเราในสลิป' }
      : { status: 'not_eligible', reason: 'ปีนี้ที่ทำงานไม่มีกองทุนสำรองเลี้ยงชีพ' };
  }

  // ── RMF: ไม่ได้ห้ามตามอายุ แต่เตือนว่าต้องถือถึง 55 ──
  if (age != null) {
    const yearsTo55 = 55 - age;
    byKey.rmf = {
      status: 'eligible',
      reason:
        yearsTo55 > 0
          ? `อายุ ${age} — ต้องถือไปอีกอย่างน้อย ${yearsTo55} ปีถึงจะขายได้ (และครบ 5 ปีนับจากก้อนแรก)`
          : `อายุ ${age} เกิน 55 แล้ว — ขายได้เมื่อถือครบ 5 ปีนับจากก้อนแรก`,
    };
    byKey.pensionInsurance = {
      status: 'eligible',
      reason: `อายุ ${age} — ประกันบำนาญเริ่มจ่ายผลประโยชน์ตอนอายุ 55 ขึ้นไป`,
    };
  }

  return DEDUCTION_ITEMS.map((item) => ({
    item,
    status: byKey[item.key]?.status ?? 'unknown',
    reason: byKey[item.key]?.reason ?? 'ไม่ขึ้นกับข้อมูลส่วนตัว — ใส่ยอดที่จ่ายจริงได้เลย',
    suggestedAmount: byKey[item.key]?.suggestedAmount,
  }));
}

/**
 * รายการที่คำนวณยอดให้ได้เลยจากข้อมูลส่วนตัว (นับหัวคูณอัตรา ไม่ใช่ยอดที่จ่ายจริง)
 * แยกออกมาเพื่อให้ปุ่ม "เติมให้อัตโนมัติ" แตะเฉพาะช่องพวกนี้ ไม่ไปทับยอดที่ผู้ใช้กรอกจากใบเสร็จ
 */
export const autoFillableDeductions = (advice: DeductionAdvice[]): DeductionMap => {
  const out: DeductionMap = {};
  advice.forEach((a) => {
    if (a.status === 'eligible' && a.suggestedAmount && a.suggestedAmount > 0) {
      out[a.item.key] = a.suggestedAmount;
    }
  });
  return out;
};
