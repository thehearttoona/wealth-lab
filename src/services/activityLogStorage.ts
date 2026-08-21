import { supabase, getUserId } from './supabase';

// ── บันทึกความเคลื่อนไหว (append-only) ──────────────────────────────────────
// เก็บ "เกิดอะไรขึ้นเมื่อไหร่" แยกจากสถานะปัจจุบัน — ตารางอื่นในแอปเก็บแต่ค่าล่าสุด
// แก้ราคาซื้อทับ = อดีตหาย, ลบรายการ = เหตุการณ์หายจากอดีตด้วย ตารางนี้ทำให้ย้อนดูได้
// (ต้องรัน sql/activity_log.sql ที่ Supabase ก่อน — ยังไม่รันแอปก็ทำงานปกติ แค่ไม่มี log)
//
// กฎเหล็กของโมดูลนี้: **ห้ามทำให้การบันทึกข้อมูลจริงพัง**
// ทุก error ถูกกลืนที่นี่ที่เดียว (ตารางยังไม่มี / เน็ตหลุด / RLS) เพราะ log เป็นของแถม
// ไม่ใช่ของหลัก — ผู้ใช้ต้องเซฟรายการลงทุนได้แม้ log จะล้มเหลว
//
// อีกข้อ: **ไม่ log การรีเฟรชราคา** (updateInvestmentPrices) โดยตั้งใจ
// ราคาอัปเดตอัตโนมัติทุก 5 นาที × จำนวนรายการ → จะกลายเป็นขยะท่วมตารางทันที
// สิ่งที่อยากรู้คือ "คนทำอะไร" ไม่ใช่ "ราคาขยับ"

export type ActivityAction = 'create' | 'update' | 'delete';

export type ActivityEntity =
  | 'investment'
  | 'realized_trade'
  | 'expense'
  | 'income'
  | 'recurring_bill'
  | 'installment'
  | 'account'
  | 'purchase_goal'
  | 'portfolio_goal'
  | 'investment_plan'
  | 'investment_cycle'
  | 'tax_profile'
  | 'life_cost'
  | 'life_goal'
  | 'currency'
  | 'platform'
  // นำเข้าจากสเตตเมนต์ = 1 แถวต่อการนำเข้า 1 ครั้ง (ไม่ใช่ต่อรายการ)
  // ไม่งั้นวางสเตตเมนต์เดือนเดียวก็ได้ log เป็นร้อยแถวจนไทม์ไลน์อ่านไม่ได้
  | 'import';

export interface ActivityLogEntry {
  id: string;
  at: string;
  entity: ActivityEntity;
  entityId?: string;
  action: ActivityAction;
  summary?: string;
  payload?: any;
}

const mapFromDb = (row: any): ActivityLogEntry => ({
  id: row.id,
  at: row.at,
  entity: row.entity,
  entityId: row.entity_id ?? undefined,
  action: row.action,
  summary: row.summary ?? undefined,
  payload: row.payload ?? undefined,
});

// id ฝั่ง client เหมือนตารางอื่น — ต้องกันชนกันเองด้วย เพราะ bulk action ยิงหลายแถวในมิลลิวินาทีเดียว
let seq = 0;
const newId = (): string => `${Date.now()}-${(seq = (seq + 1) % 100000)}`;

interface LogInput {
  entity: ActivityEntity;
  action: ActivityAction;
  entityId?: string;
  summary?: string;
  payload?: any;
}

/**
 * เขียน 1 แถวลง activity_log — ไม่ throw ไม่ว่าเกิดอะไรขึ้น
 * เรียกหลังจากการเขียนข้อมูลจริงสำเร็จแล้วเท่านั้น (ไม่งั้น log จะมีเหตุการณ์ที่ไม่ได้เกิด)
 */
export const logActivity = async (input: LogInput): Promise<void> => {
  try {
    const userId = await getUserId();
    await supabase.from('activity_log').insert({
      id: newId(),
      user_id: userId,
      at: new Date().toISOString(),
      entity: input.entity,
      entity_id: input.entityId ?? null,
      action: input.action,
      summary: input.summary ?? null,
      payload: input.payload ?? null,
    });
  } catch {
    // เงียบตามเจตนา — ดู "กฎเหล็ก" ด้านบน
  }
};

/** เขียนหลายแถวรวดเดียว (bulk add/delete) — ไม่ throw เช่นกัน */
export const logActivityBatch = async (inputs: LogInput[]): Promise<void> => {
  if (inputs.length === 0) return;
  try {
    const userId = await getUserId();
    const at = new Date().toISOString();
    await supabase.from('activity_log').insert(
      inputs.map((input) => ({
        id: newId(),
        user_id: userId,
        at,
        entity: input.entity,
        entity_id: input.entityId ?? null,
        action: input.action,
        summary: input.summary ?? null,
        payload: input.payload ?? null,
      }))
    );
  } catch {
    // เงียบตามเจตนา
  }
};

/**
 * อ่าน log ล่าสุด — คืน [] ถ้าอ่านไม่ได้/ยังไม่ได้รัน SQL
 * (ยังไม่มีหน้าจอไหนเรียก มีไว้เป็นทางเข้าของขั้นถัดไป: ค่าเฉลี่ย/จังหวะ DCA/ให้ AI ประเมิน)
 */
export const getActivityLog = async (limit = 200): Promise<ActivityLogEntry[]> => {
  try {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .order('at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(mapFromDb);
  } catch {
    return [];
  }
};

/** ประวัติของรายการเดียว เช่น ไม้นี้ถูกแก้อะไรมาบ้าง — เรียงเก่า→ใหม่ */
export const getActivityLogFor = async (
  entity: ActivityEntity,
  entityId: string
): Promise<ActivityLogEntry[]> => {
  try {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .eq('entity', entity)
      .eq('entity_id', entityId)
      .order('at', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapFromDb);
  } catch {
    return [];
  }
};
