// วินัยการกันเงินลงทุน — วัดว่า "กันไว้แล้วลงจริงหรือเปล่า"
// จุดสำคัญ: แผนบอกว่ากัน 20% แต่ถ้าเงินไม่เคยถูกโอนเข้าลงทุนจริง แผนก็เป็นแค่ตัวเลขบนจอ
// ตัวนี้ไม่ต้องให้ผู้ใช้กรอกอะไรเพิ่ม — อ่านจากรายการลงทุนที่บันทึกไว้แล้ว

import { Investment, RealizedTrade } from '../types/investment';
import { convertToTHB, toChristianYear } from './constants';

export const monthKeyOf = (dateStr: string): string => toChristianYear(dateStr || '').slice(0, 7);

export const currentMonthKey = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

// เงินที่ลงทุนจริงต่อเดือน (ต้นทุน THB) — นับทั้งของที่ยังถือและที่ขายไปแล้ว
// ถ้านับแค่ของที่ยังถือ เดือนเก่าจะหายไปทุกครั้งที่ขายทิ้ง ทำให้ streak เพี้ยนย้อนหลัง
export function investedByMonth(
  investments: Investment[],
  realized: RealizedTrade[]
): Record<string, number> {
  const byMonth: Record<string, number> = {};
  const add = (dateStr: string, amount: number) => {
    const k = monthKeyOf(dateStr);
    if (!/^\d{4}-\d{2}$/.test(k) || !isFinite(amount) || amount <= 0) return;
    byMonth[k] = (byMonth[k] || 0) + amount;
  };
  investments.forEach((inv) =>
    add(inv.buyDate, convertToTHB(inv.buyPrice, inv.currency) * inv.quantity + (inv.fees || 0))
  );
  realized.forEach((t) => add(t.buyDate, convertToTHB(t.buyPrice, t.currency) * t.quantity));
  return byMonth;
}

// นับเดือนที่กันเงินได้จริงติดกัน — เริ่มนับจาก "เดือนที่แล้ว" เพราะเดือนปัจจุบันยังไม่จบ
// ผ่านเกณฑ์ = ลงจริง >= เป้า × threshold (ผ่อนไว้ 80% ไม่ให้พลาดเพราะเศษสตางค์)
export function setAsideStreak(
  byMonth: Record<string, number>,
  targetPerMonth: number,
  now: Date = new Date(),
  threshold = 0.8
): number {
  if (targetPerMonth <= 0) return 0;
  let streak = 0;
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // เพดาน 36 รอบ กันลูปไม่จบถ้าข้อมูลผิดรูป
  for (let i = 0; i < 36; i++) {
    const key = currentMonthKey(d);
    if ((byMonth[key] || 0) >= targetPerMonth * threshold) {
      streak++;
      d.setMonth(d.getMonth() - 1);
    } else break;
  }
  return streak;
}
