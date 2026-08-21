import { supabase, getUserId } from './supabase';
import { UserCurrency, DEFAULT_CURRENCIES } from '../types/investment';
import { setCurrencyCatalog } from '../utils/constants';
import { logActivity } from './activityLogStorage';

const mapFromDb = (row: any): UserCurrency => ({
  id: row.id,
  code: row.code,
  symbol: row.symbol ?? undefined,
  rateToTHB: row.rate_to_thb ?? undefined,
  feePercent: row.fee_percent != null ? Number(row.fee_percent) : undefined,
  feeMin: row.fee_min != null ? Number(row.fee_min) : undefined,
  createdAt: row.created_at,
});

const mapToDb = (c: UserCurrency, userId: string) => ({
  id: c.id,
  code: c.code,
  symbol: c.symbol ?? null,
  rate_to_thb: c.rateToTHB ?? null,
  fee_percent: c.feePercent ?? null,
  fee_min: c.feeMin ?? null,
  created_at: c.createdAt,
  user_id: userId,
});

// ยังไม่ได้รัน sql/catalog_fee_by_currency.sql — คอลัมน์ค่าธรรมเนียมยังไม่มี
// ตัดสองคอลัมน์นั้นออกแล้วลองใหม่ ดีกว่าให้ "เพิ่มสกุลเงิน" พังทั้งปุ่มเพราะฟีเจอร์เสริม
const isFeeColumnMissing = (error: { message?: string } | null): boolean =>
  /fee_percent|fee_min/i.test(error?.message || '');

const withoutFeeColumns = (row: ReturnType<typeof mapToDb>) => {
  const { fee_percent, fee_min, ...rest } = row;
  return rest;
};

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
  const row = mapToDb(c, userId);
  let { error } = await supabase.from('user_currencies').insert(row);
  // ยังไม่ได้รัน sql/catalog_fee_by_currency.sql → ลองใหม่โดยไม่ส่งคอลัมน์ค่าธรรมเนียม
  if (error && isFeeColumnMissing(error)) {
    ({ error } = await supabase.from('user_currencies').insert(withoutFeeColumns(row)));
  }
  if (error) throw error;
  await logActivity({
    entity: 'currency',
    action: 'create',
    entityId: c.id,
    summary: `เพิ่มสกุลเงิน ${c.code} เรต ${c.rateToTHB ?? '-'} บาท`,
    payload: c,
  });
};

export const updateCurrency = async (c: UserCurrency): Promise<void> => {
  const userId = await getUserId();
  // เรตที่ตั้งเองมีผลกับ "ทุกยอดรวมในแอป" (convertToTHB) — เปลี่ยนเรตแล้วมูลค่าพอร์ตย้อนหลัง
  // ก็เปลี่ยนตามทันที ต้องรู้ว่าเคยใช้เรตอะไรอยู่ตอนไหน ไม่งั้นเทียบตัวเลขข้ามวันไม่ได้
  let before: UserCurrency | null = null;
  try {
    const { data } = await supabase.from('user_currencies').select('*').eq('id', c.id).maybeSingle();
    before = data ? mapFromDb(data) : null;
  } catch {
    // อ่านไม่ได้ก็เขียนต่อ
  }
  const row = mapToDb(c, userId);
  let { error } = await supabase.from('user_currencies').update(row).eq('id', c.id);
  if (error && isFeeColumnMissing(error)) {
    ({ error } = await supabase.from('user_currencies').update(withoutFeeColumns(row)).eq('id', c.id));
  }
  if (error) throw error;
  await logActivity({
    entity: 'currency',
    action: 'update',
    entityId: c.id,
    summary:
      before && before.rateToTHB !== c.rateToTHB
        ? `แก้เรต ${c.code}: ${before.rateToTHB ?? '-'} → ${c.rateToTHB ?? '-'} บาท`
        : `แก้สกุลเงิน ${c.code}`,
    payload: { before, after: c },
  });
};

export const deleteCurrency = async (id: string): Promise<void> => {
  const { error } = await supabase.from('user_currencies').delete().eq('id', id);
  if (error) throw error;
  await logActivity({
    entity: 'currency',
    action: 'delete',
    entityId: id,
    summary: `ลบสกุลเงิน ${id}`,
  });
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
