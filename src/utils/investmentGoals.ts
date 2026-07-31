// เป้าหมายพอร์ตรวม — ผู้ใช้ปักแค่ "ยอดที่อยากได้" (บาท) ระบบสรุปให้อัตโนมัติ
// ทุกตัวเลขเป็นเลขคณิตทบต้นตรงไปตรงมา ไม่มีการเดา % ความน่าจะเป็น

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const MIN_YEARS_FOR_ANNUALIZED = 0.25; // พอร์ตต้องมีอายุ ~3 เดือนขึ้นไปถึงจะประเมินอัตราโตจริงได้
export const GOAL_HORIZONS = [1, 3, 5, 10]; // ปีที่ระบบสรุปให้

export interface PortfolioGoal {
  targetAmount: number;                  // ยอดพอร์ตรวมที่อยากได้ (บาท)
  expectedAnnualReturnPercent?: number;  // คาดว่าจะโตปีละกี่ % (ผู้ใช้ตั้งเอง — ไม่บังคับ)
}

export interface HorizonRequirement {
  years: number;
  annualReturnPercent: number; // ต้องโตเฉลี่ยปีละกี่ % ถึงจะถึงเป้าในกรอบเวลานี้
}

// 'realized' = วัดจากการขายจริง (น่าเชื่อถือสุด), 'user' = ผู้ใช้พิมพ์เอง, 'actual' = CAGR ของพอร์ตที่ยังไม่ขาย
export type ProjectionSource = 'user' | 'actual' | 'realized';

export interface PortfolioGoalAnalysis {
  targetAmount: number;
  currentValue: number;                 // ถ้าขายตอนนี้ (ประมาณ)
  remaining: number;                    // ยังขาดอีกเท่าไหร่ (< 0 = เกินเป้าแล้ว)
  progressRatio: number;                // currentValue / targetAmount
  reached: boolean;
  requiredByHorizon: HorizonRequirement[];   // สรุป 1/3/5/10 ปี
  actualAnnualReturnPercent: number | null;  // พอร์ตโตจริงเฉลี่ยปีละกี่ % ที่ผ่านมา
  projectionRatePercent: number | null;      // อัตราที่ใช้ประมาณวันถึงเป้า
  projectionSource: ProjectionSource | null; // มาจากผู้ใช้ตั้งเอง หรือพาซจริง
  projectedYearsToReach: number | null;      // ถ้าโตในอัตรานี้จะถึงเป้าในอีกกี่ปี
  projectedDate: string | null;              // ≈ วันที่ถึงเป้า (ISO)
}

export function analyzePortfolioGoal(
  goal: PortfolioGoal,
  totalValue: number,
  totalCost: number,
  portfolioStartDate: string | null,
  now: Date = new Date(),
  // CAGR ที่วัดได้จากการขายจริง — ถ้ามี จะถูกใช้ก่อนเลขที่ผู้ใช้ตั้งเอง
  // เพราะ "ของจริงที่วัดได้" เชื่อถือได้กว่า "ที่หวังไว้"
  realizedAnnualReturnPercent: number | null = null
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

  // อัตราโตจริงเฉลี่ยต่อปีของพอร์ต (จากวันซื้อแรก)
  let actualAnnualReturnPercent: number | null = null;
  if (portfolioStartDate && totalCost > 0 && totalValue > 0) {
    const yearsElapsed = (now.getTime() - new Date(portfolioStartDate).getTime()) / MS_PER_YEAR;
    if (yearsElapsed >= MIN_YEARS_FOR_ANNUALIZED) {
      actualAnnualReturnPercent = (Math.pow(totalValue / totalCost, 1 / yearsElapsed) - 1) * 100;
    }
  }

  // ลำดับความน่าเชื่อถือ: ขายจริง > ผู้ใช้ตั้งเอง > CAGR ของพอร์ตที่ยังไม่ขาย
  // ตั้งใจให้ "ขายจริง" ชนะเลขที่ผู้ใช้ตั้งเอง — ถ้าฝีมือจริงต่างจากที่หวัง ควรเห็นความจริง
  let projectionRatePercent: number | null = null;
  let projectionSource: ProjectionSource | null = null;
  if (realizedAnnualReturnPercent != null && realizedAnnualReturnPercent > 0) {
    projectionRatePercent = realizedAnnualReturnPercent;
    projectionSource = 'realized';
  } else if (goal.expectedAnnualReturnPercent != null && goal.expectedAnnualReturnPercent > 0) {
    projectionRatePercent = goal.expectedAnnualReturnPercent;
    projectionSource = 'user';
  } else if (actualAnnualReturnPercent != null && actualAnnualReturnPercent > 0) {
    projectionRatePercent = actualAnnualReturnPercent;
    projectionSource = 'actual';
  }

  let projectedYearsToReach: number | null = null;
  let projectedDate: string | null = null;
  if (!reached && projectionRatePercent != null && currentValue > 0) {
    const years = Math.log(goal.targetAmount / currentValue) / Math.log(1 + projectionRatePercent / 100);
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
    projectionRatePercent,
    projectionSource,
    projectedYearsToReach,
    projectedDate,
  };
}

