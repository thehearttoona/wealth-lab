// เป้าหมายพอร์ตรวม — ผู้ใช้ปักแค่ "ยอดที่อยากได้" (บาท) ระบบสรุปให้อัตโนมัติ
// ทุกตัวเลขเป็นเลขคณิตทบต้นตรงไปตรงมา ไม่มีการเดา % ความน่าจะเป็น

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const MIN_YEARS_FOR_ANNUALIZED = 0.25; // พอร์ตต้องมีอายุ ~3 เดือนขึ้นไปถึงจะประเมินอัตราโตจริงได้
export const GOAL_HORIZONS = [1, 3, 5, 10]; // ปีที่ระบบสรุปให้

export interface PortfolioGoal {
  targetAmount: number; // ยอดพอร์ตรวมที่อยากได้ (บาท)
}

export interface HorizonRequirement {
  years: number;
  annualReturnPercent: number; // ต้องโตเฉลี่ยปีละกี่ % ถึงจะถึงเป้าในกรอบเวลานี้
}

export interface PortfolioGoalAnalysis {
  targetAmount: number;
  currentValue: number;                 // ถ้าขายตอนนี้ (ประมาณ)
  remaining: number;                    // ยังขาดอีกเท่าไหร่ (< 0 = เกินเป้าแล้ว)
  progressRatio: number;                // currentValue / targetAmount
  reached: boolean;
  requiredByHorizon: HorizonRequirement[];   // สรุป 1/3/5/10 ปี
  actualAnnualReturnPercent: number | null;  // พอร์ตโตจริงเฉลี่ยปีละกี่ % ที่ผ่านมา
  projectedYearsToReach: number | null;      // ถ้าโตในพาซเดิมจะถึงเป้าในอีกกี่ปี
  projectedDate: string | null;              // ≈ วันที่ถึงเป้า (ISO)
}

export function analyzePortfolioGoal(
  goal: PortfolioGoal,
  totalValue: number,
  totalCost: number,
  portfolioStartDate: string | null,
  now: Date = new Date()
): PortfolioGoalAnalysis | null {
  if (goal.targetAmount <= 0) return null;

  const currentValue = totalValue;
  const reached = currentValue >= goal.targetAmount;
  const progressRatio = currentValue / goal.targetAmount;

  // สรุปอัตราที่ต้องการต่อปี ในแต่ละกรอบเวลา (คงที่ 1/3/5/10 ปี)
  const requiredByHorizon: HorizonRequirement[] = currentValue > 0 && !reached
    ? GOAL_HORIZONS.map((years) => ({
        years,
        annualReturnPercent: (Math.pow(goal.targetAmount / currentValue, 1 / years) - 1) * 100,
      }))
    : [];

  // อัตราโตจริงเฉลี่ยต่อปีของพอร์ต (จากวันซื้อแรก) — ฐานของการประมาณวันถึงเป้า
  let actualAnnualReturnPercent: number | null = null;
  if (portfolioStartDate && totalCost > 0 && totalValue > 0) {
    const yearsElapsed = (now.getTime() - new Date(portfolioStartDate).getTime()) / MS_PER_YEAR;
    if (yearsElapsed >= MIN_YEARS_FOR_ANNUALIZED) {
      actualAnnualReturnPercent = (Math.pow(totalValue / totalCost, 1 / yearsElapsed) - 1) * 100;
    }
  }

  // ถ้าโตในพาซเดิมต่อไป จะถึงเป้าในอีกกี่ปี (ต้องโตจริงเป็นบวกถึงคำนวณได้)
  let projectedYearsToReach: number | null = null;
  let projectedDate: string | null = null;
  if (!reached && actualAnnualReturnPercent != null && actualAnnualReturnPercent > 0 && currentValue > 0) {
    const years = Math.log(goal.targetAmount / currentValue) / Math.log(1 + actualAnnualReturnPercent / 100);
    projectedYearsToReach = years;
    projectedDate = new Date(now.getTime() + years * MS_PER_YEAR).toISOString();
  }

  return {
    targetAmount: goal.targetAmount,
    currentValue,
    remaining: goal.targetAmount - currentValue,
    progressRatio,
    reached,
    requiredByHorizon,
    actualAnnualReturnPercent,
    projectedYearsToReach,
    projectedDate,
  };
}
