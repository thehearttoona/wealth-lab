import { Investment, Transaction, PortfolioSummary, InvestmentType } from '../types/investment';
import { convertToTHB } from '../utils/constants';
import { supabase } from './supabase';

const getUserId = async (): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
};

const mapInvestmentFromDb = (row: any): Investment => ({
  id: row.id,
  type: row.type,
  symbol: row.symbol,
  name: row.name,
  quantity: row.quantity,
  buyPrice: row.buy_price,
  currency: row.currency,
  currentPrice: row.current_price,
  buyDate: row.buy_date,
  notes: row.notes,
  fees: row.fees,
});

const mapInvestmentToDb = (inv: Investment, userId: string) => ({
  id: inv.id,
  type: inv.type,
  symbol: inv.symbol,
  name: inv.name,
  quantity: inv.quantity,
  buy_price: inv.buyPrice,
  currency: inv.currency,
  current_price: inv.currentPrice,
  buy_date: inv.buyDate,
  notes: inv.notes,
  fees: inv.fees,
  user_id: userId,
});

const mapTransactionFromDb = (row: any): Transaction => ({
  id: row.id,
  investmentId: row.investment_id,
  type: row.type,
  quantity: row.quantity,
  price: row.price,
  date: row.date,
  fees: row.fees,
  notes: row.notes,
});

const mapTransactionToDb = (tx: Transaction, userId: string) => ({
  id: tx.id,
  investment_id: tx.investmentId,
  type: tx.type,
  quantity: tx.quantity,
  price: tx.price,
  date: tx.date,
  fees: tx.fees,
  notes: tx.notes,
  user_id: userId,
});

// Investments
export const saveInvestment = async (investment: Investment): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('investments').insert(mapInvestmentToDb(investment, userId));
  if (error) throw error;
};

export const getInvestments = async (): Promise<Investment[]> => {
  const { data, error } = await supabase
    .from('investments')
    .select('*')
    .order('buy_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapInvestmentFromDb);
};

export const updateInvestment = async (investment: Investment): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase
    .from('investments')
    .update(mapInvestmentToDb(investment, userId))
    .eq('id', investment.id);
  if (error) throw error;
};

export const deleteInvestment = async (id: string): Promise<void> => {
  const { error: txError } = await supabase
    .from('transactions')
    .delete()
    .eq('investment_id', id);
  if (txError) throw txError;

  const { error } = await supabase.from('investments').delete().eq('id', id);
  if (error) throw error;
};

// Transactions
export const saveTransaction = async (transaction: Transaction): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('transactions').insert(mapTransactionToDb(transaction, userId));
  if (error) throw error;
};

export const getTransactions = async (): Promise<Transaction[]> => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapTransactionFromDb);
};

export const getTransactionsByInvestment = async (investmentId: string): Promise<Transaction[]> => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('investment_id', investmentId)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapTransactionFromDb);
};

// Portfolio Summary
export const getPortfolioSummary = async (): Promise<PortfolioSummary> => {
  try {
    const investments = await getInvestments();

    let totalValue = 0;
    let totalCost = 0;
    const byType: PortfolioSummary['byType'] = {};

    investments.forEach((inv) => {
      // currentPrice เก็บเป็นสกุลเงินเดียวกับ inv.currency ต้องแปลงเป็น THB ก่อนรวมพอร์ต
      const buyPriceInTHB = convertToTHB(inv.buyPrice, inv.currency);
      const currentPriceInTHB = convertToTHB(inv.currentPrice ?? inv.buyPrice, inv.currency);
      const cost = buyPriceInTHB * inv.quantity + (inv.fees || 0);
      const value = currentPriceInTHB * inv.quantity;
      const profit = value - cost;

      totalCost += cost;
      totalValue += value;

      if (!byType[inv.type]) {
        byType[inv.type] = { value: 0, cost: 0, profit: 0, profitPercent: 0, count: 0 };
      }

      byType[inv.type]!.value += value;
      byType[inv.type]!.cost += cost;
      byType[inv.type]!.profit += profit;
      byType[inv.type]!.count += 1;
    });

    Object.keys(byType).forEach((type) => {
      const d = byType[type as InvestmentType]!;
      d.profitPercent = d.cost > 0 ? (d.profit / d.cost) * 100 : 0;
    });

    const totalProfit = totalValue - totalCost;
    const totalProfitPercent = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

    return { totalValue, totalCost, totalProfit, totalProfitPercent, byType };
  } catch (error) {
    console.error('Error calculating portfolio summary:', error);
    return { totalValue: 0, totalCost: 0, totalProfit: 0, totalProfitPercent: 0, byType: {} };
  }
};
