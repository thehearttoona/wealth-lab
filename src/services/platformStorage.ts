import { supabase } from './supabase';
import { UserPlatform, INVESTMENT_PLATFORMS } from '../types/investment';
import { isCatalogTableMissing } from './currencyStorage';

const getUserId = async (): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
};

const mapFromDb = (row: any): UserPlatform => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
});

const mapToDb = (p: UserPlatform, userId: string) => ({
  id: p.id,
  name: p.name,
  created_at: p.createdAt,
  user_id: userId,
});

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
  const { error } = await supabase.from('user_platforms').insert(mapToDb(p, userId));
  if (error) throw error;
};

export const updatePlatform = async (p: UserPlatform): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase
    .from('user_platforms')
    .update(mapToDb(p, userId))
    .eq('id', p.id);
  if (error) throw error;
};

export const deletePlatform = async (id: string): Promise<void> => {
  const { error } = await supabase.from('user_platforms').delete().eq('id', id);
  if (error) throw error;
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
  const { error } = await supabase.from('user_platforms').insert(rows.map((r) => mapToDb(r, userId)));
  if (error) throw error;
  return rows;
};
