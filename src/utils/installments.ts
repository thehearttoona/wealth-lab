import { InstallmentPlan } from '../types';

// เพิ่ม/ลด เดือนจาก YYYY-MM แล้วคืนค่า YYYY-MM
export const addMonths = (monthKey: string, delta: number): string => {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const getCurrentMonthKey = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// เดือนสุดท้ายที่ยังต้องจ่าย (startMonth + totalMonths - 1)
export const getEndMonth = (plan: InstallmentPlan): string =>
  addMonths(plan.startMonth, plan.totalMonths - 1);

// แผนนี้ยัง "แอคทีฟ" อยู่ในเดือนที่ระบุไหม (อยู่ในช่วง startMonth..endMonth)
export const isPlanActiveInMonth = (plan: InstallmentPlan, monthKey: string): boolean => {
  const endMonth = getEndMonth(plan);
  return monthKey >= plan.startMonth && monthKey <= endMonth;
};

// เหลืออีกกี่งวด นับจากเดือนที่ระบุ (รวมเดือนนั้นด้วยถ้ายัง active) — null ถ้าจบไปแล้วหรือยังไม่เริ่ม
export const getRemainingInstallments = (plan: InstallmentPlan, monthKey: string): number | null => {
  if (!isPlanActiveInMonth(plan, monthKey)) return null;
  const endMonth = getEndMonth(plan);
  // นับจำนวนเดือนจาก monthKey ถึง endMonth
  const [y1, m1] = monthKey.split('-').map(Number);
  const [y2, m2] = endMonth.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
};

// งวดที่เท่าไหร่ของแผนนี้ ตกที่เดือนที่ระบุ (1-indexed) — null ถ้าไม่ active ในเดือนนั้น
export const getInstallmentNumber = (plan: InstallmentPlan, monthKey: string): number | null => {
  if (!isPlanActiveInMonth(plan, monthKey)) return null;
  const [y1, m1] = plan.startMonth.split('-').map(Number);
  const [y2, m2] = monthKey.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
};

// ประมาณการยอดรวมของเดือนที่ระบุ จากแผนผ่อนทั้งหมดที่ยัง active อยู่ในเดือนนั้น
export const getEstimatedTotalForMonth = (plans: InstallmentPlan[], monthKey: string): number =>
  plans
    .filter((p) => isPlanActiveInMonth(p, monthKey))
    .reduce((sum, p) => sum + p.monthlyAmount, 0);

export const isPlanCompleted = (plan: InstallmentPlan, referenceMonth: string): boolean =>
  getEndMonth(plan) < referenceMonth;
