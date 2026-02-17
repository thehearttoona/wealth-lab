import AsyncStorage from '@react-native-async-storage/async-storage';
import { Investment, Transaction, PortfolioSummary, InvestmentType } from '../types/investment';
import { convertToTHB } from '../utils/constants';

const INVESTMENTS_KEY = '@investments';
const TRANSACTIONS_KEY = '@transactions';

// Investments
export const saveInvestment = async (investment: Investment): Promise<void> => {
  try {
    const existingInvestments = await getInvestments();
    const updatedInvestments = [...existingInvestments, investment];
    await AsyncStorage.setItem(INVESTMENTS_KEY, JSON.stringify(updatedInvestments));
  } catch (error) {
    console.error('Error saving investment:', error);
    throw error;
  }
};

export const getInvestments = async (): Promise<Investment[]> => {
  try {
    const investments = await AsyncStorage.getItem(INVESTMENTS_KEY);
    return investments ? JSON.parse(investments) : [];
  } catch (error) {
    console.error('Error getting investments:', error);
    return [];
  }
};

export const updateInvestment = async (investment: Investment): Promise<void> => {
  try {
    const investments = await getInvestments();
    const updatedInvestments = investments.map((inv) =>
      inv.id === investment.id ? investment : inv
    );
    await AsyncStorage.setItem(INVESTMENTS_KEY, JSON.stringify(updatedInvestments));
  } catch (error) {
    console.error('Error updating investment:', error);
    throw error;
  }
};

export const deleteInvestment = async (id: string): Promise<void> => {
  try {
    const investments = await getInvestments();
    const filteredInvestments = investments.filter((inv) => inv.id !== id);
    await AsyncStorage.setItem(INVESTMENTS_KEY, JSON.stringify(filteredInvestments));
    
    // ลบ transactions ที่เกี่ยวข้องด้วย
    const transactions = await getTransactions();
    const filteredTransactions = transactions.filter((tx) => tx.investmentId !== id);
    await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(filteredTransactions));
  } catch (error) {
    console.error('Error deleting investment:', error);
    throw error;
  }
};

// Transactions
export const saveTransaction = async (transaction: Transaction): Promise<void> => {
  try {
    const existingTransactions = await getTransactions();
    const updatedTransactions = [...existingTransactions, transaction];
    await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(updatedTransactions));
  } catch (error) {
    console.error('Error saving transaction:', error);
    throw error;
  }
};

export const getTransactions = async (): Promise<Transaction[]> => {
  try {
    const transactions = await AsyncStorage.getItem(TRANSACTIONS_KEY);
    return transactions ? JSON.parse(transactions) : [];
  } catch (error) {
    console.error('Error getting transactions:', error);
    return [];
  }
};

export const getTransactionsByInvestment = async (investmentId: string): Promise<Transaction[]> => {
  try {
    const transactions = await getTransactions();
    return transactions.filter((tx) => tx.investmentId === investmentId);
  } catch (error) {
    console.error('Error getting transactions by investment:', error);
    return [];
  }
};

// Portfolio Summary
export const getPortfolioSummary = async (): Promise<PortfolioSummary> => {
  try {
    const investments = await getInvestments();
    
    let totalValue = 0;
    let totalCost = 0;
    const byType: PortfolioSummary['byType'] = {};

    investments.forEach((inv) => {
      // แปลง buyPrice เป็น THB สำหรับการคำนวณ
      const buyPriceInTHB = convertToTHB(inv.buyPrice, inv.currency);
      const cost = buyPriceInTHB * inv.quantity + (inv.fees || 0);
      const currentPrice = inv.currentPrice || buyPriceInTHB;
      const value = currentPrice * inv.quantity;
      const profit = value - cost;
      const profitPercent = cost > 0 ? (profit / cost) * 100 : 0;

      totalCost += cost;
      totalValue += value;

      // Group by type
      if (!byType[inv.type]) {
        byType[inv.type] = {
          value: 0,
          cost: 0,
          profit: 0,
          profitPercent: 0,
          count: 0,
        };
      }

      byType[inv.type]!.value += value;
      byType[inv.type]!.cost += cost;
      byType[inv.type]!.profit += profit;
      byType[inv.type]!.count += 1;
    });

    // Calculate profit percent by type
    Object.keys(byType).forEach((type) => {
      const typeData = byType[type as InvestmentType]!;
      typeData.profitPercent = typeData.cost > 0 ? (typeData.profit / typeData.cost) * 100 : 0;
    });

    const totalProfit = totalValue - totalCost;
    const totalProfitPercent = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

    return {
      totalValue,
      totalCost,
      totalProfit,
      totalProfitPercent,
      byType,
    };
  } catch (error) {
    console.error('Error calculating portfolio summary:', error);
    return {
      totalValue: 0,
      totalCost: 0,
      totalProfit: 0,
      totalProfitPercent: 0,
      byType: {},
    };
  }
};
