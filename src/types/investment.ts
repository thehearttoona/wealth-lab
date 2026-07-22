export type InvestmentType = 'stock_th' | 'stock_foreign' | 'fund' | 'crypto' | 'gold' | 'other';

export type Currency = 'THB' | 'USD' | 'EUR' | 'JPY' | 'CNY';

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
  targetReturnPercent?: number; // เป้าหมายกำไร % (เช่น 10 = +10%)
  targetDate?: string;   // วันที่ต้องการให้ถึงเป้า (ISO) — ใช้คำนวณ "ต้องโตปีละกี่ %"
}

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

export const INVESTMENT_TYPES: { value: InvestmentType; label: string; icon: any }[] = [
  { value: 'stock_th', label: 'หุ้นไทย', icon: 'trending-up-outline' },
  { value: 'stock_foreign', label: 'หุ้นต่างประเทศ', icon: 'globe-outline' },
  { value: 'fund', label: 'กองทุน', icon: 'briefcase-outline' },
  { value: 'crypto', label: 'Crypto', icon: 'logo-bitcoin' },
  { value: 'gold', label: 'ทอง', icon: 'diamond-outline' },
  { value: 'other', label: 'อื่นๆ', icon: 'cube-outline' },
];
