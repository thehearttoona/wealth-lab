import { supabase, getUserId } from './supabase';
import {
  TaxProfile,
  TaxMonth,
  DeductionMap,
  TaxYearFacts,
  TaxYearFactKey,
  TAX_YEAR_FACT_FIELDS,
  emptyTaxMonths,
  sumTaxMonths,
} from '../types/tax';
import { logActivity } from './activityLogStorage';

// ข้อมูลภาษี 1 แถวต่อ 1 ปีภาษี (unique user_id + year) — ไม่ใช่ singleton แบบ investment_plan
// เพราะต้องย้อนดูปีเก่าได้ และทั้งเงินเดือน/กฎกำไรขายเปลี่ยนได้ทุกปี
// ต้องรัน sql/tax_profiles.sql ที่ Supabase ก่อน 1 ครั้ง
//
// เงินเดือน/โบนัส/หัก ณ ที่จ่าย/ประกันสังคม เก็บใน column jsonb `months` (12 แถว)
// คอลัมน์รายปีเดิม (monthly_salary/salary_months/bonus/social_security/withheld) ยังเขียนค่ารวมลงไปด้วย
// เพื่อให้แถวใน Supabase console อ่านรู้เรื่อง และเป็นทางถอยถ้า jsonb หายไป — แต่ "แหล่งความจริง" คือ months

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** บังคับให้ได้ 12 แถวเรียงตามเดือนเสมอ ไม่ว่า jsonb จะเก็บมาไม่ครบ/สลับลำดับ */
const normalizeMonths = (raw: any): TaxMonth[] => {
  const base = emptyTaxMonths();
  if (!Array.isArray(raw)) return base;
  raw.forEach((r) => {
    const idx = num(r?.month) - 1;
    if (idx < 0 || idx > 11) return;
    base[idx] = {
      month: idx + 1,
      salary: num(r?.salary),
      bonus: num(r?.bonus),
      withheld: num(r?.withheld),
      socialSecurity: num(r?.socialSecurity ?? r?.social_security),
    };
  });
  return base;
};

/**
 * แถวเก่าที่บันทึกไว้ตอนยังเก็บเป็นรายปี — กระจายลงรายเดือนแบบรักษายอดรวม
 * (ภาษีคิดจากยอดรวม ดังนั้นการกระจายแบบนี้ให้ภาษีเท่าเดิมเป๊ะ แค่เดือนที่ลงอาจไม่ตรงสลิปจริง)
 * ทำครั้งเดียวตอนอ่าน ผู้ใช้กดบันทึกทับก็จะกลายเป็น months ถาวร
 */
const monthsFromLegacyRow = (row: any): TaxMonth[] => {
  const months = emptyTaxMonths();
  const perMonth = num(row.monthly_salary);
  const count = Math.min(12, Math.max(0, Math.round(num(row.salary_months))));
  if (perMonth <= 0 && count <= 0) return months;

  const spread = Math.max(1, count);
  for (let i = 0; i < spread; i++) months[i].salary = perMonth;

  // ยอดรวมรายปีที่ไม่รู้ว่าเกิดเดือนไหน → หารเท่ากันแล้วโยนเศษไปเดือนสุดท้ายที่ทำงาน
  const spreadEvenly = (total: number, key: 'withheld' | 'socialSecurity') => {
    if (total <= 0) return;
    const each = Math.floor((total / spread) * 100) / 100;
    for (let i = 0; i < spread; i++) months[i][key] = each;
    months[spread - 1][key] = Math.round((total - each * (spread - 1)) * 100) / 100;
  };
  spreadEvenly(num(row.withheld), 'withheld');
  spreadEvenly(num(row.social_security), 'socialSecurity');

  // โบนัสไม่รู้เดือน — ลงเดือนสุดท้ายที่มีเงินเดือน (ไทยส่วนใหญ่จ่ายปลายปี)
  months[spread - 1].bonus = num(row.bonus);
  return months;
};

/**
 * ลดหย่อนแยกรายการ — แถวเก่าที่มีแต่ extra_deductions ก้อนเดียว ให้ย้ายไปคีย์ 'other'
 * จะได้ไม่หายไปเงียบ ๆ ตอนหน้าจอเปลี่ยนมาอ่าน deductions แล้วผู้ใช้เห็นภาษีเด้งขึ้นโดยไม่รู้สาเหตุ
 */
const normalizeDeductions = (raw: any, legacyTotal: number): DeductionMap | undefined => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out: DeductionMap = {};
    Object.entries(raw).forEach(([k, v]) => {
      const n = num(v);
      if (n > 0) out[k] = n;
    });
    if (Object.keys(out).length > 0) return out;
  }
  return legacyTotal > 0 ? { other: legacyTotal } : undefined;
};

/**
 * ข้อเท็จจริงรายปี — เก็บเฉพาะคีย์ที่รู้จักและเป็น boolean จริง
 * ค่าที่ไม่ได้ตอบต้องไม่โผล่เป็นคีย์เลย เพราะ `undefined` (ยังไม่ตอบ) กับ `false` (ตอบว่าไม่)
 * ให้คำแนะนำสิทธิ์คนละแบบ — ถ้าปล่อยให้ null กลายเป็น false คนที่ยังไม่ตอบจะเห็นว่า "ใช้ไม่ได้"
 */
