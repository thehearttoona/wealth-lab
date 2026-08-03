import { Expense, Income, InstallmentPlan } from '../types';
import { Investment, RealizedTrade } from '../types/investment';
import { convertToTHB, toChristianYear } from './constants';

export type ActivityKind = 'income' | 'expense' | 'buy' | 'sell' | 'installment';

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  /** ISO — ใช้เรียงลำดับ */
  date: string;
  title: string;
  subtitle?: string;
  /** THB — บวก = เงินเข้า, ลบ = เงินออก, null = ไม่ใช่รายการเงิน (แค่บันทึกเหตุการณ์) */
  amountTHB: number | null;
}

export const ACTIVITY_META: Record<ActivityKind, { label: string; icon: string }> = {
  income: { label: 'รายรับ', icon: 'arrow-down-circle-outline' },
  expense: { label: 'รายจ่าย', icon: 'arrow-up-circle-outline' },
  buy: { label: 'ซื้อ', icon: 'cart-outline' },
  sell: { label: 'ขาย', icon: 'pricetag-outline' },
  installment: { label: 'เริ่มผ่อน', icon: 'card-outline' },
};

// วันที่ในระบบมีทั้ง ISO เต็มและ YYYY-MM-DD และบางแหล่งเป็น พ.ศ. — ทำให้เทียบกันได้ก่อน
const toTime = (raw?: string): number => {
  if (!raw) return 0;
  const t = new Date(toChristianYear(raw)).getTime();
  return Number.isNaN(t) ? 0 : t;
};

interface FeedInput {
  expenses: Expense[];
  incomes: Income[];
  investments: Investment[];
  realized: RealizedTrade[];
  plans: InstallmentPlan[];
}

/**
 * รวมทุกอย่างที่ "เกิดขึ้น" มาเรียงตามเวลาล่าสุดก่อน
 * ทุกแหล่งมี timestamp อยู่แล้ว ไม่ต้องเก็บข้อมูลเพิ่ม
 */
export const buildActivityFeed = (
  { expenses, incomes, investments, realized, plans }: FeedInput,
  limit = 40
): ActivityEvent[] => {
  const events: ActivityEvent[] = [];

  incomes.forEach((i) =>
    events.push({
      id: `income-${i.id}`,
      kind: 'income',
      date: i.date,
      title: i.description?.trim() || i.category,
      subtitle: i.description?.trim() ? i.category : undefined,
      amountTHB: i.amount,
    })
  );

  expenses.forEach((e) =>
    events.push({
      id: `expense-${e.id}`,
      kind: 'expense',
      date: e.date,
      title: e.description?.trim() || e.category,
      subtitle: e.description?.trim() ? e.category : undefined,
      amountTHB: -e.amount,
    })
  );

  investments.forEach((inv) =>
    events.push({
      id: `buy-${inv.id}`,
      kind: 'buy',
      date: inv.buyDate,
      title: `${inv.symbol} ${inv.quantity} หน่วย`,
      subtitle: inv.platform || inv.name,
      // เงินออกจากกระเป๋าไปเป็นสินทรัพย์ — ต้นทุนรวมค่าธรรมเนียม
      amountTHB: -(convertToTHB(inv.buyPrice, inv.currency ?? 'THB') * inv.quantity + (inv.fees || 0)),
    })
  );

  realized.forEach((t) => {
    const proceeds = convertToTHB(t.sellPrice, t.currency) * t.quantity - (t.fees || 0);
    const cost = convertToTHB(t.buyPrice, t.currency) * t.quantity;
    const pnl = proceeds - cost;
    events.push({
      id: `sell-${t.id}`,
      kind: 'sell',
      date: t.sellDate,
      title: `${t.symbol} ${t.quantity} หน่วย`,
      subtitle: `${pnl >= 0 ? 'กำไร' : 'ขาดทุน'} ${pnl >= 0 ? '+' : ''}${Math.round(pnl).toLocaleString('th-TH')}`,
      amountTHB: proceeds,
    });
  });

  plans.forEach((p) =>
    events.push({
      id: `plan-${p.id}`,
      kind: 'installment',
      date: p.createdAt,
      title: p.name,
      subtitle: `${p.totalMonths} งวด · งวดละ ${Math.round(p.monthlyAmount).toLocaleString('th-TH')}`,
      // ยังไม่ได้จ่ายทั้งก้อนตอนเริ่มแผน จึงไม่นับเป็นเงินเข้า/ออกของวันนั้น
      amountTHB: null,
    })
  );

  return events.sort((a, b) => toTime(b.date) - toTime(a.date)).slice(0, limit);
};

