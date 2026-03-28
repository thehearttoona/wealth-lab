export interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: string;
  type: 'daily' | 'recurring' | 'income';
}

export interface RecurringBill {
  id: string;
  name: string;
  amount: number; // ยอดอ้างอิง (ใช้เป็น placeholder เท่านั้น)
  category: string;
  monthlyAmounts: { [key: string]: number }; // YYYY-MM -> amount (บันทึกเองแต่ละเดือน)
  // legacy fields (backward compat กับข้อมูลเก่า)
  dueDay?: number;
  isActive?: boolean;
}

export interface Income {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: string; // ISO string or YYYY-MM-DD (legacy)
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
  Home: { returnDate?: string } | undefined;
  AddExpense: { type: 'daily' | 'recurring'; expense?: Expense; bill?: RecurringBill; date?: string };
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
  AddIncome: { income?: Income; date?: string };
};

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AIFinancialContext {
  totalExpenseThisMonth?: number;
  totalExpenseLastMonth?: number;
  topExpenseCategories?: { category: string; amount: number }[];
  totalIncomeThisMonth?: number;
  portfolioTotalValue?: number;
  portfolioTotalProfit?: number;
  openTradingOrders?: number;
  tradingWinRate?: number;
}
