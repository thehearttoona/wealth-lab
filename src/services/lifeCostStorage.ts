import { LifeCost, LifeCostKind } from '../types/lifeCost';
import { supabase, getUserId } from './supabase';
import { logActivity } from './activityLogStorage';

// ── "ค่าเสื่อมของชีวิต" (ตาราง life_costs) ──
// ต้องรัน sql/life_costs.sql ที่ Supabase console ก่อนใช้งาน
// DB เป็น snake_case / TS เป็น camelCase → เพิ่มฟิลด์ใหม่ต้องแก้ทั้ง mapFromDb และ mapToDb
// (แก้ข้างเดียวแล้วฟิลด์จะหายเงียบ ๆ ทั้งตอนเซฟและตอนโหลด — กฎข้อ 1 ของโปรเจกต์)

const mapFromDb = (row: any): LifeCost => ({
  id: row.id,
  name: row.name,
  kind: (row.kind ?? 'other') as LifeCostKind,
  cost: Number(row.cost),
  salvage: row.salvage != null ? Number(row.salvage) : undefined,
  cycleMonths: row.cycle_months != null ? Number(row.cycle_months) : 12,
  startedAt: (row.started_at ?? '').slice(0, 10),
  reserved: row.reserved != null ? Number(row.reserved) : undefined,
  note: row.note ?? undefined,
  createdAt: row.created_at ?? new Date().toISOString(),
});

const mapToDb = (c: LifeCost, userId: string) => ({
  id: c.id,
  user_id: userId,
  name: c.name,
  kind: c.kind,
  cost: c.cost,
  salvage: c.salvage ?? null,
  cycle_months: c.cycleMonths,
  started_at: c.startedAt,
  reserved: c.reserved ?? null,
  note: c.note ?? null,
});

/** ยังไม่ได้รัน sql/life_costs.sql — จอต้องบอกให้ไปรัน ไม่ใช่โยน error ดิบใส่หน้า */
export const isLifeCostTableMissing = (e: any): boolean =>
  /does not exist|schema cache/i.test(e?.message || String(e || ''));

export const getLifeCosts = async (): Promise<LifeCost[]> => {
  const { data, error } = await supabase
    .from('life_costs')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapFromDb);
};

export const saveLifeCost = async (item: LifeCost): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('life_costs').insert(mapToDb(item, userId));
  if (error) throw error;
  await logActivity({
    entity: 'life_cost',
    action: 'create',
    entityId: item.id,
    summary: `เพิ่มค่าเสื่อม ${item.name} ฿${item.cost} ทุก ${item.cycleMonths} เดือน`,
  });
};

export const updateLifeCost = async (item: LifeCost): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase
    .from('life_costs')
    .update(mapToDb(item, userId))
    .eq('id', item.id);
  if (error) throw error;
};

export const deleteLifeCost = async (id: string): Promise<void> => {
  const { error } = await supabase.from('life_costs').delete().eq('id', id);
  if (error) throw error;
};

/**
 * แก้เฉพาะยอดที่เก็บไว้ — patch คอลัมน์เดียว ไม่ส่งทั้งแถว
 * ส่งทั้งแถวจะเขียนทับค่าที่หน้าจออื่นเพิ่งแก้ด้วยข้อมูลเก่าที่ค้างใน state
 * (บั๊กแบบเดียวกับที่ setRedAck/updateInvestmentPrices เลี่ยงไว้)
 */
export const setLifeCostReserved = async (id: string, reserved: number): Promise<void> => {
  const { error } = await supabase.from('life_costs').update({ reserved }).eq('id', id);
  if (error) throw error;
};

/**
 * เริ่มรอบใหม่ (ซื้อของใหม่แล้ว / ไปตรวจมาแล้ว)
 *
 * ล้างยอดที่เก็บไว้กลับเป็น 0 ด้วย เพราะเงินก้อนนั้นถูกใช้ไปกับรอบที่เพิ่งจบแล้ว
 * — ถ้าไม่ล้าง รอบใหม่จะขึ้นว่า "เก็บครบแล้ว" ทั้งที่ยังไม่ได้เก็บสักบาท
 */
export const restartLifeCostCycle = async (item: LifeCost, startedAt: string): Promise<void> => {
  const { error } = await supabase
    .from('life_costs')
    .update({ started_at: startedAt, reserved: 0 })
    .eq('id', item.id);
  if (error) throw error;
  await logActivity({
    entity: 'life_cost',
    action: 'update',
    entityId: item.id,
    summary: `เริ่มรอบใหม่ ${item.name} (${startedAt})`,
  });
};
