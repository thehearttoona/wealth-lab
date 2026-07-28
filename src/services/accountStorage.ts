import { Account } from '../types/account';
import { supabase } from './supabase';

const getUserId = async (): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
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
};

export const updateAccount = async (account: Account): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase
    .from('accounts')
    .update(mapToDb(account, userId))
    .eq('id', account.id);
  if (error) throw error;
};

export const deleteAccount = async (id: string): Promise<void> => {
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw error;
};
