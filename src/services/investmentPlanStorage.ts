import { supabase } from './supabase';

export interface InvestmentPlan {
  setAsidePercent: number;  // กันเงินเดือนกี่ % ไปลงทุน
  dcaRounds: number;        // จำนวนรอบที่วางแผนจะทยอยลง
  expectedIncome?: number;  // เงินเดือน/เงินได้ต่อเดือน (โดยประมาณ) — ฐานที่นิ่งของแผน "จ่ายตัวเองก่อน"
  dryPowder?: number;       // เงินรอลงทุนที่จดเอง (THB) — ก้อนที่พร้อมลงตอนนี้ ไม่ใช่เงินเดือน
  dryPowderAsOf?: string;   // วันที่จดยอดล่าสุด (YYYY-MM-DD) — ไว้เตือนว่าซื้อไปแล้วกี่รายการหลังจากนั้น
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
  return {
    setAsidePercent: data.salary_set_aside_percent,
    dcaRounds: data.dca_rounds,
    expectedIncome: data.expected_income ?? undefined,
    dryPowder: data.dry_powder ?? undefined,
    dryPowderAsOf: data.dry_powder_as_of ?? undefined,
  };
};

// คอลัมน์ dry_powder เพิ่มทีหลัง (sql/investment_plan_dry_powder.sql) — ถ้ายังไม่ได้รัน SQL
// จะ save ซ้ำแบบไม่ส่ง 2 คอลัมน์นั้น เพื่อไม่ให้แผนทั้งก้อนบันทึกไม่ได้
const isMissingColumn = (error: { code?: string; message?: string }): boolean =>
  error.code === '42703' || error.code === 'PGRST204' || /dry_powder/.test(error.message || '');

export const saveInvestmentPlan = async (plan: InvestmentPlan): Promise<void> => {
  const userId = await getUserId();
  const base = {
    user_id: userId,
    salary_set_aside_percent: plan.setAsidePercent,
    dca_rounds: plan.dcaRounds,
    expected_income: plan.expectedIncome ?? null,
  };
  const { error } = await supabase.from('investment_plan').upsert({
    ...base,
    dry_powder: plan.dryPowder ?? null,
    dry_powder_as_of: plan.dryPowderAsOf ?? null,
  });
  if (!error) return;
  if (!isMissingColumn(error)) throw error;
  const { error: retryError } = await supabase.from('investment_plan').upsert(base);
  if (retryError) throw retryError;
};

export const deleteInvestmentPlan = async (): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('investment_plan').delete().eq('user_id', userId);
  if (error) throw error;
};
