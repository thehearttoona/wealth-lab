import { supabase, getUserId } from './supabase';
import { UserPlatform, INVESTMENT_PLATFORMS } from '../types/investment';
import { isCatalogTableMissing } from './currencyStorage';
import { logActivity } from './activityLogStorage';

// ⚠️ mapper สองทางต้องแก้คู่กันเสมอ — เพิ่มฟิลด์ที่เดียวจะหายเงียบ ๆ ทั้งตอนบันทึกและตอนอ่าน
const mapFromDb = (row: any): UserPlatform => ({
  id: row.id,
  name: row.name,
  feePercent: row.fee_percent != null ? Number(row.fee_percent) : undefined,
  feeMinTHB: row.fee_min_thb != null ? Number(row.fee_min_thb) : undefined,
  feeMinCurrency: row.fee_min_currency ?? undefined,
  createdAt: row.created_at,
});

const mapToDb = (p: UserPlatform, userId: string) => ({
  id: p.id,
  name: p.name,
  fee_percent: p.feePercent ?? null,
  fee_min_thb: p.feeMinTHB ?? null,
  fee_min_currency: p.feeMinCurrency ?? null,
  created_at: p.createdAt,
  user_id: userId,
});

// ยังไม่ได้รัน sql/user_platforms_fee.sql — คอลัมน์ค่าธรรมเนียมยังไม่มี
// ตัดสองคอลัมน์นั้นออกแล้วลองใหม่ ดีกว่าให้ "เพิ่มแพลตฟอร์ม" พังทั้งปุ่มเพราะฟีเจอร์เสริม
const isFeeColumnMissing = (error: { message?: string } | null): boolean =>
  /fee_percent|fee_min_thb|fee_min_currency/i.test(error?.message || '');

const withoutFeeColumns = (row: ReturnType<typeof mapToDb>) => {
  const { fee_percent, fee_min_thb, fee_min_currency, ...rest } = row;
  return rest;
};

export const getPlatforms = async (): Promise<UserPlatform[]> => {
  const { data, error } = await supabase
    .from('user_platforms')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) {
    if (isCatalogTableMissing(error)) return [];
    throw error;
  }
  return (data || []).map(mapFromDb);
};

export const savePlatform = async (p: UserPlatform): Promise<void> => {
  const userId = await getUserId();
  const row = mapToDb(p, userId);
  let { error } = await supabase.from('user_platforms').insert(row);
  if (error && isFeeColumnMissing(error)) {
    ({ error } = await supabase.from('user_platforms').insert(withoutFeeColumns(row)));
  }
  if (error) throw error;
  await logActivity({
    entity: 'platform',
    action: 'create',
    entityId: p.id,
    summary: `เพิ่มแพลตฟอร์ม ${p.name}`,
    payload: p,
  });
};

export const updatePlatform = async (p: UserPlatform): Promise<void> => {
  const userId = await getUserId();
  const row = mapToDb(p, userId);
  let { error } = await supabase.from('user_platforms').update(row).eq('id', p.id);
  if (error && isFeeColumnMissing(error)) {
    ({ error } = await supabase
      .from('user_platforms')
      .update(withoutFeeColumns(row))
      .eq('id', p.id));
  }
  if (error) throw error;
  await logActivity({
    entity: 'platform',
    action: 'update',
    entityId: p.id,
    summary: `แก้แพลตฟอร์ม ${p.name}`,
    payload: p,
  });
};

export const deletePlatform = async (id: string): Promise<void> => {
  const { error } = await supabase.from('user_platforms').delete().eq('id', id);
  if (error) throw error;
  await logActivity({
    entity: 'platform',
    action: 'delete',
    entityId: id,
    summary: `ลบแพลตฟอร์ม ${id}`,
  });
};

// เติมค่าเริ่มต้นครั้งแรก = แพลตฟอร์มยอดนิยม + ชื่อที่ผู้ใช้เคยพิมพ์ไว้เองในรายการลงทุน/บัญชี
export const seedDefaultPlatforms = async (extraNames: string[] = []): Promise<UserPlatform[]> => {
  const userId = await getUserId();
  const seen = new Set<string>();
  const names = [...INVESTMENT_PLATFORMS, ...extraNames]
    .map((n) => n.trim())
    .filter((n) => {
      const key = n.toLowerCase();
      if (!n || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const now = Date.now();
  const rows = names.map((name, i) => ({
    id: `${now + i}`,
    name,
    createdAt: new Date().toISOString(),
  }));
  const payload = rows.map((r) => mapToDb(r, userId));
  let { error } = await supabase.from('user_platforms').insert(payload);
  if (error && isFeeColumnMissing(error)) {
    ({ error } = await supabase.from('user_platforms').insert(payload.map(withoutFeeColumns)));
  }
  if (error) throw error;
  return rows;
};
