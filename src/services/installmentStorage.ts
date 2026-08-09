import { InstallmentPlan } from '../types';
import { supabase, getUserId } from './supabase';
import { logActivity } from './activityLogStorage';

// อ่านแผนไว้ก่อนแก้/ลบ เพื่อให้ log มีค่าเดิม — best-effort, ห้ามขวางการเขียนจริง
const fetchPlanForLog = async (id: string): Promise<InstallmentPlan | null> => {
  try {
    const { data } = await supabase.from('installment_plans').select('*').eq('id', id).maybeSingle();
    return data ? mapFromDb(data) : null;
  } catch {
    return null;
  }
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
  await logActivity({
    entity: 'installment',
    action: 'create',
    entityId: plan.id,
    summary: `เริ่มผ่อน ${plan.name} ${plan.monthlyAmount}/เดือน × ${plan.totalMonths} (เริ่ม ${plan.startMonth})`,
    payload: plan,
  });
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
  const before = await fetchPlanForLog(plan.id);
  const { error } = await supabase
    .from('installment_plans')
    .update(mapToDb(plan, userId))
    .eq('id', plan.id);
  if (error) throw error;
  await logActivity({
    entity: 'installment',
    action: 'update',
    entityId: plan.id,
    summary: `แก้แผนผ่อน ${plan.name}`,
    payload: { before, after: plan },
  });
};

export const deleteInstallmentPlan = async (id: string): Promise<void> => {
  const before = await fetchPlanForLog(id);
  const { error } = await supabase.from('installment_plans').delete().eq('id', id);
  if (error) throw error;
  await logActivity({
    entity: 'installment',
    action: 'delete',
    entityId: id,
    summary: before ? `ลบแผนผ่อน ${before.name}` : `ลบแผนผ่อน ${id}`,
    payload: before ?? { id },
  });
};
