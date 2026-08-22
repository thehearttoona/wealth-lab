// ── บันได "ให้พอร์ตจ่ายชีวิตแทน" ──
//
// นี่คือ **ด่านที่ต้องผ่านก่อนเป้าอื่นทั้งหมด**: ตราบใดที่ค่าใช้จ่ายประจำยังต้องจ่ายจากเงินเดือน
// เป้าเงินล้าน/ของรางวัล ก็เป็นแค่ตัวเลขที่ยังไม่มีฐานรองรับ ปลดค่าใช้จ่ายได้ก่อนถึงค่อยไปต่อ
//
// pure ทั้งไฟล์ ไม่มี React ไม่มี network
//
// ── ทำไมหารด้วย (ผลตอบแทน − เงินเฟ้อ) ไม่ใช่ผลตอบแทนเปล่า ๆ ──
// ค่าเน็ต ฿599 วันนี้ อีก 10 ปีไม่ใช่ ฿599 ทุนที่ต้องมีคือทุนที่จ่ายได้ **ตลอดไปโดยไม่แตะเงินต้น**
// ซึ่งต้องเผื่อให้ยอดจ่ายโตตามเงินเฟ้อด้วย (perpetuity แบบมีการเติบโต: ทุน = ยอดต่อปี ÷ (r − g))
// ที่ 7% กับเงินเฟ้อ 2.5% ทุนที่ต้องมีมากกว่าการหารด้วย 7% เฉย ๆ ถึง 56% —
// พลาดตรงนี้แล้วตัวเลขจะให้ความมั่นใจเกินจริง ซึ่งอันตรายกว่าไม่มีตัวเลขเลย
//
// ⚠️ ผลตอบแทน ≤ เงินเฟ้อ = ทุนเป็นอนันต์ ต้องคืน reason ไม่ใช่คืนเลขมั่ว ๆ หรือ Infinity
//
// ── "ถึงแล้ว" กับ "ปลดแล้ว" เป็นสองสถานะ ห้ามยุบเป็นอันเดียว (2026-08-22 เจ้าของสั่ง) ──
// `reached` = ทุนพอแล้วตามคณิต (คำนวณจากมูลค่าพอร์ต + อัตราที่สมมติ)
// `freedAt` = คนกดยืนยันว่าเปลี่ยนมาให้พอร์ตจ่ายจริงแล้ว (มาจากตาราง expense_ladder_freed)
// เดิมมีสถานะเดียวชื่อ `cleared` แล้วพิมพ์ว่า "ปลดแล้ว" ซึ่ง**อ้างสิ่งที่ยังไม่เกิด** —
// เจ้าของยังจ่ายค่าตรวจสุขภาพจากเงินเดือนอยู่ ยังไม่เคยขายอะไรเลย
// (หลักเดียวกับ achievedAt ของด่านชีวิต และ powderLegsUsed: แอปคำนวณ คนกดยืนยัน)
//
// ⚠️ **`freedAt` ห้ามย้อนไปคุมคณิต** — ลำดับสะสมต้องคิดจาก `reached` อย่างเดียว
// ถ้าเอาการกดยืนยันไปคุม ขั้นที่ถึงแล้วแต่ยังไม่กดจะทำให้โซ่สะสมขาดกลาง
// แล้วขั้นถัดไปจะเด้งไปเป็น "ขั้นที่กำลังทำ" ทั้งที่ทุนยังไม่ถึง

import { LifeCost } from '../types/lifeCost';
import { summarizeLifeCosts } from './lifeCost';

/** หนึ่งอย่างที่ต้องจ่ายทุกเดือน — มาจากค่าเสื่อมหรือบิลประจำก็ได้ คำถามเดียวกัน */
export interface OutflowItem {
  id: string;
  name: string;
  /** ยอดที่ต้องจ่ายเฉลี่ยต่อเดือน (บาท) */
  monthlyTHB: number;
  kind: 'life_cost' | 'bill';
}

