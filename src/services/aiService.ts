import { AIMessage, AIFinancialContext } from '../types';
import { getExpenses } from './storage';
import { getIncomes } from './incomeStorage';
import { getPortfolioSummary } from './investmentStorage';
import { getOrderStatistics } from './tradingStorage';
import { getMT5Settings } from './mt5Storage';

export async function getBackendUrl(): Promise<string> {
  try {
    const settings = await getMT5Settings();
    return settings?.backendUrl ?? 'http://192.168.0.190:8000';
  } catch {
    return 'http://192.168.0.190:8000';
  }
}

export async function buildFinancialContext(): Promise<AIFinancialContext> {
  try {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const [expenses, incomes, portfolioSummary, tradingStats] = await Promise.all([
      getExpenses(),
      getIncomes(),
      getPortfolioSummary(),
      getOrderStatistics(),
    ]);

    // Expenses this month
    const thisMonthExpenses = expenses.filter((e) => e.date.startsWith(thisMonth));
    const lastMonthExpenses = expenses.filter((e) => e.date.startsWith(lastMonth));

    const totalExpenseThisMonth = thisMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalExpenseLastMonth = lastMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Top categories this month
    const categoryTotals: { [key: string]: number } = {};
    thisMonthExpenses.forEach((e) => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
    });
    const topExpenseCategories = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, amount]) => ({ category, amount }));

    // Income this month
    const thisMonthIncomes = incomes.filter((i) => i.date.startsWith(thisMonth));
    const totalIncomeThisMonth = thisMonthIncomes.reduce((sum, i) => sum + i.amount, 0);

    return {
      totalExpenseThisMonth,
      totalExpenseLastMonth,
      topExpenseCategories,
      totalIncomeThisMonth,
      portfolioTotalValue: portfolioSummary.totalValue,
      portfolioTotalProfit: portfolioSummary.totalProfit,
      openTradingOrders: tradingStats.openOrders,
      tradingWinRate: tradingStats.winRate,
    };
  } catch {
    return {};
  }
}

export async function sendAIMessage(
  message: string,
  history: AIMessage[],
  context: AIFinancialContext,
  backendUrl: string
): Promise<string> {
  const payload = {
    message,
    history: history.map((m) => ({ role: m.role, content: m.content })),
    context: {
      total_expense_this_month: context.totalExpenseThisMonth ?? null,
      total_expense_last_month: context.totalExpenseLastMonth ?? null,
      top_expense_categories: context.topExpenseCategories ?? null,
      total_income_this_month: context.totalIncomeThisMonth ?? null,
      portfolio_total_value: context.portfolioTotalValue ?? null,
      portfolio_total_profit: context.portfolioTotalProfit ?? null,
      open_trading_orders: context.openTradingOrders ?? null,
      trading_win_rate: context.tradingWinRate ?? null,
    },
  };

  const response = await fetch(`${backendUrl}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.response as string;
}
