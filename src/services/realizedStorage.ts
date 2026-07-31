import { RealizedTrade } from '../types/investment';
import { supabase } from './supabase';

// เก็บ "การขายที่เกิดขึ้นจริง" — ตารางแยกจาก investments โดยตั้งใจ
// เพราะพอขายหมดแล้วรายการลงทุนจะถูกลบ แต่ประวัติผลตอบแทนจริงต้องอยู่ต่อ
// (ต้องรัน SQL ใน sql/realized_trades.sql ที่ Supabase console ก่อนใช้งาน)

const getUserId = async (): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
};

const mapFromDb = (row: any): RealizedTrade => ({
  id: row.id,
  symbol: row.symbol,
  name: row.name ?? '',
  assetType: row.asset_type,
  currency: row.currency ?? 'THB',
  quantity: Number(row.quantity),
  buyPrice: Number(row.buy_price),
  sellPrice: Number(row.sell_price),
  buyDate: row.buy_date,
  sellDate: row.sell_date,
  fees: row.fees != null ? Number(row.fees) : undefined,
  notes: row.notes ?? undefined,
});

const mapToDb = (t: RealizedTrade, userId: string) => ({
  id: t.id,
  symbol: t.symbol,
  name: t.name,
  asset_type: t.assetType,
  currency: t.currency,
  quantity: t.quantity,
  buy_price: t.buyPrice,
  sell_price: t.sellPrice,
  buy_date: t.buyDate,
  sell_date: t.sellDate,
  fees: t.fees ?? 0,
  notes: t.notes ?? null,
  user_id: userId,
});

export const saveRealizedTrade = async (trade: RealizedTrade): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('realized_trades').insert(mapToDb(trade, userId));
  if (error) throw error;
};

export const getRealizedTrades = async (): Promise<RealizedTrade[]> => {
  const { data, error } = await supabase
    .from('realized_trades')
    .select('*')
    .order('sell_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapFromDb);
};

export const deleteRealizedTrade = async (id: string): Promise<void> => {
  const { error } = await supabase.from('realized_trades').delete().eq('id', id);
  if (error) throw error;
};
