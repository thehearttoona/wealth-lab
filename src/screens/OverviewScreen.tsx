import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { getExpenses, getRecurringBills } from '../services/storage';
import { getInvestments, getPortfolioSummary } from '../services/investmentStorage';
import { getTradingOrders, getOrderStatistics } from '../services/tradingStorage';
import { formatCurrency, COLORS, getCurrentMonthYear } from '../utils/constants';
import { useResponsive } from '../utils/responsive';

type OverviewScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Overview'
>;

export default function OverviewScreen() {
  const navigation = useNavigation<OverviewScreenNavigationProp>();
  const { isDesktop } = useResponsive();
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [monthlyBills, setMonthlyBills] = useState(0);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [portfolioProfit, setPortfolioProfit] = useState(0);
  const [tradingPnL, setTradingPnL] = useState(0);
  const [openOrders, setOpenOrders] = useState(0);

  const loadData = async () => {
    // รายจ่ายรายวัน (เดือนนี้)
    const expenses = await getExpenses();
    const now = new Date();
    const monthExpenses = expenses.filter((e) => {
      const expDate = new Date(e.date);
      return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear();
    });
    setTotalExpenses(monthExpenses.reduce((sum, e) => sum + e.amount, 0));

    // รายจ่ายประจำเดือน
    const bills = await getRecurringBills();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setMonthlyBills(bills.reduce((sum, b) => sum + (b.monthlyAmounts?.[currentMonthKey] ?? 0), 0));

    // พอร์ตการลงทุน
    const portfolio = await getPortfolioSummary();
    setPortfolioValue(portfolio.totalValue);
    setPortfolioProfit(portfolio.totalProfit);

    // Trading
    const tradingStats = await getOrderStatistics();
    setTradingPnL(tradingStats.totalPnL);
    setOpenOrders(tradingStats.openOrders);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const totalIncome = portfolioValue + portfolioProfit + tradingPnL;
  const totalOutcome = totalExpenses + monthlyBills;
  const netWorth = totalIncome - totalOutcome;

  return (
    <ScrollView style={styles.container}>
      <View style={isDesktop ? styles.desktopInnerWrapper : undefined}>
        <View style={[styles.header, isDesktop && { paddingTop: 0 }]}>
          <View style={styles.headerTop}>
            <Ionicons name="analytics" size={32} color="#ffffff" />
            <Text style={styles.headerTitle}>ภาพรวมการเงิน</Text>
          </View>
          <Text style={styles.headerSubtitle}>{getCurrentMonthYear()}</Text>
        </View>

        {/* สรุปรวม */}
        <View style={[styles.summaryCard, isDesktop && { borderRadius: 0}]}>
          <Text style={styles.summaryLabel}>มูลค่าสุทธิ</Text>
          <Text style={[
            styles.summaryValue,
            netWorth >= 0 ? styles.positive : styles.negative
          ]}>
            {formatCurrency(netWorth)}
          </Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Ionicons name="trending-up" size={16} color={COLORS.success} />
              <Text style={styles.summaryItemLabel}>รายรับ</Text>
              <Text style={styles.summaryItemValue}>{formatCurrency(totalIncome)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Ionicons name="trending-down" size={16} color={COLORS.error} />
              <Text style={styles.summaryItemLabel}>รายจ่าย</Text>
              <Text style={styles.summaryItemValue}>{formatCurrency(totalOutcome)}</Text>
            </View>
          </View>
        </View>

        {/* รายจ่าย & การลงทุน & Trading - Desktop: single row of 4 cards */}
        {isDesktop ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="card-outline" size={20} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>สรุปทั้งหมด</Text>
            </View>
            <View style={[styles.row, { gap: 24 }]}>
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('ExpenseTracking')}
              >
                <View style={styles.cardIcon}>
                  <Ionicons name="calendar-outline" size={24} color={COLORS.primary} />
                </View>
                <Text style={styles.cardLabel}>รายจ่ายรายวัน</Text>
                <Text style={styles.cardValue}>{formatCurrency(totalExpenses)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('ExpenseTracking')}
              >
                <View style={styles.cardIcon}>
                  <Ionicons name="repeat" size={24} color={COLORS.primary} />
                </View>
                <Text style={styles.cardLabel}>รายจ่ายรายเดือน</Text>
                <Text style={styles.cardValue}>{formatCurrency(monthlyBills)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('Portfolio')}
              >
                <View style={styles.cardIcon}>
                  <Ionicons name="briefcase-outline" size={24} color={COLORS.primary} />
                </View>
                <Text style={styles.cardLabel}>การลงทุน</Text>
                <Text style={styles.cardValue}>{formatCurrency(portfolioValue)}</Text>
                <Text style={[
                  styles.cardSubValue,
                  portfolioProfit >= 0 ? styles.positive : styles.negative
                ]}>
                  {portfolioProfit >= 0 ? '+' : ''}{formatCurrency(portfolioProfit)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('TradingOrders')}
              >
                <View style={styles.cardIcon}>
                  <Ionicons name="trending-up" size={24} color={COLORS.primary} />
                </View>
                <Text style={styles.cardLabel}>Trading</Text>
                <Text style={styles.cardValue}>{openOrders} ออเดอร์</Text>
                <Text style={[
                  styles.cardSubValue,
                  tradingPnL >= 0 ? styles.positive : styles.negative
                ]}>
                  {tradingPnL >= 0 ? '+' : ''}{formatCurrency(tradingPnL)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* รายจ่าย */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="card-outline" size={20} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>รายจ่าย</Text>
              </View>
              <View style={styles.row}>
                <TouchableOpacity
                  style={styles.card}
                  onPress={() => navigation.navigate('ExpenseTracking')}
                >
                  <View style={styles.cardIcon}>
                    <Ionicons name="calendar-outline" size={24} color={COLORS.primary} />
                  </View>
                  <Text style={styles.cardLabel}>รายวัน</Text>
                  <Text style={styles.cardValue}>{formatCurrency(totalExpenses)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.card}
                  onPress={() => navigation.navigate('ExpenseTracking')}
                >
                  <View style={styles.cardIcon}>
                    <Ionicons name="repeat" size={24} color={COLORS.primary} />
                  </View>
                  <Text style={styles.cardLabel}>รายเดือน</Text>
                  <Text style={styles.cardValue}>{formatCurrency(monthlyBills)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* การลงทุน */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="briefcase-outline" size={20} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>การลงทุน</Text>
              </View>
              <TouchableOpacity
                style={styles.investmentCard}
                onPress={() => navigation.navigate('Portfolio')}
              >
                <View style={styles.investmentHeader}>
                  <Text style={styles.investmentLabel}>พอร์ตการลงทุน</Text>
                  <Text style={styles.investmentValue}>{formatCurrency(portfolioValue)}</Text>
                </View>
                <View style={styles.investmentProfit}>
                  <Text style={styles.investmentProfitLabel}>กำไร/ขาดทุน</Text>
                  <Text style={[
                    styles.investmentProfitValue,
                    portfolioProfit >= 0 ? styles.positive : styles.negative
                  ]}>
                    {portfolioProfit >= 0 ? '+' : ''}{formatCurrency(portfolioProfit)}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Trading */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="trending-up" size={20} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Trading</Text>
              </View>
              <TouchableOpacity
                style={styles.investmentCard}
                onPress={() => navigation.navigate('TradingOrders')}
              >
                <View style={styles.investmentHeader}>
                  <Text style={styles.investmentLabel}>ออเดอร์เปิดอยู่</Text>
                  <Text style={styles.investmentCount}>{openOrders} ออเดอร์</Text>
                </View>
                <View style={styles.investmentProfit}>
                  <Text style={styles.investmentProfitLabel}>P&L รวม</Text>
                  <Text style={[
                    styles.investmentProfitValue,
                    tradingPnL >= 0 ? styles.positive : styles.negative
                  ]}>
                    {tradingPnL >= 0 ? '+' : ''}{formatCurrency(tradingPnL)}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  desktopInnerWrapper: {
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 16,
  },
  header: {
    backgroundColor: COLORS.primary,
    padding: 20,
    paddingTop: 60,
    paddingBottom: 30,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    fontFamily: 'NotoSansThai_600SemiBold',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_300Light',
    color: 'rgba(255, 255, 255, 0.8)',
    marginLeft: 44,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    margin: 16,
    padding: 24,
    borderRadius: 0,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 36,
    fontWeight: 'bold',
    fontFamily: 'NotoSansThai_600SemiBold',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 16,
  },
  summaryItem: {
    flex: 1,
    flexDirection: 'column',
    gap: 4,
  },
  summaryItemLabel: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  summaryItemValue: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 0,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardIcon: {
    marginBottom: 8,
  },
  cardLabel: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  cardSubValue: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'NotoSansThai_600SemiBold',
    marginTop: 4,
  },
  investmentCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 0,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  investmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  investmentLabel: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  investmentValue: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  investmentCount: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  investmentProfit: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  investmentProfitLabel: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  investmentProfitValue: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'NotoSansThai_600SemiBold',
  },
  positive: {
    color: COLORS.success,
  },
  negative: {
    color: COLORS.error,
  },
});
