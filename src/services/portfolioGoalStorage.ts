import { PortfolioGoal } from '../utils/investmentGoals';
import { supabase, getUserId } from './supabase';
import { logActivity } from './activityLogStorage';

export const getPortfolioGoal = async (): Promise<PortfolioGoal | null> => {
  const { data, error } = await supabase
    .from('portfolio_goals')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data || data.target_amount == null) return null;
  return {
    targetAmount: data.target_amount,
    expectedAnnualReturnPercent: data.expected_annual_return ?? undefined,
  };
};

export const savePortfolioGoal = async (goal: PortfolioGoal): Promise<void> => {
  const userId = await getUserId();
  // ตารางนี้เป็น singleton ต่อ user (upsert) — ค่าเดิมถูกทับหายทุกครั้ง
  // ถ้าไม่ log ไว้จะไม่มีทางรู้ว่าเคยตั้งเป้าไว้เท่าไหร่ แล้วขยับเป้าตอนไหน
  let before: PortfolioGoal | null = null;
  try {
    before = await getPortfolioGoal();
  } catch {
    // อ่านไม่ได้ก็เขียนต่อ
  }
  const { error } = await supabase.from('portfolio_goals').upsert({
    user_id: userId,
    target_amount: goal.targetAmount,
    expected_annual_return: goal.expectedAnnualReturnPercent ?? null,
  });
  if (error) throw error;
  await logActivity({
    entity: 'portfolio_goal',
    action: before ? 'update' : 'create',
    summary:
      before && before.targetAmount !== goal.targetAmount
        ? `ขยับเป้าพอร์ต ${before.targetAmount} → ${goal.targetAmount}`
        : `ตั้งเป้าพอร์ต ${goal.targetAmount}`,
    payload: { before, after: goal },
  });
};

export const deletePortfolioGoal = async (): Promise<void> => {
  const userId = await getUserId();
  let before: PortfolioGoal | null = null;
  try {
    before = await getPortfolioGoal();
  } catch {
    // อ่านไม่ได้ก็ลบต่อ
  }
  const { error } = await supabase.from('portfolio_goals').delete().eq('user_id', userId);
  if (error) throw error;
  await logActivity({
    entity: 'portfolio_goal',
    action: 'delete',
    summary: before ? `ลบเป้าพอร์ต (เดิม ${before.targetAmount})` : 'ลบเป้าพอร์ต',
    payload: before ?? null,
  });
};
