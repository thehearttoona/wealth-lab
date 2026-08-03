import { Investment } from '../types/investment';
import { InstallmentPlan } from '../types';
import { Account } from '../types/account';
import { convertToTHB } from './constants';
import { getCurrentMonthKey, getRemainingInstallments } from './installments';

export interface NetWorthBreakdown {
  portfolioValue: number; // มูลค่าพอร์ตตามราคาตลาด (THB)
  cash: number;           // เงินสดที่ยังไม่ได้ลงทุน (THB)
  debt: number;           // ยอดผ่อนที่ยังต้องจ่ายอีก (THB)
  netWorth: number;       // portfolioValue + cash − debt
  /** มีบัญชีที่ยังไม่ได้กรอกยอด — ตัวเลขเงินสดจึงต่ำกว่าความจริง */
  hasUnfilledAccount: boolean;
}

/**
 * เงินสดของบัญชี "รอลงทุน (สำรอง)" ต้องหักต้นทุนที่ซื้อไปแล้วออกก่อน
 *
 * เพราะ Account.manualBalance ของ role='reserve' คือ "ยอดที่เติมเข้าสะสม" ไม่ใช่ยอดคงเหลือ
 * (ดู types/account.ts) — เงินที่เอาไปซื้อหุ้นแล้วยังนับอยู่ในเลขนั้น ถ้าบวกกับมูลค่าพอร์ตตรง ๆ
 * จะนับเงินก้อนเดียวกันสองรอบ เช่น เติม 80,000 ซื้อไป 75,988 พอร์ตโต 79,408
 *   ผิด: 80,000 + 79,408 = 159,408
 *   ถูก: (80,000 − 75,988) + 79,408 = 83,420
 *
 * การจับคู่ใช้ account.platform ↔ investment.platform (case-insensitive)
 * บัญชี reserve ที่ยังไม่ได้ผูก platform = หักไม่ได้ ใช้ยอดที่เติมตรง ๆ
 */
const reserveCashTHB = (accounts: Account[], investments: Investment[]): number => {
  // ต้นทุนรวมต่อ platform
  const investedByPlatform = new Map<string, number>();
  investments.forEach((inv) => {
    const key = (inv.platform || '').trim().toLowerCase();
    if (!key) return;
    const cost = convertToTHB(inv.buyPrice, inv.currency ?? 'THB') * inv.quantity + (inv.fees || 0);
    investedByPlatform.set(key, (investedByPlatform.get(key) || 0) + cost);
  });

  // รวมบัญชีที่ผูก platform เดียวกันเข้าด้วยกันก่อนหัก — ไม่งั้นถ้ามี 2 บัญชีบน platform เดียวกัน
  // ต่างคนต่างหักต้นทุนก้อนเดิม จะหักเกินไปเท่าตัว
  const fundedByPlatform = new Map<string, number>();
  let unlinkedFunded = 0;

  accounts
    .filter((a) => a.role === 'reserve')
    .forEach((a) => {
      const funded = convertToTHB(a.manualBalance || 0, a.currency);
      const key = (a.platform || '').trim().toLowerCase();
      if (key) fundedByPlatform.set(key, (fundedByPlatform.get(key) || 0) + funded);
      else unlinkedFunded += funded;
    });

  let total = unlinkedFunded;
  fundedByPlatform.forEach((funded, key) => {
    // ซื้อเกินยอดที่จดว่าเติม (เช่นลืมอัปเดตยอด) — ปัดเป็น 0 ดีกว่าปล่อยให้เงินสดติดลบไปลดความมั่งคั่ง
    total += Math.max(0, funded - (investedByPlatform.get(key) || 0));
  });
  return total;
};

/** ยอดผ่อนที่ยังค้างอยู่ทั้งหมด = งวดที่เหลือ × ค่างวด */
export const totalRemainingDebt = (plans: InstallmentPlan[], monthKey = getCurrentMonthKey()): number =>
  plans.reduce((sum, p) => {
    const remaining = getRemainingInstallments(p, monthKey);
    return remaining ? sum + remaining * p.monthlyAmount : sum;
  }, 0);

export const computeNetWorth = (
  portfolioValue: number,
  accounts: Account[],
  investments: Investment[],
  plans: InstallmentPlan[]
): NetWorthBreakdown => {
  // บัญชีที่ไม่ใช่ reserve เก็บยอดคงเหลือตรง ๆ อยู่แล้ว ไม่ต้องหักอะไร
  const plainCash = accounts
    .filter((a) => a.role !== 'reserve')
    .reduce((s, a) => s + convertToTHB(a.manualBalance || 0, a.currency), 0);

  const cash = plainCash + reserveCashTHB(accounts, investments);
  const debt = totalRemainingDebt(plans);

  return {
    portfolioValue,
    cash,
    debt,
    netWorth: portfolioValue + cash - debt,
    hasUnfilledAccount: accounts.some((a) => a.manualBalance == null),
  };
};
