// เป้าหมายการลงทุน "ระดับพอร์ตรวม" — ตั้งเป้าครั้งเดียว แล้วระบบวิเคราะห์ให้
// แยกชัดระหว่าง "ข้อเท็จจริงตอนนี้" กับ "ประมาณการ/คำวินิจฉัย" (ไม่มีการเดา % ความน่าจะเป็น)

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
// พอร์ตต้องมีอายุอย่างน้อยเท่านี้ ถึงจะประเมิน "อัตราโตจริงต่อปี" ได้อย่างมีความหมาย
const MIN_YEARS_FOR_ANNUALIZED = 0.25; // ~3 เดือน

export interface PortfolioGoal {
  targetReturnPercent: number; // เป้ากำไรรวม % (เช่น 15 = +15%)
  targetDate: string;          // วันที่ต้องการให้ถึงเป้า (ISO)
}

export type GoalVerdict =
  | 'reached'         // ถึงเป้าแล้ว
  | 'on_track'        // อัตราโตจริง ≥ อัตราที่ต้องการ → มีแนวโน้มทัน
  | 'behind'          // อัตราโตจริง < อัตราที่ต้องการ → อาจไม่ทัน
  | 'deadline_passed' // เลยกรอบเวลาแล้ว ยังไม่ถึงเป้า
  | 'too_new';        // พอร์ตยังใหม่เกินไป ประเมินแนวโน้มไม่ได้

export interface PortfolioGoalAnalysis {
  currentReturnPercent: number;              // กำไร/ขาดทุนรวมตอนนี้ (%) — ข้อเท็จจริง
  targetReturnPercent: number;
  progressRatio: number;                     // 0..1 (เกิน 1 = ถึงเป้า) — clamp ตอนวาด bar
  reached: boolean;
  yearsLeft: number;
  deadlinePassed: boolean;
  requiredAnnualReturnPercent: number | null; // ต้องโตปีละกี่ % จากนี้ (ประมาณการ)
  actualAnnualReturnPercent: number | null;   // พอร์ตโตจริงเฉลี่ยปีละกี่ % ที่ผ่านมา
  verdict: GoalVerdict;
}

// totalValue / totalCost เป็น THB (จาก PortfolioSummary), portfolioStartDate = วันซื้อแรกสุดในพอร์ต
export function analyzePortfolioGoal(
  goal: PortfolioGoal,
  totalValue: number,
  totalCost: number,
  portfolioStartDate: string | null,
  now: Date = new Date()
): PortfolioGoalAnalysis | null {
  if (totalCost <= 0) return null;

  const currentReturnPercent = ((totalValue - totalCost) / totalCost) * 100;
  const target = goal.targetReturnPercent;
  const targetValue = totalCost * (1 + target / 100);
  const reached = currentReturnPercent >= target;

  const progressRatio = target !== 0 ? currentReturnPercent / target : (currentReturnPercent >= 0 ? 1 : 0);

  const yearsLeft = (new Date(goal.targetDate).getTime() - now.getTime()) / MS_PER_YEAR;
  const deadlinePassed = yearsLeft <= 0;

  // ต้องโตปีละกี่ % จากราคาปัจจุบัน ถึงจะถึงเป้าทันกำหนด (ทบต้น)
  let requiredAnnualReturnPercent: number | null = null;
  if (!reached && !deadlinePassed && totalValue > 0) {
    requiredAnnualReturnPercent = (Math.pow(targetValue / totalValue, 1 / yearsLeft) - 1) * 100;
  }

  // อัตราโตจริงเฉลี่ยต่อปีของพอร์ต (อิงผลงานจริงตั้งแต่วันซื้อแรก) — ฐานของคำวินิจฉัย
  let actualAnnualReturnPercent: number | null = null;
  if (portfolioStartDate && totalValue > 0) {
    const yearsElapsed = (now.getTime() - new Date(portfolioStartDate).getTime()) / MS_PER_YEAR;
    if (yearsElapsed >= MIN_YEARS_FOR_ANNUALIZED) {
      actualAnnualReturnPercent = (Math.pow(totalValue / totalCost, 1 / yearsElapsed) - 1) * 100;
    }
  }

  let verdict: GoalVerdict;
  if (reached) verdict = 'reached';
  else if (deadlinePassed) verdict = 'deadline_passed';
  else if (actualAnnualReturnPercent == null) verdict = 'too_new';
  else if (requiredAnnualReturnPercent != null && actualAnnualReturnPercent >= requiredAnnualReturnPercent) verdict = 'on_track';
  else verdict = 'behind';

  return {
    currentReturnPercent,
    targetReturnPercent: target,
    progressRatio,
    reached,
    yearsLeft,
    deadlinePassed,
    requiredAnnualReturnPercent,
    actualAnnualReturnPercent,
    verdict,
  };
}