export interface ActivityDay {
  label: string;
  events: ActivityEvent[];
}

/** จัดกลุ่มเป็น วันนี้ / เมื่อวาน / <วันที่ไทย> โดยคงลำดับเดิมไว้ */
export const groupActivityByDay = (events: ActivityEvent[]): ActivityDay[] => {
  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const now = new Date();
  const todayKey = dayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = dayKey(yesterday);

  const groups: ActivityDay[] = [];
  const index = new Map<string, ActivityDay>();

  events.forEach((e) => {
    const d = new Date(toChristianYear(e.date));
    const key = Number.isNaN(d.getTime()) ? 'ไม่ทราบวันที่' : dayKey(d);

    let label: string;
    if (key === todayKey) label = 'วันนี้';
    else if (key === yesterdayKey) label = 'เมื่อวาน';
    else if (key === 'ไม่ทราบวันที่') label = key;
    else label = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

    let group = index.get(key);
    if (!group) {
      group = { label, events: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.events.push(e);
  });

  return groups;
};

export interface MonthFlow {
  monthKey: string; // YYYY-MM
  label: string;    // ม.ค.
  income: number;
  expense: number;
}

/**
 * ยอดเข้า/ออก ย้อนหลัง N เดือน (รวมเดือนปัจจุบัน) เรียงเก่า → ใหม่
 * ใช้เฉพาะรายรับ/รายจ่ายที่บันทึกเอง ไม่รวมการซื้อขายลงทุน (คนละกระเป๋า)
 */
export const buildMonthlyFlow = (expenses: Expense[], incomes: Income[], months = 6): MonthFlow[] => {
  const TH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const now = new Date();
  const out: MonthFlow[] = [];

  for (let back = months - 1; back >= 0; back--) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ monthKey, label: TH_SHORT[d.getMonth()], income: 0, expense: 0 });
  }

  const bucket = new Map(out.map((m) => [m.monthKey, m]));
  const keyOf = (raw?: string) => (raw ? toChristianYear(raw).slice(0, 7) : '');

  incomes.forEach((i) => {
    const m = bucket.get(keyOf(i.date));
    if (m) m.income += i.amount;
  });
  expenses.forEach((e) => {
    const m = bucket.get(keyOf(e.date));
    if (m) m.expense += e.amount;
  });

  return out;
};

/** จำนวนเดือน (ในช่วงที่ดู) ที่มีข้อมูลจริง — ใช้ตัดสินว่าควรโชว์กราฟไหม */
export const monthsWithData = (flow: MonthFlow[]): number =>
  flow.filter((m) => m.income > 0 || m.expense > 0).length;

export interface CategorySlice {
  category: string;
  amount: number;
}

/** รายจ่ายเดือนที่ระบุ แยกหมวด เรียงมาก→น้อย เอา top N ที่เหลือยุบเป็น "อื่นๆ" */
export const expensesByCategory = (
  expenses: Expense[],
  monthKey: string,
  top = 5
): CategorySlice[] => {
  const sums = new Map<string, number>();
  expenses.forEach((e) => {
    if (!e.date || toChristianYear(e.date).slice(0, 7) !== monthKey) return;
    sums.set(e.category, (sums.get(e.category) || 0) + e.amount);
  });

  const sorted = [...sums.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  if (sorted.length <= top) return sorted;
  const rest = sorted.slice(top).reduce((s, c) => s + c.amount, 0);
  return [...sorted.slice(0, top), { category: 'อื่นๆ', amount: rest }];
};