// จำนวนปีที่จะถึงเป้า เมื่อเติมเงินลงทุนเพิ่มทุกเดือน (พอร์ตทบต้นรายปี + เงินเติมแบบ annuity)
//   FV(t) = current(1+r)^t + Cยรายปี·[((1+r)^t − 1)/r]  →  แก้หา t
// คืน null ถ้าไปไม่ถึง (เช่น ไม่โต ไม่เติมเงิน) ; คืน 0 ถ้าถึงเป้าแล้ว
export function yearsToReachGoal(
  current: number,
  target: number,
  annualReturnPercent: number,
  monthlyContribution: number
): number | null {
  if (target <= 0) return null;
  if (current >= target) return 0;
  const r = annualReturnPercent / 100;
  const annualC = Math.max(0, monthlyContribution) * 12;
  if (r <= 0) {
    // ไม่มีการโต — พึ่งเงินเติมล้วน
    return annualC > 0 ? (target - current) / annualC : null;
  }
  const k = annualC / r;
  const ratio = (target + k) / (current + k);
  if (ratio <= 0) return null;
  const years = Math.log(ratio) / Math.log(1 + r);
  return years > 0 && Number.isFinite(years) ? years : null;
}

// ตัวกลับด้านของ monthsToReachGoal: อยากถึงเป้าใน "กี่ปี" ต้องเติมเดือนละเท่าไหร่
//   FV(n) = current(1+m)^n + C·[((1+m)^n − 1)/m] = target  →  แก้หา C (เงินเติมต่อเดือน)
//   โดย m = อัตราต่อเดือนที่ได้จากอัตราต่อปีแบบทบต้น, n = years×12
// คืน 0 ถ้าไม่ต้องเติม (ถึงเป้าแล้ว หรือปล่อยให้โตเองก็ถึง) ; คืน null ถ้าคำนวณไม่ได้
export function requiredMonthlyContribution(
  current: number,
  target: number,
  annualReturnPercent: number,
  years: number
): number | null {
  if (target <= 0 || years <= 0) return null;
  if (current >= target) return 0;
  const n = years * 12;
  const m = Math.pow(1 + annualReturnPercent / 100, 1 / 12) - 1; // อัตราต่อเดือนจากต่อปี (ทบต้น)
  if (m <= 0) {
    // ไม่โต (หรือติดลบ) — พึ่งเงินเติมล้วน
    return (target - current) / n;
  }
  const grown = current * Math.pow(1 + m, n);
  if (grown >= target) return 0; // ปล่อยให้พอร์ตโตเองก็ถึงเป้าแล้ว ไม่ต้องเติม
  const C = ((target - grown) * m) / (Math.pow(1 + m, n) - 1);
  return C > 0 && Number.isFinite(C) ? C : null;
}

// สัดส่วนที่ใช้จำลองในตาราง: 10% → 80% ทีละ 10
export const INVEST_PERCENT_STEPS = [10, 20, 30, 40, 50, 60, 70, 80];

// สัดส่วนกำไรต่อเดือนที่ใช้จำลอง (%/เดือน) — จากทำได้จริงแบบระวัง ไปจนถึงเทรดเก่งมาก
export const MONTHLY_RETURN_STEPS = [1, 2, 3, 5, 7, 10];

// แปลงกำไรต่อเดือน (ทบต้น) → กำไรต่อปีเทียบเท่า (%)
export function monthlyToAnnualPercent(monthlyReturnPercent: number): number {
  return (Math.pow(1 + monthlyReturnPercent / 100, 12) - 1) * 100;
}

// จำนวนเดือนที่จะถึงเป้า เมื่อพอร์ตโต m%/เดือน (ทบต้นรายเดือน) + เติมเงินทุกเดือน (annuity รายเดือน)
//   FV(n) = current(1+m)^n + C·[((1+m)^n − 1)/m]  →  แก้หา n
// คืน null ถ้าไปไม่ถึง (ไม่โต + ไม่เติมเงิน) ; คืน 0 ถ้าถึงเป้าแล้ว
export function monthsToReachGoal(
  current: number,
  target: number,
  monthlyReturnPercent: number,
  monthlyContribution: number
): number | null {
  if (target <= 0) return null;
  if (current >= target) return 0;
  const m = monthlyReturnPercent / 100;
  const C = Math.max(0, monthlyContribution);
  if (m <= 0) {
    // ไม่โต — พึ่งเงินเติมล้วน
    return C > 0 ? (target - current) / C : null;
  }
  const k = C / m;
  const ratio = (target + k) / (current + k);
  if (ratio <= 0) return null;
  const n = Math.log(ratio) / Math.log(1 + m);
  return n > 0 && Number.isFinite(n) ? n : null;
}
