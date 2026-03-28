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
  ActivityIndicator,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Calendar, DateData } from 'react-native-calendars';
import { RootStackParamList, Expense, RecurringBill } from '../types';
import { saveExpense, updateExpense, saveRecurringBill, updateRecurringBill } from '../services/storage';
import { setPendingReturnDate } from '../services/pendingNavigation';
import { EXPENSE_CATEGORIES, COLORS, formatCurrency, toChristianYear } from '../utils/constants';
import { useResponsive } from '../utils/responsive';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../services/supabase';

type AddExpenseScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AddExpense'>;
type AddExpenseScreenRouteProp = RouteProp<RootStackParamList, 'AddExpense'>;

// แปลงวันที่จาก OCR ที่อาจอ่านปีพ.ศ.ผิด
// case: "69"   → 2-digit BE → 2026
// case: "2569" → full BE    → 2026
// case: "2069" → AI เติม 2000 หน้าเลข BE 2 หลัก → 2026
const normalizeScanDate = (dateStr: string): string => {
  if (!dateStr) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  let year = parseInt(parts[0], 10);
  if (isNaN(year)) return dateStr;
  const currentYear = new Date().getFullYear();
  if (year < 100) {
    // เช่น "69" → 69 + 2500 - 543 = 2026
    year = year + 2500 - 543;
  } else if (year > 2400) {
    // เช่น "2569" → 2569 - 543 = 2026
    year = year - 543;
  } else if (year > currentYear + 20 && year < 2200) {
    // AI เติม 2000 หน้า 2-digit BE เช่น "2069" (= 2000 + 69) → 2069 - 43 = 2026
    year = year - 43;
  }
  return `${year}-${parts[1]}-${parts[2]}`;
};

