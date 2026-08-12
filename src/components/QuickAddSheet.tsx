// การ์ดเลื่อนขึ้นจากด้านล่าง สำหรับเพิ่มรายรับ/รายจ่าย โดยไม่ออกจากหน้าหลัก
//
// ทำไมไม่ push หน้า AddExpense/AddIncome เหมือนเดิม:
//   บันทึกรายจ่ายเป็นงานที่ทำวันละหลายครั้ง การเปลี่ยนหน้าทั้งจอแล้วเด้งกลับ
//   ทำให้เสียตำแหน่งที่เลื่อนอยู่บนปฏิทินทุกครั้ง — สองหน้านั้นยังอยู่ครบ
//   ใช้ตอน "แก้ไข" รายการเดิม กับตอนทำค่าใช้จ่ายประจำ (โหมด recurring)
//
// ⚠️ การ์ดใน Modal ต้องเป็น ScrollView + maxHeight (ดู CLAUDE.md §1.6)
//    public/index.html ตั้ง body { overflow: hidden } ไว้ ถ้าการ์ดสูงเกินจอ
//    ปุ่มบันทึกจะไปอยู่นอกจอแล้วกดไม่ได้เลย

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, DateData } from 'react-native-calendars';
import { Expense } from '../types';
import { saveExpense } from '../services/storage';
import { saveIncome, INCOME_CATEGORIES } from '../services/incomeStorage';
import { setPendingReturnDate } from '../services/pendingNavigation';
import { EXPENSE_CATEGORIES, COLORS, FONTS, formatCurrency, toChristianYear } from '../utils/constants';
import { notify } from '../utils/dialog';
import { pickAndScanReceipt } from '../utils/receiptScan';

type Mode = 'expense' | 'income';

const todayStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

const nowTime = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
};

export type QuickAddSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** วันที่ที่เลือกอยู่บนปฏิทิน — ว่าง = วันนี้ */
  defaultDate?: string;
  /** โหมดที่จะเปิดค้างไว้ครั้งแรก */
  defaultMode?: Mode;
  /** บันทึกสำเร็จแล้ว — หน้าหลักเอาไปโหลดข้อมูลใหม่ */
  onSaved: (date: string) => void;
};

