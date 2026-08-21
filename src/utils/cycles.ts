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

// ── "ต้องขายที่ราคาเท่าไหร่" (2026-08-21) ─────────────────────────────────────
//
// ตัวเลขที่ขาดมาตลอดคือราคาที่เอาไป **ตั้งคำสั่งขายได้จริง** — %กำไรของรอบบอกว่า
// "ยังไม่ถึง" แต่ไม่เคยบอกว่าต้องตั้งขายที่เท่าไหร่ ต้องมานั่งคิดเองทุกครั้ง
//
// ⚠️ ต้องคิดค่าธรรมเนียม **ขาขาย** ด้วย ไม่งั้นราคาคุ้มทุนที่โชว์จะต่ำกว่าความจริง
// แล้วคนตั้งขายที่ราคานั้นจะขาดทุนจริงทั้งที่จอบอกว่าเท่าทุน
// ต้นทุน (legCostTHB) รวมค่าธรรมเนียมขาซื้อไว้แล้ว ที่ยังขาดคือขาขายอย่างเดียว
//
// ⚠️ ค่าธรรมเนียมที่ยังไม่ได้ตั้งใน "สกุลเงิน & แพลตฟอร์ม" = **ไม่รู้ ไม่ใช่ 0**
// (กฎเดียวกับ estimatePlatformFee) — คิดราคาโดยไม่มีค่าธรรมเนียมได้ แต่ต้องชู `feeUnknown`
// ให้จอพิมพ์บอก ไม่ใช่ปล่อยให้อ่านเหมือนโบรกฟรี

/** ค่าธรรมเนียมของแพลตฟอร์มหนึ่ง — undefined = ยังไม่ได้ตั้ง */
export interface FeeRule {
  percent?: number;
  minTHB?: number;
}

export interface SymbolExit {
  symbol: string;
  currency: string;
  quantity: number;
  /** ต้นทุนรวมของตัวนี้ (บาท, รวมค่าธรรมเนียมขาซื้อแล้ว) */
  costTHB: number;
  /** ต้นทุนเฉลี่ยต่อหน่วยในสกุลเดิม (ไม่รวมค่าธรรมเนียม — เอาไว้เทียบกับกระดาน) */
  avgBuyPrice: number;
  /** ราคาปัจจุบันในสกุลเดิม — null = ยังไม่มีราคา */
  currentPrice: number | null;
  /** ขายที่ราคานี้แล้วเท่าทุนพอดี (สกุลเดิม, หักค่าธรรมเนียมขายแล้ว) */
  breakEvenPrice: number;
  /**
   * ขายที่ราคานี้แล้ว "ทั้งรอบ" ถึงเป้า โดยสมมติว่าตัวอื่นในรอบขายที่ราคาปัจจุบัน
   * null = ไม่ต้องรอตัวนี้แล้ว (ตัวอื่นพาถึงเป้าได้เอง) หรือคิดไม่ได้เพราะยังไม่มีราคา
   */
  targetPrice: number | null;
  /** ต้องขึ้นอีกกี่ % จากราคาปัจจุบันถึงจะถึง targetPrice */
  gapPercent: number | null;
  /** ค่าธรรมเนียมขายโดยประมาณตอนขายที่ targetPrice (บาท) — null = ยังไม่ได้ตั้ง */
  sellFeeTHB: number | null;
  feeUnknown: boolean;
}

/** ค่าธรรมเนียมขายของมูลค่า V บาท */
const sellFeeOf = (valueTHB: number, fee: FeeRule | undefined): number => {
  if (!fee || (fee.percent == null && fee.minTHB == null)) return 0;
  return Math.max(((fee.percent ?? 0) * valueTHB) / 100, fee.minTHB ?? 0);
};

/**
 * มูลค่าขายขั้นต่ำ (บาท) ที่ทำให้ได้เงินสุทธิ >= netWanted
 *
 * ค่าธรรมเนียมเป็น max(%, ขั้นต่ำ) จึงมีสองกรณี: % คุม หรือ ขั้นต่ำคุม
 * เอา max ของทั้งสองคำตอบ — กรณีที่ไม่ใช่ตัวคุมจะให้เลขต่ำกว่าเสมอ จึงไม่มีทางประเมินต่ำเกิน
 */
