import { Investment, Transaction, PortfolioSummary, InvestmentType } from '../types/investment';
import { convertToTHB } from '../utils/constants';
import { supabase, getUserId } from './supabase';

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
  platform: row.platform ?? undefined,
  targetReturnPercent: row.target_return_percent ?? undefined,
  targetDate: row.target_date ?? undefined,
  redInterval: row.red_interval ?? undefined,
  redEvery: row.red_every ?? undefined,
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
  platform: inv.platform ?? null,
  target_return_percent: inv.targetReturnPercent ?? null,
  target_date: inv.targetDate ?? null,
  red_interval: inv.redInterval ?? null,
  red_every: inv.redEvery ?? null,
  user_id: userId,
});

// คอลัมน์ที่เพิ่มทีหลัง — ถ้ายังไม่ได้รัน SQL ให้ตัดทิ้งเฉพาะตัวที่ error ฟ้องชื่อมา แล้วลองใหม่
// (วิธีเดียวกับ investmentPlanStorage) กันไม่ให้ "บันทึกการลงทุนไม่ได้เลย" เพราะลืมรัน SQL
// ตัดทีละตัว ไม่ทิ้งทั้งชุด เผื่อรัน SQL ไปแค่บางส่วน
const OPTIONAL_COLUMNS = ['red_interval', 'red_every'] as const;

// รับได้ทั้งแถวเดียวและหลายแถว (bulk insert ก็ต้องตัดคอลัมน์เหมือนกัน)
const withOptionalColumnFallback = async <T extends Record<string, any> | Record<string, any>[]>(
  payload: T,
  // PromiseLike ไม่ใช่ Promise — query builder ของ supabase เป็น thenable ที่ไม่มี catch/finally
  run: (p: T) => PromiseLike<{ error: any }>
): Promise<void> => {
  const has = (p: T, col: string) =>
    Array.isArray(p) ? p.some((row) => col in row) : col in p;
  const strip = (p: T, col: string): T =>
    (Array.isArray(p)
      ? p.map((row) => {
          const next = { ...row };
          delete next[col];
          return next;
        })
      : (() => {
          const next = { ...(p as Record<string, any>) };
          delete next[col];
          return next;
        })()) as T;

  let current = payload;
  for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt++) {
    const { error } = await run(current);
    if (!error) return;
    const missing = OPTIONAL_COLUMNS.find(
      (c) => has(current, c) && new RegExp(c, 'i').test(error.message || '')
    );
    if (!missing) throw error;
    current = strip(current, missing);
  }
  throw new Error('บันทึกการลงทุนไม่สำเร็จ');
};

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
  await withOptionalColumnFallback(mapInvestmentToDb(investment, userId), (p) =>
    supabase.from('investments').insert(p)
  );
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
  await withOptionalColumnFallback(mapInvestmentToDb(investment, userId), (p) =>
    supabase.from('investments').update(p).eq('id', investment.id)
  );
};

// อัปเดตเฉพาะ "ราคาปัจจุบัน" ของหลายรายการ — ใช้กับปุ่มรีเฟรชและ auto refresh ทุก 5 นาที
// จงใจไม่เรียก updateInvestment ทีละตัว เพราะนั่นส่งทั้งแถวขึ้นไป (ค่าที่ค้างใน memory ของหน้าจอ
// จะทับสิ่งที่อาจถูกแก้จากอีกเครื่อง/อีกแท็บ) และเรียงคิวทีละ request จนรอบหนึ่งกินเวลาเป็นนาที
// ที่นี่แตะแค่ current_price แล้วยิงขนาน — Supabase ไม่มี bulk update ที่ค่าต่างกันต่อแถว
export const updateInvestmentPrices = async (
  updates: { id: string; currentPrice: number }[]
): Promise<void> => {
  if (updates.length === 0) return;
  const results = await Promise.all(
    updates.map(({ id, currentPrice }) =>
      supabase.from('investments').update({ current_price: currentPrice }).eq('id', id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
};

// เพิ่มหลายรายการพร้อมกัน (bulk insert) — ใช้ในหน้า "จัดการตามแพลตฟอร์ม"
export const saveInvestments = async (investments: Investment[]): Promise<void> => {
  if (investments.length === 0) return;
  const userId = await getUserId();
  await withOptionalColumnFallback(
    investments.map((inv) => mapInvestmentToDb(inv, userId)) as Record<string, any>[],
    (p) => supabase.from('investments').insert(p)
  );
};

// เปลี่ยน platform ของหลายรายการพร้อมกัน (bulk update) — RLS กรองให้เฉพาะของ user เองอยู่แล้ว
export const updateInvestmentsPlatform = async (ids: string[], platform: string | null): Promise<void> => {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('investments')
    .update({ platform: platform || null })
    .in('id', ids);
  if (error) throw error;
};

// ลบหลายรายการพร้อมกัน (ลบ transactions ที่ผูกอยู่ก่อน) — bulk delete
export const deleteInvestments = async (ids: string[]): Promise<void> => {
  if (ids.length === 0) return;
  const { error: txError } = await supabase.from('transactions').delete().in('investment_id', ids);
  if (txError) throw txError;
  const { error } = await supabase.from('investments').delete().in('id', ids);
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
// คิดยอดรวมจาก array ที่มีอยู่ในมือ ไม่แตะ DB — หน้าพอร์ตใช้ตอน auto refresh ราคา
// เพื่อคำนวณยอดใหม่ทันทีโดยไม่ต้องโหลดทุกอย่างซ้ำ (แยกออกมาให้สูตรอยู่ที่เดียว
// ไม่ให้หน้าจอไปเขียนสูตรคิดกำไรของตัวเองแล้วเพี้ยนไม่ตรงกับหน้าอื่น)
export const summarizeInvestments = (investments: Investment[]): PortfolioSummary => {
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
};

export const getPortfolioSummary = async (): Promise<PortfolioSummary> => {
  try {
    return summarizeInvestments(await getInvestments());
  } catch (error) {
    console.error('Error calculating portfolio summary:', error);
    return { totalValue: 0, totalCost: 0, totalProfit: 0, totalProfitPercent: 0, byType: {} };
  }
};
