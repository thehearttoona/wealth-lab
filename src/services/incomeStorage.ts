import { Income } from '../types';
import { supabase, getUserId } from './supabase';
import { logActivity } from './activityLogStorage';

export type { Income };

// อ่านแถวไว้ก่อนแก้/ลบ เพื่อให้ log มีค่าเดิม — best-effort, ห้ามขวางการเขียนจริง
const fetchIncomeForLog = async (id: string): Promise<any | null> => {
  try {
    const { data } = await supabase.from('incomes').select('*').eq('id', id).maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
};

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
  const userId = await getUserId();
  const { error } = await supabase.from('incomes').insert({ ...income, user_id: userId });
  if (error) throw error;
  await logActivity({
    entity: 'income',
    action: 'create',
    entityId: income.id,
    summary: `รับ ${income.amount} · ${income.category}${income.description ? ` · ${income.description}` : ''}`,
    payload: income,
  });
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
  const before = await fetchIncomeForLog(income.id);
  const { error } = await supabase
    .from('incomes')
    .update(income)
    .eq('id', income.id);
  if (error) throw error;
  await logActivity({
    entity: 'income',
    action: 'update',
    entityId: income.id,
    summary: `แก้รายรับ ${income.amount} · ${income.category}`,
    payload: { before, after: income },
  });
};

export const deleteIncome = async (id: string): Promise<void> => {
  const before = await fetchIncomeForLog(id);
  const { error } = await supabase.from('incomes').delete().eq('id', id);
  if (error) throw error;
  await logActivity({
    entity: 'income',
    action: 'delete',
    entityId: id,
    summary: before ? `ลบรายรับ ${before.amount} · ${before.category}` : `ลบรายรับ ${id}`,
    payload: before ?? { id },
  });
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
