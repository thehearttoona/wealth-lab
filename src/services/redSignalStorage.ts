import { supabase, getUserId } from './supabase';
import { RedSignal, RedSignalOutcome } from '../types/redSignal';
import { InvestmentType, RedInterval } from '../types/investment';

// ── ประวัติสัญญาณ "ถึงคิวลงไม้" (ตาราง red_signals) ──
// ต้องรัน sql/red_signals.sql ที่ Supabase ก่อน 1 ครั้ง
// ยังไม่รัน: getRedSignals คืน [] และการบันทึกจะเงียบ ๆ ไม่ทำอะไร — พอร์ตยังทำงานปกติทุกอย่าง
// (หน้าประวัติจะขึ้นข้อความบอกให้ไปรัน SQL แทนการโชว์ "ยังไม่มีสัญญาณ" ซึ่งจะโกหกผู้ใช้)

/** ยังไม่ได้สร้างตาราง/คอลัมน์ — ใช้ตัดสินว่าจะกลืน error หรือโยนต่อ (แบบเดียวกับ cycleStorage) */
export const isRedSignalTableMissing = (e: any): boolean =>
  /red_signals|does not exist|schema cache/i.test(String(e?.message || e));

// ⚠️ mapper สองทางต้องแก้คู่กันเสมอ — เพิ่มฟิลด์ที่เดียวจะหายเงียบ ๆ ทั้งตอนบันทึกและตอนอ่าน
const mapFromDb = (row: any): RedSignal => ({
  id: row.id,
  signalKey: row.signal_key,
  investmentId: row.investment_id ?? undefined,
  type: row.asset_type as InvestmentType,
  symbol: row.symbol ?? '',
  name: row.name ?? '',
  interval: (row.red_interval ?? 'day') as RedInterval,
  every: Number(row.red_every ?? 2),
  count: Number(row.red_count ?? 0),
  roundNo: Number(row.round_no ?? 1),
  dropPercent: Number(row.drop_percent ?? 0),
  lowPrice: row.low_price != null ? Number(row.low_price) : undefined,
  lowCurrency: row.low_currency ?? undefined,
  currency: row.currency ?? 'THB',
  streakStartAt: row.streak_start_at ?? undefined,
  firedAt: row.fired_at,
  // ⚠️ null → undefined ตั้งใจ: "ไม้นี้ไม่อยู่ในรอบ" ต้องไม่กลายเป็น false (= เข้าไม่ได้)
  enterable: row.enterable == null ? undefined : !!row.enterable,
  blockedReason: row.blocked_reason ?? undefined,
  cycleId: row.cycle_id ?? undefined,
  cycleNo: row.cycle_no != null ? Number(row.cycle_no) : undefined,
  planLegTHB: row.plan_leg_thb != null ? Number(row.plan_leg_thb) : undefined,
  outcome: (row.outcome ?? 'pending') as RedSignalOutcome,
  actedAt: row.acted_at ?? undefined,
  note: row.note ?? undefined,
});

const mapToDb = (s: RedSignal, userId: string) => ({
  id: s.id,
  user_id: userId,
  signal_key: s.signalKey,
  investment_id: s.investmentId ?? null,
  asset_type: s.type,
  symbol: s.symbol ?? '',
  name: s.name ?? '',
  red_interval: s.interval,
  red_every: s.every,
  red_count: s.count,
  round_no: s.roundNo,
  drop_percent: s.dropPercent,
  low_price: s.lowPrice ?? null,
  low_currency: s.lowCurrency ?? null,
  currency: s.currency,
  streak_start_at: s.streakStartAt ?? null,
  fired_at: s.firedAt,
  enterable: s.enterable == null ? null : s.enterable,
  blocked_reason: s.blockedReason ?? null,
  cycle_id: s.cycleId ?? null,
  cycle_no: s.cycleNo ?? null,
  plan_leg_thb: s.planLegTHB ?? null,
  outcome: s.outcome,
  acted_at: s.actedAt ?? null,
  note: s.note ?? null,
});

