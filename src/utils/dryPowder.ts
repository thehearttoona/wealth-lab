// ── ขนาดไม้ของเงินรอลงทุน ──
// pure ทั้งไฟล์ ไม่มี React ไม่มี network — เป็นทางเดียวที่ทุกจอใช้คิด "เงินต่อไม้"
// (หน้าเงินรอลงทุน / รอบลงทุน / การ์ดถึงคิวลงไม้ ต้องได้เลขเดียวกันเสมอ)
//
// สูตร:  ไม้ถัดไป = เงินทุนปัจจุบัน ÷ (จำนวนหุ้น × จำนวนครั้งต่อหุ้น)
//   จำนวนหุ้น        = นับอัตโนมัติจากพอร์ต (นับ "ตัว" ไม่ใช่ "ไม้" — ไม้ของหุ้นเดียวกันนับเป็น 1)
//   จำนวนครั้งต่อหุ้น = ช่วงเวลาที่จะกระจายเงิน ÷ ซื้อทุกกี่วัน
//                     ช่วงเวลาคือ "สไตล์" ของก้อนนี้ — 1 วัน = ยิงทีเดียว, 1 ปี = ค่อย ๆ ทยอย
//
// ตัวหารที่เขียนในโค้ดคือ "ไม้ที่ยังเหลือ" (ไม้ทั้งก้อน − ที่ลงไปแล้ว) ไม่ใช่ "ไม้ทั้งก้อน"
// ตอนเริ่มก้อน (ยังไม่ลงไม้ไหน) สองอย่างนี้เท่ากันพอดี → ได้เลขเดียวกับสูตรข้างบนเป๊ะ ๆ
// แต่พอลงไม้แล้วมาแก้ยอดให้ตรงจริง ถ้าหารด้วยไม้ทั้งก้อนเสมอ ตัวตั้งลดแต่ตัวหารไม่ลด
// ขนาดไม้จะหดลงแบบเรขาคณิต เงินไม่มีวันหมด (10 ไม้ใช้จริงแค่ 65% ของก้อน) และแอปจะ
// ลงโทษคนที่จดยอดตามจริง — ตัวหารที่นับถอยจึงเป็นเงื่อนไขให้สูตรข้างบนอยู่ได้จริง
//
// คุณสมบัติ: ลงตามแผน → ขนาดไม้คงที่ · ลงเกินแผน → ไม้ที่เหลือหดเอง · ไม้สุดท้ายใช้เงินหมดพอดี

/** ระยะห่างต่อไม้เริ่มต้น (%) — ใช้แปลง "เหลือกี่ไม้ต่อหุ้น" เป็น "รับดิ่งได้อีกกี่ %" */
export const DEFAULT_STEP_PERCENT = 5;

/** ช่วงเวลาที่จะกระจายเงินของก้อนนี้ (วัน) — ค่าเริ่มต้น 1 เดือน */
export const DEFAULT_SPAN_DAYS = 30;

/** ซื้อทุกกี่วันในช่วงเวลานั้น — ค่าเริ่มต้นสัปดาห์ละครั้ง */
export const DEFAULT_EVERY_DAYS = 7;

/** ไม้ถัดไปเล็กกว่าที่วางแผนไว้เกินสัดส่วนนี้ = ลงเกินแผนไปแล้ว ต้องเตือน */
export const UNDERFUNDED_RATIO = 0.7;

/** เพดานกันเลขหลุด — ไม้ทั้งก้อนเกินนี้แปลว่ากรอกผิด ไม่ใช่แผนจริง */
const MAX_ROUNDS_PER_SYMBOL = 120;

/**
 * สไตล์การลงเงิน = ช่วงเวลาที่จะกระจายก้อนนี้ให้หมด
 * 1 วัน คือ "ยิงทีเดียว" (ครั้งต่อหุ้น = 1) ไปจนถึงทยอยข้ามปี
 */
