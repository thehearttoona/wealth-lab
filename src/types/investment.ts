export type InvestmentType = 'stock_th' | 'stock_foreign' | 'fund' | 'crypto' | 'gold' | 'other';

// สกุลเงินเป็น string เปล่า ๆ เพราะผู้ใช้เพิ่ม/แก้/ลบเองได้ในหน้า "สกุลเงิน & แพลตฟอร์ม"
// 5 ตัวข้างล่างเป็นแค่ค่าเริ่มต้นตอน seed ครั้งแรก ไม่ใช่ข้อจำกัดของ type อีกต่อไป
export type Currency = string;

export const DEFAULT_CURRENCIES: { code: string; symbol: string; rateToTHB: number }[] = [
  { code: 'THB', symbol: '฿', rateToTHB: 1 },
  { code: 'USD', symbol: '$', rateToTHB: 35 },
  { code: 'EUR', symbol: '€', rateToTHB: 38 },
  { code: 'JPY', symbol: '¥', rateToTHB: 0.24 },
  { code: 'CNY', symbol: '¥', rateToTHB: 4.8 },
];

export interface Investment {
  id: string;
  type: InvestmentType;
  symbol: string;        // ตัวย่อ เช่น PTT, BTC, XAU
  name: string;          // ชื่อเต็ม
  quantity: number;      // จำนวนหุ้น/หน่วย
  buyPrice: number;      // ราคาซื้อเฉลี่ย
  currency?: Currency;   // สกุลเงินของราคาซื้อ
  currentPrice?: number; // ราคาปัจจุบัน (จาก API หรือกรอกเอง)
  buyDate: string;       // วันที่ซื้อ
  notes?: string;        // บันทึกเพิ่มเติม
  fees?: number;         // ค่าธรรมเนียม
  platform?: string;     // แพลตฟอร์มที่ลงทุน เช่น Bitkub, Streaming, Dime
  targetReturnPercent?: number; // เป้าหมายกำไร % (เช่น 10 = +10%)
  targetDate?: string;   // วันที่ต้องการให้ถึงเป้า (ISO) — ใช้คำนวณ "ต้องโตปีละกี่ %"
  // ── กฎ "ถึงคิวลงไม้" ตั้งแยกรายตัวได้ (ไม่ตั้ง = ใช้ค่าเริ่มต้น วัน/ทุก 2 แท่ง) ──
  // ของที่แกว่งแรงอย่าง crypto ดูรายวันทัน แต่หุ้นปันผลที่ถือยาวดูรายสัปดาห์/เดือนจะมีความหมายกว่า
  redInterval?: RedInterval; // แท่งเทียนที่ใช้นับ
  redEvery?: number;         // เตือนเมื่อแดงติดกันครบทุก ๆ N แท่ง (N, 2N, 3N…)
}

// กรอบเวลาแท่งเทียนของกฎ "แดงติดกัน"
export type RedInterval = 'day' | 'week' | 'month';

export const RED_INTERVALS: { value: RedInterval; label: string; unit: string }[] = [
  { value: 'day', label: 'รายวัน', unit: 'วัน' },
  { value: 'week', label: 'รายสัปดาห์', unit: 'สัปดาห์' },
  { value: 'month', label: 'รายเดือน', unit: 'เดือน' },
];

export const DEFAULT_RED_INTERVAL: RedInterval = 'day';
export const DEFAULT_RED_EVERY = 2;

export interface Transaction {
  id: string;
  investmentId: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  date: string;
  fees?: number;
  notes?: string;
}

// การขายที่เกิดขึ้นจริง (realized) — เก็บ snapshot ครบในแถวเดียว
// จงใจไม่ผูก FK กับ investments เพราะขายหมดแล้วรายการลงทุนจะถูกลบทิ้ง
// แต่ประวัติผลตอบแทนจริงต้องอยู่ต่อ ไม่งั้นวัดฝีมือย้อนหลังไม่ได้
export interface RealizedTrade {
  id: string;
  symbol: string;
  name: string;
  assetType: InvestmentType;
  currency: Currency;      // สกุลของ buyPrice/sellPrice (ทั้งคู่สกุลเดียวกัน)
  quantity: number;
  buyPrice: number;        // ต้นทุนต่อหน่วย
  sellPrice: number;       // ราคาขายต่อหน่วย
  buyDate: string;
  sellDate: string;
  fees?: number;           // ค่าธรรมเนียมรวม (ซื้อ+ขาย) เป็น THB
  notes?: string;
  // แพลตฟอร์ม/โบรกของไม้ที่ขายไป — เป็นส่วนหนึ่งของ "ตัวระบุไม้" ไม่ใช่ข้อมูลประดับ
  // ตัวเดียวกันคนละโบรก = คนละไม้ ตอนย้อนคืนต้องกลับเข้าแพลตฟอร์มเดิม
  // (column `platform` — ต้องรัน sql/realized_trades_undo.sql ก่อน)
  platform?: string;
  // snapshot ของรายการลงทุนตอนก่อนขาย — มีไว้เพื่อ "ย้อนคืน" ได้ตรงเป๊ะ
  // (โน้ต/เป้าหมายกำไร ไม่ได้อยู่ในคอลัมน์อื่น ถ้าไม่เก็บไว้จะหายตอนกู้คืน)
  // เก็บใน column jsonb `source_investment` — ต้องรัน sql/realized_trades_undo.sql ก่อน
  sourceInvestment?: Investment;
}

export interface PortfolioSummary {
  totalValue: number;      // มูลค่ารวม
  totalCost: number;       // ต้นทุนรวม
  totalProfit: number;     // กำไร/ขาดทุนรวม
  totalProfitPercent: number; // % กำไร/ขาดทุน
  byType: {
    [key in InvestmentType]?: {
      value: number;
      cost: number;
      profit: number;
      profitPercent: number;
      count: number;
    };
  };
}

// รายการที่ผู้ใช้จัดการเอง (เก็บใน Supabase) — ดู services/currencyStorage.ts, platformStorage.ts
export interface UserCurrency {
  id: string;
  code: string;        // THB, USD, ...
  symbol?: string;     // ฿, $, € — ไม่ใส่ก็ได้ จะ fallback เป็นโค้ด
  rateToTHB?: number;  // 1 หน่วย = กี่บาท (ไม่ตั้ง = คิด 1:1 ยอดรวมจะเพี้ยน)
  createdAt: string;
}

export interface UserPlatform {
  id: string;
  name: string;
  createdAt: string;
}

// แพลตฟอร์มยอดนิยม — ใช้เป็นค่าเริ่มต้นตอน seed ครั้งแรกเท่านั้น
export const INVESTMENT_PLATFORMS = [
  'Bitkub', 'Binance', 'Bitazza',
  'Streaming', 'InnovestX', 'Dime!', 'Webull', 'IBKR',
  'FINNOMENA', 'K-My Funds', 'SCB EASY',
  'ฮั่วเซ่งเฮง', 'YLG',
];

export const INVESTMENT_TYPES: { value: InvestmentType; label: string; icon: any }[] = [
  { value: 'stock_th', label: 'หุ้นไทย', icon: 'trending-up-outline' },
  { value: 'stock_foreign', label: 'หุ้นต่างประเทศ', icon: 'globe-outline' },
  { value: 'fund', label: 'กองทุน', icon: 'briefcase-outline' },
  { value: 'crypto', label: 'Crypto', icon: 'logo-bitcoin' },
  { value: 'gold', label: 'ทอง', icon: 'diamond-outline' },
  { value: 'other', label: 'อื่นๆ', icon: 'cube-outline' },
];
