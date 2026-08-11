import { Investment } from '../types/investment';
import { InvestmentCycle, basketAccepts } from '../types/cycle';
import { convertToTHB, toChristianYear } from './constants';

// ── คณิตของ "รอบลงทุน" ──
// pure ทั้งไฟล์ ไม่มี React ไม่มี network
//
// กฎเหล็กของไฟล์นี้: ตัวเลขที่คำนวณจากตัวหารที่ยัง <= 0 ต้องคืน null ไม่ใช่ 0
// เพราะ 0 อ่านว่า "วัดแล้วได้ศูนย์" ซึ่งคนละเรื่องกับ "ยังวัดไม่ได้"
// (แบบเดียวกับ portfolioCoverage / realizedAnalysis)

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// รอบที่สั้นกว่านี้ ห้ามคิดผลตอบแทนต่อปี — กำไร 5% ใน 6 วันแปลงเป็นต่อปีได้หลายพัน %
// ซึ่งไม่ได้บอกอะไรเลยนอกจากทำให้ตัวเลขบนจอดูเป็นเรื่องโกหก
export const MIN_DAYS_FOR_ANNUALIZED = 30;

/** ต้นทุนของไม้เป็นบาท — รวมค่าธรรมเนียม (ค่าธรรมเนียมเก็บเป็นบาทอยู่แล้ว เหมือน summarizeInvestments) */
export const legCostTHB = (inv: Investment): number =>
  convertToTHB(inv.buyPrice, inv.currency) * inv.quantity + (inv.fees || 0);

/** มูลค่าปัจจุบันของไม้เป็นบาท — ไม่มีราคาปัจจุบันก็ใช้ต้นทุน (= กำไร 0) ดู missingPriceCount */
export const legValueTHB = (inv: Investment): number =>
  convertToTHB(inv.currentPrice ?? inv.buyPrice, inv.currency) * inv.quantity;

const hasLivePrice = (inv: Investment): boolean =>
  typeof inv.currentPrice === 'number' && inv.currentPrice > 0;

const daysSince = (dateStr: string): number => {
  const t = new Date(toChristianYear(dateStr || '')).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / MS_PER_DAY));
};

export interface CycleStatus {
  legCount: number;
  /** ต้นทุนรวมของไม้ที่ยังอยู่ในรอบ (THB) */
  investedTHB: number;
  valueTHB: number;
  /** null = ยังไม่มีไม้ในรอบ (รอบเปล่าไม่ใช่รอบที่กำไร 0) */
  profitTHB: number | null;
  profitPercent: number | null;
  met: boolean;
  /**
   * มูลค่ารวมต้องขึ้นอีกกี่ % ถึงจะถึงเป้า — เลขที่ต้องโชว์คู่กับ % กำไรเสมอ
   * % กำไรอย่างเดียวหลอกตา: เติมไม้แล้วมันดูขยับใกล้เป้า ทั้งที่เงินที่ผิดทางเพิ่มขึ้น
   * ค่าติดลบ = เลยเป้าไปแล้ว, null = ยังไม่มีมูลค่าให้เทียบ
   */
  requiredBouncePercent: number | null;
  budgetTHB: number | null;
  budgetLeftTHB: number | null;
  budgetUsedPercent: number | null;
  /** เหลือลงได้อีกกี่ไม้ ตามงบที่เหลือ ÷ เงินต่อไม้ — null = ไม่ได้ตั้งงบ/ไม่รู้เงินต่อไม้ */
  roundsLeft: number | null;
  overBudget: boolean;
  days: number;
  /** ไม้ที่ยังไม่มีราคาปัจจุบัน (กองทุน/ทองที่กรอกเอง) — กำไรรวมจะต่ำกว่าความจริง */
  missingPriceCount: number;
  legCountBySymbol: { symbol: string; count: number }[];
}

