import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
  Switch,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Calendar, DateData } from 'react-native-calendars';
import { RootStackParamList, Expense, RecurringBill } from '../types';
import { getExpenses, deleteExpense, getRecurringBills, deleteRecurringBill, updateRecurringBill } from '../services/storage';
import { formatCurrency, formatDate, COLORS, getCurrentMonthYear } from '../utils/constants';
import { useResponsive } from '../utils/responsive';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { isDesktop } = useResponsive();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalToday, setTotalToday] = useState(0);
  const [weekTotal, setWeekTotal] = useState(0);
  const [totalMonth, setTotalMonth] = useState(0);
  const [selectedDate, setSelectedDate] = useState('');
  const [markedDates, setMarkedDates] = useState<any>({});
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
  const [recurringBills, setRecurringBills] = useState<RecurringBill[]>([]);
  const [totalMonthlyBills, setTotalMonthlyBills] = useState(0);

  const calculateMarkedDates = async (dailyExpenses: Expense[]) => {
    const bills = await getRecurringBills();
    const marked: any = {};
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const dailyTotal = dailyExpenses
        .filter((e) => {
          const expenseDate = new Date(e.date);
          return expenseDate.getDate() === day &&
                 expenseDate.getMonth() === currentMonth &&
                 expenseDate.getFullYear() === currentYear;
        })
        .reduce((sum, e) => sum + e.amount, 0);

      const recurringTotal = bills
        .filter((b) => b.isActive && b.dueDay === day)
        .reduce((sum, b) => sum + b.amount, 0);

      const totalAmount = dailyTotal + recurringTotal;

      if (totalAmount > 0) {
        marked[dateStr] = {
          marked: true,
          dotColor: COLORS.primary,
          customStyles: {
            container: {
              backgroundColor: totalAmount > 5000 ? '#2A1015' : totalAmount > 1000 ? '#2A1F0E' : '#0F2A1E',
              borderRadius: 8,
            },
            text: {
              color: COLORS.text,
              fontWeight: 'bold',
            },
          },
          amount: totalAmount,
        };
      }
    }

    const todayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (marked[todayStr]) {
      marked[todayStr].selected = true;
      marked[todayStr].selectedColor = COLORS.primary;
    } else {
      marked[todayStr] = {
        selected: true,
        selectedColor: COLORS.primary,
      };
    }

    setMarkedDates(marked);
  };

  const updateFilteredExpenses = (dateStr: string, allExpenses: Expense[]) => {
    if (!dateStr) {
      setFilteredExpenses(allExpenses.slice(0, 10));
      return;
    }

    const selectedDateObj = new Date(dateStr);
    const filtered = allExpenses.filter((e) => {
      const expenseDate = new Date(e.date);
      return expenseDate.getDate() === selectedDateObj.getDate() &&
             expenseDate.getMonth() === selectedDateObj.getMonth() &&
             expenseDate.getFullYear() === selectedDateObj.getFullYear();
    });
    setFilteredExpenses(filtered);
  };

  const loadExpenses = async () => {
    const allExpenses = await getExpenses();
    const dailyExpenses = allExpenses.filter((e) => e.type === 'daily' );
    const sorted = dailyExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setExpenses(sorted);

    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); 
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const weekTotal = dailyExpenses
      .filter((e) => {
        const expenseDate = new Date(e.date);
        return expenseDate >= startOfWeek && expenseDate <= endOfWeek;
      })
      .reduce((sum, e) => sum + e.amount, 0);
    setWeekTotal(weekTotal);


    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthTotal = dailyExpenses
      .filter((e) => {
        const expenseDate = new Date(e.date);
        return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear;
      })
      .reduce((sum, e) => sum + e.amount, 0);
    setTotalMonth(monthTotal);

    await calculateMarkedDates(dailyExpenses);
    updateFilteredExpenses(selectedDate, sorted);

    const bills = await getRecurringBills();
    setRecurringBills(bills);
    const monthlyTotal = bills
      .filter((b) => b.isActive)
      .reduce((sum, b) => sum + b.amount, 0);
    setTotalMonthlyBills(monthlyTotal);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadExpenses();
    }, [])
  );

  const handleDelete = async (id: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?');
      if (confirmed) {
        await deleteExpense(id);
        loadExpenses();
      }
    } else {
      Alert.alert('ลบรายการ', 'คุณต้องการลบรายการนี้ใช่หรือไม่?', [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: async () => {
            await deleteExpense(id);
            loadExpenses();
          },
        },
      ]);
    }
  };

  const handleEdit = (item: Expense) => {
    navigation.navigate('AddExpense', { type: 'daily', expense: item });
  };

  const handleToggleBill = async (bill: RecurringBill) => {
    const updatedBill = { ...bill, isActive: !bill.isActive };
    await updateRecurringBill(updatedBill);
    loadExpenses();
  };

  const handleDeleteBill = async (id: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?');
      if (confirmed) {
        await deleteRecurringBill(id);
        loadExpenses();
      }
    } else {
      Alert.alert('ลบรายการ', 'คุณต้องการลบรายการนี้ใช่หรือไม่?', [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: async () => {
            await deleteRecurringBill(id);
            loadExpenses();
          },
        },
      ]);
    }
  };

  const handleEditBill = (bill: RecurringBill) => {
    navigation.navigate('AddExpense', { type: 'recurring', bill });
  };

  const onDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
    updateFilteredExpenses(day.dateString, expenses);
  };

  const getDayTotal = (dateString: string) => {
    return markedDates[dateString]?.amount || 0;
  };

  const renderExpenseItem = (item: Expense) => (
    <View style={styles.expenseItem}>
      <TouchableOpacity
        style={styles.expenseContent}
        onPress={() => handleEdit(item)}
      >
        <View style={styles.expenseLeft}>
          <Text style={styles.expenseCategory}>{item.category}</Text>
          <Text style={styles.expenseDescription}>{item.description || '-'}</Text>
          <Text style={styles.expenseDate}>{formatDate(item.date)}</Text>
        </View>
        <Text style={styles.expenseAmount}>{formatCurrency(item.amount)}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDelete(item.id)}
      >
        <FontAwesome name="trash" size={14} color={COLORS.error} />
        <Text style={styles.deleteButtonText}> ลบ</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCalendar = () => (
    <View style={[styles.calendarContainer, isDesktop && styles.calendarContainerDesktop]}>
      <Calendar
        markingType={'custom'}
        markedDates={markedDates}
        onDayPress={onDayPress}
        style={{ backgroundColor: COLORS.surface }}
        theme={{
          backgroundColor: COLORS.surface,
          calendarBackground: COLORS.surface,
          textSectionTitleColor: COLORS.text,
          selectedDayBackgroundColor: COLORS.primary,
          selectedDayTextColor: '#ffffff',
          todayTextColor: COLORS.primary,
          dayTextColor: COLORS.text,
          textDisabledColor: COLORS.textSecondary,
          monthTextColor: COLORS.text,
          arrowColor: COLORS.text,
          textMonthFontWeight: 'bold',
          textDayFontSize: isDesktop ? 15 : 14,
          textMonthFontSize: isDesktop ? 20 : 18,
        }}
        dayComponent={({ date, state, marking }: any) => {
          const amount = marking?.amount || 0;
          const isToday = marking?.selected;
          const isMarked = amount > 0;

          return (
            <TouchableOpacity
              style={[
                styles.dayContainer,
                isDesktop && styles.dayContainerDesktop,
                marking?.customStyles?.container,
                isToday && styles.todayContainer,
              ]}
              onPress={() => onDayPress(date)}
            >
              <Text
                style={[
                  styles.dayText,
                  isDesktop && styles.dayTextDesktop,
                  state === 'disabled' && styles.disabledDay,
                  isToday && styles.todayText,
                ]}
              >
                {date.day}
              </Text>
              {isMarked && (
                <Text style={[styles.dayAmount, isDesktop && styles.dayAmountDesktop]}>
                  {amount >= 1000 ? `${(amount / 1000).toFixed(1)}k` : amount.toFixed(0)}
                </Text>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {selectedDate && (
        <View style={styles.selectedDayInfo}>
          <View style={styles.selectedDayTitleContainer}>
            <FontAwesome name="calendar-check-o" size={14} color={COLORS.text} />
            <Text style={styles.selectedDayTitle}>
              {' '}{new Date(selectedDate).toLocaleDateString('th-TH', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </View>
          <Text style={styles.selectedDayAmount}>
            รวม: {formatCurrency(getDayTotal(selectedDate))}
          </Text>
        </View>
      )}
    </View>
  );

  const renderRecurringBills = () => (
    <View style={[styles.recurringBillsSection, isDesktop && styles.recurringBillsSectionDesktop]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleContainer}>
          <FontAwesome name="credit-card" size={16} color={COLORS.text} />
          <Text style={styles.sectionTitle}> รายจ่ายประจำเดือน</Text>
        </View>
        <Text style={styles.monthlyTotal}>{formatCurrency(totalMonthlyBills)}/เดือน</Text>
      </View>

      {recurringBills.length > 0 ? (
        <View style={styles.billsList}>
          {recurringBills.map((bill) => (
            <View key={bill.id} style={styles.billItem}>
              <TouchableOpacity
                style={styles.billContent}
                onPress={() => handleEditBill(bill)}
              >
                <View style={styles.billLeft}>
                  <Text style={styles.billName}>{bill.name}</Text>
                  <View style={styles.billInfoRow}>
                    <FontAwesome name="calendar" size={10} color={COLORS.textSecondary} />
                    <Text style={styles.billDueDate}> วันที่ {bill.dueDay} ของทุกเดือน</Text>
                  </View>
                </View>
                <View style={styles.billRight}>
                  <Text style={styles.billAmount}>{formatCurrency(bill.amount)}</Text>
                  <Switch
                    value={bill.isActive}
                    onValueChange={() => handleToggleBill(bill)}
                    trackColor={{ false: '#767577', true: COLORS.primary }}
                    thumbColor={'#ffffff'}
                    style={styles.billSwitch}
                  />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.billDeleteButton}
                onPress={() => handleDeleteBill(bill.id)}
              >
                <FontAwesome name="trash" size={12} color={COLORS.textSecondary} />
                <Text style={styles.billDeleteText}> ลบ</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyBillsText}>ยังไม่มีรายจ่ายประจำเดือน</Text>
      )}

      <TouchableOpacity
        style={[styles.button, styles.buttonSecondary]}
        onPress={() => navigation.navigate('AddExpense', { type: 'recurring' })}
      >
        <FontAwesome name="plus-circle" size={16} color={COLORS.primary} />
        <Text style={styles.buttonSecondaryText}> เพิ่มรายจ่ายประจำเดือน</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={isDesktop ? styles.desktopInner : undefined}>
        <View style={styles.summaryContainer}>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={() => navigation.navigate('AddExpense', { type: 'daily' })}
          >
            <FontAwesome name="plus-circle" size={16} color={COLORS.primary} />
            <Text style={styles.buttonSecondaryText}> เพิ่มรายรับเดือนนี้</Text>
          </TouchableOpacity>
        </View>

        {/* Summary Cards */}
        <View style={styles.summaryContainer}>
          <View style={[styles.summaryCard, isDesktop && styles.summaryCardDesktop]}>
            <View style={styles.summaryLabelContainer}>
              <Text style={styles.summaryLabel}>This Week</Text>
            </View>
            <Text style={[styles.summaryAmount, isDesktop && styles.summaryAmountDesktop]}>{formatCurrency(weekTotal)}</Text>
          </View>
          <View style={[styles.summaryCard, isDesktop && styles.summaryCardDesktop]}>
            <View style={styles.summaryLabelContainer}>
              <Text style={styles.summaryLabel}>This Month</Text>
            </View>
            <Text style={[styles.summaryAmount, isDesktop && styles.summaryAmountDesktop]}>{formatCurrency(totalMonth)}</Text>
          </View>
        </View>

        {/* Desktop: Two column layout */}
        {isDesktop ? (
          <View style={styles.desktopTwoColumn}>
            <View style={styles.desktopColumnLeft}>
              {renderCalendar()}
            </View>
            <View style={styles.desktopColumnRight}>
              {renderRecurringBills()}
            </View>
          </View>
        ) : (
          <>
            {renderCalendar()}
            {renderRecurringBills()}
          </>
        )}

        {/* Add Button */}
        <View style={[styles.buttonContainer, isDesktop && styles.buttonContainerDesktop]}>
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={() => navigation.navigate('AddExpense', { type: 'daily' })}
          >
            <FontAwesome name="plus-circle" size={18} color="#ffffff" />
            <Text style={styles.buttonText}> เพิ่มรายจ่ายวันนี้</Text>
          </TouchableOpacity>
        </View>

        {/* Expense List */}
        <View style={styles.listHeader}>
          <View style={styles.listTitleContainer}>
            <FontAwesome name="list-alt" size={16} color={COLORS.text} />
            <Text style={styles.listTitle}>
              {' '}{selectedDate ? `รายการวันที่เลือก (${filteredExpenses.length})` : 'รายการล่าสุด'}
            </Text>
          </View>
          {selectedDate && (
            <TouchableOpacity
              style={styles.clearButtonContainer}
              onPress={() => {
                setSelectedDate('');
                updateFilteredExpenses('', expenses);
              }}
            >
              <FontAwesome name="times-circle" size={14} color={COLORS.primary} />
              <Text style={styles.clearButton}> ล้างการเลือก</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.listContainer}>
          {filteredExpenses.length > 0 ? (
            filteredExpenses.map((item) => (
              <View key={item.id}>
                {renderExpenseItem(item)}
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>
              {selectedDate ? 'ไม่มีรายการในวันที่เลือก' : 'ยังไม่มีรายการค่าใช้จ่าย'}
            </Text>
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
  // Desktop layout
  desktopInner: {
    alignSelf: 'center' as const,
    width: '100%',
    paddingHorizontal: 16,
  },
  desktopTwoColumn: {
    flexDirection: 'row',
    gap: 24,
    paddingHorizontal: 24,
  },
  desktopColumnLeft: {
    flex: 3,
  },
  desktopColumnRight: {
    flex: 2,
  },
  header: {
    backgroundColor: COLORS.primary,
    padding: 20,
    paddingTop: 50,
    paddingBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 1.5,
    color: '#ffffff',
    opacity: 0.8,
    marginTop: 8,
  },
  summaryContainer: {
    flexDirection: 'row',
    padding: 24,
    gap: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryCardDesktop: {
    padding: 24,
    borderRadius: 8,
  },
  summaryLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
  },
  summaryAmount: {
    fontSize: 22,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 0.5,
    color: COLORS.primary,
  },
  summaryAmountDesktop: {
    fontSize: 28,
  },
  buttonContainer: {
    padding: 24,
    paddingTop: 0,
  },
  buttonContainerDesktop: {
    maxWidth: 400,
  },
  button: {
    borderRadius: 0,
    padding: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  buttonPrimary: {
    backgroundColor: COLORS.primary,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  calendarContainer: {
    backgroundColor: COLORS.surface,
    margin: 0,
    marginTop: 0,
    borderRadius: 0,
    padding: 0,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  calendarContainerDesktop: {
    margin: 0,
    marginBottom: 24,
    borderRadius: 8,
  },
  dayContainer: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 0,
  },
  dayContainerDesktop: {
    width: 44,
    height: 44,
  },
  todayContainer: {
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  dayText: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
  },
  dayTextDesktop: {
    fontSize: 13,
  },
  todayText: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontFamily: 'NotoSansThai_500Medium',
  },
  disabledDay: {
    color: COLORS.textSecondary,
    opacity: 0.5,
  },
  dayAmount: {
    fontSize: 9,
    color: COLORS.textSecondary,
    fontFamily: 'NotoSansThai_300Light',
    marginTop: 2,
  },
  dayAmountDesktop: {
    fontSize: 10,
  },
  selectedDayInfo: {
    marginTop: 20,
    padding: 16,
    backgroundColor: COLORS.background,
    borderRadius: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  selectedDayTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedDayTitle: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 0.5,
  },
  selectedDayAmount: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
  },
  legendContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: COLORS.background,
    borderRadius: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  legendTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  legendTitle: {
    fontSize: 10,
    color: COLORS.text,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendBox: {
    width: 16,
    height: 16,
    borderRadius: 0,
    marginRight: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  legendText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
  },
  listHeader: {
    padding: 24,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  listTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listTitle: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: COLORS.text,
  },
  clearButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearButton: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 0.5,
  },
  listContainer: {
    padding: 24,
    paddingTop: 0,
  },
  expenseItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  expenseContent: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expenseLeft: {
    flex: 1,
  },
  expenseCategory: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 0.5,
    color: COLORS.text,
    marginBottom: 6,
  },
  expenseDescription: {
    fontSize: 12,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  expenseDate: {
    fontSize: 10,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 0.5,
    color: COLORS.textSecondary,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 0.5,
    color: COLORS.primary,
    marginLeft: 20,
  },
  deleteButton: {
    padding: 12,
    paddingHorizontal: 20,
    backgroundColor: COLORS.surface,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 1,
    marginTop: 48,
  },
  recurringBillsSection: {
    backgroundColor: COLORS.surface,
    margin: 24,
    marginTop: 0,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  recurringBillsSectionDesktop: {
    margin: 0,
    borderRadius: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: COLORS.text,
  },
  monthlyTotal: {
    fontSize: 14,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.primary,
  },
  billsList: {
    marginBottom: 16,
  },
  billItem: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 0,
  },
  billContent: {
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billLeft: {
    flex: 1,
  },
  billName: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
    marginBottom: 6,
  },
  billInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  billDueDate: {
    fontSize: 10,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  billRight: {
    alignItems: 'flex-end',
    marginLeft: 16,
  },
  billAmount: {
    fontSize: 14,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.primary,
    marginBottom: 8,
  },
  billSwitch: {
    transform: [{ scale: 0.8 }],
  },
  billDeleteButton: {
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  billDeleteText: {
    fontSize: 9,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
  },
  emptyBillsText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    paddingVertical: 24,
  },
  buttonSecondary: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  buttonSecondaryText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
