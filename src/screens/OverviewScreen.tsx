import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Expense, Income, InstallmentPlan, RecurringBill } from '../types';
import { Investment, RealizedTrade } from '../types/investment';
import { Account } from '../types/account';
import { getExpenses, getRecurringBills } from '../services/storage';
import { getIncomes } from '../services/incomeStorage';
import { getInvestments, getPortfolioSummary } from '../services/investmentStorage';
import { getRealizedTrades } from '../services/realizedStorage';
import { getAccounts } from '../services/accountStorage';
import { getInstallmentPlans } from '../services/installmentStorage';
import { formatCurrency, COLORS, CHART, TEXT, FONTS } from '../utils/constants';
import { getCurrentMonthKey } from '../utils/installments';
import { computeNetWorth, NetWorthBreakdown } from '../utils/netWorth';
import { computeCoverage, CoverageResult, INFLATION_RATE } from '../utils/portfolioCoverage';
import {
  ActivityDay,
  ActivityEvent,
  ACTIVITY_META,
  MonthFlow,
  CategorySlice,
  buildActivityFeed,
  groupActivityByDay,
  buildMonthlyFlow,
  monthsWithData,
  expensesByCategory,
} from '../utils/activityLog';
import MonthlyFlowChart from '../components/charts/MonthlyFlowChart';
import CategoryBars from '../components/charts/CategoryBars';
import { MascotEmpty } from '../components/Mascot';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Overview'>;

// กราฟย้อนหลังจะมีความหมายก็ต่อเมื่อมีข้อมูลจริงหลายเดือน
// น้อยกว่านี้จะได้แท่งว่างเป็นแถบ ซึ่งอ่านแล้วเข้าใจน้อยกว่าไม่มีกราฟ
const MIN_MONTHS_FOR_CHART = 3;

const kindColor = (kind: ActivityEvent['kind']): string => {
  if (kind === 'income') return CHART.income;
  if (kind === 'expense') return CHART.expense;
  if (kind === 'installment') return COLORS.textSecondary;
  return COLORS.accent; // ซื้อ/ขาย
};

