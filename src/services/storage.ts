import { Expense, RecurringBill } from '../types';
import { supabase } from './supabase';

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

const mapBillToDb = (bill: RecurringBill) => ({
  id: bill.id,
  name: bill.name,
  amount: bill.amount,
  category: bill.category,
  monthly_amounts: bill.monthlyAmounts,
  due_day: bill.dueDay,
  is_active: bill.isActive,
});

// ── Expenses ─────────────────────────────────────────────────────────────────

export const saveExpense = async (expense: Expense): Promise<void> => {
  const { error } = await supabase.from('expenses').insert(expense);
  if (error) throw error;
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
  const { error } = await supabase
    .from('expenses')
    .update(expense)
    .eq('id', expense.id);
  if (error) throw error;
};

export const deleteExpense = async (id: string): Promise<void> => {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
};

// ── Recurring Bills ───────────────────────────────────────────────────────────

export const saveRecurringBill = async (bill: RecurringBill): Promise<void> => {
  const { error } = await supabase.from('recurring_bills').insert(mapBillToDb(bill));
  if (error) throw error;
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
  const { error } = await supabase
    .from('recurring_bills')
    .update(mapBillToDb(bill))
    .eq('id', bill.id);
  if (error) throw error;
};

export const deleteRecurringBill = async (id: string): Promise<void> => {
  const { error } = await supabase.from('recurring_bills').delete().eq('id', id);
  if (error) throw error;
};
