// จัดสรร "กำไรที่ขายจริง" ให้เป้าหมายของที่อยากได้ แบบเรียงคิว
//
// กฎที่ตกลงไว้:
//   1. นับเฉพาะกำไร realized (จาก realized_trades) — กำไรลอยตัวไม่ปลดล็อกให้
//      เพราะเงินต้องออกมาจริงถึงจะเอาไปซื้อของได้ ไม่งั้นกระดานขึ้นวันเดียวก็ปลดล็อกทั้งลิสต์
//   2. เรียงคิว: ชิ้นบนกินกำไรก่อนจนเต็มโควตาของตัวเอง ที่เหลือค่อยไหลลงชิ้นถัดไป
//      (ไม่ใช่นับให้ทุกชิ้นพร้อมกัน — ของ 3 ชิ้นจะได้ปลดล็อกพร้อมกันทั้งที่กำไรมีก้อนเดียว)
//   3. ของที่กด "ซื้อแล้ว" กินโควตาของตัวเองไปถาวร — หัก requiredTHB (ราคา × ตัวคูณ) ไม่ใช่หักแค่ราคาของ
//      เพราะกฎคือ "ต้องทำกำไรให้ได้ N เท่าก่อนซื้อ" พอซื้อแล้วกำไรก้อนนั้นจึงถือว่าใช้สิทธิ์ไปแล้ว
//   4. **บัญชีให้พอร์ตจ่ายชีวิตหักก่อนคิวรางวัลทั้งคิว** (2026-08-22 เจ้าของเลือกเอง) — ผ่าน reservedTHB
//      ค่าเสื่อม + ค่าใช้จ่ายประจำเป็นของที่ต้องจ่ายอยู่ดี รางวัลเป็นของที่เลือกจะซื้อ
//      ถ้าไม่หักก่อน กำไรก้อนเดียวจะดูเหมือนจ่ายได้ทั้งค่าชีวิตและปลดล็อกรางวัล = นับซ้ำ
//      (ยอดที่ต้องหักคิดที่ utils/lifeLedger.ts ที่เดียว ไฟล์นี้แค่รับตัวเลขมา)
//
// ทุกอย่างเป็นเลขคณิตตรงไปตรงมา ไม่มีการพยากรณ์

import { PurchaseGoal } from '../types/purchaseGoal';
import { convertToTHB } from './constants';

export interface PurchaseGoalProgress {
  goal: PurchaseGoal;
  priceTHB: number;
  /** กำไรที่ต้องทำได้เพื่อปลดล็อกชิ้นนี้ = priceTHB × multiplier */
  requiredTHB: number;
  /** กำไรที่คิวนี้ได้รับจัดสรรจริง (ไม่เกิน requiredTHB) */
  allocatedTHB: number;
  /** ยังขาดอีกเท่าไหร่ถึงจะปลดล็อก */
  remainingTHB: number;
  progressRatio: number;
  unlocked: boolean;
  /** ลำดับในคิวของที่ยังไม่ซื้อ (1 = ชิ้นแรก) — ของที่ซื้อแล้วเป็น 0 */
  queueRank: number;
  /** กำไรที่ขายจริง "สะสมทั้งหมด" ต้องถึงเท่านี้ ชิ้นนี้จึงปลดล็อก (รวมโควตาของคิวที่อยู่ข้างหน้า) */
  unlockAtTHB: number;
}

export interface PurchaseGoalPlan {
  /** กำไรที่ขายจริงสะสมทั้งพอร์ต (realized.totalPnlTHB) */
  realizedProfitTHB: number;
  /** โควตาที่ของซึ่งซื้อแล้วกินไป */
  spentTHB: number;
  /** กำไรที่บัญชีให้พอร์ตจ่ายชีวิตกินไปก่อน (ยอดค้าง) — คิวรางวัลได้ที่เหลือ */
  reservedTHB: number;
  /** เหลือให้คิวที่ยังไม่ซื้อแบ่งกัน */
  availableTHB: number;
  pending: PurchaseGoalProgress[];
  purchased: PurchaseGoalProgress[];
  /** ชิ้นแรกในคิวที่ยังปลดล็อกไม่ได้ — null = ปลดล็อกครบ/ไม่มีของในคิว */
  nextUp: PurchaseGoalProgress | null;
  unlockedCount: number;
  lockedCount: number;
}

