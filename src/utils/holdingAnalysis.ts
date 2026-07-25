// วิเคราะห์รายตัว: อัตราโตเฉลี่ยต่อปีของหุ้น/เหรียญนั้น (จากวันซื้อ→ปัจจุบัน)
// และคาดว่าอีกกี่ปีจะถึงจุดขายทำกำไร — เลขคณิตทบต้น ไม่ใช่การพยากรณ์

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const MIN_YEARS = 0.25; // ถือ < ~3 เดือน อย่าคิด avg/ปี (จะเพี้ยนสูง)

// อัตราโตเฉลี่ยต่อปี (CAGR) จากราคาซื้อ→ปัจจุบัน — ใช้ราคาสกุลเดิม (ratio ไม่ขึ้นกับสกุลเงิน)
export function getHoldingAnnualGrowth(
  buyDate: string,
  buyPrice: number,
  currentPrice: number,
  now: Date = new Date()
): { annualReturnPercent: number | null; tooNew: boolean } {
  if (!buyDate || buyPrice <= 0 || currentPrice <= 0) return { annualReturnPercent: null, tooNew: false };
  const years = (now.getTime() - new Date(buyDate).getTime()) / MS_PER_YEAR;
  if (years < MIN_YEARS) return { annualReturnPercent: null, tooNew: true };
  const cagr = (Math.pow(currentPrice / buyPrice, 1 / years) - 1) * 100;
  return { annualReturnPercent: cagr, tooNew: false };
}

// อีกกี่ปีจะถึงจุดขายทำกำไร (target %) ถ้าโตในอัตราเดิม — null ถ้าอัตรา <= 0 หรือถึงแล้ว
export function getYearsToTarget(
  currentReturnPercent: number,
  targetReturnPercent: number,
  annualReturnPercent: number | null
): number | null {
  if (annualReturnPercent == null || annualReturnPercent <= 0) return null;
  if (currentReturnPercent >= targetReturnPercent) return 0; // ถึงเป้าแล้ว
  const curMult = 1 + currentReturnPercent / 100;
  const tgtMult = 1 + targetReturnPercent / 100;
  if (curMult <= 0) return null;
  return Math.log(tgtMult / curMult) / Math.log(1 + annualReturnPercent / 100);
}
