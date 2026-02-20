import { Income } from '../types';
import { supabase } from './supabase';

export type { Income };

export const INCOME_CATEGORIES = [
  'เงินเดือน',
  'Freelance',
  'ธุรกิจ',
  'การลงทุน',
  'ดอกเบี้ย/เงินปันผล',
  'ขายของ',
  'โบนัส',
  'ของขวัญ',
  'อื่นๆ',
];

export const saveIncome = async (income: Income): Promise<void> => {
  const { error } = await supabase.from('incomes').insert(income);
  if (error) throw error;
};

export const getIncomes = async (): Promise<Income[]> => {
  const { data, error } = await supabase
    .from('incomes')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const updateIncome = async (income: Income): Promise<void> => {
  const { error } = await supabase
    .from('incomes')
    .update(income)
    .eq('id', income.id);
  if (error) throw error;
};

export const deleteIncome = async (id: string): Promise<void> => {
  const { error } = await supabase.from('incomes').delete().eq('id', id);
  if (error) throw error;
};

// ดึงรายรับของเดือนที่ระบุ (YYYY-MM)
export const getIncomesByMonth = async (monthKey: string): Promise<Income[]> => {
  const { data, error } = await supabase
    .from('incomes')
    .select('*')
    .like('date', `${monthKey}%`);
  if (error) throw error;
  return data || [];
};

// ยอดรวมรายรับของเดือนที่ระบุ (YYYY-MM)
export const getMonthlyIncomeTotal = async (monthKey: string): Promise<number> => {
  const incomes = await getIncomesByMonth(monthKey);
  return incomes.reduce((sum, i) => sum + i.amount, 0);
};
