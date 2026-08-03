import { supabase, getUserId } from './supabase';
import { convertToTHB } from '../utils/constants';

// เงินรอลงทุน 1 รายการ — จดแยกตามแหล่งเงิน/โบรกได้ (เช่น "Dime 5,000", "โบนัส 20,000")
export interface DryPowderItem {
  id: string;
  label: string;      // ชื่อรายการ/แหล่งเงิน (เว้นว่างได้)
  amount: number;     // จำนวนเงินในสกุลของ currency
  currency?: string;  // สกุลเงินจากแคตตาล็อก "สกุลเงิน & แพลตฟอร์ม" (ไม่ระบุ = THB)
  asOf?: string;      // วันที่จดรายการนี้ (YYYY-MM-DD)
}

export interface InvestmentPlan {
  setAsidePercent: number;  // กันเงินเดือนกี่ % ไปลงทุน
  dcaRounds: number;        // จำนวนรอบที่วางแผนจะทยอยลง
  expectedIncome?: number;  // เงินเดือน/เงินได้ต่อเดือน (โดยประมาณ) — ฐานที่นิ่งของแผน "จ่ายตัวเองก่อน"
  dryPowder?: number;       // เงินรอลงทุนที่จดเอง (THB) — "ยอดรวม" ก้อนที่พร้อมลงตอนนี้ ไม่ใช่เงินเดือน
  dryPowderAsOf?: string;   // วันที่จดยอดล่าสุด (YYYY-MM-DD) — ไว้เตือนว่าซื้อไปแล้วกี่รายการหลังจากนั้น
  // รายการย่อยของเงินรอลงทุน — dryPowder ด้านบนคือผลรวมของรายการเหล่านี้เสมอ
  // (คอลัมน์ dry_powder_items เพิ่มทีหลัง ยังไม่รัน SQL ก็ใช้แบบยอดรวมก้อนเดียวได้)
  dryPowderItems?: DryPowderItem[];
}

// ผลรวมของรายการย่อย "เป็น THB" — แปลงด้วยเรตชุดเดียวกับ getPortfolioSummary
// ใช้ที่เดียวทั้งตอนบันทึกและตอนแสดง กันเลขรวมเพี้ยนจากกันเอง
export const sumDryPowderItems = (items?: DryPowderItem[]): number =>
  (items || []).reduce(
    (s, i) => s + (Number.isFinite(i.amount) ? convertToTHB(i.amount, i.currency ?? 'THB') : 0),
    0
  );

export const getInvestmentPlan = async (): Promise<InvestmentPlan | null> => {
  const { data, error } = await supabase
    .from('investment_plan')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data || data.salary_set_aside_percent == null || data.dca_rounds == null) return null;
  return {
    setAsidePercent: data.salary_set_aside_percent,
    dcaRounds: data.dca_rounds,
    expectedIncome: data.expected_income ?? undefined,
    dryPowder: data.dry_powder ?? undefined,
    dryPowderAsOf: data.dry_powder_as_of ?? undefined,
    dryPowderItems: Array.isArray(data.dry_powder_items) ? data.dry_powder_items : undefined,
  };
};

// คอลัมน์กลุ่ม dry_powder* เพิ่มทีหลัง (sql/investment_plan_dry_powder.sql)
// ยังไม่ได้รัน SQL → ตัดทิ้งเฉพาะคอลัมน์ที่ error ฟ้องชื่อมา แล้วลองใหม่
// (ตัดทีละตัว ไม่ทิ้งทั้งชุด เพื่อไม่ให้คนที่รัน SQL แค่บางส่วนเสียของที่มีจริง)
const OPTIONAL_COLUMNS = ['dry_powder_items', 'dry_powder_as_of', 'dry_powder'] as const;

export const saveInvestmentPlan = async (plan: InvestmentPlan): Promise<void> => {
  const userId = await getUserId();
  let payload: Record<string, any> = {
    user_id: userId,
    salary_set_aside_percent: plan.setAsidePercent,
    dca_rounds: plan.dcaRounds,
    expected_income: plan.expectedIncome ?? null,
    dry_powder: plan.dryPowder ?? null,
    dry_powder_as_of: plan.dryPowderAsOf ?? null,
    dry_powder_items: plan.dryPowderItems ?? null,
  };

  for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt++) {
    const { error } = await supabase.from('investment_plan').upsert(payload);
    if (!error) return;
    const missing = OPTIONAL_COLUMNS.find(
      (c) => c in payload && new RegExp(c, 'i').test(error.message || '')
    );
    if (!missing) throw error;
    const next = { ...payload };
    delete next[missing];
    payload = next;
  }
  throw new Error('บันทึกแผนไม่สำเร็จ');
};

export const deleteInvestmentPlan = async (): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('investment_plan').delete().eq('user_id', userId);
  if (error) throw error;
};
