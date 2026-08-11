import { supabase, getUserId } from './supabase';
import { logActivity } from './activityLogStorage';
import {
  InvestmentCycle,
  BasketKey,
  DEFAULT_CYCLE_TARGET,
  DEFAULT_MAX_LEGS_PER_SYMBOL,
  basketLabel,
} from '../types/cycle';

// ── รอบลงทุน (ตาราง investment_cycles) ──
// ต้องรัน sql/investment_cycles.sql ที่ Supabase ก่อน 1 ครั้ง
// ยังไม่รัน: getOpenCycles/getClosedCycles คืน [] แล้วการ์ดรอบจะไม่โผล่ — แอปอื่นทำงานปกติ
// (แต่ตอน "เปิดรอบ" จะ throw ข้อความบอกให้ไปรัน SQL เพราะปุ่มที่กดแล้วเงียบแย่กว่า error)

/** ยังไม่ได้สร้างตาราง/คอลัมน์ — ใช้ตัดสินว่าจะกลืน error หรือโยนต่อ (แบบเดียวกับ currencyStorage) */
export const isCycleTableMissing = (e: any): boolean =>
  /investment_cycles|cycle_id|does not exist|schema cache/i.test(String(e?.message || e));

// ⚠️ mapper สองทางต้องแก้คู่กันเสมอ — เพิ่มฟิลด์ที่เดียวจะหายเงียบ ๆ ทั้งตอนบันทึกและตอนอ่าน
const mapFromDb = (row: any): InvestmentCycle => ({
  id: row.id,
  basket: row.basket as BasketKey,
  cycleNo: Number(row.cycle_no ?? 1),
  targetProfitPercent: Number(row.target_profit_percent ?? 0),
  budgetTHB: row.budget_thb != null ? Number(row.budget_thb) : undefined,
  maxLegsPerSymbol: row.max_legs_per_symbol != null ? Number(row.max_legs_per_symbol) : undefined,
  startedAt: row.started_at,
  closedAt: row.closed_at ?? undefined,
  closedInvestedTHB: row.closed_invested_thb != null ? Number(row.closed_invested_thb) : undefined,
  closedProfitTHB: row.closed_profit_thb != null ? Number(row.closed_profit_thb) : undefined,
  closedDays: row.closed_days != null ? Number(row.closed_days) : undefined,
  notes: row.notes ?? undefined,
});

const mapToDb = (c: InvestmentCycle, userId: string) => ({
  id: c.id,
  user_id: userId,
  basket: c.basket,
  cycle_no: c.cycleNo,
  target_profit_percent: c.targetProfitPercent,
  budget_thb: c.budgetTHB ?? null,
  max_legs_per_symbol: c.maxLegsPerSymbol ?? null,
  started_at: c.startedAt,
  closed_at: c.closedAt ?? null,
  closed_invested_thb: c.closedInvestedTHB ?? null,
  closed_profit_thb: c.closedProfitTHB ?? null,
  closed_days: c.closedDays ?? null,
  notes: c.notes ?? null,
});

/** รอบที่ยังเปิดอยู่ (closed_at is null) — ตะกร้าละไม่เกิน 1 รอบ (unique index กันไว้) */
export const getOpenCycles = async (): Promise<InvestmentCycle[]> => {
  try {
    const { data, error } = await supabase
      .from('investment_cycles')
      .select('*')
      .is('closed_at', null)
      .order('basket', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapFromDb);
  } catch (e) {
    if (isCycleTableMissing(e)) return [];
    throw e;
  }
};

/** รอบที่ปิดแล้ว ใหม่ก่อน — ใช้ในการ์ดประวัติรอบ */
export const getClosedCycles = async (): Promise<InvestmentCycle[]> => {
  try {
    const { data, error } = await supabase
      .from('investment_cycles')
      .select('*')
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapFromDb);
  } catch (e) {
    if (isCycleTableMissing(e)) return [];
    throw e;
  }
};

/**
 * เปิดรอบใหม่ของตะกร้านี้ — เลขรอบต่อจากรอบล่าสุดของตะกร้าเดียวกัน
 * ตะกร้าหนึ่งเปิดได้ทีละรอบเดียว (unique index) → ถ้ามีรอบเปิดอยู่แล้วจะ throw ข้อความไทย
 * ไม่ใช่ปล่อยให้เห็น error ของ Postgres ดิบ ๆ
 */
