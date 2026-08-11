import { InvestmentType } from './investment';

// ── รอบลงทุน (cycle) ──
// ตะกร้าไม้ที่เปิดพร้อมกันและ "ปิดพร้อมกัน" เมื่อกำไรรวมถึงเป้า
// คู่กับกฎแท่งแดง (ลงไม้ตอนร่วง) = DCA ตอนย่อ + เก็บกำไรเป็นรอบ
//
// หน่วยวัดของกลยุทธ์นี้คือ "รอบ" ไม่ใช่ "ไม้" — ไม้เดี่ยวที่ปิดเท่าทุนไม่ได้แปลว่าพลาด
// ดังนั้นตัวเลขที่ต้องดูคือกำไรรวมของตะกร้า ไม่ใช่กำไรรายตัว

/** ตะกร้า = ประเภทสินทรัพย์ หรือ 'all' ถ้าตั้งใจใช้ตะกร้าเดียวรวมทั้งพอร์ต */
export type BasketKey = InvestmentType | 'all';

export interface InvestmentCycle {
  id: string;
  basket: BasketKey;
  cycleNo: number;
  /** เป้ากำไรรวม % คิดบน "ต้นทุนของรอบ" — ห้ามคิดบนมูลค่าพอร์ต (เติมไม้แล้วเป้าจะขยับเอง) */
  targetProfitPercent: number;
  /** งบสูงสุดของรอบ (THB) — undefined = ไม่จำกัด (ไม่แนะนำ ดู utils/cycles) */
  budgetTHB?: number;
  maxLegsPerSymbol?: number;
  startedAt: string;  // YYYY-MM-DD
  closedAt?: string;  // undefined = รอบที่ยังเปิดอยู่
  // snapshot ตอนปิด — realized_trades ย้อนคืนได้ ถ้าไม่เก็บ ผลของรอบที่จบแล้วจะเปลี่ยนย้อนหลัง
  closedInvestedTHB?: number;
  closedProfitTHB?: number;
  closedDays?: number;
  notes?: string;
}

// ── ค่าเริ่มต้นต่อตะกร้า ──
// เป้าระดับตะกร้าต้อง "ต่ำกว่า" เป้าขายรายไม้ (ดู utils/takeProfit: crypto 40 / หุ้น 20)
// ราว ๆ ครึ่งหนึ่ง เพราะตะกร้าเฉลี่ยตัวแรงกับตัวอ่อนเข้าหากันแล้ว
// หุ้นไทยต่ำสุดเพราะกำไรยกเว้นภาษี ปิดรอบไม่มีต้นทุนภาษี จึงหมุนรอบถี่กว่าได้
export const DEFAULT_CYCLE_TARGET: Record<BasketKey, number> = {
  crypto: 20,
  stock_foreign: 12,
  stock_th: 10,
  fund: 10,
  gold: 8,
  other: 12,
  all: 12,
};

// เพดานไม้ต่อสินทรัพย์: ลง 6 ไม้บนของที่ร่วงจาก 100 → 50 ต้องเด้ง 56% เพื่อให้ตะกร้า +10%
// ไม้ที่ 8 คือจุดที่กระสุนกับความอดทนหมดพร้อมกัน
export const DEFAULT_MAX_LEGS_PER_SYMBOL = 8;

/** ตะกร้าที่ระบบเสนอให้เปิด — ประเภทที่ราคาดึงอัตโนมัติได้ก่อน (กองทุน/ทองต้องกรอกราคาเอง) */
export const BASKET_ORDER: BasketKey[] = [
  'crypto',
  'stock_foreign',
  'stock_th',
  'fund',
  'gold',
  'other',
];

export const BASKET_LABELS: Record<BasketKey, string> = {
  crypto: 'คริปโต',
  stock_foreign: 'หุ้นต่างประเทศ',
  stock_th: 'หุ้นไทย',
  fund: 'กองทุน',
  gold: 'ทอง',
  other: 'อื่นๆ',
  all: 'ทั้งพอร์ต',
};

export const basketLabel = (b: BasketKey): string => BASKET_LABELS[b] ?? b;

/** ไม้นี้อยู่ในตะกร้านี้ไหม — 'all' รับทุกประเภท */
export const basketAccepts = (basket: BasketKey, type: InvestmentType): boolean =>
  basket === 'all' || basket === type;
