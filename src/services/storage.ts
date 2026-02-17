import AsyncStorage from '@react-native-async-storage/async-storage';
import { Expense, RecurringBill } from '../types';

const EXPENSES_KEY = '@expenses';
const RECURRING_BILLS_KEY = '@recurring_bills';

// Expenses
export const saveExpense = async (expense: Expense): Promise<void> => {
  try {
    const existingExpenses = await getExpenses();
    const updatedExpenses = [...existingExpenses, expense];
    await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify(updatedExpenses));
  } catch (error) {
    console.error('Error saving expense:', error);
    throw error;
  }
};

export const getExpenses = async (): Promise<Expense[]> => {
  try {
    const expenses = await AsyncStorage.getItem(EXPENSES_KEY);
    return expenses ? JSON.parse(expenses) : [];
  } catch (error) {
    console.error('Error getting expenses:', error);
    return [];
  }
};

export const deleteExpense = async (id: string): Promise<void> => {
  try {
    const expenses = await getExpenses();
    const filteredExpenses = expenses.filter((expense) => expense.id !== id);
    await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify(filteredExpenses));
  } catch (error) {
    console.error('Error deleting expense:', error);
    throw error;
  }
};

export const updateExpense = async (expense: Expense): Promise<void> => {
  try {
    const expenses = await getExpenses();
    const updatedExpenses = expenses.map((e) => (e.id === expense.id ? expense : e));
    await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify(updatedExpenses));
  } catch (error) {
    console.error('Error updating expense:', error);
    throw error;
  }
};

// Recurring Bills
export const saveRecurringBill = async (bill: RecurringBill): Promise<void> => {
  try {
    const existingBills = await getRecurringBills();
    const updatedBills = [...existingBills, bill];
    await AsyncStorage.setItem(RECURRING_BILLS_KEY, JSON.stringify(updatedBills));
  } catch (error) {
    console.error('Error saving recurring bill:', error);
    throw error;
  }
};

export const getRecurringBills = async (): Promise<RecurringBill[]> => {
  try {
    const bills = await AsyncStorage.getItem(RECURRING_BILLS_KEY);
    return bills ? JSON.parse(bills) : [];
  } catch (error) {
    console.error('Error getting recurring bills:', error);
    return [];
  }
};

export const updateRecurringBill = async (bill: RecurringBill): Promise<void> => {
  try {
    const bills = await getRecurringBills();
    const updatedBills = bills.map((b) => (b.id === bill.id ? bill : b));
    await AsyncStorage.setItem(RECURRING_BILLS_KEY, JSON.stringify(updatedBills));
  } catch (error) {
    console.error('Error updating recurring bill:', error);
    throw error;
  }
};

export const deleteRecurringBill = async (id: string): Promise<void> => {
  try {
    const bills = await getRecurringBills();
    const filteredBills = bills.filter((bill) => bill.id !== id);
    await AsyncStorage.setItem(RECURRING_BILLS_KEY, JSON.stringify(filteredBills));
  } catch (error) {
    console.error('Error deleting recurring bill:', error);
    throw error;
  }
};
