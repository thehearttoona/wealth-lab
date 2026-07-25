import { supabase } from './supabase';

export interface InvestmentPlan {
  cashReserve: number;  // เงินสำรองรอลงทุน (บาท)
  dcaRounds: number;    // จำนวนรอบที่วางแผนจะทยอยลง
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
  if (!data || data.cash_reserve == null || data.dca_rounds == null) return null;
  return { cashReserve: data.cash_reserve, dcaRounds: data.dca_rounds };
};

export const saveInvestmentPlan = async (plan: InvestmentPlan): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('investment_plan').upsert({
    user_id: userId,
    cash_reserve: plan.cashReserve,
    dca_rounds: plan.dcaRounds,
  });
  if (error) throw error;
};

export const deleteInvestmentPlan = async (): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('investment_plan').delete().eq('user_id', userId);
  if (error) throw error;
};
