import { supabase } from './supabase';

// เปลี่ยนชื่อสกุลเงิน/แพลตฟอร์มแล้วต้องไล่แก้ของที่ใช้อยู่ให้ครบ
// เพราะ investments/accounts/realized_trades เก็บเป็น "string ดิบ" ไม่ได้อ้าง id
// ถ้าไม่ไล่แก้ ของเก่าจะค้างชื่อเดิมแล้วกลายเป็นรายการกำพร้าที่ไม่มีในลิสต์

const getUserId = async (): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
};

// ตาราง realized_trades อาจยังไม่ถูกสร้าง (ต้องรัน SQL เอง) — ข้ามไปแทนที่จะพังทั้งการ rename
const ignoreMissingTable = (error: { code?: string; message?: string } | null): void => {
  if (!error) return;
  if (error.code === '42P01' || /does not exist|schema cache/i.test(error.message || '')) return;
  throw error;
};

export const renameCurrencyEverywhere = async (oldCode: string, newCode: string): Promise<number> => {
  const userId = await getUserId();
  let touched = 0;
  const bump = (rows: unknown[] | null) => { touched += rows?.length ?? 0; };

  const inv = await supabase
    .from('investments')
    .update({ currency: newCode })
    .eq('user_id', userId)
    .eq('currency', oldCode)
    .select('id');
  if (inv.error) throw inv.error;
  bump(inv.data);

  const acc = await supabase
    .from('accounts')
    .update({ currency: newCode })
    .eq('user_id', userId)
    .eq('currency', oldCode)
    .select('id');
  if (acc.error) throw acc.error;
  bump(acc.data);

  const realized = await supabase
    .from('realized_trades')
    .update({ currency: newCode })
    .eq('user_id', userId)
    .eq('currency', oldCode)
    .select('id');
  ignoreMissingTable(realized.error);
  bump(realized.data);

  return touched;
};

export const renamePlatformEverywhere = async (oldName: string, newName: string): Promise<number> => {
  const userId = await getUserId();
  let touched = 0;

  const inv = await supabase
    .from('investments')
    .update({ platform: newName })
    .eq('user_id', userId)
    .eq('platform', oldName)
    .select('id');
  if (inv.error) throw inv.error;
  touched += inv.data?.length ?? 0;

  const acc = await supabase
    .from('accounts')
    .update({ platform: newName })
    .eq('user_id', userId)
    .eq('platform', oldName)
    .select('id');
  if (acc.error) throw acc.error;
  touched += acc.data?.length ?? 0;

  return touched;
};