/** ไม้ที่อยู่ในรอบนี้ — ผูกด้วย cycleId เท่านั้น ไม่เดาจากประเภท/วันที่ */
export const legsOfCycle = (cycle: InvestmentCycle, all: Investment[]): Investment[] =>
  all.filter((i) => i.cycleId === cycle.id);

/** ไม้ที่ยังไม่อยู่รอบไหนเลย และเข้าตะกร้านี้ได้ — ใช้ตอนเปิดรอบแรกเพื่อดึงของที่ถืออยู่เข้ามา */
export const orphanLegsForBasket = (cycle: InvestmentCycle, all: Investment[]): Investment[] =>
  all.filter((i) => !i.cycleId && basketAccepts(cycle.basket, i.type));

export const summarizeCycle = (
  cycle: InvestmentCycle,
  legs: Investment[],
  opts: { perRoundTHB?: number | null } = {}
): CycleStatus => {
  const investedTHB = legs.reduce((s, i) => s + legCostTHB(i), 0);
  const valueTHB = legs.reduce((s, i) => s + legValueTHB(i), 0);
  const hasCost = investedTHB > 0;

  const profitTHB = hasCost ? valueTHB - investedTHB : null;
  const profitPercent = hasCost ? ((valueTHB - investedTHB) / investedTHB) * 100 : null;

  const neededValue = investedTHB * (1 + cycle.targetProfitPercent / 100);
  const requiredBouncePercent =
    hasCost && valueTHB > 0 ? (neededValue / valueTHB - 1) * 100 : null;

  const budgetTHB = cycle.budgetTHB && cycle.budgetTHB > 0 ? cycle.budgetTHB : null;
  const budgetLeftTHB = budgetTHB != null ? budgetTHB - investedTHB : null;
  const budgetUsedPercent = budgetTHB != null ? (investedTHB / budgetTHB) * 100 : null;
  const perRound = opts.perRoundTHB && opts.perRoundTHB > 0 ? opts.perRoundTHB : null;
  const roundsLeft =
    budgetLeftTHB != null && perRound != null ? Math.max(0, Math.floor(budgetLeftTHB / perRound)) : null;

  const bySymbol = new Map<string, number>();
  legs.forEach((i) => {
    const key = i.symbol || i.name;
    bySymbol.set(key, (bySymbol.get(key) || 0) + 1);
  });

  return {
    legCount: legs.length,
    investedTHB,
    valueTHB,
    profitTHB,
    profitPercent,
    met: profitPercent != null && profitPercent >= cycle.targetProfitPercent,
    requiredBouncePercent,
    budgetTHB,
    budgetLeftTHB,
    budgetUsedPercent,
    roundsLeft,
    overBudget: budgetLeftTHB != null && budgetLeftTHB < 0,
    days: daysSince(cycle.startedAt),
    missingPriceCount: legs.filter((i) => !hasLivePrice(i)).length,
    legCountBySymbol: Array.from(bySymbol.entries())
      .map(([symbol, count]) => ({ symbol, count }))
      .sort((a, b) => b.count - a.count),
  };
};

/**
 * ลงไม้ตัวนี้เพิ่มได้ไหมตามกฎของรอบ
 * คืนเหตุผลเป็นข้อความไทยเสมอเมื่อลงไม่ได้ — ปุ่มต้องเทาพร้อมเหตุผล ไม่ใช่หายไป
 * (ปุ่มหาย = ผู้ใช้อ่านว่าแอปพัง / ปุ่มเทาพร้อมเหตุผล = กฎที่ตัวเองตั้งกำลังทำงาน)
 */