/** ประวัติทั้งหมด ใหม่ก่อน — ประวัติสะสมของกฎแท่งแดง ไม่มีการตัดตามปี (ตั้งใจ: ยิ่งยาวยิ่งมีค่า) */
export const getRedSignals = async (): Promise<RedSignal[]> => {
  try {
    const { data, error } = await supabase
      .from('red_signals')
      .select('*')
      .order('fired_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapFromDb);
  } catch (e) {
    if (isRedSignalTableMissing(e)) return [];
    throw e;
  }
};

/**
 * บันทึกสัญญาณที่เพิ่งเห็น — ใช้ upsert + ignoreDuplicates บน (user_id, signal_key)
 *
 * best-effort ทั้งฟังก์ชัน: ตารางยังไม่มี/เขียนไม่ได้ ก็ต้องไม่ขวางหน้าพอร์ต
 * (เหตุผลเดียวกับ activityLogStorage — บันทึกประวัติห้ามทำให้ของหลักพัง)
 *
 * คืนจำนวนแถวที่ "เพิ่งถูกเพิ่มจริง" เพื่อให้หน้าจอตัดสินใจได้ว่าต้องโหลดประวัติใหม่ไหม
 */
export const recordRedSignals = async (
  signals: Omit<RedSignal, 'id'>[]
): Promise<number> => {
  if (signals.length === 0) return 0;
  try {
    const userId = await getUserId();
    // id ต่างกันทุกแถวในชุดเดียว — Date.now() ตรง ๆ จะซ้ำกันเมื่อบันทึกหลายตัวพร้อมกัน
    const base = Date.now();
    const rows = signals.map((s, i) => mapToDb({ ...s, id: `${base + i}` }, userId));
    const { data, error } = await supabase
      .from('red_signals')
      // ⚠️ ignoreDuplicates: true — สัญญาณเดิมที่บันทึกไว้แล้วต้องไม่ถูกเขียนทับ
      // ไม่งั้น outcome ที่ผู้ใช้กด ("ลงไม้แล้ว") จะถูกรีเซ็ตเป็น pending ทุกครั้งที่เปิดจอ
      .upsert(rows, { onConflict: 'user_id,signal_key', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    return (data || []).length;
  } catch (e) {
    if (!isRedSignalTableMissing(e)) console.error('recordRedSignals failed', e);
    return 0;
  }
};

/** เปลี่ยนผลของสัญญาณ (ลงไม้แล้ว / ปล่อยผ่าน / ล้างเป็นยังไม่บันทึก) */
export const setRedSignalOutcome = async (
  id: string,
  outcome: RedSignalOutcome
): Promise<void> => {
  const { error } = await supabase
    .from('red_signals')
    .update({
      outcome,
      // ล้างกลับเป็น pending = ลบเวลาที่ลงมือด้วย ไม่ใช่ทิ้งเวลาเก่าค้างไว้ให้ขัดกับสถานะ
      acted_at: outcome === 'pending' ? null : new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
};

/**
 * ปุ่ม "ลงไม้แล้ว" ในการ์ดพอร์ตกดจาก "สัญญาณสด" ซึ่งยังไม่รู้ id ของแถวประวัติ
 * → ยิงด้วย signal_key แทน แล้วกลืน error ทั้งหมด (ปุ่มนั้นมีหน้าที่ปิดแจ้งเตือน
 *   การอัปเดตประวัติเป็นผลพลอยได้ ห้ามทำให้ปุ่มหลักล้ม)
 */
export const setRedSignalOutcomeByKey = async (
  signalKey: string,
  outcome: RedSignalOutcome
): Promise<void> => {
  try {
    const { error } = await supabase
      .from('red_signals')
      .update({
        outcome,
        acted_at: outcome === 'pending' ? null : new Date().toISOString(),
      })
      .eq('signal_key', signalKey);
    if (error) throw error;
  } catch (e) {
    if (!isRedSignalTableMissing(e)) console.error('setRedSignalOutcomeByKey failed', e);
  }
};

/** โน้ต "เพราะอะไรจึงลง/ไม่ลง" — ค่าว่างเก็บเป็น null ไม่ใช่สตริงว่าง */
export const setRedSignalNote = async (id: string, note: string): Promise<void> => {
  const { error } = await supabase
    .from('red_signals')
    .update({ note: note.trim() ? note.trim() : null })
    .eq('id', id);
  if (error) throw error;
};

/** ลบแถวประวัติ (บันทึกผิด/ทดลอง) — ไม่ลบเป็นชุด เพราะประวัติที่หายทั้งก้อนกู้ไม่ได้ */
export const deleteRedSignal = async (id: string): Promise<void> => {
  const { error } = await supabase.from('red_signals').delete().eq('id', id);
  if (error) throw error;
};
