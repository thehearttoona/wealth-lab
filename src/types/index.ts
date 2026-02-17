export interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: string;
  type: 'daily' | 'recurring';
}

export interface RecurringBill {
  id: string;
  name: string;
  amount: number;
  category: string;
  dueDay: number; // วันที่ต้องจ่ายในแต่ละเดือน (1-31)
  isActive: boolean;
  monthlyAmounts?: { [key: string]: number }; // เก็บจำนวนเงินแต่ละเดือน เช่น { "2026-01": 5000, "2026-02": 5500 }
}

export interface MonthlySummary {
  id: string;
  month: string; // YYYY-MM format
  totalExpense: number; // รายจ่ายรวมของเดือน
  notes?: string; // บันทึกเพิ่มเติม
  createdAt: string;
  updatedAt: string;
}

export type OrderType = 'buy' | 'sell';
export type OrderStatus = 'open' | 'closed' | 'cancelled';
export type AssetType = 'crypto' | 'stock' | 'forex' | 'other';

export interface ForexData {
  pair: string; // เช่น EUR/USD
  lotSize: number; // 0.01, 0.1, 1.0 etc
  leverage?: number; // 1:100, 1:500 etc
  pips?: number; // จำนวน pips ได้/เสีย
}

export interface TradingOrder {
  id: string;
  symbol: string;
  name: string;
  type: OrderType;
  assetType: AssetType;
  entryPrice: number;
  quantity: number;
  stopLoss?: number;
  takeProfit?: number;
  entryDate: string;
  exitDate?: string;
  exitPrice?: number;
  status: OrderStatus;
  fees?: number;
  notes?: string;
  pnl?: number; // Profit & Loss
  forexData?: ForexData;
}

export type RootStackParamList = {
  Main: undefined;
  Home: undefined;
  AddExpense: { type: 'daily' | 'recurring'; expense?: Expense; bill?: RecurringBill };
  ExpenseList: undefined;
  RecurringBills: undefined;
  Portfolio: undefined;
  AddInvestment: { investment?: any };
  Statistics: undefined;
  TradingOrders: undefined;
  AddTradingOrder: { order?: TradingOrder };
  Overview: undefined;
  ExpenseTracking: undefined;
  AddMonthlySummary: { summary?: MonthlySummary; month?: string };
};