export default function OverviewScreen() {
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [worth, setWorth] = useState<NetWorthBreakdown | null>(null);
  const [days, setDays] = useState<ActivityDay[]>([]);
  const [flow, setFlow] = useState<MonthFlow[]>([]);
  const [categories, setCategories] = useState<CategorySlice[]>([]);
  const [coverage, setCoverage] = useState<CoverageResult | null>(null);

  const loadData = async () => {
    // ดึงพร้อมกัน แต่ละอันล้มเองได้โดยไม่ทำให้ทั้งหน้าพัง (บางตารางอาจยังไม่ได้รัน SQL)
    const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
      try {
        return await p;
      } catch {
        return fallback;
      }
    };

    const [expenses, incomes, investments, realized, accounts, plans, bills, summary] =
      await Promise.all([
        safe<Expense[]>(getExpenses(), []),
        safe<Income[]>(getIncomes(), []),
        safe<Investment[]>(getInvestments(), []),
        safe<RealizedTrade[]>(getRealizedTrades(), []),
        safe<Account[]>(getAccounts(), []),
        safe<InstallmentPlan[]>(getInstallmentPlans(), []),
        safe<RecurringBill[]>(getRecurringBills(), []),
        getPortfolioSummary(),
      ]);

    setWorth(computeNetWorth(summary.totalValue, accounts, investments, plans));
    setCoverage(computeCoverage(expenses, bills, summary.totalValue, summary.totalProfit));
    setDays(groupActivityByDay(buildActivityFeed({ expenses, incomes, investments, realized, plans })));
    setFlow(buildMonthlyFlow(expenses, incomes));
    setCategories(expensesByCategory(expenses, getCurrentMonthKey()));
    setLoading(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  if (loading || !worth) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  const showFlowChart = monthsWithData(flow) >= MIN_MONTHS_FOR_CHART;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* เดสก์ท็อปไม่มีเพดานความกว้างแล้ว — เนื้อหาใช้เต็ม pane (ดู utils/responsive.ts) */}
      <View>
        {/* ── ① ตัวเลขเดียวที่หน้านี้มีแล้วที่อื่นไม่มี ── */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>ความมั่งคั่งสุทธิ</Text>
          <Text style={[styles.heroValue, worth.netWorth < 0 && { color: COLORS.error }]}>
            {formatCurrency(worth.netWorth)}
          </Text>

          <View style={styles.breakdown}>
            <BreakdownRow label="พอร์ตลงทุน (ราคาตลาด)" value={worth.portfolioValue} sign="+" />
            <BreakdownRow label="เงินสดที่ยังไม่ได้ลงทุน" value={worth.cash} sign="+" />
            <BreakdownRow label="ยอดผ่อนที่ยังต้องจ่าย" value={worth.debt} sign="−" />
          </View>

          {worth.hasUnfilledAccount && (
            <Text style={styles.note}>
              * บางบัญชียังไม่ได้กรอกยอด เงินสดจึงต่ำกว่าจริง — กรอกได้ที่ "บัญชีของฉัน"
            </Text>
          )}
        </View>

        {/* ── ② พอร์ตเลี้ยงตัวเองได้แค่ไหน (ย้ายมาจากหน้าสรุปรายจ่ายรายเดือนที่ถอดออก) ── */}
        {coverage && (coverage.coveragePercent !== null || coverage.requiredReturnPercent !== null) && (
          <View style={styles.coverageCard}>
            <Text style={styles.coverageTitle}>พอร์ตเลี้ยงตัวเองได้แค่ไหน</Text>
            {coverage.coveragePercent !== null && (
              <Text style={styles.coverageLine}>
                กำไรพอร์ตตอนนี้ครอบคลุมรายจ่ายปีนี้ได้{' '}
                <Text style={styles.coverageStrong}>{Math.round(coverage.coveragePercent)}%</Text>
              </Text>
            )}
            {coverage.requiredReturnPercent !== null && (
              <Text style={styles.coverageLine}>
                ต้องได้ผลตอบแทน{' '}
                <Text style={styles.coverageStrong}>
                  {coverage.requiredReturnPercent.toFixed(1)}% ต่อปี
                </Text>{' '}
                ถึงจะจ่ายไหว + สู้เงินเฟ้อ {INFLATION_RATE}%
              </Text>
            )}
            <Text style={styles.note}>
              * รายจ่ายปีนี้ {formatCurrency(coverage.expenseYTD)} · เทียบกับกำไรลอยตัวทั้งก้อน
              (ไม่ใช่เฉพาะกำไรที่เกิดปีนี้)
            </Text>
          </View>
        )}

        {/* ── ③ ความเคลื่อนไหว — ของที่คุ้มสุด อยู่บนสุดรองจาก hero ── */}
        <Text style={styles.sectionTitle}>ความเคลื่อนไหวล่าสุด</Text>
        {days.length === 0 ? (
          <View style={styles.emptyCard}>
            <MascotEmpty>ยังไม่มีรายการ — เริ่มบันทึกรายรับ/รายจ่ายได้ที่หน้าหลัก</MascotEmpty>
          </View>
        ) : (
          <View style={styles.card}>
            {days.map((day, di) => (
              <View key={day.label} style={di > 0 ? styles.dayBlockGap : undefined}>
                <Text style={styles.dayLabel}>{day.label}</Text>
                {day.events.map((e) => (
                  <View key={e.id} style={styles.event}>
                    <View style={[styles.eventDot, { backgroundColor: `${kindColor(e.kind)}18` }]}>
                      <Ionicons
                        name={ACTIVITY_META[e.kind].icon as any}
                        size={16}
                        color={kindColor(e.kind)}
                      />
                    </View>
                    <View style={styles.eventText}>
                      <Text style={styles.eventTitle} numberOfLines={1}>
                        {e.title}
                      </Text>
                      <Text style={styles.eventSub} numberOfLines={1}>
                        {ACTIVITY_META[e.kind].label}
                        {e.subtitle ? ` · ${e.subtitle}` : ''}
                      </Text>
                    </View>
                    {e.amountTHB !== null && (
                      <Text
                        style={[
                          styles.eventAmount,
                          { color: e.amountTHB >= 0 ? CHART.income : COLORS.text },
                        ]}
                      >
                        {e.amountTHB >= 0 ? '+' : '−'}
                        {formatCurrency(Math.abs(e.amountTHB))}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* ── ③ กราฟ — โผล่เองเมื่อข้อมูลพอ ── */}
        <Text style={styles.sectionTitle}>เข้า / ออก ย้อนหลัง 6 เดือน</Text>
        <View style={styles.card}>
          {showFlowChart ? (
            <MonthlyFlowChart data={flow} />
          ) : (
            <Text style={styles.emptyText}>
              ยังเก็บข้อมูลไม่พอ — มีข้อมูล {monthsWithData(flow)} เดือน กราฟจะขึ้นเองเมื่อครบ{' '}
              {MIN_MONTHS_FOR_CHART} เดือน
            </Text>
          )}
        </View>

        {/* ── ④ รายจ่ายเดือนนี้แยกหมวด ── */}
        <Text style={styles.sectionTitle}>รายจ่ายเดือนนี้ แยกหมวด</Text>
        <View style={[styles.card, styles.lastCard]}>
          {categories.length > 0 ? (
            <CategoryBars data={categories} />
          ) : (
            <Text style={styles.emptyText}>เดือนนี้ยังไม่มีรายจ่ายที่บันทึกไว้</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function BreakdownRow({ label, value, sign }: { label: string; value: number; sign: '+' | '−' }) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>
        {sign} {label}
      </Text>
      <Text style={styles.breakdownValue}>{formatCurrency(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 18,
  },
  heroLabel: { ...TEXT.caption, color: COLORS.textSecondary },
  // ตัวเลขพระเอกใช้ sans ตัวเดียวกับทั้งแอป ไม่ใช้ฟอนต์ประดับ
  heroValue: {
    fontSize: 34,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
    marginTop: 2,
    marginBottom: 14,
  },
  breakdown: {
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    paddingTop: 10,
    gap: 6,
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  breakdownLabel: { ...TEXT.caption, color: COLORS.textSecondary, flexShrink: 1 },
  breakdownValue: { ...TEXT.caption, fontFamily: FONTS.medium, color: COLORS.text },
  note: { ...TEXT.hint, color: COLORS.warning, marginTop: 10 },

  coverageCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    gap: 4,
  },
  coverageTitle: { ...TEXT.title, color: COLORS.text, marginBottom: 4 },
  coverageLine: { ...TEXT.body, color: COLORS.textSecondary, lineHeight: 22 },
  coverageStrong: { fontFamily: FONTS.semibold, color: COLORS.text },

  sectionTitle: {
    ...TEXT.title,
    color: COLORS.text,
    marginTop: 22,
    marginBottom: 8,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
  },
  lastCard: { marginBottom: 8 },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 22,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: { ...TEXT.caption, color: COLORS.textSecondary, textAlign: 'center' },

  dayBlockGap: { marginTop: 16 },
  dayLabel: {
    ...TEXT.hint,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  event: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  eventDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventText: { flex: 1 },
  eventTitle: { ...TEXT.body, color: COLORS.text },
  eventSub: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 1 },
  eventAmount: { ...TEXT.body, fontFamily: FONTS.semibold },
});