/** โควตากำไรของ 1 ชิ้น — ค่าติดลบ/เพี้ยนถูกกันเป็น 0 ไม่ให้ลาก availableTHB เพิ่มขึ้นเอง */
export const requiredProfitOf = (goal: PurchaseGoal): number => {
  const priceTHB = Math.max(0, convertToTHB(goal.price, goal.currency));
  return priceTHB * Math.max(0, goal.multiplier);
};

/** เรียงคิวให้แน่นอน: sortOrder ก่อน แล้วค่อย createdAt กันกรณี sortOrder ชนกัน */
const byQueue = (a: PurchaseGoal, b: PurchaseGoal): number =>
  a.sortOrder - b.sortOrder || (a.createdAt || '').localeCompare(b.createdAt || '');

/**
 * @param reservedTHB กำไรที่บัญชีให้พอร์ตจ่ายชีวิตจองไว้ก่อน (ยอดค้างจาก utils/lifeLedger)
 *   หักออกจากกำไรก่อนแจกคิว ไม่ใช่หักจากชิ้นใดชิ้นหนึ่ง — มันคือด่านที่อยู่ก่อนคิวทั้งคิว
 *   ทุกจอที่โชว์คิวรางวัลต้องส่งค่าเดียวกัน ไม่งั้นสองหน้าจะบอก "เหลือให้รางวัล" ไม่ตรงกัน
 */
export function planPurchaseGoals(
  goals: PurchaseGoal[],
  realizedProfitTHB: number,
  reservedTHB = 0
): PurchaseGoalPlan {
  const sorted = [...goals].sort(byQueue);
  const purchasedGoals = sorted.filter((g) => !!g.purchasedAt);
  const pendingGoals = sorted.filter((g) => !g.purchasedAt);

  const spentTHB = purchasedGoals.reduce((s, g) => s + requiredProfitOf(g), 0);
  const reserved = Math.max(0, reservedTHB);
  // กำไรขาดทุนรวมติดลบได้ (ขายขาดทุน) — availableTHB ต้องไม่ติดลบ ไม่งั้น progress จะกลายเป็นเลขลบ
  const availableTHB = Math.max(0, realizedProfitTHB - spentTHB - reserved);

  let pool = availableTHB;
  // unlockAtTHB คือ "กำไรสะสมต้องถึงเท่านี้" จึงต้องนับยอดที่ชีวิตจองไว้เข้าไปด้วย
  // ไม่งั้นการ์ดจะบอกว่าปลดล็อกที่ ฿50,000 ทั้งที่จริงต้องถึง ฿50,000 + ยอดค้าง
  let cumulativeRequired = spentTHB + reserved;

  const pending: PurchaseGoalProgress[] = pendingGoals.map((goal, i) => {
    const priceTHB = Math.max(0, convertToTHB(goal.price, goal.currency));
    const requiredTHB = requiredProfitOf(goal);
    const allocatedTHB = Math.min(pool, requiredTHB);
    pool -= allocatedTHB;
    cumulativeRequired += requiredTHB;
    return {
      goal,
      priceTHB,
      requiredTHB,
      allocatedTHB,
      remainingTHB: Math.max(0, requiredTHB - allocatedTHB),
      // requiredTHB = 0 (ราคา 0 หรือตัวคูณ 0) ถือว่าปลดล็อกแล้ว ไม่ใช่หาร 0
      progressRatio: requiredTHB > 0 ? allocatedTHB / requiredTHB : 1,
      unlocked: allocatedTHB >= requiredTHB,
      queueRank: i + 1,
      unlockAtTHB: cumulativeRequired,
    };
  });

  const purchased: PurchaseGoalProgress[] = purchasedGoals.map((goal) => {
    const priceTHB = Math.max(0, convertToTHB(goal.price, goal.currency));
    const requiredTHB = requiredProfitOf(goal);
    return {
      goal,
      priceTHB,
      requiredTHB,
      allocatedTHB: requiredTHB,
      remainingTHB: 0,
      progressRatio: 1,
      unlocked: true,
      queueRank: 0,
      unlockAtTHB: requiredTHB,
    };
  });

  const unlockedCount = pending.filter((p) => p.unlocked).length;

  return {
    realizedProfitTHB,
    spentTHB,
    reservedTHB: reserved,
    availableTHB,
    pending,
    purchased,
    nextUp: pending.find((p) => !p.unlocked) ?? null,
    unlockedCount,
    lockedCount: pending.length - unlockedCount,
  };
}