export interface LadderRung extends OutflowItem {
  /** ทุนที่ต้องมีเพื่อให้ผลตอบแทนจ่ายเฉพาะอันนี้ได้ตลอด */
  capitalTHB: number;
  /** ทุนสะสมตั้งแต่ขั้นแรกถึงขั้นนี้ — ตัวที่ใช้ตัดสินว่าปลดถึงไหนแล้ว */
  cumulativeTHB: number;
  /**
   * ยอด **ต่อเดือน** สะสมถึงขั้นนี้ — หน่วยที่คนคิดเป็นจริง ๆ (2026-08-22 เจ้าของบอก)
   * "เดือนละ 12,000" อ่านออกทันทีว่าคืออะไร ส่วน "ทุน 1,354,356" ต้องแปลในหัวก่อน
   * เป็นเลขเดียวกับ cumulativeTHB แค่คนละหน่วย (× r ÷ 12) จึงไม่มีทางขัดกันเอง
   */
  cumulativeMonthlyTHB: number;
  /** ทุนพอแล้วตามคณิต — คำนวณล้วน ไม่เกี่ยวกับว่าคนกดยืนยันหรือยัง */
  reached: boolean;
  /** คนกดยืนยันว่าเปลี่ยนมาให้พอร์ตจ่ายจริงแล้วเมื่อไหร่ — undefined = ยังไม่กด */
  freedAt?: string;
  /** ความคืบหน้าเฉพาะขั้นนี้ 0–100 (ขั้นก่อนหน้าต้องถึงครบก่อนถึงจะเริ่มนับ) */
  percent: number;
}

export interface ExpenseLadder {
  rungs: LadderRung[];
  /** ขั้นที่กำลังทำอยู่ = ขั้นแรกที่ทุนยังไม่ถึง */
  current: LadderRung | null;
  /** ขั้นที่ทุนถึงแล้ว (คณิต) */
  reachedCount: number;
  /** ขั้นที่คนกดยืนยันแล้วว่าปลดจริง — ต้อง ≤ reachedCount ในทางปฏิบัติ */
  freedCount: number;
  /** ยอดรวมที่ต้องจ่ายทุกเดือนของทุกขั้น */
  totalMonthlyTHB: number;
  /** ทุนที่ต้องมีเพื่อปลดครบทุกขั้น */
  totalCapitalTHB: number;
  /**
   * เงินที่ "กลับมา" แล้วต่อเดือน — นับจากขั้นที่ **คนกดยืนยัน** เท่านั้น ไม่ใช่ขั้นที่ทุนถึง
   * เพราะประโยคนี้อ้างว่าเงินอยู่ในกระเป๋าแล้วจริง ๆ ถ้านับจาก reached จะโกหก
   */
  freedMonthlyTHB: number;
  /** ยอดต่อเดือนของขั้นที่ทุนถึงแล้วแต่ยังไม่ได้กดยืนยัน — จอเอาไปชวนให้กด */
  reachedNotFreedMonthlyTHB: number;
  /**
   * ทุนที่มีอยู่ตอนนี้จ่ายได้เดือนละเท่าไหร่ **แบบไม่แตะเงินต้น**
   * คิดจากผลตอบแทนหลังเงินเฟ้อ ไม่ใช่ผลตอบแทนเปล่า ๆ — ที่ 7% พอร์ตได้มากกว่านี้ต่อเดือน
   * แต่ส่วนที่เกินต้องกันไว้ให้ยอดจ่ายโตตามเงินเฟ้อ ไม่ใช่เงินที่ใช้ได้ (ดูหัวไฟล์)
   */
  affordableMonthlyTHB: number;
  /** จ่ายได้กี่ % ของยอดต่อเดือนทั้งหมด (0–100) — เลขเดียวกับสัดส่วนทุน แค่คนละหน่วย */
  monthlyProgressPercent: number;
  /** ผลตอบแทนสุทธิหลังเงินเฟ้อที่ใช้คิด (%) */
  realReturnPercent: number;
  /** คิดไม่ได้เพราะอะไร — null = คิดได้ปกติ */
  reason: string | null;
}