export const openCycle = async (input: {
  basket: BasketKey;
  targetProfitPercent?: number;
  budgetTHB?: number;
  maxLegsPerSymbol?: number;
  startedAt?: string;
}): Promise<InvestmentCycle> => {
  const userId = await getUserId();
  // เลขรอบถัดไป — อ่านรอบล่าสุดของตะกร้า (รวมที่ปิดแล้ว) เพื่อให้เลขเดินต่อ ไม่ย้อนกลับไป 1
  let nextNo = 1;
  try {
    const { data } = await supabase
      .from('investment_cycles')
      .select('cycle_no')
      .eq('basket', input.basket)
      .order('cycle_no', { ascending: false })
      .limit(1);
    if (data && data.length > 0) nextNo = Number(data[0].cycle_no ?? 0) + 1;
  } catch {
    // อ่านไม่ได้ก็เริ่มที่ 1 — ห้ามขวางการเปิดรอบ
  }

  const cycle: InvestmentCycle = {
    id: Date.now().toString(),
    basket: input.basket,
    cycleNo: nextNo,
    targetProfitPercent:
      input.targetProfitPercent ?? DEFAULT_CYCLE_TARGET[input.basket] ?? 12,
    budgetTHB: input.budgetTHB,
    maxLegsPerSymbol: input.maxLegsPerSymbol ?? DEFAULT_MAX_LEGS_PER_SYMBOL,
    startedAt: input.startedAt ?? new Date().toISOString().slice(0, 10),
  };

  const { error } = await supabase.from('investment_cycles').insert(mapToDb(cycle, userId));
  if (error) {
    if (/investment_cycles_open_per_basket|duplicate key/i.test(error.message || '')) {
      throw new Error(`ตะกร้า "${basketLabel(input.basket)}" มีรอบที่เปิดอยู่แล้ว — ปิดรอบนั้นก่อน`);
    }
    if (isCycleTableMissing(error)) {
      throw new Error('ยังไม่ได้สร้างตาราง — เอา sql/investment_cycles.sql ไปรันที่ Supabase ก่อน');
    }
    throw error;
  }
  await logActivity({
    entity: 'investment_cycle',
    action: 'create',
    entityId: cycle.id,
    summary: `เปิดรอบที่ ${cycle.cycleNo} · ${basketLabel(cycle.basket)} · เป้า +${cycle.targetProfitPercent}%`,
    payload: cycle,
  });
  return cycle;
};

/** แก้ค่าของรอบที่เปิดอยู่ (เป้า/งบ/เพดานไม้) — ส่งทั้งแถวเพราะหน้าตั้งค่าถือค่าล่าสุดอยู่แล้ว */
export const updateCycle = async (cycle: InvestmentCycle): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase
    .from('investment_cycles')
    .update(mapToDb(cycle, userId))
    .eq('id', cycle.id);
  if (error) throw error;
  await logActivity({
    entity: 'investment_cycle',
    action: 'update',
    entityId: cycle.id,
    summary:
      `แก้รอบที่ ${cycle.cycleNo} · ${basketLabel(cycle.basket)} · เป้า +${cycle.targetProfitPercent}%` +
      (cycle.budgetTHB ? ` · งบ ${cycle.budgetTHB}` : ''),
    payload: cycle,
  });
};

/**
 * ปิดรอบ — เก็บ snapshot ผลของรอบไว้ในแถว
 * เรียก "หลัง" ขายไม้ทุกตัวสำเร็จแล้วเท่านั้น ไม่งั้นรอบจะปิดทั้งที่ของยังอยู่ในพอร์ต
 */
export const closeCycle = async (
  cycle: InvestmentCycle,
  snapshot: { investedTHB: number; profitTHB: number; days: number; closedAt?: string }
): Promise<InvestmentCycle> => {
  const closed: InvestmentCycle = {
    ...cycle,
    closedAt: snapshot.closedAt ?? new Date().toISOString().slice(0, 10),
    closedInvestedTHB: snapshot.investedTHB,
    closedProfitTHB: snapshot.profitTHB,
    closedDays: snapshot.days,
  };
  const userId = await getUserId();
  const { error } = await supabase
    .from('investment_cycles')
    .update(mapToDb(closed, userId))
    .eq('id', cycle.id);
  if (error) throw error;
  await logActivity({
    entity: 'investment_cycle',
    action: 'update',
    entityId: cycle.id,
    summary:
      `ปิดรอบที่ ${cycle.cycleNo} · ${basketLabel(cycle.basket)} · ` +
      `ลง ${Math.round(snapshot.investedTHB)} กำไร ${Math.round(snapshot.profitTHB)} ใน ${snapshot.days} วัน`,
    payload: closed,
  });
  return closed;
};

/** ลบรอบ (เปิดผิดตะกร้า/ผิดค่า) — ไม้ที่ผูกไว้ต้องถอนออกก่อน ไม่งั้นจะเหลือ cycle_id ที่ไม่มีเจ้าของ */
export const deleteCycle = async (id: string): Promise<void> => {
  const { error } = await supabase.from('investment_cycles').delete().eq('id', id);
  if (error) throw error;
  await logActivity({
    entity: 'investment_cycle',
    action: 'delete',
    entityId: id,
    summary: 'ลบรอบลงทุน',
    payload: { id },
  });
};
