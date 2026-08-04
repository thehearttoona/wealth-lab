import { PurchaseGoal, DEFAULT_PURCHASE_MULTIPLIER } from '../types/purchaseGoal';
import { supabase, getUserId } from './supabase';

// เป้าหมายของที่อยากได้ — ต้องรัน sql/purchase_goals.sql ที่ Supabase console ก่อนใช้งาน
// DB เป็น snake_case / TS เป็น camelCase → เพิ่มฟิลด์ใหม่ต้องแก้ทั้ง mapFromDb และ mapToDb

const mapFromDb = (row: any): PurchaseGoal => ({
  id: row.id,
  name: row.name,
  price: Number(row.price),
  currency: row.currency ?? 'THB',
  multiplier: row.multiplier != null ? Number(row.multiplier) : DEFAULT_PURCHASE_MULTIPLIER,
  sortOrder: row.sort_order != null ? Number(row.sort_order) : 0,
  note: row.note ?? undefined,
  purchasedAt: row.purchased_at ?? undefined,
  createdAt: row.created_at ?? new Date().toISOString(),
});

const mapToDb = (g: PurchaseGoal, userId: string) => ({
  id: g.id,
  user_id: userId,
  name: g.name,
  price: g.price,
  currency: g.currency,
  multiplier: g.multiplier,
  sort_order: g.sortOrder,
  note: g.note ?? null,
  purchased_at: g.purchasedAt ?? null,
});

/** ยังไม่ได้รัน sql/purchase_goals.sql — หน้าจอต้องบอกให้ไปรัน ไม่ใช่ขึ้น error ดิบ */
export const isPurchaseGoalTableMissing = (e: any): boolean =>
  /does not exist|schema cache/i.test(e?.message || String(e || ''));

export const getPurchaseGoals = async (): Promise<PurchaseGoal[]> => {
  const { data, error } = await supabase
    .from('purchase_goals')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapFromDb);
};

export const savePurchaseGoal = async (goal: PurchaseGoal): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('purchase_goals').insert(mapToDb(goal, userId));
  if (error) throw error;
};

export const updatePurchaseGoal = async (goal: PurchaseGoal): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase
    .from('purchase_goals')
    .update(mapToDb(goal, userId))
    .eq('id', goal.id);
  if (error) throw error;
};

export const deletePurchaseGoal = async (id: string): Promise<void> => {
  const { error } = await supabase.from('purchase_goals').delete().eq('id', id);
  if (error) throw error;
};

// เลื่อนคิว — ส่งมาทั้งลิสต์ตามลำดับใหม่ แล้วเขียน sort_order ให้ตรงกับ index
// อัปเดตทีละแถวโดยตั้งใจ: upsert ทั้งก้อนต้องส่งทุกคอลัมน์ครบ ไม่งั้นค่าที่ไม่ได้ส่งจะถูกล้าง
export const reorderPurchaseGoals = async (orderedIds: string[]): Promise<void> => {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('purchase_goals')
      .update({ sort_order: i })
      .eq('id', orderedIds[i]);
    if (error) throw error;
  }
};

/** กด "ซื้อแล้ว" / "ยังไม่ซื้อ" — แยกจาก updatePurchaseGoal เพื่อไม่ต้องส่งฟิลด์อื่นไปทับ */
export const setPurchaseGoalBought = async (id: string, bought: boolean): Promise<void> => {
  const { error } = await supabase
    .from('purchase_goals')
    .update({ purchased_at: bought ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
};
