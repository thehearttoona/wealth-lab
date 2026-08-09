import { Expense, RecurringBill } from '../types';
import { supabase, getUserId } from './supabase';
import { logActivity } from './activityLogStorage';

// อ่านแถวเดียวไว้ก่อนแก้/ลบ — best-effort, ห้ามขวางการเขียนจริง
const fetchRowForLog = async (table: string, id: string): Promise<any | null> => {
  try {
    const { data } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
};

// ── mapper: recurring_bills (DB snake_case ↔ TS camelCase) ──────────────────

const mapBillFromDb = (row: any): RecurringBill => ({
  id: row.id,
  name: row.name,
  amount: row.amount,
  category: row.category,
  monthlyAmounts: row.monthly_amounts || {},
  dueDay: row.due_day,
  isActive: row.is_active,
});

const mapBillToDb = (bill: RecurringBill, userId: string) => ({
  id: bill.id,
  name: bill.name,
  amount: bill.amount,
  category: bill.category,
  monthly_amounts: bill.monthlyAmounts,
  due_day: bill.dueDay,
  is_active: bill.isActive,
  user_id: userId,
});

// ── Expenses ─────────────────────────────────────────────────────────────────

export const saveExpense = async (expense: Expense): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('expenses').insert({ ...expense, user_id: userId });
  if (error) throw error;
  await logActivity({
    entity: 'expense',
    action: 'create',
    entityId: expense.id,
    summary: `จ่าย ${expense.amount} · ${expense.category}${expense.description ? ` · ${expense.description}` : ''}`,
    payload: expense,
  });
};

export const getExpenses = async (): Promise<Expense[]> => {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const updateExpense = async (expense: Expense): Promise<void> => {
  const before = await fetchRowForLog('expenses', expense.id);
  const { error } = await supabase
    .from('expenses')
    .update(expense)
    .eq('id', expense.id);
  if (error) throw error;
  await logActivity({
    entity: 'expense',
    action: 'update',
    entityId: expense.id,
    summary: `แก้รายจ่าย ${expense.amount} · ${expense.category}`,
    payload: { before, after: expense },
  });
};

export const deleteExpense = async (id: string): Promise<void> => {
  const before = await fetchRowForLog('expenses', id);
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
  await logActivity({
    entity: 'expense',
    action: 'delete',
    entityId: id,
    summary: before ? `ลบรายจ่าย ${before.amount} · ${before.category}` : `ลบรายจ่าย ${id}`,
    payload: before ?? { id },
  });
};

// ── Recurring Bills ───────────────────────────────────────────────────────────

export const saveRecurringBill = async (bill: RecurringBill): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('recurring_bills').insert(mapBillToDb(bill, userId));
  if (error) throw error;
  await logActivity({
    entity: 'recurring_bill',
    action: 'create',
    entityId: bill.id,
    summary: `เพิ่มบิลประจำ ${bill.name} · ${bill.category}`,
    payload: bill,
  });
};

export const getRecurringBills = async (): Promise<RecurringBill[]> => {
  const { data, error } = await supabase
    .from('recurring_bills')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapBillFromDb);
};

export const updateRecurringBill = async (bill: RecurringBill): Promise<void> => {
  const userId = await getUserId();
  const before = await fetchRowForLog('recurring_bills', bill.id);
  const { error } = await supabase
    .from('recurring_bills')
    .update(mapBillToDb(bill, userId))
    .eq('id', bill.id);
  if (error) throw error;
  await logActivity({
    entity: 'recurring_bill',
    action: 'update',
    entityId: bill.id,
    // บิลประจำแก้บ่อยเพราะยอดต่อเดือนไม่เท่ากัน (monthlyAmounts) — payload เก็บทั้งก้อน
    // จะได้ย้อนดูได้ว่าเดือนไหนเคยกรอกเท่าไหร่ ก่อนถูกแก้ทับ
    summary: `แก้บิลประจำ ${bill.name}`,
    payload: { before, after: bill },
  });
};

export const deleteRecurringBill = async (id: string): Promise<void> => {
  const before = await fetchRowForLog('recurring_bills', id);
  const { error } = await supabase.from('recurring_bills').delete().eq('id', id);
  if (error) throw error;
  await logActivity({
    entity: 'recurring_bill',
    action: 'delete',
    entityId: id,
    summary: before ? `ลบบิลประจำ ${before.name}` : `ลบบิลประจำ ${id}`,
    payload: before ?? { id },
  });
};
