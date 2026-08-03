import { Expense, RecurringBill } from '../types';
import { toChristianYear } from './constants';

/** อัตราเงินเฟ้อเฉลี่ยที่ใช้เป็นฐาน (%/ปี) */
export const INFLATION_RATE = 2.5;

export interface CoverageResult {
  /** รายจ่ายจริงสะสมตั้งแต่ต้นปี (รายวัน + ค่าใช้จ่ายประจำ) */
  expenseYTD: number;
  /** กำไรพอร์ตครอบคลุมรายจ่ายปีนี้ได้กี่ % — null เมื่อยังไม่มีรายจ่ายให้เทียบ */
  coveragePercent: number | null;
  /** ต้องได้ผลตอบแทนปีละกี่ % ถึงจะจ่ายค่าใช้จ่ายไหว + สู้เงินเฟ้อ — null เมื่อยังไม่มีพอร์ต */
  requiredReturnPercent: number | null;
}

/**
 * รายจ่ายจริงสะสมตั้งแต่ต้นปี
 *
 * เดิมหน้า "สรุปรายจ่ายรายเดือน" ใช้ยอดที่ผู้ใช้พิมพ์เองในตาราง monthly_summaries
 * ซึ่งขัดกับยอดที่คำนวณได้จากรายการจริงได้ตลอด — ตัวนี้อ่านจากรายการจริงอย่างเดียว
 */
export const expenseYearToDate = (
  expenses: Expense[],
  bills: RecurringBill[],
  year = new Date().getFullYear()
): number => {
  const prefix = `${year}-`;

  const daily = expenses.reduce(
    (s, e) => (e.date && toChristianYear(e.date).startsWith(prefix) ? s + e.amount : s),
    0
  );

  // ค่าใช้จ่ายประจำเก็บเป็น map เดือน -> ยอดที่บันทึกจริงของเดือนนั้น
  const recurring = bills.reduce((s, b) => {
    const perMonth = Object.entries(b.monthlyAmounts ?? {})
      .filter(([monthKey]) => monthKey.startsWith(prefix))
      .reduce((ms, [, amount]) => ms + (amount || 0), 0);
    return s + perMonth;
  }, 0);

  return daily + recurring;
};

/**
 * "พอร์ตเลี้ยงตัวเองได้แค่ไหน"
 *
 * ⚠️ profitNow คือกำไรลอยตัว ณ ตอนนี้ทั้งก้อน (ไม่ใช่กำไรเฉพาะปีนี้) จึงเทียบกับรายจ่าย
 * ปีนี้แบบไม่ตรงคาบเป๊ะ — ป้ายบนหน้าจอต้องเขียนให้ตรงตามนี้ อย่าเรียกว่า "กำไรปีนี้"
 */
export const computeCoverage = (
  expenses: Expense[],
  bills: RecurringBill[],
  portfolioValue: number,
  profitNow: number
): CoverageResult => {
  const expenseYTD = expenseYearToDate(expenses, bills);

  return {
    expenseYTD,
    coveragePercent: expenseYTD > 0 ? (profitNow / expenseYTD) * 100 : null,
    requiredReturnPercent:
      portfolioValue > 0
        ? ((expenseYTD + portfolioValue * (INFLATION_RATE / 100)) / portfolioValue) * 100
        : null,
  };
};
