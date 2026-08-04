// "ขายแล้วมันขึ้นต่อไหม" — ทบทวนจังหวะขายจากไม้ที่ปิดแล้ว
//
// จุดประสงค์: ตอบว่า "ควรใช้กฎขายแบบไหน" ด้วยข้อมูลของผู้ใช้เอง ไม่ใช่ความเห็นใคร
//   ขายเร็วเกินเป็นส่วนใหญ่ → เป้า % คงที่ไม่เหมาะ ควรใช้ trailing stop / ขายเป็นขั้น
//   ขายถูกจังหวะเป็นส่วนใหญ่ → สัญชาตญาณใช้ได้ อย่าเอากฎอัตโนมัติมาขัด
//   ผสม → ต้องมีกฎ เพราะใช้ความรู้สึกแล้วผลไม่คงที่
//
// ⚠️ ข้อจำกัดที่ต้องบอกผู้ใช้บนหน้าจอ ห้ามซ่อน:
//   1. นี่คือ hindsight — "ราคาวันนี้" เป็นแค่หนึ่งจุดเวลา พรุ่งนี้เลขชุดนี้เปลี่ยน
//   2. เงินที่ขายไปถูกเอาไปลงทุนใหม่แล้ว การเทียบว่า "ถ้าถือไว้" จึงเป็นค่าเสียโอกาสของไม้นั้น
//      ไม่ได้แปลว่าตัดสินใจผิด (ถ้าเอาเงินไปลงตัวอื่นแล้วได้มากกว่า ก็คือถูกแล้ว)
//   3. กองทุนไทยไม่มี API ราคา (NAV กรอกมือ) → ไม้พวกนั้นเทียบไม่ได้ ต้องนับแยกให้เห็น

import { RealizedTrade } from '../types/investment';
import { convertToTHB } from './constants';
import { analyzeRealizedTrade } from './realizedAnalysis';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ขยับไม่ถึง ±3% ถือว่าเสมอ — ต่ำกว่านี้เป็นความแกว่งรายวัน ไม่ใช่ฝีมือการจับจังหวะ */
export const FLAT_BAND_PERCENT = 3;

/** ขายไม่ถึง 30 วันยังตัดสินไม่ได้ — เอามานับจะกลายเป็นวัดข่าวสัปดาห์เดียว */
export const MIN_DAYS_TO_JUDGE = 30;

/** ต่ำกว่า 3 ไม้ที่ตัดสินได้ ยังสรุป "นิสัยการขาย" ไม่ได้ โชว์รายตัวได้แต่ห้ามวินิจฉัย */
export const MIN_TRADES_FOR_DIAGNOSIS = 3;

export type SellVerdict =
  | 'too_early'   // ราคาวันนี้สูงกว่าที่ขาย = พลาดกำไร
  | 'well_timed'  // ราคาวันนี้ต่ำกว่าที่ขาย = หนีได้
  | 'flat'        // อยู่ในกรอบ ±FLAT_BAND_PERCENT
  | 'too_recent'  // ขายไม่ถึง MIN_DAYS_TO_JUDGE
  | 'unknown';    // ดึงราคาวันนี้ไม่ได้ (กองทุน/สินทรัพย์ที่ไม่มี API)

export interface SellReviewRow {
  trade: RealizedTrade;
  /** กำไรที่ได้จริงจากไม้นั้นตอนขาย (THB) */
  realizedPnlTHB: number;
  /** ราคาวันนี้ สกุลเดียวกับ sellPrice — null = ดึงไม่ได้ */
  priceNow: number | null;
  /** ราคาขยับกี่ % นับจากวันขาย */
  sinceSellPercent: number | null;
  /** ส่วนต่างถ้าถือไว้ถึงวันนี้ (THB) — บวก = พลาดกำไร, ลบ = หนีขาดทุนได้ */
  deltaTHB: number | null;
  verdict: SellVerdict;
  daysSinceSell: number;
}

export type SellDiagnosis = 'not_enough_data' | 'sells_too_early' | 'well_timed' | 'mixed';

export interface SellReviewSummary {
  rows: SellReviewRow[];
  /** ไม้ที่นับเข้าวินิจฉัยได้ (มีราคา + ขายเกิน 30 วัน) */
  judged: number;
  tooEarly: number;
  wellTimed: number;
  flat: number;
  tooRecent: number;
  unknown: number;
  /** รวมเงินที่พลาด (เฉพาะไม้ที่ตัดสินได้) */
  missedTHB: number;
  /** รวมเงินที่หนีได้ (ค่าบวก) */
  savedTHB: number;
  /** missed − saved · บวก = ถ้าไม่ขายอะไรเลยจะมีเงินมากกว่านี้ */
  netTHB: number;
  /** % ขยับกลาง ๆ ของไม้ที่ตัดสินได้ — median กัน outlier ตัวเดียวลากค่าเฉลี่ย */
  medianSincePercent: number | null;
  diagnosis: SellDiagnosis;
}

const verdictOf = (sincePercent: number): SellVerdict => {
  if (sincePercent > FLAT_BAND_PERCENT) return 'too_early';
  if (sincePercent < -FLAT_BAND_PERCENT) return 'well_timed';
  return 'flat';
};

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * @param pricesBySymbol ราคาวันนี้ในสกุลเดียวกับ sellPrice ของไม้นั้น
 *                       key = priceKeyOf(trade) — ตัวเดียวกันคนละสกุลคือคนละ key
 */