const grossNeededFor = (netWanted: number, fee: FeeRule | undefined): number => {
  const p = (fee?.percent ?? 0) / 100;
  const m = fee?.minTHB ?? 0;
  const byPercent = p < 1 ? netWanted / (1 - p) : netWanted;
  return Math.max(byPercent, netWanted + m);
};

/**
 * ราคาที่ต้องขายของแต่ละตัวในรอบ
 *
 * `feeOf` รับชื่อแพลตฟอร์มแล้วคืนค่าธรรมเนียม — ส่งเข้ามาเป็นฟังก์ชันเพื่อให้ utils
 * ไม่ต้องรู้จัก services (แบบเดียวกับที่ powderStatus รับ symbolCount เข้ามา)
 *
 * แยกตัวด้วย `symbol:currency` เพราะเหรียญเดียวกันคนละสกุลคือคนละราคา (เหตุผลเดียวกับ §6.2)
 */
export const exitPlanForCycle = (
  cycle: InvestmentCycle,
  legs: Investment[],
  feeOf: (platform?: string, currency?: string) => FeeRule | undefined
): SymbolExit[] => {
  interface Bucket {
    symbol: string;
    currency: string;
    quantity: number;
    costTHB: number;
    grossNative: number;
    currentPrice: number | null;
    platform?: string;
  }
  const buckets = new Map<string, Bucket>();
  legs.forEach((inv) => {
    const currency = inv.currency ?? 'THB';
    const symbol = inv.symbol || inv.name;
    const key = `${symbol}:${currency}`;
    const b: Bucket = buckets.get(key) ?? {
      symbol,
      currency,
      quantity: 0,
      costTHB: 0,
      grossNative: 0,
      currentPrice: null,
      platform: inv.platform,
    };
    b.quantity += inv.quantity;
    b.costTHB += legCostTHB(inv);
    b.grossNative += inv.buyPrice * inv.quantity;
    if (hasLivePrice(inv)) b.currentPrice = inv.currentPrice as number;
    if (!b.platform && inv.platform) b.platform = inv.platform;
    buckets.set(key, b);
  });

  const list = Array.from(buckets.values()).filter((b) => b.quantity > 0);
  const investedTHB = list.reduce((s, b) => s + b.costTHB, 0);
  const netWantedTotal = investedTHB * (1 + cycle.targetProfitPercent / 100);

  // เงินสุทธิที่จะได้ถ้าขายตัวนั้นที่ราคาปัจจุบันวันนี้ (ไม่มีราคา = ใช้ต้นทุน เท่ากับกำไร 0)
  const netNowOf = (b: Bucket): number => {
    const fee = feeOf(b.platform, b.currency);
    const gross =
      b.currentPrice != null ? convertToTHB(b.currentPrice, b.currency) * b.quantity : b.costTHB;
    return gross - sellFeeOf(gross, fee);
  };

  return list.map((b) => {
    const fee = feeOf(b.platform, b.currency);
    const feeUnknown = !fee || (fee.percent == null && fee.minTHB == null);
    const perUnitTHB = (thb: number) => thb / b.quantity;
    // แปลงกลับเป็นสกุลเดิม: ราคา(สกุลเดิม) = ราคา(บาท) ÷ เรตของสกุลนั้น
    const rate = convertToTHB(1, b.currency) || 1;

    const breakEvenTHB = grossNeededFor(b.costTHB, fee);
    const breakEvenPrice = perUnitTHB(breakEvenTHB) / rate;

    const otherNet = list.filter((x) => x !== b).reduce((s, x) => s + netNowOf(x), 0);
    const needNet = netWantedTotal - otherNet;
    let targetPrice: number | null = null;
    let sellFeeTHB: number | null = null;
    if (needNet > 0) {
      const grossTHB = grossNeededFor(needNet, fee);
      targetPrice = perUnitTHB(grossTHB) / rate;
      sellFeeTHB = feeUnknown ? null : sellFeeOf(grossTHB, fee);
    }

    return {
      symbol: b.symbol,
      currency: b.currency,
      quantity: b.quantity,
      costTHB: b.costTHB,
      avgBuyPrice: b.grossNative / b.quantity,
      currentPrice: b.currentPrice,
      breakEvenPrice,
      targetPrice,
      gapPercent:
        targetPrice != null && b.currentPrice != null && b.currentPrice > 0
          ? (targetPrice / b.currentPrice - 1) * 100
          : null,
      sellFeeTHB,
      feeUnknown,
    };
  });
};
