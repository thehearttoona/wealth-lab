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
  cleared: boolean;
  /** ความคืบหน้าเฉพาะขั้นนี้ 0–100 (ขั้นก่อนหน้าต้องปลดครบก่อนถึงจะเริ่มนับ) */
  percent: number;
}

export interface ExpenseLadder {
  rungs: LadderRung[];
  /** ขั้นที่กำลังทำอยู่ = ขั้นแรกที่ยังไม่ปลด */
  current: LadderRung | null;
  clearedCount: number;
  /** ยอดรวมที่ต้องจ่ายทุกเดือนของทุกขั้น */
  totalMonthlyTHB: number;
  /** ทุนที่ต้องมีเพื่อปลดครบทุกขั้น */
  totalCapitalTHB: number;
  /** เงินที่ "กลับมา" แล้วต่อเดือน จากขั้นที่ปลดไปแล้ว — ตัวที่ทำให้ลูปเร่งตัวเอง */
  freedMonthlyTHB: number;
  /** ผลตอบแทนสุทธิหลังเงินเฟ้อที่ใช้คิด (%) */
  realReturnPercent: number;
  /** คิดไม่ได้เพราะอะไร — null = คิดได้ปกติ */
  reason: string | null;
}

const EMPTY = (realReturnPercent: number, reason: string | null): ExpenseLadder => ({
  rungs: [],
  current: null,
  clearedCount: 0,
  totalMonthlyTHB: 0,
  totalCapitalTHB: 0,
  freedMonthlyTHB: 0,
  realReturnPercent,
  reason,
});

/**
 * เรียงของที่ต้องจ่ายทุกเดือนเป็นบันได จากอันที่ใช้ทุนน้อยสุดไปมากสุด
 *
 * เรียงจากถูกไปแพงเพราะ **ปลดอันแรกได้เร็วที่สุด** แล้วเงินที่เคยจ่ายอันนั้นจะว่างมาลงทุนต่อ
 * ทำให้ขั้นถัดไปมาถึงเร็วขึ้นเรื่อย ๆ (หลักการเดียวกับ debt snowball แต่กลับด้าน)
 */
export const buildExpenseLadder = (
  items: OutflowItem[],
  capitalTHB: number,
  returnPercent: number,
  inflationPercent: number
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
      cleared: capitalTHB >= running,
      percent: i.capitalTHB > 0 ? Math.min(100, (into / i.capitalTHB) * 100) : 0,
    };
  });

  const cleared = rungs.filter((x) => x.cleared);
  return {
    rungs,
    current: rungs.find((x) => !x.cleared) ?? null,
    clearedCount: cleared.length,
    totalMonthlyTHB: usable.reduce((s, i) => s + i.monthlyTHB, 0),
    totalCapitalTHB: running,
    freedMonthlyTHB: cleared.reduce((s, i) => s + i.monthlyTHB, 0),
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
