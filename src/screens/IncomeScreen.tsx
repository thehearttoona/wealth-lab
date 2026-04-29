import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Income } from '../types';
import { getIncomesByMonth } from '../services/incomeStorage';
import { getRecurringBills } from '../services/storage';
import { COLORS, formatCurrency } from '../utils/constants';
import { useResponsive } from '../utils/responsive';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function IncomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { isDesktop } = useResponsive();

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [recurringTotal, setRecurringTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inc, bills] = await Promise.all([
        getIncomesByMonth(monthKey),
        getRecurringBills(),
      ]);
      setIncomes(inc);
      const billsTotal = bills
        .filter(b => b.isActive)
        .reduce((sum, b) => sum + (b.monthlyAmounts?.[monthKey] ?? b.amount), 0);
      setRecurringTotal(billsTotal);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const disposable = totalIncome - recurringTotal;
  const dailyBudget = disposable > 0 ? disposable / daysInMonth : 0;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={isDesktop ? styles.desktopInner : undefined}>

        {/* ── Month Navigator ── */}
        <View style={styles.monthNav}>
          <TouchableOpacity style={styles.monthNavBtn} onPress={prevMonth}>
            <FontAwesome name="chevron-left" size={14} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.monthNavLabel}>{monthLabel}</Text>
          <TouchableOpacity style={styles.monthNavBtn} onPress={nextMonth}>
            <FontAwesome name="chevron-right" size={14} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* ── Summary Cards ── */}
            {totalIncome > 0 && (
              <View style={[styles.cardsRow, isDesktop && styles.cardsRowDesktop]}>
                <View style={[styles.card, styles.cardIncome]}>
                  <Text style={styles.cardLabel}>รายรับรวม</Text>
                  <Text style={[styles.cardAmount, { color: COLORS.success }]}>{formatCurrency(totalIncome)}</Text>
                </View>
                <View style={[styles.card, styles.cardExpense]}>
                  <Text style={styles.cardLabel}>รายจ่ายคงที่</Text>
                  <Text style={[styles.cardAmount, { color: COLORS.error }]}>-{formatCurrency(recurringTotal)}</Text>
                </View>
                <View style={[styles.card, styles.cardBudget]}>
                  <Text style={styles.cardLabel}>งบรายวัน</Text>
                  <Text style={[styles.cardAmount, { color: COLORS.primary }]}>
                    {disposable > 0 ? formatCurrency(dailyBudget) : '–'}
                  </Text>
                  {disposable > 0 && (
                    <Text style={styles.cardSub}>คงเหลือ {formatCurrency(disposable)} ÷ {daysInMonth} วัน</Text>
                  )}
                </View>
              </View>
            )}

            {/* ── Income List ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>รายรับ</Text>
                {totalIncome > 0 && (
                  <Text style={styles.sectionTotal}>{formatCurrency(totalIncome)}</Text>
                )}
              </View>

              {incomes.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>ยังไม่มีรายรับเดือนนี้</Text>
                  <Text style={styles.emptySubText}>เพิ่มรายรับเพื่อคำนวณงบรายวัน</Text>
                </View>
              ) : (
                incomes.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.incomeRow}
                    onPress={() => navigation.navigate('AddIncome', { income: item })}
                  >
                    <View style={styles.incomeLeft}>
                      <Text style={styles.incomeCategory}>{item.category}</Text>
                      {item.description ? (
                        <Text style={styles.incomeDesc} numberOfLines={1}>{item.description}</Text>
                      ) : null}
                    </View>
                    <View style={styles.incomeRight}>
                      <Text style={styles.incomeAmount}>+{formatCurrency(item.amount)}</Text>
                      <Text style={styles.incomeDate}>{formatDate(item.date)}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </>
        )}

        {/* ── FAB ── */}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('AddIncome', { date: monthKey + '-01' })}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  desktopInner: { alignSelf: 'center', width: '100%', maxWidth: 800 },

  // ── Month Nav ──
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  monthNavBtn: { padding: 8 },
  monthNavLabel: {
    fontSize: 16,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
    letterSpacing: 0.5,
  },

  // ── Cards ──
  cardsRow: {
    flexDirection: 'column',
    gap: 1,
    marginTop: 24,
    marginHorizontal: 24,
  },
  cardsRowDesktop: {
    flexDirection: 'row',
    gap: 16,
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardIncome: { borderLeftWidth: 3, borderLeftColor: COLORS.success },
  cardExpense: { borderLeftWidth: 3, borderLeftColor: COLORS.error },
  cardBudget: { borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  cardLabel: {
    fontSize: 10,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  cardAmount: {
    fontSize: 22,
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 0.5,
  },
  cardSub: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  // ── Section ──
  section: { marginTop: 24 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionTotal: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.success,
  },

  // ── Income Row ──
  incomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  incomeLeft: { flex: 1, gap: 4 },
  incomeCategory: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
  },
  incomeDesc: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  incomeRight: { alignItems: 'flex-end', gap: 4 },
  incomeAmount: {
    fontSize: 15,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.success,
  },
  incomeDate: {
    fontSize: 10,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },

  // ── Empty ──
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  emptySubText: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },

  // ── FAB ──
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 52,
    height: 52,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
