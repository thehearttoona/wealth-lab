import { supabase, getUserId } from './supabase';
import { UserCurrency, DEFAULT_CURRENCIES } from '../types/investment';
import { setCurrencyCatalog } from '../utils/constants';

const mapFromDb = (row: any): UserCurrency => ({
  id: row.id,
  code: row.code,
  symbol: row.symbol ?? undefined,
  rateToTHB: row.rate_to_thb ?? undefined,
  createdAt: row.created_at,
});

const mapToDb = (c: UserCurrency, userId: string) => ({
  id: c.id,
  code: c.code,
  symbol: c.symbol ?? null,
  rate_to_thb: c.rateToTHB ?? null,
  created_at: c.createdAt,
  user_id: userId,
});

// ยังไม่ได้รัน sql/catalog_currencies_platforms.sql — ให้แอปทำงานต่อได้ด้วยค่าเริ่มต้น
export const isCatalogTableMissing = (error: { code?: string; message?: string }): boolean =>
  error?.code === '42P01' || /does not exist|schema cache/i.test(error?.message || '');

export const getCurrencies = async (): Promise<UserCurrency[]> => {
  const { data, error } = await supabase
    .from('user_currencies')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) {
    if (isCatalogTableMissing(error)) return [];
    throw error;
  }
  return (data || []).map(mapFromDb);
};

export const saveCurrency = async (c: UserCurrency): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('user_currencies').insert(mapToDb(c, userId));
  if (error) throw error;
};

export const updateCurrency = async (c: UserCurrency): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase
    .from('user_currencies')
    .update(mapToDb(c, userId))
    .eq('id', c.id);
  if (error) throw error;
};

export const deleteCurrency = async (id: string): Promise<void> => {
  const { error } = await supabase.from('user_currencies').delete().eq('id', id);
  if (error) throw error;
};

// เติมค่าเริ่มต้นให้ครั้งแรก (THB/USD/EUR/JPY/CNY) — เรียกเมื่อรายการยังว่าง
export const seedDefaultCurrencies = async (): Promise<UserCurrency[]> => {
  const userId = await getUserId();
  const now = Date.now();
  const rows = DEFAULT_CURRENCIES.map((d, i) => ({
    id: `${now + i}`,
    code: d.code,
    symbol: d.symbol,
    rateToTHB: d.rateToTHB,
    createdAt: new Date().toISOString(),
  }));
  const { error } = await supabase.from('user_currencies').insert(rows.map((r) => mapToDb(r, userId)));
  if (error) throw error;
  return rows;
};

// โหลดรายการเข้าแคชของ convertToTHB/getCurrencySymbol — ต้องเรียกก่อนหน้าจอที่คิดมูลค่ารวม
export const refreshCurrencyCache = async (): Promise<void> => {
  try {
    const list = await getCurrencies();
    if (list.length > 0) setCurrencyCatalog(list);
  } catch {
    // ล้มเหลวก็ปล่อยให้ใช้ค่าเริ่มต้นที่ hardcode ไว้ ไม่ต้องทำให้หน้าจอพัง
  }
};
