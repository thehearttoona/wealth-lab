import { MonthlySummary } from '../types';
import { supabase } from './supabase';

const getUserId = async (): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
};

const mapFromDb = (row: any): MonthlySummary => ({
  id: row.id,
  month: row.month,
  totalExpense: row.total_expense,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapToDb = (s: MonthlySummary, userId: string) => ({
  id: s.id,
  month: s.month,
  total_expense: s.totalExpense,
  notes: s.notes,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
  user_id: userId,
});

export const saveMonthlySummary = async (summary: MonthlySummary): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase
    .from('monthly_summaries')
    .upsert(mapToDb(summary, userId), { onConflict: 'month' });
  if (error) throw error;
};

export const getMonthlySummaries = async (): Promise<MonthlySummary[]> => {
  const { data, error } = await supabase
    .from('monthly_summaries')
    .select('*')
    .order('month', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapFromDb);
};

export const getMonthlySummaryByMonth = async (month: string): Promise<MonthlySummary | null> => {
  const { data, error } = await supabase
    .from('monthly_summaries')
    .select('*')
    .eq('month', month)
    .maybeSingle();
  if (error) throw error;
  return data ? mapFromDb(data) : null;
};

export const deleteMonthlySummary = async (month: string): Promise<void> => {
  const { error } = await supabase.from('monthly_summaries').delete().eq('month', month);
  if (error) throw error;
};

export const getMonthlySummariesByYear = async (year: number): Promise<MonthlySummary[]> => {
  const { data, error } = await supabase
    .from('monthly_summaries')
    .select('*')
    .like('month', `${year}-%`)
    .order('month', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapFromDb);
};
