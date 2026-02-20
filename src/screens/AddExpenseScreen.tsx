import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Calendar, DateData } from 'react-native-calendars';
import { RootStackParamList, Expense, RecurringBill } from '../types';
import { saveExpense, updateExpense, saveRecurringBill, updateRecurringBill } from '../services/storage';
import { EXPENSE_CATEGORIES, COLORS, formatCurrency } from '../utils/constants';
import { useResponsive } from '../utils/responsive';

type AddExpenseScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AddExpense'>;
type AddExpenseScreenRouteProp = RouteProp<RootStackParamList, 'AddExpense'>;

export default function AddExpenseScreen() {
  const navigation = useNavigation<AddExpenseScreenNavigationProp>();
  const route = useRoute<AddExpenseScreenRouteProp>();
  const { type, expense, bill } = route.params;
  const { isDesktop } = useResponsive();

  const isEditing = !!(expense || bill);

  // ── Shared ──
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState('');

  // ── Daily ──
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const todayLocal = `${yyyy}-${mm}-${String(now.getDate()).padStart(2, '0')}`;
  const [expenseDate, setExpenseDate] = useState(() => todayLocal);
  const [showCalendar, setShowCalendar] = useState(false);

  // ── Recurring: per-month ──
  const [viewMonth, setViewMonth] = useState<string>(() => `${yyyy}-${mm}`);
  const [monthEntries, setMonthEntries] = useState<{ [key: string]: string }>({});
  const [monthAmount, setMonthAmount] = useState('');

  // ── Load existing data ──
  useEffect(() => {
    if (expense) {
      setAmount(expense.amount.toString());
      setCategory(expense.category);
      setDescription(expense.description || '');
      if (expense.date) {
        setExpenseDate(new Date(expense.date).toISOString().split('T')[0]);
      }
    } else if (bill) {
      setAmount(bill.amount.toString());
      setCategory(bill.category);
      setDescription(bill.name || '');
      if (bill.monthlyAmounts) {
        const entries: { [key: string]: string } = {};
        Object.entries(bill.monthlyAmounts).forEach(([month, amt]) => {
          entries[month] = amt.toString();
        });
        setMonthEntries(entries);
      }
    }
  }, [expense, bill]);

  // sync monthAmount input เมื่อเปลี่ยนเดือน
  useEffect(() => {
    setMonthAmount(monthEntries[viewMonth] || '');
  }, [viewMonth]);

  // ── Helpers ──
  const formatMonthLabel = (monthKey: string) => {
    const [y, m] = monthKey.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
  };

  const navigateViewMonth = (delta: number) => {
    const [y, m] = viewMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleSaveMonthEntry = () => {
    const amt = parseFloat(monthAmount.replace(/,/g, ''));
    if (!monthAmount || isNaN(amt) || amt <= 0) return;
    setMonthEntries((prev) => ({ ...prev, [viewMonth]: monthAmount }));
  };

  const handleRemoveMonthEntry = (month: string) => {
    setMonthEntries((prev) => {
      const next = { ...prev };
      delete next[month];
      return next;
    });
  };

  const showMsg = (msg: string) => {
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert('', msg);
  };

  // ── Save ──
  const handleSave = async () => {
    if (type === 'daily') {
      if (!amount || parseFloat(amount) <= 0) {
        showMsg('กรุณากรอกจำนวนเงินที่ถูกต้อง');
        return;
      }
    } else {
      if (Object.keys(monthEntries).length === 0) {
        showMsg('กรุณาบันทึกยอดอย่างน้อย 1 เดือน');
        return;
      }
    }

    try {
      if (type === 'daily') {
        const expenseData: Expense = {
          id: expense?.id || Date.now().toString(),
          amount: parseFloat(amount),
          category,
          description,
          date: new Date(expenseDate).toISOString(),
          type: 'daily',
        };
        if (isEditing && expense) {
          await updateExpense(expenseData);
        } else {
          await saveExpense(expenseData);
        }
        showMsg(isEditing ? 'แก้ไขรายจ่ายเรียบร้อย' : 'บันทึกรายจ่ายเรียบร้อย');
      } else {
        const parsedMonthly: { [key: string]: number } = {};
        Object.entries(monthEntries).forEach(([month, amtStr]) => {
          const v = parseFloat(amtStr);
          if (!isNaN(v) && v > 0) parsedMonthly[month] = v;
        });

        const billData: RecurringBill = {
          id: bill?.id || Date.now().toString(),
          name: description || category,
          amount: parseFloat(amount) || 0,
          category,
          monthlyAmounts: parsedMonthly,
        };
        if (isEditing && bill) {
          await updateRecurringBill(billData);
        } else {
          await saveRecurringBill(billData);
        }
        showMsg(isEditing ? 'แก้ไขรายจ่ายประจำเดือนเรียบร้อย' : 'บันทึกรายจ่ายประจำเดือนเรียบร้อย');
      }
      navigation.goBack();
    } catch {
      showMsg('ไม่สามารถบันทึกข้อมูลได้');
    }
  };

  const sortedEntries = Object.entries(monthEntries).sort(([a], [b]) => b.localeCompare(a));
  const totalSaved = sortedEntries.reduce((sum, [, v]) => sum + (parseFloat(v) || 0), 0);


  
  // ── Render ──
  return (
    <ScrollView style={styles.container}>
      <View
        style={[
          styles.content,
          isDesktop && { maxWidth: 600, alignSelf: 'center' as const, width: '100%' as any },
        ]}
      >
        {/* ── ชื่อ / รายละเอียด ── */}
        <Text style={styles.label}>{type === 'daily' ? 'รายละเอียด' : 'ชื่อรายการ'}</Text>
        <TextInput
          style={[styles.input, { minHeight: 56 }]}
          value={description}
          onChangeText={setDescription}
          placeholder={type === 'daily' ? '' : 'เช่น ค่าเช่าบ้าน, ค่าโทรศัพท์'}
          placeholderTextColor={COLORS.textSecondary}
        />

        {/* ── หมวดหมู่ ── */}
        <Text style={styles.label}>หมวดหมู่</Text>
        {isDesktop ? (
          <View style={styles.categoryScrollWrapper}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 }}>
              {EXPENSE_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryButton, { marginRight: 0 }, category === cat && styles.categoryButtonSelected]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.categoryText, category === cat && styles.categoryTextSelected]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.categoryScrollWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryContainer}
              contentContainerStyle={styles.categoryContentContainer}
              nestedScrollEnabled
            >
              {EXPENSE_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryButton, category === cat && styles.categoryButtonSelected]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.categoryText, category === cat && styles.categoryTextSelected]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ════════════ DAILY ════════════ */}
        {type === 'daily' && (
          <>
            <Text style={styles.label}>จำนวนเงิน (บาท)</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.label}>วันที่</Text>
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => setShowCalendar((v) => !v)}
            >
              <FontAwesome name="calendar" size={15} color={COLORS.primary} />
              <Text style={styles.datePickerText}>
                {new Date(expenseDate).toLocaleDateString('th-TH', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </Text>
              <FontAwesome name={showCalendar ? 'chevron-up' : 'chevron-down'} size={12} color={COLORS.textSecondary} />
            </TouchableOpacity>
            {showCalendar && (
              <View style={styles.calendarWrapper}>
                <Calendar
                  current={expenseDate}
                  markedDates={{ [expenseDate]: { selected: true, selectedColor: COLORS.primary } }}
                  onDayPress={(day: DateData) => { setExpenseDate(day.dateString); setShowCalendar(false); }}
                  theme={{
                    backgroundColor: COLORS.surface, calendarBackground: COLORS.surface,
                    textSectionTitleColor: COLORS.text, selectedDayBackgroundColor: COLORS.primary,
                    selectedDayTextColor: '#ffffff', todayTextColor: COLORS.primary,
                    dayTextColor: COLORS.text, textDisabledColor: COLORS.textSecondary,
                    monthTextColor: COLORS.text, arrowColor: COLORS.primary,
                    textMonthFontWeight: 'bold', textDayFontSize: 14, textMonthFontSize: 16,
                  }}
                />
              </View>
            )}
          </>
        )}

        {/* ════════════ RECURRING ════════════ */}
        {type === 'recurring' && (
          <>
            {/* ยอดอ้างอิง */}
            <Text style={styles.label}>ยอดอ้างอิง (บาท) — ไม่บังคับ</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="เช่น 8000 (ใช้เป็น placeholder ช่วยจำ)"
              placeholderTextColor={COLORS.textSecondary}
            />

            {/* Month navigator */}
            <Text style={styles.label}>เลือกเดือนและกรอกยอด</Text>

            <View style={styles.monthNavigator}>
              <TouchableOpacity onPress={() => navigateViewMonth(-1)} style={styles.monthNavBtn}>
                <FontAwesome name="chevron-left" size={16} color={COLORS.primary} />
              </TouchableOpacity>
              <View style={styles.monthNavCenter}>
                <Text style={styles.monthNavigatorLabel}>{formatMonthLabel(viewMonth)}</Text>
                {monthEntries[viewMonth] !== undefined && (
                  <View style={styles.monthSavedBadge}>
                    <FontAwesome name="check" size={9} color="#fff" />
                    <Text style={styles.monthSavedBadgeText}> บันทึกแล้ว</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => navigateViewMonth(1)} style={styles.monthNavBtn}>
                <FontAwesome name="chevron-right" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            {/* Amount input + save */}
            <View style={styles.monthAmountRow}>
              <TextInput
                style={[styles.input, styles.monthAmountInput]}
                value={monthAmount}
                onChangeText={setMonthAmount}
                keyboardType="decimal-pad"
                placeholder={amount ? `ปกติ ${amount} บาท` : 'ยอดเงิน (บาท)'}
                placeholderTextColor={COLORS.textSecondary}
              />
              <TouchableOpacity
                style={[styles.saveMonthBtn, !monthAmount && styles.saveMonthBtnDisabled]}
                onPress={handleSaveMonthEntry}
                disabled={!monthAmount}
              >
                <FontAwesome name="check" size={14} color="#fff" />
                <Text style={styles.saveMonthBtnText}> บันทึก</Text>
              </TouchableOpacity>
            </View>

            {/* Saved months list */}
            {sortedEntries.length > 0 ? (
              <View style={styles.savedMonthsContainer}>
                <View style={styles.savedMonthsHeader}>
                  <Text style={styles.savedMonthsTitle}>
                    บันทึกแล้ว {sortedEntries.length} เดือน
                  </Text>
                  <Text style={styles.savedMonthsTotal}>{formatCurrency(totalSaved)}</Text>
                </View>
                {sortedEntries.map(([month, amtStr]) => (
                  <View
                    key={month}
                    style={[styles.savedMonthRow, month === viewMonth && styles.savedMonthRowActive]}
                  >
                    <TouchableOpacity style={styles.savedMonthMain} onPress={() => setViewMonth(month)}>
                      <Text style={[styles.savedMonthLabel, month === viewMonth && styles.savedMonthLabelActive]}>
                        {formatMonthLabel(month)}
                      </Text>
                      <Text style={styles.savedMonthAmount}>{formatCurrency(parseFloat(amtStr))}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.removeMonthBtn} onPress={() => handleRemoveMonthEntry(month)}>
                      <FontAwesome name="trash" size={13} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.noEntriesHint}>
                ยังไม่มีรายการ — เลือกเดือนแล้วกรอกยอดและกด "บันทึก"
              </Text>
            )}
          </>
        )}

        {/* ── Save ── */}
        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>
            {isEditing ? 'บันทึกการแก้ไข' : 'บันทึก'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 24 },
  label: {
    fontSize: 10, fontWeight: '400', fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5, textTransform: 'uppercase', color: COLORS.textSecondary,
    marginBottom: 12, marginTop: 24,
  },
  input: {
    backgroundColor: COLORS.surface, borderRadius: 0, padding: 16,
    fontSize: 16, fontFamily: 'NotoSansThai_300Light',
    borderWidth: 1, borderColor: COLORS.border, color: COLORS.text,
  },
  categoryScrollWrapper: { marginVertical: 12 },
  categoryContainer: { flexGrow: 0 },
  categoryContentContainer: { paddingRight: 24, paddingVertical: 8 },
  categoryButton: {
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 0,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginRight: 12,
  },
  categoryButtonSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  categoryText: { fontSize: 12, fontWeight: '300', fontFamily: 'NotoSansThai_300Light', letterSpacing: 0.5, color: COLORS.text },
  categoryTextSelected: { color: '#ffffff', fontWeight: '400', fontFamily: 'NotoSansThai_400Regular' },

  // date picker
  datePickerButton: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  datePickerText: { flex: 1, fontSize: 16, fontFamily: 'NotoSansThai_300Light', color: COLORS.text },
  calendarWrapper: { borderWidth: 1, borderTopWidth: 0, borderColor: COLORS.border, backgroundColor: COLORS.surface },

  // month navigator
  monthNavigator: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  monthNavBtn: { padding: 16 },
  monthNavCenter: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12 },
  monthNavigatorLabel: {
    fontSize: 15, fontWeight: '600', fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.text, textAlign: 'center',
  },
  monthSavedBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.success, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99,
  },
  monthSavedBadgeText: { fontSize: 10, color: '#fff', fontFamily: 'NotoSansThai_300Light' },

  // month amount row
  monthAmountRow: { flexDirection: 'row', gap: 8, marginBottom: 16, alignItems: 'stretch' },
  monthAmountInput: { flex: 1 },
  saveMonthBtn: {
    backgroundColor: COLORS.primary, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  saveMonthBtnDisabled: { opacity: 0.35 },
  saveMonthBtnText: { color: '#fff', fontSize: 12, fontFamily: 'NotoSansThai_400Regular', letterSpacing: 0.5 },

  // saved months
  savedMonthsContainer: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  savedMonthsHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  savedMonthsTitle: {
    fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
    fontFamily: 'NotoSansThai_400Regular', color: COLORS.textSecondary,
  },
  savedMonthsTotal: { fontSize: 13, fontFamily: 'NotoSansThai_400Regular', color: COLORS.primary },
  savedMonthRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  savedMonthRowActive: { backgroundColor: `${COLORS.primary}18` },
  savedMonthMain: {
    flex: 1, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 14, paddingHorizontal: 16,
  },
  savedMonthLabel: { fontSize: 14, fontFamily: 'NotoSansThai_300Light', color: COLORS.text },
  savedMonthLabelActive: { color: COLORS.primary, fontFamily: 'NotoSansThai_400Regular' },
  savedMonthAmount: { fontSize: 14, fontFamily: 'NotoSansThai_300Light', color: COLORS.primary },
  removeMonthBtn: { padding: 16, borderLeftWidth: 1, borderLeftColor: COLORS.border },
  noEntriesHint: {
    textAlign: 'center', color: COLORS.textSecondary, fontSize: 12,
    fontFamily: 'NotoSansThai_300Light', paddingVertical: 24,
    borderWidth: 1, borderColor: COLORS.border,
  },

  // save button
  saveButton: {
    backgroundColor: COLORS.primary, borderRadius: 0, padding: 18,
    alignItems: 'center', marginTop: 40, borderWidth: 1, borderColor: COLORS.primary,
  },
  saveButtonText: {
    color: '#ffffff', fontSize: 12, fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular', letterSpacing: 2, textTransform: 'uppercase',
  },
});