export const SPAN_PRESETS: { days: number; label: string; hint: string }[] = [
  { days: 1, label: 'ยิงทีเดียว', hint: 'ลงหมดในวันเดียว — ไม้ละ เงินทุน ÷ จำนวนหุ้น' },
  { days: 7, label: '1 สัปดาห์', hint: 'กระจายภายในสัปดาห์นี้' },
  { days: 30, label: '1 เดือน', hint: 'ทยอยลงภายในเดือนนี้' },
  { days: 90, label: '3 เดือน', hint: 'ไม้เล็กลง รับดิ่งได้ลึกขึ้น' },
  { days: 180, label: '6 เดือน', hint: 'ทยอยยาว เผื่อตลาดลงต่อเนื่อง' },
  { days: 365, label: '1 ปี', hint: 'ไม้เล็กที่สุด กระสุนอยู่ได้นานที่สุด' },
];

/**
 * ฟิลด์ที่สูตรนี้ใช้ — ประกาศเป็นโครงสร้างไม่ใช่ import InvestmentPlan
 * เพื่อไม่ให้ utils (โดเมนล้วน) ต้องพึ่ง services
 */
export interface PowderPlanFields {
  dryPowder?: number;
  powderLegsUsed?: number;
  powderStepPercent?: number;
  powderBaseTHB?: number;
  powderStartedAt?: string;
  powderSpanDays?: number;
  powderEveryDays?: number;
}

export interface PowderStatus {
  /** จำนวนหุ้นที่นับได้จากพอร์ต (นับ "ตัว" ไม่ใช่ "ไม้") */
  symbolCount: number;
  /** true = พอร์ตยังว่าง เลยคิดที่ 1 ตัวไปก่อน — UI ต้องบอก ไม่ใช่ปล่อยให้เลขดูเหมือนของจริง */
  symbolCountAssumed: boolean;
  spanDays: number;
  everyDays: number;
  /** ช่วงเวลา ÷ ทุกกี่วัน — อย่างน้อย 1 ครั้งเสมอ */
  roundsPerSymbol: number;
  /** จำนวนหุ้น × ครั้งต่อหุ้น */
  legsPlanned: number;
  legsUsed: number;
  legsLeft: number;
  /** ไม้ที่เหลือ ÷ จำนวนหุ้น — "หุ้นตัวหนึ่งยังลงได้อีกกี่ครั้ง" */
  roundsLeftPerSymbol: number;
  /** เงินของไม้ถัดไป (THB) — null พร้อมเหตุผลเสมอ ไม่คืน 0 */
  nextLegTHB: number | null;
  /** ขนาดที่ไม้ควรเป็นตามทุนตั้งต้น — ไว้เทียบว่าที่ผ่านมาลงเกินแผนไปแค่ไหน */
  plannedLegTHB: number | null;
  /** ครั้งที่เหลือต่อหุ้น × ระยะห่างต่อไม้ — เลขที่ตอบว่า "ถ้ามันลงอีกเท่านี้ ยังอยู่รอดไหม" */
  depthCoveredPercent: number | null;
  remainingTHB: number;
  /** ทุนตั้งต้น − ที่เหลือ — null เมื่อยังไม่ได้ตั้งหมุดของก้อน */
  spentTHB: number | null;
  /** ลงเกินแผนจนไม้ที่เหลือหดผิดปกติ — UI ต้องบอก ไม่ใช่ปล่อยให้ตัวเลขเงียบ ๆ เล็กลง */
  underfunded: boolean;
  /** เหตุผลที่คิด nextLegTHB ไม่ได้ — null เมื่อคิดได้ */
  reason: string | null;
}

const clampInt = (v: number | undefined, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : NaN;
  if (!Number.isFinite(n) || n < min) return Math.max(min, Math.min(max, fallback));
  return Math.min(max, n);
};

/**
 * นับ "จำนวนหุ้นที่ลงทุน" จากพอร์ต — นับตัว ไม่ใช่นับไม้
 * ไม้ของหุ้นตัวเดียวกันในแอปนี้เป็นคนละแถวใน investments นับตรง ๆ จะกลายเป็นนับไม้
 * รับเป็นโครงสร้างกว้าง ๆ เพื่อไม่ให้ utils ผูกกับ types/investment
 */
