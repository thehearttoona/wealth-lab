import { Investment } from './investment';

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

export interface InstallmentPlan {
  id: string;
  name: string;
  category: string;
  totalAmount: number;
  totalMonths: number; // 1 = จ่ายเต็มจำนวนเดือนเดียว, N = ผ่อน N เดือน
  monthlyAmount: number; // ยอดต่อเดือน (ปกติ = totalAmount / totalMonths แต่แก้เองได้)
  startMonth: string; // YYYY-MM ของงวดแรก
  createdAt: string;
}

export interface Income {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: string; // ISO string or YYYY-MM-DD (legacy)
}

export type RootStackParamList = {
  // ชื่อ route ของแท็บหลัก = ชื่อแบรนด์ เพราะปุ่ม back ของหน้าลูกอ่านชื่อนี้ไปโชว์
  // ส่ง screen มาเพื่อเด้งไปแท็บที่ต้องการได้ (ใช้ได้เฉพาะ mobile — desktop ใช้ state ของตัวเอง)
  'Pakmut Wealth': { screen?: 'HomeTab' | 'PortfolioTab' | 'ProfileTab' } | undefined;
  ManageCatalog: undefined;
  Home: { returnDate?: string } | undefined;
  AddExpense: { type: 'daily' | 'recurring'; expense?: Expense; bill?: RecurringBill; date?: string };
  Portfolio: undefined;
  AddInvestment: { investment?: Investment };
  ManageByPlatform: undefined;
  Statistics: undefined;
  Overview: undefined;
  AddIncome: { income?: Income; date?: string };
  IncomeScreen: undefined;
  Installments: undefined;
  AddInstallment: { plan?: InstallmentPlan };
  Accounts: undefined;
  ImportStatement: undefined;
  Tax: undefined;
  PersonalInfo: undefined;
  PurchaseGoals: undefined;
  SellReview: undefined;
  // หน้าที่แยกออกจากพอร์ต (เดิมเป็นการ์ดเรียงกันอยู่ในหน้าเดียว)
  Realized: undefined;
  Cycles: undefined;
  DryPowder: undefined;
  // หน้าที่แยกออกจากภาษี — ปีที่แก้อยู่ส่งมาทาง param (หน้าภาษีเป็นเจ้าของตัวเลือกปี)
  TaxIncome: { year: number };
  TaxDeduction: { year: number };
};

