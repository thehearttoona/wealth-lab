import { LedgerMonth } from '../types/lifeLedger';
import { supabase, getUserId } from './supabase';
import { logActivity } from './activityLogStorage';

// ── "บัญชีให้พอร์ตจ่ายชีวิต" (ตาราง life_ledger) ──
// ต้องรัน sql/life_ledger.sql ที่ Supabase console ก่อนใช้งาน
// DB เป็น snake_case / TS เป็น camelCase → เพิ่มฟิลด์ใหม่ต้องแก้ทั้ง mapFromDb และ mapToDb
// (แก้ข้างเดียวแล้วฟิลด์จะหายเงียบ ๆ ทั้งตอนเซฟและตอนโหลด — กฎข้อ 1 ของโปรเจกต์)

const mapFromDb = (row: any): LedgerMonth => ({
  month: (row.month ?? '').slice(0, 7),
  depreciationTHB: Number(row.depreciation_thb ?? 0),
  billsTHB: Number(row.bills_thb ?? 0),
  note: row.note ?? undefined,
  recordedAt: row.recorded_at ?? new Date().toISOString(),
});

const mapToDb = (m: LedgerMonth, userId: string) => ({
  // id ไม่ใช่คีย์ที่ใช้ตัดสินความซ้ำ — คีย์จริงคือ (user_id, month) ที่ unique index คุมไว้
  // จึงสร้าง id จาก userId+month ให้คงที่ เพื่อให้ upsert แถวเดิมได้ id เดิมด้วย
  id: `${userId}:${m.month}`,
  user_id: userId,
  month: m.month,
  depreciation_thb: m.depreciationTHB,
  bills_thb: m.billsTHB,
  note: m.note ?? null,
  recorded_at: m.recordedAt,
});

/** ยังไม่ได้รัน sql/life_ledger.sql — จอต้องบอกให้ไปรัน ไม่ใช่โยน error ดิบใส่หน้า */
export const isLifeLedgerTableMissing = (e: any): boolean =>
  /does not exist|schema cache/i.test(e?.message || String(e || ''));

export const getLedgerMonths = async (): Promise<LedgerMonth[]> => {
  const { data, error } = await supabase
    .from('life_ledger')
    .select('*')
    .order('month', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapFromDb);
};

/**
 * จด/แก้ยอดของหนึ่งเดือน
 *
 * upsert แบบเขียนทับ (ไม่ใช่ `ignoreDuplicates` แบบ recordRedSignals) โดยตั้งใจ:
 * ที่นี่การกดเดือนเดิมซ้ำคือ "แก้ยอดให้ถูก" ต้องทับของเดิม ส่วนที่ red_signals ต้อง ignore
 * เพราะมี `outcome` ที่คนกดเองแล้วห้ามถูกรีเซ็ต — ตารางนี้ไม่มีฟิลด์แบบนั้น ทุกช่องคนกรอกเอง
 */
export const saveLedgerMonth = async (m: LedgerMonth): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase
    .from('life_ledger')
    .upsert(mapToDb(m, userId), { onConflict: 'user_id,month' });
  if (error) throw error;
  await logActivity({
    entity: 'life_ledger',
    action: 'update',
    entityId: m.month,
    summary: `จดค่าใช้จ่ายเดือน ${m.month} ฿${Math.round(m.depreciationTHB + m.billsTHB)}`,
  });
};

export const deleteLedgerMonth = async (month: string): Promise<void> => {
  const { error } = await supabase.from('life_ledger').delete().eq('month', month);
  if (error) throw error;
};