export default function AddExpenseScreen() {
  const navigation = useNavigation<AddExpenseScreenNavigationProp>();
  const route = useRoute<AddExpenseScreenRouteProp>();
  const { type, expense, bill, date: paramDate } = route.params;
  const { isDesktop } = useResponsive();

  const isEditing = !!(expense || bill);

  // ── OCR ──
  const [scanning, setScanning] = useState(false);

  const scanWithSupabase = async (image_base64: string, media_type: string) => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('scan-receipt', {
        body: { image_base64, media_type },
      });
      if (error) throw error;
      if (data.success) {
        console.log('[scan] raw date from OCR:', data.date);
        if (data.amount) setAmount(data.amount.toString());
        if (data.description) setDescription(data.description);
        if (data.category && EXPENSE_CATEGORIES.includes(data.category)) setCategory(data.category);
        if (data.date) setExpenseDate(normalizeScanDate(data.date));
      } else {
        showMsg(data.error || 'ไม่สามารถอ่านข้อมูลจากรูปได้');
      }
    } catch (err: any) {
      showMsg('Error: ' + (err?.message || JSON.stringify(err) || 'unknown'));
    } finally {
      setScanning(false);
    }
  };

  const pickAndScan = async (useCamera: boolean) => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      if (useCamera) input.capture = 'environment';
      input.onchange = async (e: any) => {
        const file: File = e.target.files?.[0];
        document.body.removeChild(input);
        if (!file) return;
        setScanning(true);
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          // resize ด้วย Canvas ก่อนส่ง — ลดขนาดรูปให้ไม่เกิน 1024px
          const resized = await new Promise<string>((resolve) => {
            const img = new (window as any).Image();
            img.onload = () => {
              const MAX = 1024;
              let w = img.width, h = img.height;
              if (w > h ? w > MAX : h > MAX) {
                if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
                else { w = Math.round(w * MAX / h); h = MAX; }
              }
              const canvas = document.createElement('canvas');
              canvas.width = w; canvas.height = h;
              canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
              resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.src = dataUrl;
          });
          const base64 = resized.split(',')[1];
          await scanWithSupabase(base64, 'image/jpeg');
        } catch (err: any) {
          showMsg('อ่านไฟล์ไม่ได้: ' + (err?.message || ''));
          setScanning(false);
        }
      };
      document.body.appendChild(input);
      input.click();
    } else {
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { showMsg('กรุณาอนุญาตใช้กล้อง'); return; }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'], quality: 0.4, exif: false, base64: true,
        });
        if (!result.canceled && result.assets[0]) {
          await scanWithSupabase(result.assets[0].base64!, result.assets[0].mimeType || 'image/jpeg');
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { showMsg('กรุณาอนุญาตเข้าถึงรูปภาพ'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'], quality: 0.4, exif: false, base64: true,
        });
        if (!result.canceled && result.assets[0]) {
          await scanWithSupabase(result.assets[0].base64!, result.assets[0].mimeType || 'image/jpeg');
        }
      }
    }
  };

  const handleScanReceipt = async () => {
    if (Platform.OS === 'web') {
      await pickAndScan(false);
    } else {
      Alert.alert('สแกนใบเสร็จ', 'เลือกตัวเลือก', [
        { text: 'ถ่ายรูป', onPress: () => pickAndScan(true) },
        { text: 'เลือกจากคลัง', onPress: () => pickAndScan(false) },
        { text: 'ยกเลิก', style: 'cancel' },
      ]);
    }
  };

  // ── Shared ──
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState('');

  // ── Daily ──
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const todayLocal = `${yyyy}-${mm}-${String(now.getDate()).padStart(2, '0')}`;
  const [expenseDate, setExpenseDate] = useState(() => paramDate || todayLocal);
  const [expenseTime, setExpenseTime] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  });
  const [showCalendar, setShowCalendar] = useState(false);

  const handleTimeChange = (text: string) => {
    const digits = text.replace(/\D/g, '');
    if (digits.length <= 2) setExpenseTime(digits);
    else setExpenseTime(digits.slice(0, 2) + ':' + digits.slice(2, 4));
  };

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
        const d = new Date(expense.date);
        setExpenseDate(d.toISOString().split('T')[0]);
        setExpenseTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
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
    const year = y > 2400 ? y - 543 : y;
    return new Date(year, m - 1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
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
        showMsg('กรุณาบันทึกอย่างน้อย 1 เดือน');
        return;
      }
    }

    try {
      if (type === 'daily') {
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        const timeStr = timeRegex.test(expenseTime) ? expenseTime : '00:00';
        const expenseData: Expense = {
          id: expense?.id || Date.now().toString(),
          amount: parseFloat(amount),
          category,
          description,
          date: new Date(`${expenseDate}T${timeStr}:00`).toISOString(),
          type: 'daily',
        };
        if (isEditing && expense) {
          await updateExpense(expenseData);
        } else {
          await saveExpense(expenseData);
        }
        showMsg(isEditing ? 'แก้ไขรายจ่ายแล้ว' : 'บันทึกรายจ่ายแล้ว');
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
        showMsg(isEditing ? 'แก้ไขรายการแล้ว' : 'บันทึกรายการแล้ว');
      }
      if (type === 'daily') {
        setPendingReturnDate(expenseDate);
      }
      navigation.goBack();
    } catch {
      showMsg('บันทึกไม่สำเร็จ กรุณาลองใหม่');
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
        {/* ════════════ DAILY ════════════ */}
        {type === 'daily' && (
          <>
            {/* ── Scan Receipt ── */}
            <TouchableOpacity
              style={[styles.scanButton, scanning && styles.scanButtonDisabled]}
              onPress={handleScanReceipt}
              disabled={scanning}
            >
              {scanning ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <FontAwesome name="camera" size={14} color={COLORS.primary} />
              )}
              <Text style={styles.scanButtonText}>
                {scanning ? 'กำลังอ่านใบเสร็จ...' : 'สแกนใบเสร็จ'}
              </Text>
            </TouchableOpacity>

            {/* ── Amount ── */}
            <Text style={styles.label}>จำนวนเงิน (฿)</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={COLORS.textSecondary}
            />
          </>
        )}

        {/* ── Category ── */}
        <Text style={styles.label}>หมวดหมู่</Text>
        <View style={styles.categoryGrid}>
          {EXPENSE_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.categoryChipText, category === cat && styles.categoryChipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Description ── */}
        <Text style={styles.label}>{type === 'daily' ? 'รายละเอียด' : 'ชื่อรายการ'}</Text>
        <TextInput
          style={[styles.input, { minHeight: 56 }]}
          value={description}
          onChangeText={setDescription}
          placeholder={type === 'daily' ? '' : 'เช่น ค่าเช่าบ้าน, ค่าโทรศัพท์'}
          placeholderTextColor={COLORS.textSecondary}
        />

        {/* ── Daily: Date ── */}
        {type === 'daily' && (
          <>
            <Text style={styles.label}>วันที่</Text>
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => setShowCalendar((v) => !v)}
            >
              <FontAwesome name="calendar" size={15} color={COLORS.primary} />
              <Text style={styles.datePickerText}>
                {new Date(toChristianYear(expenseDate)).toLocaleDateString('en-US', {
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

            <Text style={styles.label}>เวลา</Text>
            <View style={styles.timeRow}>
              <FontAwesome name="clock-o" size={15} color={COLORS.primary} style={styles.timeIcon} />
              <TextInput
                style={styles.timeInput}
                value={expenseTime}
                onChangeText={handleTimeChange}
                keyboardType="numeric"
                placeholder="HH:MM"
                placeholderTextColor={COLORS.textSecondary}
                maxLength={5}
              />
            </View>
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
            <Text style={styles.label}>เลือกเดือน & กรอกยอด</Text>

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
                ยังไม่มีข้อมูล — เลือกเดือน กรอกยอด แล้วกด "บันทึก"
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
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 12,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  categoryChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}20`,
  },
  categoryChipText: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  categoryChipTextActive: {
    color: COLORS.primary,
    fontFamily: 'NotoSansThai_400Regular',
  },

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

  // time picker
  timeRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  timeIcon: { paddingHorizontal: 16 },
  timeInput: {
    flex: 1, padding: 16, fontSize: 16,
    fontFamily: 'NotoSansThai_300Light', color: COLORS.text,
  },

  // scan button
  scanButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.primary, borderStyle: 'dashed',
    backgroundColor: `${COLORS.primary}10`,
  },
  scanButtonDisabled: { opacity: 0.5 },
  scanButtonText: {
    color: COLORS.primary, fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular', letterSpacing: 0.5,
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