export default function QuickAddSheet({
  visible,
  onClose,
  defaultDate,
  defaultMode = 'expense',
  onSaved,
}: QuickAddSheetProps) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [amount, setAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [incomeCategory, setIncomeCategory] = useState(INCOME_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(defaultDate || todayStr());
  const [time, setTime] = useState(nowTime);
  const [showCalendar, setShowCalendar] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);

  // เปิดการ์ดใหม่ทุกครั้ง = ฟอร์มเปล่าเสมอ ไม่งั้นยอดของรายการที่แล้วค้างอยู่
  // แล้วกดบันทึกซ้ำโดยไม่ตั้งใจได้ (วันที่ยึดตามวันที่เลือกบนปฏิทิน)
  useEffect(() => {
    if (!visible) return;
    setMode(defaultMode);
    setAmount('');
    setDescription('');
    setExpenseCategory(EXPENSE_CATEGORIES[0]);
    setIncomeCategory(INCOME_CATEGORIES[0]);
    setDate(defaultDate || todayStr());
    setTime(nowTime());
    setShowCalendar(false);
  }, [visible, defaultDate, defaultMode]);

  const handleTimeChange = (text: string) => {
    const digits = text.replace(/\D/g, '');
    if (digits.length <= 2) setTime(digits);
    else setTime(digits.slice(0, 2) + ':' + digits.slice(2, 4));
  };

  const applyScan = (useCamera: boolean) =>
    pickAndScanReceipt(useCamera, {
      onStart: () => setScanning(true),
      onDone: (r) => {
        setScanning(false);
        if (!r) return;
        if (r.amount) setAmount(r.amount);
        if (r.description) setDescription(r.description);
        if (r.category) setExpenseCategory(r.category);
        if (r.date) setDate(r.date);
      },
    });

  const handleScanReceipt = () => {
    if (Platform.OS === 'web') {
      applyScan(false);
      return;
    }
    Alert.alert('สแกนใบเสร็จ', 'เลือกตัวเลือก', [
      { text: 'ถ่ายรูป', onPress: () => applyScan(true) },
      { text: 'เลือกจากคลัง', onPress: () => applyScan(false) },
      { text: 'ยกเลิก', style: 'cancel' },
    ]);
  };

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(toChristianYear(dateStr));
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const handleSave = async () => {
    const parsed = parseFloat(amount.replace(/,/g, ''));
    if (!amount || isNaN(parsed) || parsed <= 0) {
      notify('กรุณากรอกจำนวนเงินที่ถูกต้อง', 'ข้อผิดพลาด');
      return;
    }
    const timeStr = /^([01]\d|2[0-3]):([0-5]\d)$/.test(time) ? time : '00:00';
    const iso = new Date(`${date}T${timeStr}:00`).toISOString();
    setSaving(true);
    try {
      if (mode === 'expense') {
        const entry: Expense = {
          id: Date.now().toString(),
          amount: parsed,
          category: expenseCategory,
          description: description.trim(),
          date: iso,
          type: 'daily',
        };
        await saveExpense(entry);
        notify('บันทึกรายจ่ายแล้ว');
      } else {
        await saveIncome({
          id: Date.now().toString(),
          amount: parsed,
          category: incomeCategory,
          description: description.trim(),
          date: iso,
        });
        notify('บันทึกรายรับแล้ว');
      }
      // ช่องทางเดียวกับหน้าเพิ่มรายการเต็มจอ — หน้าหลักอ่านค่านี้ตอนโหลดใหม่
      // แล้วเด้งปฏิทินไปที่วันที่เพิ่งบันทึก (ไม่งั้นบันทึกย้อนหลังแล้วไม่เห็นว่าเข้าไหม)
      setPendingReturnDate(date);
      onSaved(date);
      onClose();
    } catch (e: any) {
      notify(`บันทึกไม่สำเร็จ\n${e?.message || e}`, 'ข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const isExpense = mode === 'expense';
  const accent = isExpense ? COLORS.primary : COLORS.success;
  const categories = isExpense ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const category = isExpense ? expenseCategory : incomeCategory;
  const setCategory = isExpense ? setExpenseCategory : setIncomeCategory;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* พื้นหลังกดปิดได้ แต่ตัวการ์ดต้องไม่รับ press ต่อ ไม่งั้นกดในฟอร์มแล้วปิดเอง */}
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          {/* ── สลับรายจ่าย/รายรับ ── */}
          <View style={styles.tabRow}>
            {(['expense', 'income'] as Mode[]).map((m) => {
              const active = mode === m;
              const color = m === 'expense' ? COLORS.primary : COLORS.success;
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.tab, active && { borderColor: color, backgroundColor: `${color}12` }]}
                  onPress={() => setMode(m)}
                >
                  <Ionicons
                    name={m === 'expense' ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'}
                    size={16}
                    color={active ? color : COLORS.textSecondary}
                  />
                  <Text style={[styles.tabText, active && { color }]}>
                    {m === 'expense' ? 'รายจ่าย' : 'รายรับ'}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── สแกนใบเสร็จ (เฉพาะรายจ่าย) ── */}
            {isExpense && (
              <TouchableOpacity
                style={[styles.scanBtn, scanning && { opacity: 0.6 }]}
                onPress={handleScanReceipt}
                disabled={scanning}
              >
                {scanning ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Ionicons name="scan-outline" size={16} color={COLORS.primary} />
                )}
                <Text style={styles.scanBtnText}>
                  {scanning ? ' กำลังอ่านใบเสร็จ...' : ' สแกนใบเสร็จ'}
                </Text>
              </TouchableOpacity>
            )}

            {/* ── จำนวนเงิน ── */}
            <Text style={styles.label}>จำนวนเงิน (฿)</Text>
            <TextInput
              style={[styles.input, styles.amountInput, { color: accent }]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={COLORS.textSecondary}
              autoFocus={Platform.OS === 'web'}
            />
            {amount !== '' && !isNaN(parseFloat(amount)) && (
              <Text style={styles.amountPreview}>{formatCurrency(parseFloat(amount))}</Text>
            )}

            {/* ── หมวดหมู่ ── */}
            <Text style={styles.label}>หมวดหมู่</Text>
            <View style={styles.chipWrap}>
              {categories.map((cat) => {
                const active = category === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.chip,
                      active && { borderColor: accent, backgroundColor: `${accent}18` },
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.chipText, active && { color: accent, fontFamily: FONTS.medium }]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── รายละเอียด ── */}
            <Text style={styles.label}>รายละเอียด</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="ไม่บังคับ"
              placeholderTextColor={COLORS.textSecondary}
            />

            {/* ── วันที่ + เวลา ── */}
            <View style={styles.dateTimeRow}>
              <View style={styles.dateCol}>
                <Text style={styles.label}>วันที่</Text>
                <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowCalendar((v) => !v)}>
                  <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
                  <Text style={styles.pickerBtnText} numberOfLines={1}>
                    {' '}
                    {formatDateLabel(date)}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.timeCol}>
                <Text style={styles.label}>เวลา</Text>
                <View style={styles.pickerBtn}>
                  <Ionicons name="time-outline" size={14} color={COLORS.textSecondary} />
                  <TextInput
                    style={styles.timeInput}
                    value={time}
                    onChangeText={handleTimeChange}
                    keyboardType="numeric"
                    placeholder="HH:MM"
                    placeholderTextColor={COLORS.textSecondary}
                    maxLength={5}
                  />
                </View>
              </View>
            </View>

            {showCalendar && (
              <Calendar
                current={date}
                onDayPress={(day: DateData) => {
                  setDate(day.dateString);
                  setShowCalendar(false);
                }}
                markedDates={{ [date]: { selected: true, selectedColor: accent } }}
                theme={{
                  backgroundColor: COLORS.surface,
                  calendarBackground: COLORS.surface,
                  textSectionTitleColor: COLORS.textSecondary,
                  selectedDayBackgroundColor: accent,
                  selectedDayTextColor: '#ffffff',
                  todayTextColor: accent,
                  dayTextColor: COLORS.text,
                  textDisabledColor: COLORS.border,
                  monthTextColor: COLORS.text,
                  arrowColor: COLORS.text,
                }}
                style={styles.calendar}
              />
            )}
          </ScrollView>

          {/* ปุ่มบันทึกอยู่นอก ScrollView — ต้องเห็นตลอดไม่ว่าฟอร์มจะยาวแค่ไหน */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: accent }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.saveBtnText}>
                บันทึก{isExpense ? 'รายจ่าย' : 'รายรับ'}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.footNote}>
            ค่าใช้จ่ายประจำและการแก้ไขรายการเดิม ยังทำที่หน้าเต็มเหมือนเดิม
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  backdropFill: { flex: 1 },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 20,
    paddingBottom: 20,
    // ไม่เต็มจอตามที่ตั้งใจ — ยังเห็นหน้าหลักด้านหลังว่ากำลังบันทึกให้วันไหน
    maxHeight: '88%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginTop: 10,
    marginBottom: 12,
  },

  tabRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  tab: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  tabText: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.textSecondary },
  closeBtn: { padding: 8 },

  body: { flexGrow: 0 },
  bodyContent: { paddingTop: 14, paddingBottom: 8, gap: 8 },

  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    marginBottom: 6,
  },
  scanBtnText: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.primary },

  label: {
    fontSize: 10,
    fontFamily: FONTS.regular,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  input: {
    minWidth: 0,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: FONTS.light,
    color: COLORS.text,
  },
  amountInput: { fontSize: 22, fontFamily: FONTS.medium },
  amountPreview: { fontSize: 12, fontFamily: FONTS.light, color: COLORS.textSecondary },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipText: { fontSize: 12, fontFamily: FONTS.light, color: COLORS.textSecondary },

  dateTimeRow: { flexDirection: 'row', gap: 10 },
  // flex + minWidth:0 คู่กันบังคับ — ช่องเวลาเป็น <input> บนเว็บ ย่อไม่ลงถ้าไม่ใส่ (CLAUDE.md §1.4)
  dateCol: { flex: 2, minWidth: 0 },
  timeCol: { flex: 1, minWidth: 0 },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 6,
  },
  pickerBtnText: { flex: 1, minWidth: 0, fontSize: 13, fontFamily: FONTS.light, color: COLORS.text },
  timeInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    fontSize: 13,
    fontFamily: FONTS.light,
    color: COLORS.text,
  },
  calendar: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, marginTop: 8 },

  saveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 12,
  },
  saveBtnText: { color: '#ffffff', fontSize: 14, fontFamily: FONTS.semibold },
  footNote: {
    fontSize: 10,
    fontFamily: FONTS.light,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
});
