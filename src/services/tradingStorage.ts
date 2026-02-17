// Trading Order Storage Service
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TradingOrder } from '../types';

const TRADING_ORDERS_KEY = '@trading_orders';

export const getTradingOrders = async (): Promise<TradingOrder[]> => {
  try {
    const data = await AsyncStorage.getItem(TRADING_ORDERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading trading orders:', error);
    return [];
  }
};

export const saveTradingOrder = async (order: TradingOrder): Promise<void> => {
  try {
    const orders = await getTradingOrders();
    orders.push(order);
    await AsyncStorage.setItem(TRADING_ORDERS_KEY, JSON.stringify(orders));
  } catch (error) {
    console.error('Error saving trading order:', error);
    throw error;
  }
};

export const updateTradingOrder = async (updatedOrder: TradingOrder): Promise<void> => {
  try {
    const orders = await getTradingOrders();
    const index = orders.findIndex((o) => o.id === updatedOrder.id);
    if (index !== -1) {
      orders[index] = updatedOrder;
      await AsyncStorage.setItem(TRADING_ORDERS_KEY, JSON.stringify(orders));
    }
  } catch (error) {
    console.error('Error updating trading order:', error);
    throw error;
  }
};

export const deleteTradingOrder = async (id: string): Promise<void> => {
  try {
    const orders = await getTradingOrders();
    const filtered = orders.filter((o) => o.id !== id);
    await AsyncStorage.setItem(TRADING_ORDERS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error deleting trading order:', error);
    throw error;
  }
};

export const getOrderStatistics = async () => {
  try {
    const orders = await getTradingOrders();
    const closedOrders = orders.filter((o) => o.status === 'closed');
    
    const totalPnL = closedOrders.reduce((sum, o) => sum + (o.pnl || 0), 0);
    const winningTrades = closedOrders.filter((o) => (o.pnl || 0) > 0).length;
    const losingTrades = closedOrders.filter((o) => (o.pnl || 0) < 0).length;
    const winRate = closedOrders.length > 0 ? (winningTrades / closedOrders.length) * 100 : 0;
    
    const openOrders = orders.filter((o) => o.status === 'open');
    const openValue = openOrders.reduce((sum, o) => sum + (o.entryPrice * o.quantity), 0);
    
    return {
      totalOrders: orders.length,
      openOrders: openOrders.length,
      closedOrders: closedOrders.length,
      totalPnL,
      winningTrades,
      losingTrades,
      winRate,
      openValue,
    };
  } catch (error) {
    console.error('Error calculating order statistics:', error);
    return {
      totalOrders: 0,
      openOrders: 0,
      closedOrders: 0,
      totalPnL: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      openValue: 0,
    };
  }
};
