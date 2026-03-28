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

const getUserId = async (): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
};

export const saveIncome = async (income: Income): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('incomes').insert({ ...income, user_id: userId });
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

export const getIncomesByMonth = async (monthKey: string): Promise<Income[]> => {
  const { data, error } = await supabase
    .from('incomes')
    .select('*')
    .like('date', `${monthKey}%`);
  if (error) throw error;
  return data || [];
};

export const getMonthlyIncomeTotal = async (monthKey: string): Promise<number> => {
  const incomes = await getIncomesByMonth(monthKey);
  return incomes.reduce((sum, i) => sum + i.amount, 0);
};
