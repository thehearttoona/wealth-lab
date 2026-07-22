import { PortfolioGoal } from '../utils/investmentGoals';
import { supabase } from './supabase';

const getUserId = async (): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
};

export const getPortfolioGoal = async (): Promise<PortfolioGoal | null> => {
  const { data, error } = await supabase
    .from('portfolio_goals')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    targetReturnPercent: data.target_return_percent,
    targetDate: data.target_date,
  };
};

export const savePortfolioGoal = async (goal: PortfolioGoal): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('portfolio_goals').upsert({
    user_id: userId,
    target_return_percent: goal.targetReturnPercent,
    target_date: goal.targetDate,
  });
  if (error) throw error;
};

export const deletePortfolioGoal = async (): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('portfolio_goals').delete().eq('user_id', userId);
  if (error) throw error;
};
