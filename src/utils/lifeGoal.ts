// ── คณิตของ "เป้าหมายใหญ่สุดของชีวิต" ──
// pure ทั้งไฟล์ ไม่มี React ไม่มี network — ยอดความมั่งคั่งกับอัตราเก็บต่อสัปดาห์ส่งเข้ามา
//
// สิ่งที่ไฟล์นี้ตอบ: ตอนนี้อยู่ด่านไหน · เหลืออีกเท่าไหร่ · ด้วยจังหวะนี้อีกกี่สัปดาห์ถึง
//
// ⚠️ กฎที่ห้ามพัง: **ด่านที่ผ่านแล้วห้ามถอย** ถึงแม้ความมั่งคั่งจะตกลงมาต่ำกว่าเป้าเดิม
// (ตลาดลง/ถอนเงินไปใช้) — `achievedAt` ถูกประทับครั้งเดียวแล้วอยู่อย่างนั้น
// ถ้าปล่อยให้ถอยได้ ระบบจะกลายเป็นตัวลงโทษเวลาตลาดแดง แล้วผลักให้ขายตอนไม่ควรขาย
// (เหตุผลเดียวกับที่ขั้นของน้องหมุดห้ามผูกกับมูลค่าพอร์ต — ดู components/Mascot.tsx)

import { LifeGoal } from '../types/lifeGoal';
// import type เท่านั้น — ถูกลบตอน compile จึงไม่เกิดเส้น utils → components ตอนรันจริง
// (utils ทั้งโฟลเดอร์เป็นโดเมนล้วน ห้ามลากคอมโพเนนต์/services เข้ามาเป็น dependency)
import type { MascotStage } from '../components/Mascot';

export interface LifeGoalProgress {
  goal: LifeGoal;
  /** ถึงแล้วกี่ % ของด่านนี้ (0–100) */
  percent: number;
  /** ขาดอีกเท่าไหร่ถึงจะผ่านด่าน — 0 = ถึงแล้ว */
  remainingTHB: number;
  /** ยอดความมั่งคั่งถึงเป้าแล้ว (ยังไม่ได้กดยืนยันผ่านด่านก็จริงได้) */
  reached: boolean;
}

export interface LifeGoalPlan {
  /** ด่านที่ผ่านแล้ว เรียงตามลำดับด่าน */
  cleared: LifeGoal[];
  /** ด่านปัจจุบัน = ด่านแรกที่ยังไม่ผ่าน */
  current: LifeGoalProgress | null;
  /** ด่านถัดจากด่านปัจจุบัน */
  upcoming: LifeGoalProgress[];
  /** ความมั่งคั่งสุทธิที่ใช้วัด */
  netWorthTHB: number;
  /** ด่านที่ยอดถึงแล้วแต่ยังไม่ได้กดยืนยัน — จอต้องชวนให้กด ไม่ใช่ประทับให้เอง */
  readyToClaim: LifeGoal | null;
  /** เลเวลปัจจุบัน = จำนวนด่านที่ผ่านแล้ว + 1 */
  level: number;
}

const clampPercent = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0);

/**
 * จัดบันไดทั้งชุดให้เป็น "ผ่านแล้ว / กำลังทำ / รอคิว"
 *
 * ด่านปัจจุบันคือด่านแรกที่ยังไม่มี `achievedAt` — ไม่ใช่ด่านแรกที่ยอดยังไม่ถึง
 * (คนอาจข้ามด่านเพราะยอดพุ่ง แต่ยังไม่ได้กดยืนยัน ด่านนั้นต้องยังเป็นด่านปัจจุบันอยู่)
 */
export const planLifeGoals = (goals: LifeGoal[], netWorthTHB: number): LifeGoalPlan => {
  const sorted = [...goals].sort((a, b) => a.level - b.level || a.targetTHB - b.targetTHB);
  const cleared = sorted.filter((g) => !!g.achievedAt);
  const open = sorted.filter((g) => !g.achievedAt);

  const toProgress = (g: LifeGoal): LifeGoalProgress => {
    const target = Math.max(0, g.targetTHB);
    return {
      goal: g,
      percent: target > 0 ? clampPercent((netWorthTHB / target) * 100) : 0,
      remainingTHB: Math.max(0, target - netWorthTHB),
      reached: target > 0 && netWorthTHB >= target,
    };
  };

  const current = open.length > 0 ? toProgress(open[0]) : null;
  return {
    cleared,
    current,
    upcoming: open.slice(1).map(toProgress),
    netWorthTHB,
    readyToClaim: current?.reached ? current.goal : null,
    level: cleared.length + 1,
  };
};

export interface LifeGoalEta {
  weeks: number;
  months: number;
  /** ปีที่คาดว่าจะถึง (ค.ศ.) */
  year: number;
}

/**
 * อีกกี่สัปดาห์ถึงด่านนี้ ถ้ายังเก็บได้เท่าเดิม
 *
 * ใช้ "เงินที่ลงจริงต่อสัปดาห์" (utils/powderFlow) เป็นตัวแทนของอัตราเก็บ — **ไม่คิดผลตอบแทน
 * และไม่คิดรายจ่ายที่จะโผล่มา** จึงเป็นตัวเลขหยาบ ๆ ที่ควรพิมพ์คำว่า "ถ้าเก็บได้เท่าเดิม" กำกับเสมอ
 * คืน `null` เมื่ออัตรา ≤ 0 — ห้ามคืน Infinity หรือเลขมั่ว ๆ ให้จอเอาไปโชว์
 */
export const lifeGoalEta = (
  remainingTHB: number,
  perWeekTHB: number | null,
  today: Date
): LifeGoalEta | null => {
  if (remainingTHB <= 0) return null;
  if (perWeekTHB == null || !(perWeekTHB > 0)) return null;
  const weeks = Math.ceil(remainingTHB / perWeekTHB);
  const target = new Date(today.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  return { weeks, months: Math.round(weeks / 4.345), year: target.getFullYear() };
};

/**
 * ขั้นของน้องหมุดจากจำนวนด่านที่ผ่านแล้ว
 *
 * ผ่าน 0 ด่าน = ขั้น 1 ... ผ่าน 4 ด่านขึ้นไป = ขั้น 5
 * ใช้ "ด่านที่ผ่านแล้ว" ซึ่งขึ้นอย่างเดียว ไม่ใช่ยอดเงินซึ่งขึ้นลงได้ — ขั้นจึงไม่มีวันถอย
 */
export const mascotStageForLevels = (clearedCount: number): MascotStage => {
  const n = Math.max(0, Math.floor(clearedCount));
  return (Math.min(5, n + 1) as MascotStage);
};