export const countSymbols = (rows?: { type?: string; symbol?: string }[] | null): number => {
  const keys = new Set<string>();
  (rows || []).forEach((r) => {
    const sym = (r.symbol || '').trim().toUpperCase();
    if (!sym) return;
    keys.add(`${r.type || ''}:${sym}`);
  });
  return keys.size;
};

/**
 * สถานะกระสุนของก้อนปัจจุบัน
 * symbolCount = จำนวนหุ้นที่ถืออยู่ (ใช้ countSymbols) — 0 หรือไม่ส่งมา = คิดที่ 1 ตัวพร้อมธง
 */
export const powderStatus = (
  plan?: PowderPlanFields | null,
  symbolCount?: number
): PowderStatus => {
  const remainingTHB = plan?.dryPowder && plan.dryPowder > 0 ? plan.dryPowder : 0;
  const counted =
    typeof symbolCount === 'number' && Number.isFinite(symbolCount) && symbolCount > 0
      ? Math.floor(symbolCount)
      : 0;
  // พอร์ตยังว่าง = กำลังจะซื้อตัวแรก คิดที่ 1 ตัวไปก่อนแล้วติดธงให้ UI บอก
  const symbols = counted > 0 ? counted : 1;

  const spanDays = clampInt(plan?.powderSpanDays, 1, 3650, DEFAULT_SPAN_DAYS);
  const everyDays = clampInt(plan?.powderEveryDays, 1, 365, DEFAULT_EVERY_DAYS);
  const roundsPerSymbol = Math.max(
    1,
    Math.min(MAX_ROUNDS_PER_SYMBOL, Math.floor(spanDays / everyDays))
  );

  const legsPlanned = symbols * roundsPerSymbol;
  const legsUsed = Math.min(Math.max(0, Math.floor(plan?.powderLegsUsed ?? 0)), legsPlanned);
  const legsLeft = legsPlanned - legsUsed;

  const step =
    plan?.powderStepPercent && plan.powderStepPercent > 0 ? plan.powderStepPercent : null;
  const base = plan?.powderBaseTHB && plan.powderBaseTHB > 0 ? plan.powderBaseTHB : null;
  const roundsLeftPerSymbol = legsLeft / symbols;

  const common = {
    symbolCount: symbols,
    symbolCountAssumed: counted === 0,
    spanDays,
    everyDays,
    roundsPerSymbol,
    legsPlanned,
    legsUsed,
    legsLeft,
    roundsLeftPerSymbol,
    // ขนาดที่ไม้ควรเป็นถ้าลงตามแผนตั้งแต่ต้น — ตัวเทียบว่าลงเกินแผนไปไหม
    plannedLegTHB: base != null ? base / legsPlanned : null,
    depthCoveredPercent: step != null ? roundsLeftPerSymbol * step : null,
    remainingTHB,
    spentTHB: base != null ? Math.max(0, base - remainingTHB) : null,
  };

  if (remainingTHB <= 0) {
    return {
      ...common,
      nextLegTHB: null,
      underfunded: false,
      reason: 'ยังไม่ได้จดยอดเงินรอลงทุน',
    };
  }
  if (legsLeft <= 0) {
    return {
      ...common,
      nextLegTHB: null,
      underfunded: false,
      reason: 'ลงครบจำนวนไม้ของก้อนนี้แล้ว — เริ่มก้อนใหม่ หรือยืดช่วงเวลาออก',
    };
  }

  const nextLegTHB = remainingTHB / legsLeft;

  return {
    ...common,
    nextLegTHB,
    underfunded:
      common.plannedLegTHB != null && nextLegTHB < common.plannedLegTHB * UNDERFUNDED_RATIO,
    reason: null,
  };
};

/** เงินต่อไม้ที่จอรอบลงทุน/การ์ดถึงคิวลงไม้ใช้ — ทางเดียวกับหน้าเงินรอลงทุน */
export const nextLegTHBOf = (
  plan?: PowderPlanFields | null,
  symbolCount?: number
): number | null => {
  const n = powderStatus(plan, symbolCount).nextLegTHB;
  return n != null && n > 0 ? n : null;
};