export const canAddLeg = (
  cycle: InvestmentCycle,
  status: CycleStatus,
  symbol: string,
  amountTHB?: number | null
): { ok: boolean; reason?: string } => {
  const cap = cycle.maxLegsPerSymbol;
  if (cap && cap > 0) {
    const used = status.legCountBySymbol.find((s) => s.symbol === symbol)?.count ?? 0;
    if (used >= cap) return { ok: false, reason: `ครบเพดาน ${cap} ไม้ของ ${symbol} ในรอบนี้แล้ว` };
  }
  if (status.budgetLeftTHB != null) {
    if (status.budgetLeftTHB <= 0) return { ok: false, reason: 'ใช้งบของรอบนี้ครบแล้ว' };
    if (amountTHB && amountTHB > status.budgetLeftTHB) {
      return { ok: false, reason: 'ยอดนี้เกินงบที่เหลือของรอบ' };
    }
  }
  return { ok: true };
};

// ── ผลตอบแทนต่อปีของ "รอบ" ──
// ตัวนี้มาแทน CAGR รายไม้ ซึ่งกลยุทธ์นี้ทำให้เป็น null ตลอด
// (realizedAnalysis คืน null เมื่ออายุถือถ่วงน้ำหนัก < 0.25 ปี — DCA แล้วปิดรอบก็เข้าเงื่อนไขนั้นเสมอ)
export const annualizedCyclePercent = (
  profitPercent: number,
  days: number
): number | null => {
  if (days < MIN_DAYS_FOR_ANNUALIZED) return null;
  const growth = 1 + profitPercent / 100;
  if (growth <= 0) return null; // ขาดทุนจนมูลค่าติดลบ — ยกกำลังแล้วไม่มีความหมาย
  return (Math.pow(growth, 365.25 / days) - 1) * 100;
};

export interface CycleHistoryRow {
  cycle: InvestmentCycle;
  investedTHB: number;
  profitTHB: number;
  profitPercent: number | null;
  days: number;
  annualPercent: number | null;
  /** true = รอบสั้นเกินกว่าจะคิดต่อปี (ดู MIN_DAYS_FOR_ANNUALIZED) — UI ต้องบอกเหตุผล ไม่ใช่เว้นว่าง */
  tooShort: boolean;
}

export interface CycleHistory {
  rows: CycleHistoryRow[];
  cycleCount: number;
  winCount: number;
  avgDays: number | null;
  avgProfitPercent: number | null;
  totalProfitTHB: number;
}

/** สรุปรอบที่ปิดแล้ว — อ่านจาก snapshot ในแถว cycle ไม่ใช่คำนวณใหม่จาก realized_trades */
export const summarizeCycleHistory = (closed: InvestmentCycle[]): CycleHistory => {
  const rows: CycleHistoryRow[] = closed
    .filter((c) => !!c.closedAt)
    .map((c) => {
      const investedTHB = c.closedInvestedTHB ?? 0;
      const profitTHB = c.closedProfitTHB ?? 0;
      const days = c.closedDays ?? 0;
      const profitPercent = investedTHB > 0 ? (profitTHB / investedTHB) * 100 : null;
      const annualPercent =
        profitPercent != null && days > 0 ? annualizedCyclePercent(profitPercent, days) : null;
      return {
        cycle: c,
        investedTHB,
        profitTHB,
        profitPercent,
        days,
        annualPercent,
        tooShort: days > 0 && days < MIN_DAYS_FOR_ANNUALIZED,
      };
    })
    .sort((a, b) => (a.cycle.closedAt! < b.cycle.closedAt! ? 1 : -1));

  const withPercent = rows.filter((r) => r.profitPercent != null);
  const withDays = rows.filter((r) => r.days > 0);

  return {
    rows,
    cycleCount: rows.length,
    winCount: rows.filter((r) => r.profitTHB > 0).length,
    avgDays: withDays.length > 0 ? withDays.reduce((s, r) => s + r.days, 0) / withDays.length : null,
    avgProfitPercent:
      withPercent.length > 0
        ? withPercent.reduce((s, r) => s + (r.profitPercent as number), 0) / withPercent.length
        : null,
    totalProfitTHB: rows.reduce((s, r) => s + r.profitTHB, 0),
  };
};
