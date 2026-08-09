import { Account } from '../types/account';
import { supabase, getUserId } from './supabase';
import { logActivity } from './activityLogStorage';

// อ่านบัญชีไว้ก่อนแก้/ลบ เพื่อให้ log มีค่าเดิม (ยอดที่กรอกเองเปลี่ยนบ่อย ต้องย้อนดูได้)
// best-effort, ห้ามขวางการเขียนจริง
const fetchAccountForLog = async (id: string): Promise<Account | null> => {
  try {
    const { data } = await supabase.from('accounts').select('*').eq('id', id).maybeSingle();
    return data ? mapFromDb(data) : null;
  } catch {
    return null;
  }
};

// mapper: accounts (DB snake_case ↔ TS camelCase)
const mapFromDb = (row: any): Account => ({
  id: row.id,
  name: row.name,
  currency: row.currency,
  role: row.role,
  manualBalance: row.manual_balance ?? undefined,
  platform: row.platform ?? undefined,
  createdAt: row.created_at,
});

const mapToDb = (acc: Account, userId: string) => ({
  id: acc.id,
  name: acc.name,
  currency: acc.currency,
  role: acc.role,
  manual_balance: acc.manualBalance ?? null,
  platform: acc.platform ?? null,
  created_at: acc.createdAt,
  user_id: userId,
});

export const getAccounts = async (): Promise<Account[]> => {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapFromDb);
};

export const saveAccount = async (account: Account): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase.from('accounts').insert(mapToDb(account, userId));
  if (error) throw error;
  await logActivity({
    entity: 'account',
    action: 'create',
    entityId: account.id,
    summary: `เพิ่มบัญชี ${account.name} (${account.role}) ${account.manualBalance ?? 0} ${account.currency}`,
    payload: account,
  });
};

export const updateAccount = async (account: Account): Promise<void> => {
  const userId = await getUserId();
  const before = await fetchAccountForLog(account.id);
  const { error } = await supabase
    .from('accounts')
    .update(mapToDb(account, userId))
    .eq('id', account.id);
  if (error) throw error;
  await logActivity({
    entity: 'account',
    action: 'update',
    entityId: account.id,
    // ยอดคงเหลือที่กรอกเองคือของที่เปลี่ยนบ่อยสุด — เก็บก่อน/หลังไว้ดูการเติมเงินเข้าพอร์ต
    summary:
      `แก้บัญชี ${account.name}` +
      (before && before.manualBalance !== account.manualBalance
        ? `: ยอด ${before.manualBalance ?? 0} → ${account.manualBalance ?? 0}`
        : ''),
    payload: { before, after: account },
  });
};

export const deleteAccount = async (id: string): Promise<void> => {
  const before = await fetchAccountForLog(id);
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw error;
  await logActivity({
    entity: 'account',
    action: 'delete',
    entityId: id,
    summary: before ? `ลบบัญชี ${before.name}` : `ลบบัญชี ${id}`,
    payload: before ?? { id },
  });
};
