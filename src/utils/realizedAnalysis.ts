// ผลตอบแทนที่เกิดขึ้นจริง (realized) — จากการขายที่บันทึกไว้
// นี่คือตัวเลข "ฝีมือจริง" ต่างจากกำไรลอยตัวที่ยังไม่ได้ขาย
// ทุกอย่างเป็นเลขคณิตตรงไปตรงมา ไม่มีการพยากรณ์

import { RealizedTrade } from '../types/investment';
import { convertToTHB } from './constants';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
// ต้องมีอายุถือถ่วงน้ำหนัก >= ~3 เดือน ถึงจะแปลงเป็น "ต่อปี" ได้ไม่เพี้ยน
// (เท่ากับเกณฑ์ที่ใช้ใน investmentGoals.ts / holdingAnalysis.ts)
const MIN_YEARS_FOR_ANNUALIZED = 0.25;

export interface RealizedTradeResult {
  trade: RealizedTrade;
  costTHB: number;
  proceedsTHB: number;
  pnlTHB: number;
  pnlPercent: number;
  years: number;      // ถือนานกี่ปี
  isWin: boolean;
}

export interface RealizedSummary {
  tradeCount: number;
  totalCostTHB: number;
  totalProceedsTHB: number;
  totalPnlTHB: number;
  totalPnlPercent: number;
  winCount: number;
  winRatePercent: number;
  avgHoldYears: number;            // อายุถือเฉลี่ยถ่วงน้ำหนักด้วยต้นทุน
  annualReturnPercent: number | null; // CAGR จริง — null = ข้อมูลยังน้อย/สั้นเกินไป
  tooShort: boolean;               // true = ปิดดีลเร็วเกินไปจนยังแปลงเป็นต่อปีไม่ได้
  bestTrade: RealizedTradeResult | null;
  worstTrade: RealizedTradeResult | null;
}

// คำนวณผล 1 ดีล — แปลงเป็น THB ด้วย convertToTHB (เรตคงที่ ชุดเดียวกับ getPortfolioSummary)
export function analyzeRealizedTrade(trade: RealizedTrade): RealizedTradeResult {
  const buyTHB = convertToTHB(trade.buyPrice, trade.currency);
  const sellTHB = convertToTHB(trade.sellPrice, trade.currency);
  const costTHB = buyTHB * trade.quantity;
  // ค่าธรรมเนียมหักออกจากเงินที่ได้กลับมา (เก็บเป็น THB อยู่แล้ว)
  const proceedsTHB = sellTHB * trade.quantity - (trade.fees || 0);
  const pnlTHB = proceedsTHB - costTHB;
  const years = Math.max(
    0,
    (new Date(trade.sellDate).getTime() - new Date(trade.buyDate).getTime()) / MS_PER_YEAR
  );
  return {
    trade,
    costTHB,
    proceedsTHB,
    pnlTHB,
    pnlPercent: costTHB > 0 ? (pnlTHB / costTHB) * 100 : 0,
    years,
    isWin: pnlTHB > 0,
  };
}

// สรุปรวมทุกดีล + CAGR จริงแบบถ่วงน้ำหนักด้วยเงิน (money-weighted)
//   multiple = เงินที่ได้กลับมารวม / ต้นทุนรวม
//   avgYears = Σ(ต้นทุน_i × ปีที่ถือ_i) / Σต้นทุน_i   ← ถ่วงด้วยต้นทุน ดีลใหญ่มีน้ำหนักมากกว่า
//   CAGR     = multiple^(1/avgYears) − 1
// เลือกวิธีนี้เพราะการเฉลี่ย % ของแต่ละดีลตรง ๆ จะถูกดีลจิ๋ว/ดีลสั้นบิดเบือนหนัก
export function summarizeRealized(trades: RealizedTrade[]): RealizedSummary {
  const results = trades.map(analyzeRealizedTrade);
  const empty: RealizedSummary = {
    tradeCount: 0,
    totalCostTHB: 0,
    totalProceedsTHB: 0,
    totalPnlTHB: 0,
    totalPnlPercent: 0,
    winCount: 0,
    winRatePercent: 0,
    avgHoldYears: 0,
    annualReturnPercent: null,
    tooShort: false,
    bestTrade: null,
    worstTrade: null,
  };
  if (results.length === 0) return empty;

  const totalCostTHB = results.reduce((s, r) => s + r.costTHB, 0);
  const totalProceedsTHB = results.reduce((s, r) => s + r.proceedsTHB, 0);
  const totalPnlTHB = totalProceedsTHB - totalCostTHB;
  const winCount = results.filter((r) => r.isWin).length;

  const avgHoldYears =
    totalCostTHB > 0 ? results.reduce((s, r) => s + r.costTHB * r.years, 0) / totalCostTHB : 0;

  let annualReturnPercent: number | null = null;
  let tooShort = false;
  if (totalCostTHB > 0 && totalProceedsTHB > 0) {
    if (avgHoldYears >= MIN_YEARS_FOR_ANNUALIZED) {
      const multiple = totalProceedsTHB / totalCostTHB;
      annualReturnPercent = (Math.pow(multiple, 1 / avgHoldYears) - 1) * 100;
    } else {
      tooShort = true;
    }
  }

  const sorted = [...results].sort((a, b) => b.pnlPercent - a.pnlPercent);

  return {
    tradeCount: results.length,
    totalCostTHB,
    totalProceedsTHB,
    totalPnlTHB,
    totalPnlPercent: totalCostTHB > 0 ? (totalPnlTHB / totalCostTHB) * 100 : 0,
    winCount,
    winRatePercent: (winCount / results.length) * 100,
    avgHoldYears,
    annualReturnPercent,
    tooShort,
    bestTrade: sorted[0] ?? null,
    worstTrade: sorted[sorted.length - 1] ?? null,
  };
}
