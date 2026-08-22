import { supabase, getUserId } from './supabase';
import { logActivity } from './activityLogStorage';

// ── "ขั้นบันไดที่ปลดจริงแล้ว" (ตาราง expense_ladder_freed) ──
// ต้องรัน sql/expense_ladder_freed.sql ที่ Supabase console ก่อนใช้งาน
//
// ⚠️ นี่คือ **บันทึกของโลกจริง ไม่ใช่ input ของคณิตบันได** — "ถึงแล้ว" คิดจากมูลค่าพอร์ต
// ที่ utils/expenseLadder.ts อย่างเดียว ตารางนี้บอกแค่ว่าคนกดยืนยันแล้วหรือยัง
// (หลักเดียวกับ achievedAt ของด่านชีวิต และ powderLegsUsed ของกระสุน: แอปคำนวณ คนกดยืนยัน)

/** คีย์ของหนึ่งขั้น — ต้องมี kind เพราะ id ของ life_costs กับ recurring_bills อาจชนกัน */
export type LadderItemKind = 'life_cost' | 'bill';

export interface LadderFreed {
  itemKind: LadderItemKind;
  itemId: string;
  freedAt: string;
  note?: string;
}

/** คีย์ที่ใช้ทั้งใน Map และเป็น id ของแถว — รูปแบบเดียวทั้งแอป */
export const ladderKey = (kind: LadderItemKind, itemId: string): string => `${kind}:${itemId}`;

const mapFromDb = (row: any): LadderFreed => ({
  itemKind: (row.item_kind ?? 'life_cost') as LadderItemKind,
  itemId: row.item_id,
  freedAt: (row.freed_at ?? '').slice(0, 10),
  note: row.note ?? undefined,
});

const mapToDb = (f: LadderFreed, userId: string) => ({
  // id คงที่จาก userId + คีย์ของขั้น เพื่อให้ upsert แถวเดิมได้ id เดิม (แบบเดียวกับ life_ledger)
  id: `${userId}:${ladderKey(f.itemKind, f.itemId)}`,
  user_id: userId,
  item_kind: f.itemKind,
  item_id: f.itemId,
  freed_at: f.freedAt,
  note: f.note ?? null,
});

/** ยังไม่ได้รัน sql/expense_ladder_freed.sql — จอต้องบอกให้ไปรัน ไม่ใช่โยน error ดิบใส่หน้า */
export const isLadderFreedTableMissing = (e: any): boolean =>
  /does not exist|schema cache/i.test(e?.message || String(e || ''));

/**
 * คืนเป็น Map คีย์ `kind:id` → วันที่ปลด
 *
 * ทนตารางหายโดยคืน Map ว่าง (ไม่ throw) — บันไดต้องใช้งานได้ก่อนรัน SQL
 * และ "ยังไม่มีใครกดยืนยัน" กับ "ยังไม่ได้รัน SQL" ให้ผลบนจอเหมือนกันพอดี
 */
export const getLadderFreed = async (): Promise<Map<string, string>> => {
  try {
    const { data, error } = await supabase.from('expense_ladder_freed').select('*');
    if (error) throw error;
    const out = new Map<string, string>();
    (data || []).map(mapFromDb).forEach((f) => out.set(ladderKey(f.itemKind, f.itemId), f.freedAt));
    return out;
  } catch (e) {
    if (isLadderFreedTableMissing(e)) return new Map();
    throw e;
  }
};

export const setLadderFreed = async (
  itemKind: LadderItemKind,
  itemId: string,
  freedAt: string,
  name?: string
): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase
    .from('expense_ladder_freed')
    .upsert(mapToDb({ itemKind, itemId, freedAt }, userId), {
      onConflict: 'user_id,item_kind,item_id',
    });
  if (error) throw error;
  await logActivity({
    entity: 'expense_ladder',
    action: 'update',
    entityId: ladderKey(itemKind, itemId),
    summary: `ปลดขั้นบันได ${name || itemId} (${freedAt})`,
  });
};

/** ยกเลิกการยืนยัน — กดผิดต้องถอยได้ ไม่ใช่ค้างถาวร */
export const clearLadderFreed = async (
  itemKind: LadderItemKind,
  itemId: string
): Promise<void> => {
  const { error } = await supabase
    .from('expense_ladder_freed')
    .delete()
    .eq('item_kind', itemKind)
    .eq('item_id', itemId);
  if (error) throw error;
};