const EMPTY = (realReturnPercent: number, reason: string | null): ExpenseLadder => ({
  rungs: [],
  current: null,
  reachedCount: 0,
  freedCount: 0,
  totalMonthlyTHB: 0,
  totalCapitalTHB: 0,
  freedMonthlyTHB: 0,
  reachedNotFreedMonthlyTHB: 0,
  affordableMonthlyTHB: 0,
  monthlyProgressPercent: 0,
  realReturnPercent,
  reason,
});

/**
 * เรียงของที่ต้องจ่ายทุกเดือนเป็นบันได จากอันที่ใช้ทุนน้อยสุดไปมากสุด
 *
 * เรียงจากถูกไปแพงเพราะ **ปลดอันแรกได้เร็วที่สุด** แล้วเงินที่เคยจ่ายอันนั้นจะว่างมาลงทุนต่อ
 * ทำให้ขั้นถัดไปมาถึงเร็วขึ้นเรื่อย ๆ (หลักการเดียวกับ debt snowball แต่กลับด้าน)
 */
/**
 * @param freed คีย์ `kind:id` → วันที่คนกดยืนยันว่าปลดจริง (จาก services/ladderFreedStorage)
 *   ไม่ส่งมา = ยังไม่มีใครกด ซึ่งเป็นสถานะเริ่มต้นที่ถูกต้อง ไม่ใช่ข้อมูลหาย
 */
export const buildExpenseLadder = (
  items: OutflowItem[],
  capitalTHB: number,
  returnPercent: number,
  inflationPercent: number,
  freed?: Map<string, string>
): ExpenseLadder => {
  const realReturnPercent = returnPercent - inflationPercent;
  if (!(realReturnPercent > 0)) {
    return EMPTY(
      realReturnPercent,
      'ผลตอบแทนที่ตั้งไว้ไม่ชนะเงินเฟ้อ — ทุนที่ต้องมีจะไม่มีวันพอ ลองปรับผลตอบแทนขึ้น'
    );
  }
  const usable = items.filter((i) => i.monthlyTHB > 0);
  if (usable.length === 0) return EMPTY(realReturnPercent, null);

  const r = realReturnPercent / 100;
  const sorted = [...usable]
    .map((i) => ({ ...i, capitalTHB: (i.monthlyTHB * 12) / r }))
    .sort((a, b) => a.capitalTHB - b.capitalTHB);

  let running = 0;
  const rungs: LadderRung[] = sorted.map((i) => {
    const before = running;
    running += i.capitalTHB;
    // ทุนที่เหลือหลังจากปลดขั้นก่อน ๆ ครบแล้ว — ขั้นนี้ถึงจะเริ่มนับความคืบหน้า
    const into = Math.max(0, capitalTHB - before);
    return {
      ...i,
      cumulativeTHB: running,
      // × r ÷ 12 คือการกลับสูตร capital = monthly × 12 ÷ r จึงเท่ากับผลรวม monthlyTHB
      // ของขั้นแรกถึงขั้นนี้พอดี (คิดกลับแทนที่จะบวกซ้ำ เพื่อไม่ให้สองตัวเลขหลุดจากกันได้)
      cumulativeMonthlyTHB: (running * r) / 12,
      reached: capitalTHB >= running,
      freedAt: freed?.get(`${i.kind}:${i.id}`),
      percent: i.capitalTHB > 0 ? Math.min(100, (into / i.capitalTHB) * 100) : 0,
    };
  });

  const reached = rungs.filter((x) => x.reached);
  const freedRungs = rungs.filter((x) => !!x.freedAt);
  const totalMonthlyTHB = usable.reduce((s, i) => s + i.monthlyTHB, 0);
  // ทุนติดลบ/เพี้ยนถูกกันเป็น 0 — จ่ายได้ติดลบไม่มีความหมาย
  const affordableMonthlyTHB = Math.max(0, (capitalTHB * r) / 12);
  return {
    rungs,
    // ขั้นที่กำลังทำคิดจาก reached อย่างเดียว — ดูคำเตือนหัวไฟล์ว่าทำไมห้ามใช้ freedAt
    current: rungs.find((x) => !x.reached) ?? null,
    reachedCount: reached.length,
    freedCount: freedRungs.length,
    totalMonthlyTHB,
    totalCapitalTHB: running,
    freedMonthlyTHB: freedRungs.reduce((s, i) => s + i.monthlyTHB, 0),
    reachedNotFreedMonthlyTHB: reached
      .filter((x) => !x.freedAt)
      .reduce((s, i) => s + i.monthlyTHB, 0),
    affordableMonthlyTHB,
    monthlyProgressPercent:
      totalMonthlyTHB > 0 ? Math.min(100, (affordableMonthlyTHB / totalMonthlyTHB) * 100) : 0,
    realReturnPercent,
    reason: null,
  };
};

