import { InstallmentPlan } from '../types';
import { supabase } from './supabase';

const getUserId = async (): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
};

const mapFromDb = (row: any): InstallmentPlan => ({
  id: row.id,
  name: row.name,
  category: row.category,
  totalAmount: row.total_amount,
  totalMonths: row.total_months,
  monthlyAmount: row.monthly_amount,
  startMonth: row.start_month,
  createdAt: row.created_at,
});

const mapToDb = (plan: InstallmentPlan, userId: string) => ({
  id: plan.id,
  name: plan.name,
  category: plan.category,
  total_amount: plan.totalAmount,
  total_months: plan.totalMonths,
  monthly_amount: plan.monthlyAmount,
  start_month: plan.startMonth,
  created_at: plan.createdAt,
  user_id: userId,
});

export const saveInstallmentPlan = async (plan: InstallmentPlan): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('installment_plans').insert(mapToDb(plan, userId));
  if (error) throw error;
};

export const getInstallmentPlans = async (): Promise<InstallmentPlan[]> => {
  const { data, error } = await supabase
    .from('installment_plans')
    .select('*')
    .order('start_month', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapFromDb);
};

export const updateInstallmentPlan = async (plan: InstallmentPlan): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase
    .from('installment_plans')
    .update(mapToDb(plan, userId))
    .eq('id', plan.id);
  if (error) throw error;
};

export const deleteInstallmentPlan = async (id: string): Promise<void> => {
  const { error } = await supabase.from('installment_plans').delete().eq('id', id);
  if (error) throw error;
};