const normalizeYearFacts = (raw: any): TaxYearFacts | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: TaxYearFacts = {};
  TAX_YEAR_FACT_FIELDS.forEach(({ key }) => {
    const v = (raw as Record<TaxYearFactKey, unknown>)[key];
    if (typeof v === 'boolean') out[key] = v;
  });
  return Object.keys(out).length > 0 ? out : undefined;
};

const mapFromDb = (row: any): TaxProfile => {
  const legacyExtra = num(row.extra_deductions);
  return {
    year: row.year,
    months: Array.isArray(row.months) && row.months.length > 0
      ? normalizeMonths(row.months)
      : monthsFromLegacyRow(row),
    otherIncome: num(row.other_income),
    deductions: normalizeDeductions(row.deductions, legacyExtra),
    extraDeductions: legacyExtra,
    yearFacts: normalizeYearFacts(row.year_facts),
    gainRules: row.gain_rules && typeof row.gain_rules === 'object' ? row.gain_rules : undefined,
    remittedRatio: row.remitted_ratio ?? undefined,
  };
};

const mapToDb = (p: TaxProfile, userId: string) => {
  const t = sumTaxMonths(p.months);
  return {
    user_id: userId,
    year: p.year,
    months: p.months,
    // ค่ารวมที่ derive จาก months — เขียนไว้ให้แถวอ่านรู้เรื่อง ห้ามใช้เป็นแหล่งคำนวณ
    monthly_salary: t.filledMonths > 0 ? Math.round(t.salary / Math.max(1, t.filledMonths)) : 0,
    salary_months: t.filledMonths,
    bonus: t.bonus,
    social_security: t.socialSecurity,
    withheld: t.withheld,
    other_income: p.otherIncome,
    deductions: p.deductions ?? null,
    // ยอดรวมที่กรอก (ก่อนตัดเพดาน) — derive จาก deductions ไว้ให้แถวอ่านรู้เรื่องและเป็นทางถอย
    extra_deductions: p.deductions
      ? Object.values(p.deductions).reduce((s, v) => s + num(v), 0)
      : p.extraDeductions,
    year_facts: p.yearFacts ?? null,
    gain_rules: p.gainRules ?? null,
    remitted_ratio: p.remittedRatio ?? null,
  };
};

/** ยังไม่ได้รัน SQL — บอกให้หน้าจอโชว์คำแนะนำแทนที่จะเด้ง error ดิบ */
export const isTaxTableMissing = (error: any): boolean =>
  /tax_profiles/i.test(error?.message || '') &&
  /(does not exist|schema cache|relation)/i.test(error?.message || '');

export const getTaxProfile = async (year: number): Promise<TaxProfile | null> => {
  const { data, error } = await supabase
    .from('tax_profiles')
    .select('*')
    .eq('year', year)
    .maybeSingle();
  if (error) throw error;
  return data ? mapFromDb(data) : null;
};

/** ปีภาษีที่มีข้อมูลอยู่แล้ว (ใหม่→เก่า) ใช้ทำตัวเลือกปีในหน้าภาษี */
export const getTaxYears = async (): Promise<number[]> => {
  const { data, error } = await supabase
    .from('tax_profiles')
    .select('year')
    .order('year', { ascending: false });
  if (error) throw error;
  return (data || []).map((r: any) => r.year);
};

export const saveTaxProfile = async (profile: TaxProfile): Promise<void> => {
  const userId = await getUserId();
  const row: Record<string, any> = mapToDb(profile, userId);
  let { error } = await supabase
    .from('tax_profiles')
    .upsert(row, { onConflict: 'user_id,year' });
  // ยังไม่ได้รัน sql/tax_year_facts.sql → คอลัมน์ไม่มี แล้ว "ทั้งแถว" บันทึกไม่ผ่าน
  // เงินเดือนทั้งปีต้องไม่หายไปเพราะคำถามใช่/ไม่ใช่ 5 ข้อ จึงตัดคอลัมน์ที่ไม่มีออกแล้วลองซ้ำ
  // (แพตเทิร์นเดียวกับ investmentStorage/realizedStorage — ดู §4 ใน CLAUDE.md)
  if (error && /year_facts/i.test(error.message || '')) {
    delete row.year_facts;
    ({ error } = await supabase.from('tax_profiles').upsert(row, { onConflict: 'user_id,year' }));
  }
  if (error) throw error;
  // upsert ทับทั้งปี — ไม่ log ก็ไม่รู้ว่ากรอกเงินเดือน/หัก ณ ที่จ่ายไว้เท่าไหร่ก่อนแก้
  await logActivity({
    entity: 'tax_profile',
    action: 'update',
    entityId: String(profile.year),
    summary: `บันทึกข้อมูลภาษีปี ${profile.year}`,
    payload: profile,
  });
};

export const deleteTaxProfile = async (year: number): Promise<void> => {
  let before: TaxProfile | null = null;
  try {
    before = await getTaxProfile(year);
  } catch {
    // อ่านไม่ได้ก็ลบต่อ
  }
  const { error } = await supabase.from('tax_profiles').delete().eq('year', year);
  if (error) throw error;
  await logActivity({
    entity: 'tax_profile',
    action: 'delete',
    entityId: String(year),
    summary: `ลบข้อมูลภาษีปี ${year}`,
    payload: before ?? { year },
  });
};
