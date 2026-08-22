// ── กำไรที่เอามาหัก "บัญชีให้พอร์ตจ่ายชีวิต" — ทางเดียวของทั้งแอป ──
//
// สามจอต้องได้เลขเดียวกัน (บัญชีชีวิต · ปลดล็อกรางวัล · แถวเมนูในพอร์ต) ไม่งั้นผู้ใช้
// เห็น "เหลือให้รางวัล" ไม่ตรงกันสองหน้าแล้วไม่รู้จะเชื่ออันไหน — จึงรวมมาไว้ที่ไฟล์นี้ไฟล์เดียว
//
// ⚠️ ภาษีคิด **รายปีภาษี ปีละครั้งบนกำไรรวมของปีนั้น** ไม่ใช่ไล่คิดต่อไม้แล้วบวกกัน
// ฐานภาษีเป็นขั้นบันได กำไรก้อนใหญ่พาดข้ามขั้น — คิดต่อไม้แล้วบวกจะได้ภาษีต่ำกว่าจริง
// (กฎเดียวกับตอนกดปิดรอบใน CyclesScreen และ §6.5 ของ CLAUDE.md)
//
// ⚠️ ปีที่ยังไม่ได้กรอกเงินเดือน = **คิดภาษีไม่ได้** ไม่ใช่ภาษี 0
// ส่ง taxKnown: false กลับไปให้จอพิมพ์บอก ห้ามกลืนเป็น 0 แล้วปล่อยให้อ่านเหมือนไม่มีภาษี

import { RealizedTrade } from '../types/investment';
import { buildLifeLedger, ledgerFirstMonth, LedgerProfit, LifeLedger } from '../utils/lifeLedger';
import { calculateTax, realizedGainTHB, taxYearOf } from '../utils/taxCalc';
import { incomeExemptionFor } from '../types/userProfile';
import { getRealizedTrades } from './realizedStorage';
import { getTaxProfile } from './taxStorage';
import { getUserProfile } from './userProfileStorage';
import { getLedgerMonths } from './lifeLedgerStorage';

/** ไม้ที่ขายตั้งแต่เดือนแรกของบัญชีเป็นต้นไป — กำไรที่ได้ก่อนนั้นไปจ่ายเดือนที่ไม่มีในบัญชี */
export const tradesInLedgerWindow = (
  trades: RealizedTrade[],
  firstMonth: string | null
): RealizedTrade[] => {
  if (!firstMonth) return [];
  return trades.filter((t) => (t.sellDate || '').slice(0, 7) >= firstMonth);
};

/**
 * กำไรสุทธิหลังภาษีของช่วงบัญชี
 *
 * @param firstMonth เดือนแรกของบัญชี (จาก ledgerFirstMonth) — null = บัญชียังไม่เริ่ม คืน 0
 * @param known ไม้ที่ขายแล้วที่จอโหลดมาอยู่แล้ว — ส่งมาเพื่อไม่ต้องยิงซ้ำ
 */
export const loadLedgerProfit = async (
  firstMonth: string | null,
  known?: RealizedTrade[]
): Promise<LedgerProfit> => {
  if (!firstMonth) return { grossTHB: 0, taxTHB: 0, taxKnown: true };

  let all: RealizedTrade[];
  try {
    all = known ?? (await getRealizedTrades());
  } catch {
    // โหลดไม่ได้ = ยังไม่รู้ ไม่ใช่ "ไม่มีกำไร" — คืน taxKnown: false ให้จอบอกว่ายอดยังไม่ครบ
    return { grossTHB: 0, taxTHB: 0, taxKnown: false };
  }

  const trades = tradesInLedgerWindow(all, firstMonth);
  const grossTHB = trades.reduce((s, t) => s + realizedGainTHB(t), 0);
  if (trades.length === 0) return { grossTHB: 0, taxTHB: 0, taxKnown: true };

  // ยกเว้นเงินได้ 190,000 ต้องเป็นค่าเดียวกับที่หน้าภาษีใช้ ไม่งั้นสองหน้าโชว์ภาษีคนละตัว (§6.1)
  const person = await getUserProfile().catch(() => null);

  const years = [...new Set(trades.map((t) => taxYearOf(t.sellDate)).filter(Number.isFinite))];
  let taxTHB = 0;
  let taxKnown = true;

  for (const year of years) {
    const yearTrades = trades.filter((t) => taxYearOf(t.sellDate) === year);
    const profile = await getTaxProfile(year).catch(() => null);
    // ไม่มีโปรไฟล์ปีนั้น หรือมีแต่ยังไม่กรอกเดือนไหนเลย = ยังคิดขั้นภาษีไม่ได้
    if (!profile) {
      taxKnown = false;
      continue;
    }
    const opts = { incomeExemption: incomeExemptionFor(person, year).amount };
    const breakdown = calculateTax(profile, yearTrades, opts);
    if (breakdown.filledMonths === 0) taxKnown = false;
    // taxFromGains = ภาษีทั้งปี − ภาษีถ้าไม่มีกำไรก้อนนี้ (คิดเป็นส่วนต่างในที่เดียวใน taxCalc)
    taxTHB += Math.max(0, breakdown.taxFromGains);
  }

  return { grossTHB, taxTHB, taxKnown };
};

/**
 * บัญชีทั้งใบพร้อมใช้ — จอที่ต้องรู้แค่ "ค้างเท่าไหร่" เรียกตัวนี้ตัวเดียว
 *
 * ทนตารางหาย/โหลดพลาดโดยคืนบัญชีเปล่า (owedTHB = 0) เพราะจอที่เรียกตัวนี้
 * (คิวรางวัล · แถวเมนูในพอร์ต) มีเรื่องหลักของตัวเองอยู่แล้ว ยังไม่รัน SQL ก็ต้องใช้งานได้ตามปกติ
 * — หน้าบัญชีเองต่างหากที่ต้องขึ้นข้อความให้ไปรัน SQL จึงโหลดแยกเอง
 */
export const loadLifeLedger = async (known?: RealizedTrade[]): Promise<LifeLedger> => {
  let months: Awaited<ReturnType<typeof getLedgerMonths>> = [];
  try {
    months = await getLedgerMonths();
  } catch {
    months = [];
  }
  const profit = await loadLedgerProfit(ledgerFirstMonth(months), known).catch(() => ({
    grossTHB: 0,
    taxTHB: 0,
    taxKnown: false,
  }));
  return buildLifeLedger(months, profit);
};
