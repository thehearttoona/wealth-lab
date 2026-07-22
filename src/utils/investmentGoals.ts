import { Investment } from '../types/investment';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

// ── ส่วนที่ 1: ความคืบหน้าตอนนี้ (ข้อเท็จจริง จากราคาปัจจุบัน) ──
export interface GoalProgress {
  currentReturnPercent: number; // กำไร/ขาดทุนตอนนี้ (%)
  targetReturnPercent: number;  // เป้าหมาย (%)
  progressRatio: number;        // 0..1 (เกิน 1 = ถึงเป้าแล้ว) — clamp ตอนวาด bar เอง
  reached: boolean;             // ถึงเป้าแล้วหรือยัง
}

export function getGoalProgress(
  inv: Investment,
  currentValue: number,
  cost: number
): GoalProgress | null {
  if (inv.targetReturnPercent == null || cost <= 0) return null;
  const currentReturnPercent = ((currentValue - cost) / cost) * 100;
  const target = inv.targetReturnPercent;
  // เทียบกับ "ระยะทางจาก 0 ถึงเป้า" — ถ้าเป้าเป็น 0 หรือติดลบ ถือว่าถึงเมื่อ current >= target
  const progressRatio = target !== 0 ? currentReturnPercent / target : (currentReturnPercent >= 0 ? 1 : 0);
  return {
    currentReturnPercent,
    targetReturnPercent: target,
    progressRatio,
    reached: currentReturnPercent >= target,
  };
}

// ── ส่วนที่ 2: ต้องโตปีละกี่ % ถึงจะทันเป้า (ประมาณการ — เลขคณิตทบต้น ไม่ใช่ความน่าจะเป็น) ──
export interface GoalProjection {
  requiredAnnualReturnPercent: number | null; // ต้องโตเฉลี่ยปีละกี่ % จากราคาปัจจุบัน (null ถ้าคำนวณไม่ได้)
  yearsLeft: number;          // เหลืออีกกี่ปีถึงกำหนด (ติดลบ = เลยกำหนด)
  deadlinePassed: boolean;
  alreadyReached: boolean;
}

export function getGoalProjection(
  inv: Investment,
  currentValue: number,
  cost: number,
  now: Date = new Date()
): GoalProjection | null {
  if (inv.targetReturnPercent == null || !inv.targetDate || cost <= 0) return null;

  const targetValue = cost * (1 + inv.targetReturnPercent / 100);
  const alreadyReached = currentValue >= targetValue;
  const yearsLeft = (new Date(inv.targetDate).getTime() - now.getTime()) / MS_PER_YEAR;
  const deadlinePassed = yearsLeft <= 0;

  let requiredAnnualReturnPercent: number | null = null;
  // คำนวณ CAGR ได้ต่อเมื่อ ยังไม่ถึงเป้า, ยังไม่เลยกำหนด, และมูลค่าปัจจุบันเป็นบวก
  if (!alreadyReached && !deadlinePassed && currentValue > 0) {
    const cagr = Math.pow(targetValue / currentValue, 1 / yearsLeft) - 1;
    requiredAnnualReturnPercent = cagr * 100;
  }

  return { requiredAnnualReturnPercent, yearsLeft, deadlinePassed, alreadyReached };
}
