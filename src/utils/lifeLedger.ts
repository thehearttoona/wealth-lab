// ── คณิตของ "บัญชีให้พอร์ตจ่ายชีวิต" ──
// pure ทั้งไฟล์ ไม่มี React ไม่มี network ไม่รู้จัก services
//
// คำถามที่ไฟล์นี้ตอบ: **"พอร์ตจ่ายค่าชีวิตของเราไปได้กี่เดือนแล้ว"**
// ยอดที่ค้างคือค่าใช้จ่ายที่สะสมมาแล้วแต่กำไรยังไม่ไปถึง — เกินจากนั้นคือกำไรจริง
//
// ⚠️ สามข้อที่ห้ามทำ:
//
// 1) **ห้ามเปลี่ยนยอดค้างให้กลายเป็น "เป้าของเดือนนี้"** ยอดนี้ไม่มีวันครบกำหนดโดยตั้งใจ
//    พอมีเส้นตายรายเดือน มันจะสั่งให้ขายวันที่ 30 เพื่อให้ตัวเลขสวย ซึ่งขัดกับทั้งระบบ
//    (จังหวะขายมาจากรอบถึงเป้า ดู utils/cycles.ts) เขียนว่า "ค้างอยู่" ได้ "ต้องทำให้ได้เดือนนี้" ไม่ได้
//
// 2) **ขาดทุนจากการขายห้ามไปเพิ่มยอดค้าง** — บัญชีนี้เก็บแค่สิ่งที่ชีวิตเรียกเก็บ
//    กำไรสุทธิติดลบถูก clamp เป็น 0 (กฎเดียวกับ availableTHB ใน utils/purchaseGoals.ts)
//    ไม่งั้นขายขาดทุนหนึ่งครั้งจะกลายเป็น "ค้างเพิ่มอีก 3 เดือน" ซึ่งเป็นการลงโทษซ้ำสอง
//
// 3) **ต้นทุนของเดือนที่จดไปแล้วห้ามคิดใหม่ตามค่าปัจจุบัน** — ค่าเน็ตเดือน มี.ค. คือยอดของ มี.ค.
//    ถ้าเอา perMonth วันนี้ไปคูณจำนวนเดือน ยอดสะสมทั้งก้อนจะขยับทุกครั้งที่เพิ่มรายการค่าเสื่อม
//    (เดือนที่จดแล้วเป็นข้อเท็จจริง จึงเก็บเป็นแถว ไม่ใช่คำนวณย้อน)

import { LedgerMonth } from '../types/lifeLedger';

/** หนึ่งเดือนในบัญชี + ผลว่ากำไรไหลมาถึงหรือยัง */
export interface LifeLedgerRow {
  month: string;
  depreciationTHB: number;
  billsTHB: number;
  /** รวมสองก้อน = ยอดที่ชีวิตเรียกเก็บเดือนนั้น */
  costTHB: number;
  /** กำไรที่ไหลมาถึงเดือนนี้ (จ่ายเดือนเก่าก่อน) */
  coveredTHB: number;
  /** จ่ายครบเดือนนี้แล้ว — เดือนที่ยอด 0 ถือว่าครบ แต่ไม่ถูกนับเป็น "ฟรี" */
  covered: boolean;
  /** ยังขาดอีกเท่าไหร่ของเดือนนี้ */
  shortTHB: number;
  note?: string;
}

/** กำไรที่เอามาหักบัญชี — สุทธิหลังภาษีกำไร ถ้าคิดภาษีได้ */
export interface LedgerProfit {
  /** กำไรที่ขายแล้วก่อนภาษี (THB) */
  grossTHB: number;
  /** ภาษีกำไรที่คิดได้ — 0 คู่กับ taxKnown: false แปลว่า "ยังคิดไม่ได้" ไม่ใช่ "ไม่มีภาษี" */
  taxTHB: number;
  /**
   * คิดภาษีได้ครบทุกปีในช่วงนี้หรือยัง
   * false = ยังไม่ได้กรอกเงินเดือนของปีใดปีหนึ่ง → เลขที่โชว์เป็นก่อนภาษี จอต้องพิมพ์บอก
   * (กฎเดียวกับ taxOf ใน utils/cycles.ts: ห้ามส่ง 0 แล้วให้อ่านเหมือนไม่มีภาษี)
   */
  taxKnown: boolean;
}

