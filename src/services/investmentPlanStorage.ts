import { supabase } from './supabase';

export interface InvestmentPlan {
  setAsidePercent: number; // กันเงินเดือนกี่ % ไปลงทุน
  dcaRounds: number;       // จำนวนรอบที่วางแผนจะทยอยลง
}

const getUserId = async (): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
};

export const getInvestmentPlan = async (): Promise<InvestmentPlan | null> => {
  const { data, error } = await supabase
    .from('investment_plan')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data || data.salary_set_aside_percent == null || data.dca_rounds == null) return null;
  return { setAsidePercent: data.salary_set_aside_percent, dcaRounds: data.dca_rounds };
};

export const saveInvestmentPlan = async (plan: InvestmentPlan): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('investment_plan').upsert({
    user_id: userId,
    salary_set_aside_percent: plan.setAsidePercent,
    dca_rounds: plan.dcaRounds,
  });
  if (error) throw error;
};

export const deleteInvestmentPlan = async (): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('investment_plan').delete().eq('user_id', userId);
  if (error) throw error;
};
