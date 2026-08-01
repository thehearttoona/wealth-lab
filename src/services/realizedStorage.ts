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
  // แพลตฟอร์ม: อ่านจากคอลัมน์ก่อน ถ้ายังไม่ได้รัน SQL ก็ยังพอดึงจาก snapshot ได้
  platform: row.platform ?? row.source_investment?.platform ?? undefined,
  sourceInvestment: row.source_investment ?? undefined,
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

// คอลัมน์ที่เพิ่มทีหลัง (sql/realized_trades_undo.sql) — ยังไม่ได้รัน SQL ก็ต้องขายได้
// ห้ามให้การบันทึกการขายพังเพราะฟีเจอร์ย้อนคืน แต่ก็ห้ามทิ้งคอลัมน์ที่มีจริงไปด้วย
// จึงตัดทิ้งทีละคอลัมน์ตามชื่อที่ error ฟ้องมา แล้วลองใหม่
const OPTIONAL_COLUMNS = ['platform', 'source_investment'] as const;

export const saveRealizedTrade = async (trade: RealizedTrade): Promise<void> => {
  const userId = await getUserId();
  let payload: Record<string, any> = { ...mapToDb(trade, userId) };
  if (trade.platform) payload.platform = trade.platform;
  if (trade.sourceInvestment) payload.source_investment = trade.sourceInvestment;

  for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt++) {
    const { error } = await supabase.from('realized_trades').insert(payload);
    if (!error) return;
    const missing = OPTIONAL_COLUMNS.find(
      (c) => c in payload && new RegExp(c, 'i').test(error.message || '')
    );
    if (!missing) throw error;
    const next = { ...payload };
    delete next[missing];
    payload = next;
  }
  throw new Error('บันทึกการขายไม่สำเร็จ');
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
