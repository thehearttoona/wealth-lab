import { PurchaseGoal, DEFAULT_PURCHASE_MULTIPLIER } from '../types/purchaseGoal';
import { supabase, getUserId } from './supabase';
import { logActivity } from './activityLogStorage';

// อ่านของชิ้นนั้นไว้ก่อนแก้/ลบ — best-effort, ห้ามขวางการเขียนจริง
const fetchGoalForLog = async (id: string): Promise<PurchaseGoal | null> => {
  try {
    const { data } = await supabase.from('purchase_goals').select('*').eq('id', id).maybeSingle();
    return data ? mapFromDb(data) : null;
  } catch {
    return null;
  }
};

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
  await logActivity({
    entity: 'purchase_goal',
    action: 'create',
    entityId: goal.id,
    summary: `เพิ่มของที่อยากได้ ${goal.name} ${goal.price} ${goal.currency} ×${goal.multiplier}`,
    payload: goal,
  });
};

export const updatePurchaseGoal = async (goal: PurchaseGoal): Promise<void> => {
  const userId = await getUserId();
  const before = await fetchGoalForLog(goal.id);
  const { error } = await supabase
    .from('purchase_goals')
    .update(mapToDb(goal, userId))
    .eq('id', goal.id);
  if (error) throw error;
  await logActivity({
    entity: 'purchase_goal',
    action: 'update',
    entityId: goal.id,
    summary: `แก้ของที่อยากได้ ${goal.name}`,
    payload: { before, after: goal },
  });
};

export const deletePurchaseGoal = async (id: string): Promise<void> => {
  const before = await fetchGoalForLog(id);
  const { error } = await supabase.from('purchase_goals').delete().eq('id', id);
  if (error) throw error;
  await logActivity({
    entity: 'purchase_goal',
    action: 'delete',
    entityId: id,
    summary: before ? `ลบของที่อยากได้ ${before.name}` : `ลบของที่อยากได้ ${id}`,
    payload: before ?? { id },
  });
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
  // ลำดับคิวเป็นเรื่องใหญ่: ตัวบนสุดกินโควตากำไรก่อนทั้งก้อน สลับคิวคือเปลี่ยนว่าอะไรปลดล็อกก่อน
  // log 1 แถวต่อการจัดคิว 1 ครั้ง (ไม่ใช่ต่อรายการ)
  await logActivity({
    entity: 'purchase_goal',
    action: 'update',
    summary: `จัดลำดับคิวของที่อยากได้ (${orderedIds.length} รายการ)`,
    payload: { orderedIds },
  });
};

/** กด "ซื้อแล้ว" / "ยังไม่ซื้อ" — แยกจาก updatePurchaseGoal เพื่อไม่ต้องส่งฟิลด์อื่นไปทับ */
export const setPurchaseGoalBought = async (id: string, bought: boolean): Promise<void> => {
  const before = await fetchGoalForLog(id);
  const { error } = await supabase
    .from('purchase_goals')
    .update({ purchased_at: bought ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
  // เหตุการณ์นี้กินโควตากำไรจริงถาวร (price × multiplier) — ต้องมีในไทม์ไลน์
  await logActivity({
    entity: 'purchase_goal',
    action: 'update',
    entityId: id,
    summary: `${bought ? 'ซื้อแล้ว' : 'ยกเลิกซื้อแล้ว'}: ${before?.name || id}`,
    payload: { field: 'purchasedAt', bought, item: before ?? { id } },
  });
};
