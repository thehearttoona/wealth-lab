import { LifeGoal } from '../types/lifeGoal';
import { supabase, getUserId } from './supabase';
import { logActivity } from './activityLogStorage';

// ── "เป้าหมายใหญ่สุดของชีวิต" (ตาราง life_goals) ──
// ต้องรัน sql/life_goals.sql ที่ Supabase console ก่อนใช้งาน
// DB เป็น snake_case / TS เป็น camelCase → เพิ่มฟิลด์ใหม่ต้องแก้ทั้ง mapFromDb และ mapToDb

const mapFromDb = (row: any): LifeGoal => ({
  id: row.id,
  name: row.name,
  targetTHB: Number(row.target_thb),
  level: row.level != null ? Number(row.level) : 0,
  achievedAt: row.achieved_at ? String(row.achieved_at).slice(0, 10) : undefined,
  note: row.note ?? undefined,
  createdAt: row.created_at ?? new Date().toISOString(),
});

const mapToDb = (g: LifeGoal, userId: string) => ({
  id: g.id,
  user_id: userId,
  name: g.name,
  target_thb: g.targetTHB,
  level: g.level,
  achieved_at: g.achievedAt ?? null,
  note: g.note ?? null,
});

/** ยังไม่ได้รัน sql/life_goals.sql — จอต้องบอกให้ไปรัน ไม่ใช่โยน error ดิบใส่หน้า */
export const isLifeGoalTableMissing = (e: any): boolean =>
  /does not exist|schema cache/i.test(e?.message || String(e || ''));

export const getLifeGoals = async (): Promise<LifeGoal[]> => {
  const { data, error } = await supabase
    .from('life_goals')
    .select('*')
    .order('level', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapFromDb);
};

export const saveLifeGoal = async (goal: LifeGoal): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('life_goals').insert(mapToDb(goal, userId));
  if (error) throw error;
  await logActivity({
    entity: 'life_goal',
    action: 'create',
    entityId: goal.id,
    summary: `ตั้งด่าน ${goal.name} ฿${goal.targetTHB}`,
  });
};

export const updateLifeGoal = async (goal: LifeGoal): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('life_goals').update(mapToDb(goal, userId)).eq('id', goal.id);
  if (error) throw error;
};

export const deleteLifeGoal = async (id: string): Promise<void> => {
  const { error } = await supabase.from('life_goals').delete().eq('id', id);
  if (error) throw error;
};

/**
 * ประทับว่าผ่านด่านแล้ว — patch คอลัมน์เดียว ไม่ส่งทั้งแถว
 * (ส่งทั้งแถวจะเขียนทับชื่อ/ยอดด้วยข้อมูลเก่าที่ค้างใน state ของจอ)
 *
 * `achievedAt` ประทับครั้งเดียวแล้วอยู่อย่างนั้น — ยอดตกลงมาทีหลังก็ไม่ถอยด่าน
 * (ดูเหตุผลใน utils/lifeGoal.ts) การยกเลิกทำได้ทางเดียวคือกด "ยกเลิกการผ่านด่าน" เอง
 */
export const setLifeGoalAchieved = async (id: string, achievedAt: string | null): Promise<void> => {
  const { error } = await supabase.from('life_goals').update({ achieved_at: achievedAt }).eq('id', id);
  if (error) throw error;
};