export function reviewSells(
  trades: RealizedTrade[],
  pricesBySymbol: { [key: string]: number },
  now: Date = new Date()
): SellReviewSummary {
  const rows: SellReviewRow[] = trades.map((trade) => {
    const realizedPnlTHB = analyzeRealizedTrade(trade).pnlTHB;
    const daysSinceSell = Math.max(
      0,
      Math.floor((now.getTime() - new Date(trade.sellDate).getTime()) / MS_PER_DAY)
    );
    const priceNow = pricesBySymbol[priceKeyOf(trade)] ?? null;

    if (priceNow == null || priceNow <= 0 || trade.sellPrice <= 0) {
      return {
        trade, realizedPnlTHB, priceNow: null, sinceSellPercent: null, deltaTHB: null,
        verdict: 'unknown', daysSinceSell,
      };
    }

    const sinceSellPercent = (priceNow / trade.sellPrice - 1) * 100;
    // ส่วนต่างคิดจากจำนวนที่ขายไปจริง แปลงเป็นบาทด้วยเรตชุดเดียวกับที่พอร์ตใช้
    const deltaTHB = convertToTHB((priceNow - trade.sellPrice) * trade.quantity, trade.currency);

    return {
      trade, realizedPnlTHB, priceNow, sinceSellPercent, deltaTHB,
      verdict: daysSinceSell < MIN_DAYS_TO_JUDGE ? 'too_recent' : verdictOf(sinceSellPercent),
      daysSinceSell,
    };
  });

  const judgedRows = rows.filter(
    (r) => r.verdict === 'too_early' || r.verdict === 'well_timed' || r.verdict === 'flat'
  );

  // นับเงินจากไม้ที่ตัดสินได้เท่านั้น — ไม้ที่ขายอาทิตย์เดียวยังไม่ควรมีน้ำหนักในข้อสรุป
  const missedTHB = judgedRows.reduce((s, r) => s + Math.max(0, r.deltaTHB ?? 0), 0);
  const savedTHB = judgedRows.reduce((s, r) => s + Math.max(0, -(r.deltaTHB ?? 0)), 0);
  const netTHB = missedTHB - savedTHB;

  const tooEarly = judgedRows.filter((r) => r.verdict === 'too_early').length;
  const wellTimed = judgedRows.filter((r) => r.verdict === 'well_timed').length;
  const flat = judgedRows.filter((r) => r.verdict === 'flat').length;
  const judged = judgedRows.length;

  let diagnosis: SellDiagnosis = 'not_enough_data';
  if (judged >= MIN_TRADES_FOR_DIAGNOSIS) {
    // ดูทั้งจำนวนไม้และจำนวนเงิน — พลาดก้อนใหญ่ครั้งเดียวสำคัญกว่าหนีได้จิ๋ว ๆ ห้าครั้ง
    if (tooEarly / judged >= 0.6 && netTHB > 0) diagnosis = 'sells_too_early';
    else if (netTHB <= 0 || wellTimed / judged >= 0.6) diagnosis = 'well_timed';
    else diagnosis = 'mixed';
  }

  return {
    rows,
    judged,
    tooEarly,
    wellTimed,
    flat,
    tooRecent: rows.filter((r) => r.verdict === 'too_recent').length,
    unknown: rows.filter((r) => r.verdict === 'unknown').length,
    missedTHB,
    savedTHB,
    netTHB,
    medianSincePercent: median(judgedRows.map((r) => r.sinceSellPercent!)),
    diagnosis,
  };
}

/** ตัวเดียวกันคนละสกุลต้องดึงราคาแยก เพราะราคาถูกแปลงเป็นสกุลของไม้นั้น */
export const priceKeyOf = (t: RealizedTrade): string =>
  `${t.assetType}:${(t.symbol || '').toUpperCase()}:${t.currency || 'THB'}`;

export const DIAGNOSIS_TEXT: Record<SellDiagnosis, { title: string; advice: string }> = {
  not_enough_data: {
    title: 'ยังสรุปนิสัยการขายไม่ได้',
    advice: `ต้องมีไม้ที่ขายเกิน ${MIN_DAYS_TO_JUDGE} วันอย่างน้อย ${MIN_TRADES_FOR_DIAGNOSIS} ไม้ — ดูรายตัวด้านล่างได้ แต่ยังอย่าเอาไปเปลี่ยนวิธีเล่น`,
  },
  sells_too_early: {
    title: 'คุณขายไว',
    advice: 'เป้ากำไร % คงที่ไม่เหมาะกับคุณ — มันตัดตัวที่กำลังวิ่งทิ้ง ลองใช้ trailing stop (ย่อจากจุดสูงสุด X% ค่อยขาย) หรือขายเป็นขั้นทีละส่วน จะเก็บขาขึ้นได้ต่อ',
  },
  well_timed: {
    title: 'จังหวะขายของคุณใช้ได้',
    advice: 'ที่ขายไปโดยรวมดีกว่าถือไว้ — อย่าเอากฎขายอัตโนมัติมาขัดสิ่งที่ทำได้อยู่แล้ว ถ้าจะเพิ่มกฎ ให้เพิ่มฝั่งคุมความเสี่ยง (เพดานเงินต่อตัว) ก่อน',
  },
  mixed: {
    title: 'ผลไม่คงที่ — ยังไม่มีกฎ',
    advice: 'บางไม้ขายไว บางไม้ขายทัน แปลว่าตอนนี้ตัดสินด้วยความรู้สึก ควรเขียนกฎไว้ล่วงหน้าแล้วทำตามให้ครบรอบ จะได้วัดได้ว่ากฎนั้นดีจริงไหม',
  },
};