/**
 * ยอดเฉลี่ยต่อเดือนของบิลประจำ — ใช้ "เดือนที่กรอกจริง" ล่าสุด ไม่ใช่ช่อง amount
 *
 * `RecurringBill.amount` เป็นแค่ยอดอ้างอิงที่ตั้งไว้ครั้งแรก (ดู types/index.ts)
 * ยอดจริงอยู่ใน `monthlyAmounts` และไม่เท่ากันทุกเดือน — ใช้ค่าอ้างอิงจะได้เลขที่เพี้ยน
 * คืน 0 เมื่อยังไม่เคยกรอกเดือนไหนเลย (ไม่เดาจากค่าอ้างอิง)
 */
export const avgMonthlyBill = (
  monthlyAmounts: { [key: string]: number } | undefined,
  months = 6
): number => {
  const entries = Object.entries(monthlyAmounts || {})
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, Math.max(1, months));
  if (entries.length === 0) return 0;
  return entries.reduce((s, [, v]) => s + v, 0) / entries.length;
};

/**
 * แปลง "ค่าเสื่อม + บิลประจำ" เป็นรายการ outflow ของบันได — **ทางเดียวของทั้งแอป**
 *
 * เดิมหน้าค่าเสื่อมประกอบลิสต์นี้เองในตัว render พอหัวพอร์ตต้องใช้บันไดชุดเดียวกัน
 * (เป้าพอร์ต = ทุนที่ต้องมีเพื่อปลดค่าชีวิต) สองที่ต้องได้ลิสต์เดียวกันเป๊ะ ๆ
 * ไม่งั้นหัวพอร์ตกับหน้าค่าเสื่อมจะบอก "ปลดครบต้องมีเท่าไหร่" ไม่ตรงกัน
 *
 * รับ `today` เข้ามาแทนที่จะอ่าน `new Date()` เอง — เหตุผลเดียวกับ utils/lifeCost.ts
 */
export const outflowsFrom = (
  costs: LifeCost[],
  bills: { id: string; name: string; monthlyAmounts?: { [key: string]: number } }[],
  today: Date
): OutflowItem[] => {
  const fromCosts: OutflowItem[] = summarizeLifeCosts(costs, today).rows.map((r) => ({
    id: r.item.id,
    name: r.item.name,
    monthlyTHB: r.perMonth,
    kind: 'life_cost' as const,
  }));
  const fromBills: OutflowItem[] = bills
    .map((b) => ({
      id: b.id,
      name: b.name,
      // ใช้ยอดที่กรอกจริงเฉลี่ย ไม่ใช่ช่อง amount ที่เป็นแค่ค่าอ้างอิง (ดู avgMonthlyBill)
      monthlyTHB: avgMonthlyBill(b.monthlyAmounts),
      kind: 'bill' as const,
    }))
    .filter((b) => b.monthlyTHB > 0);
  return [...fromCosts, ...fromBills];
};
