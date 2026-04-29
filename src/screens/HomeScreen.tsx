import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
  Modal,
} from 'react-native';
import { FontAwesome, Ionicons, AntDesign } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Calendar, DateData } from 'react-native-calendars';
import { RootStackParamList, Expense, RecurringBill, Income } from '../types';
import { getIncomes, getMonthlyIncomeTotal, deleteIncome } from '../services/incomeStorage';
import { getPendingReturnDate, clearPendingReturnDate } from '../services/pendingNavigation';
import { supabase } from '../services/supabase';

import { getExpenses, deleteExpense, getRecurringBills, deleteRecurringBill } from '../services/storage';
import { formatCurrency, formatDate, COLORS, getCurrentMonthYear } from '../utils/constants';
import { useResponsive } from '../utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontDisplay } from 'expo-font';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { isDesktop, isMobile } = useResponsive();
  const insets = useSafeAreaInsets();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [weekTotal, setWeekTotal] = useState(0);
  const [totalMonth, setTotalMonth] = useState(0);
  const [selectedDate, setSelectedDate] = useState('');
  const [markedDates, setMarkedDates] = useState<any>({});
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
  const [filteredIncomes, setFilteredIncomes] = useState<Income[]>([]);
  const [recurringBills, setRecurringBills] = useState<RecurringBill[]>([]);
  const [totalMonthlyBills, setTotalMonthlyBills] = useState(0);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());
  const [selectedIncomeIds, setSelectedIncomeIds] = useState<Set<string>>(new Set());
  const [expenseSelectMode, setExpenseSelectMode] = useState(false);
  const [incomeSelectMode, setIncomeSelectMode] = useState(false);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [showWeekTable, setShowWeekTable] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const today = new Date();
    const diff = today.getDay() === 0 ? -6 : 1 - today.getDay();
    const mon = new Date(today);
    mon.setDate(today.getDate() + diff);
    mon.setHours(0, 0, 0, 0);
    return mon;
  });
  const [showIncomeList, setShowIncomeList] = useState(true);
  const [showExpenseList, setShowExpenseList] = useState(true);


  const navigateWeek = (dir: -1 | 1) => {
    setWeekStart(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + dir * 7);
      return next;
    });
    setSelectedDate('');
  };


  const calculateMarkedDates = async (dailyExpenses: Expense[], allIncomes: Income[] = [], viewYear?: number, viewMonth?: number) => {
    const marked: any = {};
    const today = new Date();
    const currentMonth = viewMonth !== undefined ? viewMonth : today.getMonth();
    const currentYear = viewYear !== undefined ? viewYear : today.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const dailyTotal = dailyExpenses
        .filter((e) => {
          const parts = e.date?.split('-');
          if (!parts || parts.length < 3) return false;
          return parseInt(parts[2]) === day &&
                 parseInt(parts[1]) - 1 === currentMonth &&
                 parseInt(parts[0]) === currentYear;
        })
        .reduce((sum, e) => sum + e.amount, 0);

      const totalAmount = dailyTotal;

      if (day === 1) console.log('[calendar] income dates:', allIncomes.slice(0, 3).map(i => i.date));
      const dayIncome = allIncomes
        .filter((i) => {
          const parts = i.date?.split('-');
          if (!parts || parts.length < 3) return false;
          return parseInt(parts[2]) === day &&
                 parseInt(parts[1]) - 1 === currentMonth &&
                 parseInt(parts[0]) === currentYear;
        })
        .reduce((sum, i) => sum + i.amount, 0);
      if (totalAmount > 0 || dayIncome > 0) {
        marked[dateStr] = {
          customStyles: {
            container: {
              backgroundColor: dayIncome > 0 && totalAmount === 0 ? '#0F2A1E' : 'transparent',
              borderRadius: 0,
            },
            text: { color: COLORS.text, fontWeight: 'bold' },
          },
          amount: totalAmount,
          incomeAmount: dayIncome,
        };
      }
    }

    // today indicator — only when viewing the actual current month
    const isCurrentMonth = today.getMonth() === currentMonth && today.getFullYear() === currentYear;
    if (isCurrentMonth) {
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      if (marked[todayStr]) {
        marked[todayStr].customStyles = {
          ...marked[todayStr].customStyles,
          container: { ...marked[todayStr].customStyles?.container, borderWidth: 2, borderColor: COLORS.primary, borderRadius: 0},
          text: { color: COLORS.primary, fontWeight: 'bold' },
        };
      } else {
        marked[todayStr] = {
          customStyles: {
            container: { borderWidth: 2, borderColor: COLORS.primary, borderRadius: 0},
            text: { color: COLORS.primary, fontWeight: 'bold' },
          },
        };
      }
    }

    setMarkedDates(marked);
  };

  const updateFilteredExpenses = (dateStr: string, allExpenses: Expense[], allIncomes: Income[] = [], ws?: Date) => {
    if (!dateStr) {
      // show this week's items when no date selected
      const start = ws || weekStart;
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const inWeek = (dateString: string) => {
        const p = dateString?.split('-');
        if (!p || p.length < 3) return false;
        const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
        return d >= start && d <= end;
      };
      setFilteredExpenses(allExpenses.filter((e) => inWeek(e.date)));
      setFilteredIncomes(allIncomes.filter((i) => inWeek(i.date)));
      return;
    }
    const parts = dateStr.split('-');
    const y = parseInt(parts[0]), m = parseInt(parts[1]) - 1, d = parseInt(parts[2]);
    setFilteredExpenses(allExpenses.filter((e) => {
      const ep = e.date?.split('-');
      return ep && parseInt(ep[0]) === y && parseInt(ep[1]) - 1 === m && parseInt(ep[2]) === d;
    }));
    setFilteredIncomes(allIncomes.filter((i) => {
      const ip = i.date?.split('-');
      return ip && parseInt(ip[0]) === y && parseInt(ip[1]) - 1 === m && parseInt(ip[2]) === d;
    }));
  };

  const loadExpenses = async () => {
    const allIncomes = await getIncomes();
    setIncomes(allIncomes);
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const incomeTotal = allIncomes
      .filter((i) => i.date?.startsWith(currentMonthKey))
      .reduce((sum, i) => sum + i.amount, 0);
    setMonthlyIncome(incomeTotal);
    const allExpenses = await getExpenses();
    const dailyExpenses = allExpenses.filter((e) => e.type === 'daily');
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
        const d = new Date(e.date);
        return d >= startOfWeek && d <= endOfWeek;
      })
      .reduce((sum, e) => sum + e.amount, 0);
    setWeekTotal(weekTotal);

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthTotal = dailyExpenses
      .filter((e) => {
        const d = new Date(e.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((sum, e) => sum + e.amount, 0);
    setTotalMonth(monthTotal);

    await calculateMarkedDates(dailyExpenses, allIncomes, calendarMonth.year, calendarMonth.month);

    const returnDate = getPendingReturnDate();
    if (returnDate) {
      clearPendingReturnDate();
      const parts = returnDate.split('-').map(Number);
      if (parts.length === 3) {
        const [y, m, d] = parts;
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        setSelectedDate(dateStr);
        setCalendarMonth({ year: y, month: m - 1 });
        updateFilteredExpenses(dateStr, sorted, allIncomes, weekStart);
      }
    } else {
      updateFilteredExpenses(selectedDate, sorted, allIncomes, weekStart);
    }

    const bills = await getRecurringBills();
    setRecurringBills(bills);
    const monthlyTotal = bills.reduce((sum, b) => sum + (b.monthlyAmounts?.[currentMonthKey] ?? 0), 0);
    setTotalMonthlyBills(monthlyTotal);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadExpenses();
    }, [])
  );

  const handleDelete = async (id: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('ต้องการลบรายการนี้ใช่ไหม?');
      if (confirmed) {
        await deleteExpense(id);
        loadExpenses();
      }
    } else {
      Alert.alert('ลบรายการ', 'ต้องการลบรายการนี้ใช่ไหม?', [
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

  const handleDeleteBill = async (id: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('ต้องการลบรายการนี้ใช่ไหม?');
      if (confirmed) {
        await deleteRecurringBill(id);
        loadExpenses();
      }
    } else {
      Alert.alert('ลบรายการ', 'ต้องการลบรายการนี้ใช่ไหม?', [
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

  const handleDeleteIncome = (id: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm('ต้องการลบรายรับนี้ใช่ไหม?')) {
        deleteIncome(id).then(() => loadExpenses());
      }
    } else {
      Alert.alert('ลบรายรับ', 'ต้องการลบรายรับนี้ใช่ไหม?', [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ลบ', style: 'destructive', onPress: () => deleteIncome(id).then(() => loadExpenses()) },
      ]);
    }
  };

  const handleDeleteSelectedExpenses = () => {
    if (selectedExpenseIds.size === 0) return;
    const doDelete = async () => {
      for (const id of selectedExpenseIds) await deleteExpense(id);
      setSelectedExpenseIds(new Set());
      loadExpenses();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`ลบ ${selectedExpenseIds.size} รายการใช่ไหม?`)) doDelete();
    } else {
      Alert.alert('ลบรายการ', `ลบ ${selectedExpenseIds.size} รายการใช่ไหม?`, [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ลบ', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleDeleteSelectedIncomes = () => {
    if (selectedIncomeIds.size === 0) return;
    const doDelete = async () => {
      for (const id of selectedIncomeIds) await deleteIncome(id);
      setSelectedIncomeIds(new Set());
      loadExpenses();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`ลบ ${selectedIncomeIds.size} รายการใช่ไหม?`)) doDelete();
    } else {
      Alert.alert('ลบรายการ', `ลบ ${selectedIncomeIds.size} รายการใช่ไหม?`, [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ลบ', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const onDayPress = (day: DateData) => {
    const dateStr = day.dateString;
    setSelectedDate(dateStr);
    updateFilteredExpenses(dateStr, expenses, incomes);
    setMarkedDates((prev: any) => {
      const updated = { ...prev };
      // ลบ selected เก่าออก
      Object.keys(updated).forEach((k) => {
        if (updated[k]._selected) {
          delete updated[k]._selected;
          updated[k].customStyles = {
            ...updated[k].customStyles,
            container: {
              ...updated[k].customStyles?.container,
              borderWidth: updated[k]._isToday ? 2 : 0,
            },
          };
        }
      });
      // ใส่ selected ใหม่
      updated[dateStr] = {
        ...updated[dateStr],
        _selected: true,
        customStyles: {
          ...updated[dateStr]?.customStyles,
          container: {
            ...updated[dateStr]?.customStyles?.container,
            borderWidth: 2,
            borderColor: COLORS.accent,
            borderRadius: 0,
          },
          text: { color: COLORS.accent, fontWeight: 'bold' },
        },
      };
      return updated;
    });
  };

  const getDayTotal = (dateString: string) => {
    return markedDates[dateString]?.amount || 0;
  };

  const getDayIncome = (dateString: string) => {
    return markedDates[dateString]?.incomeAmount || 0;
  };

  const formatItemTime = (isoDate: string): string => {
    const d = new Date(isoDate);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const renderExpenseItem = (item: Expense) => {
    const isSelected = selectedExpenseIds.has(item.id);
    const onPress = () => {
      if (expenseSelectMode) {
        setSelectedExpenseIds((prev) => {
          const next = new Set(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        });
      } else {
        handleEdit(item);
      }
    };
    return (
      <TouchableOpacity key={item.id} style={[styles.expenseItem, isSelected && styles.itemSelected]} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.expenseContent}>
          {expenseSelectMode && (
            <FontAwesome
              name={isSelected ? 'check-circle' : 'circle-o'}
              size={18}
              color={isSelected ? COLORS.error : COLORS.textSecondary}
              style={{ marginRight: 14 }}
            />
          )}
          <View style={styles.expenseLeft}>
            <Text style={styles.expenseCategory}>{item.category}</Text>
            <Text style={styles.expenseDescription}>{item.description || '-'}</Text>
            <View style={styles.itemDateRow}>
              <Text style={styles.expenseDate}>{formatDate(item.date)}</Text>
              <Text style={styles.itemTime}>{formatItemTime(item.date)}</Text>
            </View>
          </View>
          <Text style={styles.expenseAmount}>{formatCurrency(item.amount)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderIncomeItem = (item: Income) => {
    const isSelected = selectedIncomeIds.has(item.id);
    const onPress = () => {
      if (incomeSelectMode) {
        setSelectedIncomeIds((prev) => {
          const next = new Set(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        });
      } else {
        navigation.navigate('AddIncome', { income: item });
      }
    };
    return (
      <TouchableOpacity key={item.id} style={[styles.expenseItem, isSelected && styles.itemSelected]} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.expenseContent}>
          {incomeSelectMode && (
            <FontAwesome
              name={isSelected ? 'check-circle' : 'circle-o'}
              size={18}
              color={isSelected ? COLORS.error : COLORS.textSecondary}
              style={{ marginRight: 14 }}
            />
          )}
          <View style={styles.expenseLeft}>
            <Text style={styles.expenseCategory}>{item.category}</Text>
            <Text style={styles.expenseDescription}>{item.description || '-'}</Text>
            <View style={styles.itemDateRow}>
              <Text style={styles.expenseDate}>{formatDate(item.date)}</Text>
              {item.date.length > 10 && <Text style={styles.itemTime}>{formatItemTime(item.date)}</Text>}
            </View>
          </View>
          <Text style={styles.incomeAmount}>{formatCurrency(item.amount)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const toDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const fmtShort = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0);

  const renderWeekStrip = () => {
    const today = new Date();
    const todayStr = toDateStr(today);
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
    const endDay = weekDays[6];
    const monthLabel =
      weekStart.getMonth() === endDay.getMonth()
        ? weekStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : `${weekStart.toLocaleDateString('en-US', { month: 'short' })} – ${endDay.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
      <View style={[styles.calendarContainer, isDesktop && styles.calendarContainerDesktop]}>
        {/* header */}
        <View style={styles.weekHeader}>
          <TouchableOpacity onPress={() => navigateWeek(-1)} style={styles.weekNavBtn}>
            <FontAwesome name="chevron-left" size={11} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.weekMonthLabel}>{monthLabel}</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => navigateWeek(1)} style={styles.weekNavBtn}>
              <FontAwesome name="chevron-right" size={11} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setViewMode('month')} style={styles.viewToggleBtn}>
              <FontAwesome name="calendar" size={12} color={COLORS.textSecondary} />
              <Text style={styles.viewToggleText}>Month</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* day strip */}
        <View style={styles.weekDaysRow}>
          {DAY_LABELS.map((label, i) => {
            const d = weekDays[i];
            const dateStr = toDateStr(d);
            const isSelected = selectedDate === dateStr;
            const isToday = dateStr === todayStr;
            const hasExpense = (markedDates[dateStr]?.amount || 0) > 0;
            const hasIncome = (markedDates[dateStr]?.incomeAmount || 0) > 0;
            return (
              <TouchableOpacity
                key={i}
                style={[styles.weekDayBtn, isSelected && styles.weekDayBtnSelected, isToday && !isSelected && styles.weekDayBtnToday]}
                onPress={() => onDayPress({ dateString: dateStr, day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear(), timestamp: d.getTime() })}
              >
                <Text style={[styles.weekDayLabel, isSelected && styles.weekDayTextSelected, isToday && !isSelected && styles.weekDayTextToday]}>{label}</Text>
                <Text style={[styles.weekDayNum, isSelected && styles.weekDayTextSelected, isToday && !isSelected && styles.weekDayTextToday]}>{d.getDate()}</Text>
                <View style={styles.weekDots}>
                  {hasExpense && <View style={[styles.weekDot, { backgroundColor: COLORS.primary }]} />}
                  {hasIncome && <View style={[styles.weekDot, { backgroundColor: COLORS.success }]} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* week summary or selected day summary */}
        <View style={styles.selectedDayInfo}>
          {selectedDate ? (
            <>
              <Text style={styles.selectedDayTitle}>
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                {getDayIncome(selectedDate) > 0 && (
                  <Text style={[styles.selectedDayAmount, { color: COLORS.success }]}>+{formatCurrency(getDayIncome(selectedDate))}</Text>
                )}
                {getDayTotal(selectedDate) > 0 && (
                  <Text style={[styles.selectedDayAmount, { color: COLORS.error }]}>-{formatCurrency(getDayTotal(selectedDate))}</Text>
                )}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.selectedDayTitle}>This Week</Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                {(() => {
                  const weekEnd = new Date(weekStart);
                  weekEnd.setDate(weekStart.getDate() + 6);
                  const wIncome = incomes.filter((i) => {
                    const p = i.date?.split('-');
                    if (!p) return false;
                    const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
                    return d >= weekStart && d <= weekEnd;
                  }).reduce((s, i) => s + i.amount, 0);
                  const wExpense = expenses.filter((e) => {
                    const p = e.date?.split('-');
                    if (!p) return false;
                    const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
                    return d >= weekStart && d <= weekEnd;
                  }).reduce((s, e) => s + e.amount, 0);
                  return (
                    <>
                      {wIncome > 0 && <Text style={[styles.selectedDayAmount, { color: COLORS.success }]}>+{formatCurrency(wIncome)}</Text>}
                      {wExpense > 0 && <Text style={[styles.selectedDayAmount, { color: COLORS.error }]}>-{formatCurrency(wExpense)}</Text>}
                      {wIncome === 0 && wExpense === 0 && <Text style={[styles.selectedDayAmount, { color: COLORS.textSecondary }]}>No records</Text>}
                    </>
                  );
                })()}
              </View>
            </>
          )}
        </View>
      </View>
    );
  };

  const renderCalendar = () => {
    return (
      <View style={[styles.calendarContainer, isDesktop && styles.calendarContainerDesktop]}>

        {/* ── Month/Year Picker Header ── */}
        {(() => {
          const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const goTo = (year: number, month: number) => {
            setCalendarMonth({ year, month });
            setSelectedDate('');
            updateFilteredExpenses('', expenses, incomes);
            calculateMarkedDates(expenses, incomes, year, month);
          };
          return (
            <>
              {/* Title row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 24 }}>
                <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} onPress={() => {
                  const m = calendarMonth.month === 0 ? { year: calendarMonth.year - 1, month: 11 } : { year: calendarMonth.year, month: calendarMonth.month - 1 };
                  goTo(m.year, m.month);
                }}>
                  <Ionicons name="chevron-back" size={22} color={COLORS.text} />
                </TouchableOpacity>
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 12 }}
                  onPress={() => { setShowMonthPicker(true); setPickerYear(calendarMonth.year); }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: COLORS.text, fontFamily: 'NotoSansThai_600SemiBold' }}>
                    {MONTHS[calendarMonth.month]} {calendarMonth.year}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={COLORS.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} onPress={() => {
                  const m = calendarMonth.month === 11 ? { year: calendarMonth.year + 1, month: 0 } : { year: calendarMonth.year, month: calendarMonth.month + 1 };
                  goTo(m.year, m.month);
                }}>
                  <Ionicons name="chevron-forward" size={22} color={COLORS.text} />
                </TouchableOpacity>
              </View>
              {/* Modal picker */}
              <Modal visible={showMonthPicker} transparent animationType="fade" onRequestClose={() => setShowMonthPicker(false)}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}
                  activeOpacity={1} onPress={() => setShowMonthPicker(false)}>
                  <View style={{ backgroundColor: COLORS.surface, width: 280, borderWidth: 1, borderColor: COLORS.border }}>
                    {/* Year row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                      <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => setPickerYear(y => y - 1)}>
                        <Ionicons name="chevron-back" size={20} color={COLORS.text} />
                      </TouchableOpacity>
                      <Text style={{ color: COLORS.text, fontWeight: 'bold', fontSize: 16 }}>{pickerYear}</Text>
                      <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => setPickerYear(y => y + 1)}>
                        <Ionicons name="chevron-forward" size={20} color={COLORS.text} />
                      </TouchableOpacity>
                    </View>
                    {/* Month grid */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      {MONTHS.map((m, i) => {
                        const isActive = pickerYear === calendarMonth.year && i === calendarMonth.month;
                        return (
                          <TouchableOpacity key={m}
                            style={{ width: '25%', alignItems: 'center', paddingVertical: 14, backgroundColor: isActive ? COLORS.primary : 'transparent' }}
                            onPress={() => { goTo(pickerYear, i); setShowMonthPicker(false); }}>
                            <Text style={{ color: isActive ? '#fff' : COLORS.text, fontSize: 14 }}>{m}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </TouchableOpacity>
              </Modal>
            </>
          );
        })()}

        {/* ── Original Calendar ── */}
        <Calendar
          key={`${calendarMonth.year}-${calendarMonth.month}`}
          markingType={'custom'}
          markedDates={markedDates}
          current={`${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, '0')}-01`}
          onDayPress={onDayPress}
          onMonthChange={(m: DateData) => {
            const y = m.year, mo = m.month - 1;
            setCalendarMonth({ year: y, month: mo });
            setSelectedDate('');
            updateFilteredExpenses('', expenses, incomes);
            calculateMarkedDates(expenses, incomes, y, mo);
          }}
          style={{ backgroundColor: COLORS.surface }}
          hideArrows={true}
          hideDayNames={false}
          renderHeader={() => null as any}
          theme={{
            backgroundColor: COLORS.surface,
            calendarBackground: COLORS.surface,
            textSectionTitleColor: COLORS.textSecondary,
            selectedDayBackgroundColor: COLORS.accent,
            selectedDayTextColor: '#ffffff',
            todayTextColor: COLORS.primary,
            dayTextColor: COLORS.text,
            textDisabledColor: COLORS.border,
            monthTextColor: COLORS.text,
            arrowColor: COLORS.text,
            textMonthFontWeight: 'bold' as const,
            textDayFontSize: isDesktop ? 14 : 13,
            textMonthFontSize: isDesktop ? 18 : 16,
          }}
          dayComponent={({ date, state, marking }: any) => {
            const amount = marking?.amount || 0;
            const incomeAmt = marking?.incomeAmount || 0;
            const isToday = marking?.customStyles?.text?.color === COLORS.primary;
            const isSelected = selectedDate === date?.dateString;
            return (
              <TouchableOpacity
                style={[
                  styles.dayContainer,
                  isDesktop && styles.dayContainerDesktop,
                  isSelected && styles.dayContainerSelected,
                  marking?.customStyles?.container,
                ]}
                onPress={() => onDayPress(date)}
              >
                <Text style={[
                  styles.dayText,
                  isDesktop && styles.dayTextDesktop,
                  state === 'disabled' && styles.disabledDay,
                  isToday && styles.todayText,
                  isSelected && styles.dayTextSelected,
                ]}>
                  {date?.day}
                </Text>
                {amount > 0 ? <Text style={[styles.dayAmount, { color: COLORS.primary }]}>-{fmtShort(amount)}</Text> : null}
                {incomeAmt > 0 ? <Text style={[styles.dayAmount, { color: COLORS.success }]}>+{fmtShort(incomeAmt)}</Text> : null}
              </TouchableOpacity>
            );
          }}
        />

        {/* ── Selected day info ── */}
        {selectedDate ? (
          <View style={styles.selectedDayInfo}>
            <Text style={styles.selectedDayTitle}>
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              {getDayIncome(selectedDate) > 0 ? <Text style={[styles.selectedDayAmount, { color: COLORS.success }]}>+{formatCurrency(getDayIncome(selectedDate))}</Text> : null}
              {getDayTotal(selectedDate) > 0 ? <Text style={[styles.selectedDayAmount, { color: COLORS.error }]}>-{formatCurrency(getDayTotal(selectedDate))}</Text> : null}
            </View>
          </View>
        ) : null}

      </View>
    );
  };

  const renderWeeklySummary = () => {
    const { year, month } = calendarMonth;
    const dayStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const firstOfMonth = new Date(year, month, 1);
    const firstSun = new Date(firstOfMonth);
    const dow = firstSun.getDay();
    firstSun.setDate(firstSun.getDate() + (dow === 0 ? 0 : (7 - dow) % 7));
    type WeekRow = { days: Date[]; label: string };
    const weeks: WeekRow[] = [];
    let sun = new Date(firstSun);
    while (sun.getMonth() === month) {
      const mon = new Date(sun);
      mon.setDate(sun.getDate() - 6);
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(mon);
        d.setDate(mon.getDate() + i);
        return d;
      });
      const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const spansPrev = mon.getMonth() !== month;
      const label = spansPrev ? `${fmtDay(mon)}–${fmtDay(sun)}` : `${fmtDay(mon)}–${sun.getDate()}`;
      weeks.push({ days, label });
      sun = new Date(sun);
      sun.setDate(sun.getDate() + 7);
    }
    return (
      <View>
        {!isDesktop && (
          <TouchableOpacity style={styles.weekTableToggle} onPress={() => setShowWeekTable(v => !v)}>
            <Text style={styles.weekTableToggleText}>Weekly Summary</Text>
            <FontAwesome name={showWeekTable ? 'chevron-up' : 'chevron-down'} size={10} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {(isDesktop || showWeekTable) ? <View style={styles.weekTableContainer}>
          <View style={styles.weekTableHeader}>
            <Text style={[styles.weekTableCell, { flex: 1, fontFamily: 'NotoSansThai_400Regular', letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 10 }]}>Week</Text>
            <Text style={[styles.weekTableCell, { flex: 1, textAlign: 'right', color: COLORS.success, fontFamily: 'NotoSansThai_400Regular', letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 10 }]}>Income</Text>
            <Text style={[styles.weekTableCell, { flex: 1, textAlign: 'right', color: COLORS.primary, fontFamily: 'NotoSansThai_400Regular', letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 10 }]}>Expense</Text>
            <Text style={[styles.weekTableCell, { flex: 1, textAlign: 'right', fontFamily: 'NotoSansThai_400Regular', letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 10 }]}>Balance</Text>
          </View>
          {weeks.map((week, wi) => {
            const wExpense = week.days.reduce((s, d) => {
              const ds = dayStr(d);
              return s + expenses.filter(e => e.date?.startsWith(ds)).reduce((ss, e) => ss + e.amount, 0);
            }, 0);
            const wIncome = week.days.reduce((s, d) => {
              const ds = dayStr(d);
              return s + incomes.filter(i => i.date?.startsWith(ds)).reduce((ss, i) => ss + i.amount, 0);
            }, 0);
            const balance = wIncome - wExpense;
            return (
              <View key={wi} style={[styles.weekTableRow, wi % 2 === 0 ? { backgroundColor: `${COLORS.surface}` } : { backgroundColor: COLORS.background }]}>
                <Text style={[styles.weekTableCell, { flex: 1, color: COLORS.text }]} numberOfLines={1}>{week.label}</Text>
                <Text style={[styles.weekTableCell, { flex: 1, textAlign: 'right', color: wIncome > 0 ? COLORS.success : COLORS.textSecondary }]}>
                  {wIncome > 0 ? `${formatCurrency(wIncome)}` : '–'}
                </Text>
                <Text style={[styles.weekTableCell, { flex: 1, textAlign: 'right', color: wExpense > 0 ? COLORS.primary : COLORS.textSecondary }]}>
                  {wExpense > 0 ? `${formatCurrency(wExpense)}` : '–'}
                </Text>
                <Text style={[styles.weekTableCell, { flex: 1, textAlign: 'right', color: balance >= 0 ? COLORS.success : COLORS.error }]}>
                  {wIncome === 0 && wExpense === 0 ? '–' : formatCurrency(balance)}
                </Text>
              </View>
            );
          })}
        </View> : null}
      </View>
    );
  };

  const renderRecurringBills = () => {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentMonthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return (
      <View style={[styles.recurringBillsSection, isDesktop && styles.recurringBillsSectionDesktop]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleContainer}>
            <FontAwesome name="credit-card" size={16} color={COLORS.text} />
            <Text style={styles.sectionTitle}> Recurring Bills</Text>
          </View>
          <Text style={styles.monthlyTotal}>{formatCurrency(totalMonthlyBills)}</Text>
        </View>

        <Text style={styles.billMonthLabel}>{currentMonthLabel}</Text>

        {recurringBills.length > 0 ? (
          <View style={styles.billsList}>
            {recurringBills.map((bill) => {
              const thisMonthAmount = bill.monthlyAmounts?.[currentMonthKey];
              const recordedCount = Object.keys(bill.monthlyAmounts ?? {}).length;
              return (
                <View key={bill.id} style={styles.billItem}>
                  <TouchableOpacity
                    style={styles.billContent}
                    onPress={() => handleEditBill(bill)}
                  >
                    <View style={styles.billLeft}>
                      <Text style={styles.billName}>{bill.name}</Text>
                      <View style={styles.billInfoRow}>
                        <FontAwesome name="calendar" size={10} color={COLORS.textSecondary} />
                        <Text style={styles.billDueDate}>
                          {' '}{recordedCount} month{recordedCount !== 1 ? 's' : ''} recorded
                        </Text>
                      </View>
                    </View>
                    <View style={styles.billRight}>
                      {thisMonthAmount !== undefined ? (
                        <Text style={styles.billAmount}>{formatCurrency(thisMonthAmount)}</Text>
                      ) : (
                        <Text style={styles.billAmountEmpty}>Not recorded</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.billDeleteButton}
                    onPress={() => handleDeleteBill(bill.id)}
                  >
                    <FontAwesome name="trash" size={12} color={COLORS.textSecondary} />
                    <Text style={styles.billDeleteText}> Delete</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.emptyBillsText}>No recurring bills yet</Text>
        )}

        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => navigation.navigate('AddExpense', { type: 'recurring' })}
        >
          <FontAwesome name="plus-circle" size={16} color={COLORS.primary} />
          <Text style={styles.buttonSecondaryText}> Add Recurring Bill</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={isDesktop ? styles.desktopInner : undefined}>

        {/* ── Header ── */}
        <View style={[styles.topBar, { paddingTop: insets.top + 14 }]}>
          <Text style={styles.topBarLogo}>WEALTH LAB</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {isDesktop && (
              <>
                {/* <TouchableOpacity
                  style={styles.topBarAddBtn}
                  onPress={() => navigation.navigate('AddIncome', { date: selectedDate || undefined })}
                >
                  <Ionicons name="add-circle-outline" size={16} color={COLORS.success} />
                  <Text style={[styles.topBarAddBtnText, { color: COLORS.success }]}>Add Income</Text>
                </TouchableOpacity> */}
                {/* <TouchableOpacity
                  style={styles.topBarAddBtn}
                  onPress={() => navigation.navigate('AddExpense', { type: 'daily', date: selectedDate || undefined })}
                >
                  <Ionicons name="add-circle-outline" size={16} color={COLORS.primary} />
                  <Text style={[styles.topBarAddBtnText, { color: COLORS.primary }]}>Add Expense</Text>
                </TouchableOpacity> */}
              </>
            )}
            <TouchableOpacity onPress={() => supabase.auth.signOut()} style={styles.topBarLogout}>
              <AntDesign name="logout" size={14} color={COLORS.textSecondary} />
              <Text style={{ color: COLORS.text, fontSize: 12, fontFamily: 'NotoSansThai_400Regular' }}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Summary Cards ── */}
        {(() => {
          const viewKey = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, '0')}`;
          const viewIncome = incomes.filter(i => i.date?.startsWith(viewKey)).reduce((s, i) => s + i.amount, 0);
          const viewExpense = expenses.filter(e => e.date?.startsWith(viewKey)).reduce((s, e) => s + e.amount, 0);
          const viewBalance = viewIncome - viewExpense;
          const monthLabel = new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          return (
            <View style={[styles.summaryContainer, isMobile && styles.summaryContainerMobile]}>
              <View style={[styles.summaryCard, styles.summaryCardIncome, isDesktop && styles.summaryCardDesktop]}>
                <Text style={styles.summaryLabel}>Income</Text>
                <Text style={[styles.summaryAmount, styles.summaryAmountIncome, isDesktop && styles.summaryAmountDesktop]}>
                  {formatCurrency(viewIncome)}
                </Text>
                <Text style={styles.summarySubLabel}>{monthLabel}</Text>
              </View>
              <View style={[styles.summaryCard, styles.summaryCardExpense, isDesktop && styles.summaryCardDesktop]}>
                <Text style={styles.summaryLabel}>Expense</Text>
                <Text style={[styles.summaryAmount, styles.summaryAmountExpense, isDesktop && styles.summaryAmountDesktop]}>
                  {formatCurrency(viewExpense)}
                </Text>
                <Text style={styles.summarySubLabel}>{monthLabel}</Text>
              </View>
              {/* <View style={[styles.summaryCard, styles.summaryCardNet, isDesktop && styles.summaryCardDesktop]}>
                <Text style={styles.summaryLabel}>Balance</Text>
                <Text style={[styles.summaryAmount, viewBalance >= 0 ? styles.summaryAmountIncome : styles.summaryAmountExpense, isDesktop && styles.summaryAmountDesktop]}>
                  {formatCurrency(viewBalance)}
                </Text>
                <Text style={styles.summarySubLabel}>{monthLabel}</Text>
              </View> */}
            </View>
          );
        })()}

        {/* ── Calendar ── */}
        {isDesktop ? (
          <View style={styles.desktopTwoColumn}>
            <View style={styles.desktopColumnLeft}>
              {renderCalendar()}
            </View>
            <View style={styles.desktopColumnRight}>
              {renderWeeklySummary()}
            </View>
          </View>
        ) : (
          <>
            {renderCalendar()}
            {renderWeeklySummary()}
          </>
        )}

        {/* ── Add Buttons (mobile only) ── */}
        {!isDesktop && (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.buttonIncome]}
              onPress={() => navigation.navigate('AddIncome', { date: selectedDate || undefined })}
            >
              <Ionicons name="add-circle-outline" size={24} color={COLORS.success} />
              <Text style={[styles.buttonText, styles.buttonTextIncome]}>Add Income</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonExpense]}
              onPress={() => navigation.navigate('AddExpense', { type: 'daily', date: selectedDate || undefined })}
            >
              <Ionicons name="add-circle-outline" size={24} color={COLORS.primary} />
              <Text style={[styles.buttonText, styles.buttonTextExpense]}>Add Expense</Text>
            </TouchableOpacity>
          </View>
        )}

        {isDesktop && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,padding:24 }}>
            <TouchableOpacity
              style={styles.topBarAddBtn}
              onPress={() => navigation.navigate('AddIncome', { date: selectedDate || undefined })}
            >
              <Ionicons name="add-circle-outline" size={16} color={COLORS.success} />
              <Text style={[styles.topBarAddBtnText, { color: COLORS.success }]}>Add Income</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.topBarAddBtn}
              onPress={() => navigation.navigate('AddExpense', { type: 'daily', date: selectedDate || undefined })}
            >
              <Ionicons name="add-circle-outline" size={16} color={COLORS.primary} />
              <Text style={[styles.topBarAddBtnText, { color: COLORS.primary }]}>Add Expense</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Income / Expense Lists ── */}
        <View style={isDesktop ? styles.desktopListsRow : undefined}>

        {/* ── Income List ── */}
        {filteredIncomes.length > 0 && (
          <View style={[styles.incomeSection, isDesktop && { flex: 1 }]}>
            <View style={styles.listHeader}>
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} onPress={() => setShowIncomeList(v => !v)}>
                <Text style={styles.listTitle}>Income ({filteredIncomes.length})</Text>
                <FontAwesome name={showIncomeList ? 'chevron-up' : 'chevron-down'} size={10} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {incomeSelectMode ? (
                  <>
                    {selectedIncomeIds.size > 0 && (
                      <TouchableOpacity onPress={handleDeleteSelectedIncomes} style={styles.deleteSelectedBtn}>
                        <FontAwesome name="trash" size={12} color={COLORS.error} />
                        <Text style={styles.deleteSelectedText}>Delete ({selectedIncomeIds.size})</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => { setIncomeSelectMode(false); setSelectedIncomeIds(new Set()); }} style={styles.cancelSelectBtn}>
                      <Text style={styles.cancelSelectText}>ยกเลิก</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity onPress={() => setIncomeSelectMode(true)} style={styles.selectModeBtn}>
                      <FontAwesome name="check-square-o" size={13} color={COLORS.textSecondary} />
                      <Text style={styles.selectModeText}>Select</Text>
                    </TouchableOpacity>
                    <Text style={styles.incomeTotalText}>{formatCurrency(filteredIncomes.reduce((s, i) => s + i.amount, 0))}</Text>
                  </>
                )}
              </View>
            </View>
            {showIncomeList && filteredIncomes.map((item) => renderIncomeItem(item))}
          </View>
        )}

        {/* ── Expense List Header ── */}
        <View style={[{ flex: isDesktop ? 1 : undefined }]}>
        <View style={styles.listHeader}>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} onPress={() => setShowExpenseList(v => !v)}>
            <Text style={styles.listTitle}>
              {selectedDate
                ? `Expenses (${filteredExpenses.length})`
                : viewMode === 'week'
                ? `This Week · ${filteredExpenses.length} items`
                : `Expenses (${filteredExpenses.length})`}
            </Text>
            <FontAwesome name={showExpenseList ? 'chevron-up' : 'chevron-down'} size={10} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {expenseSelectMode ? (
              <>
                {selectedExpenseIds.size > 0 && (
                  <TouchableOpacity onPress={handleDeleteSelectedExpenses} style={styles.deleteSelectedBtn}>
                    <FontAwesome name="trash" size={12} color={COLORS.error} />
                    <Text style={styles.deleteSelectedText}>Delete ({selectedExpenseIds.size})</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => { setExpenseSelectMode(false); setSelectedExpenseIds(new Set()); }} style={styles.cancelSelectBtn}>
                  <Text style={styles.cancelSelectText}>ยกเลิก</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity onPress={() => setExpenseSelectMode(true)} style={styles.selectModeBtn}>
                  <FontAwesome name="check-square-o" size={13} color={COLORS.textSecondary} />
                  <Text style={styles.selectModeText}>Select</Text>
                </TouchableOpacity>
                <Text style={styles.expenseTotalText}>{formatCurrency(filteredExpenses.reduce((s, e) => s + e.amount, 0))}</Text>
              </>
            )}
          </View>
        </View>

        {/* ── Expense List ── */}
        {showExpenseList && <View style={[styles.listContainer, isDesktop && styles.listContainerDesktop]}>
          {filteredExpenses.length > 0 ? (
            filteredExpenses.map((item, index) => (
              <View
                key={item.id}
                style={isDesktop ? [
                  styles.expenseColItem,
                  index % 2 === 0 && styles.expenseColLeft,
                ] : undefined}
              >
                {renderExpenseItem(item)}
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>
              {selectedDate ? 'No expenses on this day' : 'No expenses yet'}
            </Text>
          )}
        </View>}
        </View>
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

  // ── Section toggle header ──
  sectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionToggleText: {
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
  },

  // ── Desktop wrapper ──
  desktopInner: {
    alignSelf: 'center' as const,
    width: '100%',
  },

  // ── Desktop header (title + add button) ──
  desktopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  desktopHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  desktopHeaderTitle: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: COLORS.text,
  },
  desktopHeaderMonth: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 0.5,
  },
  desktopAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 0,
  },
  desktopAddBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
  },

  // ── Two-column layout ──
  desktopTwoColumn: {
    flexDirection: 'row',
    gap: 20,
    paddingHorizontal: 24,
  },
  desktopColumnLeft: {
    flex: 2,
  },
  desktopColumnRight: {
    flex: 1,
  },
  desktopListsRow: {
    flexDirection: 'row',
    gap: 0,
    alignItems: 'flex-start',
    padding: 24
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  topBarAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  topBarAddBtnText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  topBarLogo: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 4,
  },
  topBarLogout: {
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  // ── Summary cards ──
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 20,
  },
  summaryContainerMobile: {
    flexDirection: 'column',
  },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryCardDesktop: {
    padding: 24,
    borderRadius: 0,
  },
  summaryCardIncome: {
    borderColor: `${COLORS.success}40`,
  },
  summaryAmountIncome: {
    color: COLORS.success,
  },
  summaryCardExpense: {
    borderColor: `${COLORS.error}40`,
  },
  summaryAmountExpense: {
    color: COLORS.error,
  },
  summaryCardNet: {
    borderColor: `${COLORS.accent}40`,
  },
  summarySubLabel: {
    fontSize: 9,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  incomeSection: {
    marginTop: 8,
    marginHorizontal: 0,
  },
  incomeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  incomeAmount: {
    fontSize: 15,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.success,
  },
  incomeTotalText: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.success,
  },
  expenseTotalText: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.primary,
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

  // ── Buttons ──
  buttonContainer: {
    flexDirection: 'row',
    paddingTop: 16,
    paddingHorizontal: 24,
    paddingBottom: 8,
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    backgroundColor: 'transparent',
    minHeight: 56,
  },
  buttonSecondary: {
    borderColor: COLORS.primary,
    flex: 0,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 0,
  },
  buttonIncome: {
    borderColor: COLORS.success,
  },
  buttonExpense: {
    borderColor: COLORS.primary,
  },
  buttonText: {
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  buttonTextIncome: {
    color: COLORS.success,
  },
  buttonTextExpense: {
    color: COLORS.primary,
  },
  buttonSecondaryText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
  },

  // ── Week Strip ──
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  weekNavBtn: {
    padding: 8,
  },
  weekMonthLabel: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1,
    color: COLORS.text,
  },
  viewToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  viewToggleBtnFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 8,
  },
  viewToggleText: {
    fontSize: 10,
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
  },
  weekDaysRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  weekDayBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 4,
    borderRadius: 0,
  },
  weekDayBtnSelected: {
    backgroundColor: COLORS.accent,
  },
  weekDayBtnToday: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 0,
  },
  weekDayLabel: {
    fontSize: 9,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weekDayNum: {
    fontSize: 15,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.text,
  },
  weekDayTextSelected: {
    color: '#ffffff',
    fontFamily: 'NotoSansThai_400Regular',
  },
  weekDayTextToday: {
    color: COLORS.primary,
    fontFamily: 'NotoSansThai_400Regular',
  },
  weekDots: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
    alignItems: 'center',
  },
  weekDot: {
    width: 4,
    height: 4,
    borderRadius: 0,
  },

  // ── Weekly Summary Table ──
  weekTableToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  weekTableToggleText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
  },
  weekTableContainer: {
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: 0,
    overflow: 'hidden',
  },
  weekTableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  weekTableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  weekTableCell: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },

  // ── Custom Calendar ──
  calMonthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  calNavBtn: { padding: 10 },
  calMonthTitle: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1,
    color: COLORS.text,
  },
  calHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 4,
  },
  calDayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  calWeekRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  calWeekCol: {
    width: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 6,
  },
  calWeekRange: {
    fontSize: 8,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  calWeekTotal: {
    fontSize: 8,
    fontFamily: 'NotoSansThai_300Light',
    lineHeight: 11,
  },
  calWeekEmpty: {
    fontSize: 8,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.border,
  },
  calDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 0,
    minHeight: 48,
    justifyContent: 'flex-start',
    paddingTop: 6,
  },
  calDayToday: {
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  calDaySelected: {
    backgroundColor: COLORS.accent,
  },
  calDayNum: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.text,
  },
  calDayNumToday: {
    color: COLORS.primary,
    fontFamily: 'NotoSansThai_400Regular',
  },
  calDayNumSelected: {
    color: '#ffffff',
    fontFamily: 'NotoSansThai_400Regular',
  },
  calDayAmt: {
    fontSize: 8,
    fontFamily: 'NotoSansThai_300Light',
    lineHeight: 11,
  },

  // ── Calendar ──
  calendarContainer: {
    backgroundColor: COLORS.surface,
    marginTop: 24,
    borderRadius: 0,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'visible',
  },
  calendarContainerDesktop: {
    margin: 0,
    marginTop: 0,
    paddingVertical: 0,
    borderRadius: 0,
  },
  dayContainer: {
    width: 42,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayContainerDesktop: {
    width: 52,
    height: 62,
  },
  dayContainerSelected: {
    borderColor: COLORS.accent,
    borderWidth: 1,
    borderRadius: 0,
  },
  todayContainer: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 0,
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
  dayTextSelected: {
    color: COLORS.accent,
    fontFamily: 'NotoSansThai_400Regular',
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

  // ── Recurring Bills ──
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
    borderRadius: 0,
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
  billMonthLabel: {
    fontSize: 11,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  billsList: {
    marginBottom: 16,
  },
  billItem: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
  },
  billAmountEmpty: {
    fontSize: 11,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    fontStyle: 'italic',
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

  // ── Expense List ──
  listHeader: {
    padding: 24,
    paddingTop:48,
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
    paddingVertical: 24,
    paddingTop: 0,
  },
  // Desktop: 2-column flex-wrap
  listContainerDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    padding: 0,
  },
  expenseColItem: {
    width: '100%',
  },
  // Left column gets a right border as column divider
  expenseColLeft: {
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },

  // ── Expense item ──
  expenseItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  expenseContent: {
    flex: 1,
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
  itemDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  itemTime: {
    fontSize: 10,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    opacity: 0.7,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 0.5,
    color: COLORS.primary,
    marginLeft: 20,
  },
  itemSelected: {
    backgroundColor: `${COLORS.error}10`,
    borderBottomColor: `${COLORS.error}30`,
  },
  selectModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  selectModeText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cancelSelectBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  cancelSelectText: {
    color: COLORS.accent,
    fontSize: 10,
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  deleteSelectedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  deleteSelectedText: {
    color: COLORS.error,
    fontSize: 10,
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 1,
    marginVertical: 48,
    width: '100%',
  },
});
