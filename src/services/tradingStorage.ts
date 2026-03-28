// Trading Order Storage Service
import { TradingOrder } from '../types';
import { supabase } from './supabase';

const getUserId = async (): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
};

const mapOrderFromDb = (row: any): TradingOrder => ({
  id: row.id,
  symbol: row.symbol,
  name: row.name,
  type: row.type,
  assetType: row.asset_type,
  entryPrice: row.entry_price,
  quantity: row.quantity,
  stopLoss: row.stop_loss,
  takeProfit: row.take_profit,
  entryDate: row.entry_date,
  exitDate: row.exit_date,
  exitPrice: row.exit_price,
  status: row.status,
  fees: row.fees,
  notes: row.notes,
  pnl: row.pnl,
  forexData: row.forex_data,
});

const mapOrderToDb = (order: TradingOrder, userId: string) => ({
  id: order.id,
  symbol: order.symbol,
  name: order.name,
  type: order.type,
  asset_type: order.assetType,
  entry_price: order.entryPrice,
  quantity: order.quantity,
  stop_loss: order.stopLoss,
  take_profit: order.takeProfit,
  entry_date: order.entryDate,
  exit_date: order.exitDate,
  exit_price: order.exitPrice,
  status: order.status,
  fees: order.fees,
  notes: order.notes,
  pnl: order.pnl,
  forex_data: order.forexData,
  user_id: userId,
});

export const getTradingOrders = async (): Promise<TradingOrder[]> => {
  const { data, error } = await supabase
    .from('trading_orders')
    .select('*')
    .order('entry_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapOrderFromDb);
};

export const saveTradingOrder = async (order: TradingOrder): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('trading_orders').insert(mapOrderToDb(order, userId));
  if (error) throw error;
};

export const updateTradingOrder = async (updatedOrder: TradingOrder): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase
    .from('trading_orders')
    .update(mapOrderToDb(updatedOrder, userId))
    .eq('id', updatedOrder.id);
  if (error) throw error;
};

export const deleteTradingOrder = async (id: string): Promise<void> => {
  const { error } = await supabase.from('trading_orders').delete().eq('id', id);
  if (error) throw error;
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
    const openValue = openOrders.reduce((sum, o) => sum + o.entryPrice * o.quantity, 0);

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
