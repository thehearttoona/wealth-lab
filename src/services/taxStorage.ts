import { supabase, getUserId } from './supabase';
import { TaxProfile } from '../types/tax';

// ข้อมูลภาษี 1 แถวต่อ 1 ปีภาษี (unique user_id + year) — ไม่ใช่ singleton แบบ investment_plan
// เพราะต้องย้อนดูปีเก่าได้ และทั้งเงินเดือน/กฎกำไรขายเปลี่ยนได้ทุกปี
// ต้องรัน sql/tax_profiles.sql ที่ Supabase ก่อน 1 ครั้ง

const mapFromDb = (row: any): TaxProfile => ({
  year: row.year,
  monthlySalary: row.monthly_salary ?? 0,
  salaryMonths: row.salary_months ?? 12,
  bonus: row.bonus ?? 0,
  otherIncome: row.other_income ?? 0,
  socialSecurity: row.social_security ?? 0,
  withheld: row.withheld ?? 0,
  extraDeductions: row.extra_deductions ?? 0,
  gainRules: row.gain_rules && typeof row.gain_rules === 'object' ? row.gain_rules : undefined,
  remittedRatio: row.remitted_ratio ?? undefined,
});

const mapToDb = (p: TaxProfile, userId: string) => ({
  user_id: userId,
  year: p.year,
  monthly_salary: p.monthlySalary,
  salary_months: p.salaryMonths,
  bonus: p.bonus,
  other_income: p.otherIncome,
  social_security: p.socialSecurity,
  withheld: p.withheld,
  extra_deductions: p.extraDeductions,
  gain_rules: p.gainRules ?? null,
  remitted_ratio: p.remittedRatio ?? null,
});

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
  const { error } = await supabase
    .from('tax_profiles')
    .upsert(mapToDb(profile, userId), { onConflict: 'user_id,year' });
  if (error) throw error;
};

export const deleteTaxProfile = async (year: number): Promise<void> => {
  const { error } = await supabase.from('tax_profiles').delete().eq('year', year);
  if (error) throw error;
};
