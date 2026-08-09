import { supabase, getUserId } from './supabase';
import { logActivity } from './activityLogStorage';

export type ImportRowType = 'income' | 'expense' | 'transfer' | 'invest';

export interface ImportRow {
  id: string;
  date: string;          // YYYY-MM-DD
  amount: number;
  type: ImportRowType;
  category: string;
  description: string;
  currency: string;      // สกุลของบัญชีที่ import เข้า
  direction: 'in' | 'out'; // เงินเข้า/ออกจากบัญชีนี้ (ใช้กับรายการโอน/ลงทุน)
}

const dedupKey = (date: string, amount: number, description: string) =>
  `${date}|${amount.toFixed(2)}|${(description || '').slice(0, 24)}`;

// ดึง key ของรายการที่มีอยู่แล้วในบัญชีนี้ (กัน import ซ้ำ)
export const getExistingKeys = async (accountId: string): Promise<Set<string>> => {
  const [ex, inc, tr] = await Promise.all([
    supabase.from('expenses').select('date,amount,description').eq('account_id', accountId),
    supabase.from('incomes').select('date,amount,description').eq('account_id', accountId),
    supabase.from('account_transfers').select('date,amount,description').eq('account_id', accountId),
  ]);
  const set = new Set<string>();
  [...(ex.data || []), ...(inc.data || []), ...(tr.data || [])].forEach((r: any) =>
    set.add(dedupKey(r.date, Number(r.amount), r.description || ''))
  );
  return set;
};

export interface SaveResult {
  saved: number;
  skipped: number;
}

// บันทึกรายการที่เลือกไว้ แยกลงตารางตามประเภท + ข้ามรายการซ้ำ
export const saveImportRows = async (rows: ImportRow[], accountId: string): Promise<SaveResult> => {
  const userId = await getUserId();
  const existing = await getExistingKeys(accountId);

  const fresh: ImportRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of rows) {
    const key = dedupKey(r.date, r.amount, r.description);
    if (existing.has(key) || seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    fresh.push(r);
  }

  const incomes = fresh
    .filter((r) => r.type === 'income')
    .map((r) => ({
      id: r.id,
      amount: r.amount,
      category: r.category,
      description: r.description,
      date: r.date,
      account_id: accountId,
      user_id: userId,
    }));

  const expenses = fresh
    .filter((r) => r.type === 'expense')
    .map((r) => ({
      id: r.id,
      amount: r.amount,
      category: r.category,
      description: r.description,
      date: r.date,
      type: 'daily',
      account_id: accountId,
      user_id: userId,
    }));

  const transfers = fresh
    .filter((r) => r.type === 'transfer' || r.type === 'invest')
    .map((r) => ({
      id: r.id,
      account_id: accountId,
      kind: r.type === 'invest' ? 'invest' : 'transfer',
      direction: r.direction,
      amount: r.amount,
      currency: r.currency,
      date: r.date,
      description: r.description,
      user_id: userId,
    }));

  if (incomes.length) {
    const { error } = await supabase.from('incomes').insert(incomes);
    if (error) throw error;
  }
  if (expenses.length) {
    const { error } = await supabase.from('expenses').insert(expenses);
    if (error) throw error;
  }
  if (transfers.length) {
    const { error } = await supabase.from('account_transfers').insert(transfers);
    if (error) throw error;
  }

  // 1 แถวต่อการนำเข้า 1 ครั้ง — ไม่ log ต่อรายการ ไม่งั้นสเตตเมนต์เดือนเดียวท่วมไทม์ไลน์
  await logActivity({
    entity: 'import',
    action: 'create',
    entityId: accountId ?? undefined,
    summary: `นำเข้าสเตตเมนต์ ${fresh.length} รายการ (รายรับ ${incomes.length} · รายจ่าย ${expenses.length} · โอน/ลงทุน ${transfers.length}) ข้ามซ้ำ ${skipped}`,
    payload: { accountId: accountId ?? null, saved: fresh.length, skipped, rows: fresh },
  });

  return { saved: fresh.length, skipped };
};