export interface LifeLedger {
  /** เรียงเก่า → ใหม่ */
  rows: LifeLedgerRow[];
  monthCount: number;
  /** ยอดสะสมที่ชีวิตเรียกเก็บทั้งหมด */
  accruedTHB: number;
  depreciationTHB: number;
  billsTHB: number;
  /** กำไรสุทธิที่เอามาหัก (หลังภาษี ถ้าคิดได้) — ไม่ติดลบ */
  profitTHB: number;
  profitGrossTHB: number;
  gainTaxTHB: number;
  taxKnown: boolean;
  /** ค้างอยู่เท่าไหร่ — 0 = พอร์ตจ่ายทันแล้ว */
  owedTHB: number;
  /** เกินยอดค้างมาเท่าไหร่ = กำไรจริงที่ยังไม่มีใครจอง */
  surplusTHB: number;
  /** จ่ายครบไปแล้วกี่เดือน (นับเฉพาะเดือนที่มียอด) */
  monthsCovered: number;
  monthsOwed: number;
  /** ค่าเฉลี่ยต่อเดือนของที่จดมา — เป็นคำบรรยาย ไม่ใช่เป้าที่ต้องทำให้ได้ทุกเดือน */
  avgMonthlyCostTHB: number;
  /** เดือนแรกที่จด — null = ยังไม่เคยจด (บัญชียังไม่เริ่ม) */
  firstMonth: string | null;
  lastMonth: string | null;
  /** จ่ายไปได้กี่ % ของยอดสะสม (0–100) */
  coveredPercent: number;
  /** เดือนที่เก่าสุดที่ยังค้าง — ตัวที่กำไรก้อนถัดไปจะไปจ่าย */
  oldestOwed: LifeLedgerRow | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const byMonth = (a: LedgerMonth, b: LedgerMonth): number => a.month.localeCompare(b.month);

/**
 * เดือนแรกของบัญชี — จอใช้ตัวนี้กรองไม้ที่ขาย ก่อนคิดกำไรส่งเข้ามา
 *
 * แยกออกมาเป็นฟังก์ชันเพราะกำไรต้องคิดภาษีซึ่งต้องใช้ services (โปรไฟล์ภาษีรายปี)
 * ไฟล์นี้จึงรับมาเป็นตัวเลขที่คิดเสร็จแล้ว — แบบเดียวกับ feeOf ใน exitPlanForCycle
 * ถ้านับกำไรที่ขายก่อนเดือนแรกด้วย มันจะไปจ่ายเดือนที่ไม่เคยอยู่ในบัญชี
 */
export const ledgerFirstMonth = (months: LedgerMonth[]): string | null => {
  const valid = months.map((m) => m.month).filter((m) => /^\d{4}-\d{2}$/.test(m || ''));
  return valid.length > 0 ? valid.reduce((a, b) => (a < b ? a : b)) : null;
};

const EMPTY: LifeLedger = {
  rows: [],
  monthCount: 0,
  accruedTHB: 0,
  depreciationTHB: 0,
  billsTHB: 0,
  profitTHB: 0,
  profitGrossTHB: 0,
  gainTaxTHB: 0,
  taxKnown: true,
  owedTHB: 0,
  surplusTHB: 0,
  monthsCovered: 0,
  monthsOwed: 0,
  avgMonthlyCostTHB: 0,
  firstMonth: null,
  lastMonth: null,
  coveredPercent: 0,
  oldestOwed: null,
};

/**
 * สร้างบัญชี: ไล่จ่ายเดือนเก่าก่อน (FIFO) ด้วยกำไรที่มี
 *
 * FIFO เพราะคำถามคือ "พอร์ตตามชีวิตทันหรือยัง" — จ่ายเดือนเก่าก่อนทำให้ "ฟรีไปแล้ว N เดือน"
 * มีความหมายเดียว (N เดือนแรกจ่ายครบ) ถ้าจ่ายเดือนใหม่ก่อน ยอดค้างจะกระโดดไปมาระหว่างเดือน
 * แล้วนับไม่ได้ว่าปลดไปกี่เดือน
 */
export const buildLifeLedger = (months: LedgerMonth[], profit: LedgerProfit): LifeLedger => {
  const sorted = [...months].filter((m) => /^\d{4}-\d{2}$/.test(m.month || '')).sort(byMonth);

  const grossTHB = num(profit.grossTHB);
  const gainTaxTHB = Math.max(0, num(profit.taxTHB));
  // ขาดทุนสุทธิไม่ทำให้ยอดค้างเพิ่ม — บัญชีนี้เก็บแค่สิ่งที่ชีวิตเรียกเก็บ (ดูข้อ 2 ในหัวไฟล์)
  const profitTHB = Math.max(0, grossTHB - gainTaxTHB);

  if (sorted.length === 0) {
    return {
      ...EMPTY,
      profitTHB,
      profitGrossTHB: grossTHB,
      gainTaxTHB,
      taxKnown: profit.taxKnown,
      surplusTHB: profitTHB,
    };
  }

  let pool = profitTHB;
  const rows: LifeLedgerRow[] = sorted.map((m) => {
    const depreciationTHB = Math.max(0, num(m.depreciationTHB));
    const billsTHB = Math.max(0, num(m.billsTHB));
    const costTHB = depreciationTHB + billsTHB;
    const coveredTHB = Math.min(pool, costTHB);
    pool -= coveredTHB;
    return {
      month: m.month,
      depreciationTHB,
      billsTHB,
      costTHB,
      coveredTHB,
      covered: costTHB > 0 ? coveredTHB >= costTHB : true,
      shortTHB: Math.max(0, costTHB - coveredTHB),
      note: m.note,
    };
  });

  const accruedTHB = rows.reduce((s, r) => s + r.costTHB, 0);
  const owedTHB = rows.reduce((s, r) => s + r.shortTHB, 0);
  // เดือนที่ยอด 0 นับเป็น covered เพื่อไม่ให้ค้างตลอดไป แต่ไม่นับเป็น "ฟรีไปแล้ว"
  // ไม่งั้นจดเดือนเปล่า ๆ ก็ได้เครดิตทั้งที่พอร์ตยังไม่ได้จ่ายอะไรเลย
  const withCost = rows.filter((r) => r.costTHB > 0);

  return {
    rows,
    monthCount: rows.length,
    accruedTHB,
    depreciationTHB: rows.reduce((s, r) => s + r.depreciationTHB, 0),
    billsTHB: rows.reduce((s, r) => s + r.billsTHB, 0),
    profitTHB,
    profitGrossTHB: grossTHB,
    gainTaxTHB,
    taxKnown: profit.taxKnown,
    owedTHB,
    surplusTHB: pool,
    monthsCovered: withCost.filter((r) => r.covered).length,
    monthsOwed: withCost.filter((r) => !r.covered).length,
    avgMonthlyCostTHB: rows.length > 0 ? accruedTHB / rows.length : 0,
    firstMonth: rows[0].month,
    lastMonth: rows[rows.length - 1].month,
    coveredPercent: accruedTHB > 0 ? Math.min(100, ((accruedTHB - owedTHB) / accruedTHB) * 100) : 0,
    oldestOwed: rows.find((r) => !r.covered && r.costTHB > 0) ?? null,
  };
};
