import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, MonthlySummary } from '../types';
import {
  getMonthlySummaries,
  getMonthlySummariesByYear,
  deleteMonthlySummary,
} from '../services/monthlySummaryStorage';
import { getPortfolioSummary } from '../services/investmentStorage';
import { formatCurrency, COLORS } from '../utils/constants';
import { useResponsive } from '../utils/responsive';

type RecurringBillsScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'RecurringBills'
>;

const INFLATION_RATE = 2.5; // อัตราเงินเฟ้อเฉลี่ย 2.5% ต่อปี

export default function RecurringBillsScreen() {
  const navigation = useNavigation<RecurringBillsScreenNavigationProp>();
  const [summaries, setSummaries] = useState<MonthlySummary[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [portfolioProfit, setPortfolioProfit] = useState(0);
  const { isDesktop } = useResponsive();

  const loadData = async () => {
    const yearSummaries = await getMonthlySummariesByYear(selectedYear);
    setSummaries(yearSummaries);

    const portfolio = await getPortfolioSummary();
    setPortfolioValue(portfolio.totalValue);
    setPortfolioProfit(portfolio.totalProfit);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [selectedYear])
  );

  const handleDelete = async (month: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?');
      if (confirmed) {
        await deleteMonthlySummary(month);
        loadData();
      }
    } else {
      Alert.alert('ลบรายการ', 'คุณต้องการลบรายการนี้ใช่หรือไม่?', [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: async () => {
            await deleteMonthlySummary(month);
            loadData();
          },
        },
      ]);
    }
  };

  const handleEdit = (summary: MonthlySummary) => {
    navigation.navigate('AddMonthlySummary', { summary });
  };

  // คำนวณข้อมูลสรุป
  const getTotalExpenseYTD = () => {
    return summaries.reduce((sum, s) => sum + s.totalExpense, 0);
  };

  const getAverageExpense = () => {
    if (summaries.length === 0) return 0;
    return getTotalExpenseYTD() / summaries.length;
  };

  const getMoMChange = (currentMonth: MonthlySummary) => {
    const currentIndex = summaries.findIndex((s) => s.month === currentMonth.month);
    if (currentIndex <= 0) return null;

    const prevMonth = summaries[currentIndex - 1];
    const change = currentMonth.totalExpense - prevMonth.totalExpense;
    const changePercent = (change / prevMonth.totalExpense) * 100;

    return { change, changePercent };
  };

  // คำนวณว่ากำไรลงทุนครอบคลุมค่าใช้จ่ายไหม
  const getProfitCoveragePercent = () => {
    const totalExpense = getTotalExpenseYTD();
    if (totalExpense === 0) return 0;
    return (portfolioProfit / totalExpense) * 100;
  };

  // คำนวณว่าต้องทำกำไรกี่% ถึงจะครอบคลุมค่าใช้จ่าย + เงินเฟ้อ
  const getRequiredReturnPercent = () => {
    const totalExpense = getTotalExpenseYTD();
    if (portfolioValue === 0) return 0;

    // ผลตอบแทนที่ต้องการ = (ค่าใช้จ่าย + เงินเฟ้อ) / มูลค่าพอร์ต
    const inflationAmount = portfolioValue * (INFLATION_RATE / 100);
    const requiredProfit = totalExpense + inflationAmount;

    return (requiredProfit / portfolioValue) * 100;
  };

  const getMonthDisplay = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
  };

  const sortedSummaries = [...summaries].sort((a, b) => b.month.localeCompare(a.month));

  // สร้าง marked dates สำหรับปฏิทิน - ทำทั้งเดือน
  const markedDates: any = {};
  summaries.forEach((summary) => {
    const [year, month] = summary.month.split('-').map(Number);
    // ทำทุกวันในเดือน
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      markedDates[dateKey] = {
        customStyles: {
          container: {
            backgroundColor: day === 1 ? COLORS.primary : `${COLORS.primary}20`,
          },
          text: {
            color: day === 1 ? '#ffffff' : COLORS.text,
            fontWeight: day === 1 ? 'bold' : 'normal',
          },
        },
        month: summary.month,
        amount: summary.totalExpense,
      };
    }
  });

  // สร้าง Month Grid
  const renderMonthGrid = () => {
    const months = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];

    return (
      <View style={styles.monthGrid}>
        {months.map((monthName, index) => {
          const monthNumber = index + 1;
          const monthKey = `${selectedYear}-${String(monthNumber).padStart(2, '0')}`;
          const summary = summaries.find(s => s.month === monthKey);

          return (
            <TouchableOpacity
              key={monthKey}
              style={[
                styles.monthBox,
                summary && styles.monthBoxFilled,
                isDesktop && { width: '15%' as any },
              ]}
              onPress={() => {
                if (summary) {
                  handleEdit(summary);
                } else {
                  navigation.navigate('AddMonthlySummary', {});
                }
              }}
            >
              <Text style={[styles.monthName, summary && styles.monthNameFilled]}>
                {monthName}
              </Text>
              {summary && (
                <Text style={styles.monthBoxAmount} numberOfLines={1}>
                  {formatCurrency(summary.totalExpense)}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={[
        styles.content,
        isDesktop && {
          maxWidth: 900,
          alignSelf: 'center' as const,
          width: '100%' as any,
          paddingHorizontal: 16,
          paddingTop: 20,
        },
      ]}>
        <View style={styles.yearSelectorTop}>
          <TouchableOpacity onPress={() => setSelectedYear(selectedYear - 1)} style={styles.yearButton}>
            <FontAwesome name="chevron-left" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.yearTextTop}>ปี {selectedYear + 543}</Text>
          <TouchableOpacity onPress={() => setSelectedYear(selectedYear + 1)} style={styles.yearButton}>
            <FontAwesome name="chevron-right" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Month Grid View */}
        {renderMonthGrid()}

        {/* Add Button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddMonthlySummary', {})}
        >
          <FontAwesome name="plus-circle" size={18} color="#ffffff" />
          <Text style={styles.addButtonText}> บันทึกรายจ่ายรายเดือน</Text>
        </TouchableOpacity>

        {/* Monthly List */}
        <View style={styles.listContainer}>
          {sortedSummaries.length === 0 ? (
            <Text style={styles.emptyText}>ยังไม่มีข้อมูลรายจ่ายรายเดือน</Text>
          ) : (
            sortedSummaries.map((summary) => {
              const momChange = getMoMChange(summary);

              return (
                <View key={summary.month} style={styles.monthItem}>
                  <TouchableOpacity
                    style={styles.monthContent}
                    onPress={() => handleEdit(summary)}
                  >
                    <View style={styles.monthLeft}>
                      <Text style={styles.monthItemName}>{getMonthDisplay(summary.month)}</Text>
                      {summary.notes && (
                        <Text style={styles.monthNotes} numberOfLines={1}>
                          {summary.notes}
                        </Text>
                      )}
                      {momChange && (
                        <View style={styles.changeContainer}>
                          <Ionicons
                            name={momChange.change >= 0 ? 'arrow-up' : 'arrow-down'}
                            size={14}
                            color={momChange.change >= 0 ? '#ef4444' : '#10b981'}
                          />
                          <Text style={[
                            styles.changeText,
                            { color: momChange.change >= 0 ? '#ef4444' : '#10b981' }
                          ]}>
                            {momChange.change >= 0 ? '+' : ''}{formatCurrency(momChange.change)}
                            {' '}({momChange.changePercent >= 0 ? '+' : ''}{momChange.changePercent.toFixed(2)}%)
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.monthRight}>
                      <Text style={styles.monthAmount}>{formatCurrency(summary.totalExpense)}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(summary.month)}
                  >
                    <FontAwesome name="trash" size={14} color="#d32f2f" />
                    <Text style={styles.deleteButtonText}> ลบ</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    paddingTop: 60,
  },
  yearSelectorTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 24,
  },
  yearButton: {
    padding: 8,
  },
  yearTextTop: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    minWidth: 140,
    textAlign: 'center',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  monthBox: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    elevation: 2,
  },
  monthBoxFilled: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  monthName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  monthNameFilled: {
    color: '#ffffff',
  },
  monthBoxAmount: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'center',
  },
  calendarContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    overflow: 'hidden',
    marginBottom: 16,
    elevation: 2,
  },
  dayContainer: {
    width: 40,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
  },
  markedDay: {
    backgroundColor: COLORS.primary,
  },
  dayText: {
    fontSize: 14,
    color: COLORS.text,
  },
  dayTextDisabled: {
    color: COLORS.textSecondary,
  },
  markedDayText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  dayAmount: {
    fontSize: 9,
    color: '#ffffff',
    marginTop: 2,
  },
  summaryContainer: {
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  summarySubtext: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 0,
    padding: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContainer: {},
  monthItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  monthContent: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthLeft: {
    flex: 1,
  },
  monthItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  monthNotes: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  monthRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 16,
  },
  monthAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  deleteButton: {
    padding: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffebee',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#d32f2f',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 16,
    marginTop: 32,
  },
  infoBox: {
    marginTop: 16,
    backgroundColor: '#e3f2fd',
    borderRadius: 0,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
});
