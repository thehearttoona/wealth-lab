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
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Calendar, DateData } from 'react-native-calendars';
import { RootStackParamList } from '../types';
import { saveIncome, updateIncome, deleteIncome, INCOME_CATEGORIES } from '../services/incomeStorage';
import { setPendingReturnDate } from '../services/pendingNavigation';
import { COLORS, formatCurrency, toChristianYear } from '../utils/constants';
import { useResponsive } from '../utils/responsive';

type AddIncomeNavProp = NativeStackNavigationProp<RootStackParamList, 'AddIncome'>;
type AddIncomeRouteProp = RouteProp<RootStackParamList, 'AddIncome'>;

export default function AddIncomeScreen() {
  const navigation = useNavigation<AddIncomeNavProp>();
  const route = useRoute<AddIncomeRouteProp>();
  console.log(route.params);
  const { income, date: paramDate } = route.params;
  const { isDesktop } = useResponsive();

  const isEditing = !!income;

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(INCOME_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(paramDate || todayStr);
  const [time, setTime] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  });
  const [showCalendar, setShowCalendar] = useState(false);

  const handleTimeChange = (text: string) => {
    const digits = text.replace(/\D/g, '');
    if (digits.length <= 2) setTime(digits);
    else setTime(digits.slice(0, 2) + ':' + digits.slice(2, 4));
  };

  useEffect(() => {
    if (income) {
      setAmount(income.amount.toString());
      setCategory(income.category);
      setDescription(income.description || '');
      const d = new Date(income.date);
      // support both YYYY-MM-DD (old) and ISO string (new)
      setDate(income.date.length === 10 ? income.date : d.toISOString().split('T')[0]);
      if (income.date.length > 10) {
        setTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      }
    }
  }, [income]);

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(toChristianYear(dateStr));
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const handleSave = async () => {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      Alert.alert('ข้อผิดพลาด', 'กรุณากรอกจำนวนเงินที่ถูกต้อง');
      return;
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const timeStr = timeRegex.test(time) ? time : '00:00';
    const entry = {
      id: income?.id ?? Date.now().toString(),
      amount: parsed,
      category,
      description: description.trim(),
      date: new Date(`${date}T${timeStr}:00`).toISOString(),
    };
    console.log('Saving income:', entry);

    if (isEditing) {
      await updateIncome(entry);
    } else {
      await saveIncome(entry);
    }
    setPendingReturnDate(date);
    navigation.goBack();
  };

  const handleDelete = () => {
    if (!income) return;
    const doDelete = async () => {
      await deleteIncome(income.id);
      navigation.goBack();
    };
    if (Platform.OS === 'web') {
      if (window.confirm('คุณต้องการลบรายรับนี้ใช่หรือไม่?')) doDelete();
    } else {
      Alert.alert('ลบรายรับ', 'คุณต้องการลบรายรับนี้ใช่หรือไม่?', [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ลบ', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const calendarTheme = {
    backgroundColor: COLORS.surface,
    calendarBackground: COLORS.surface,
    textSectionTitleColor: COLORS.text,
    selectedDayBackgroundColor: COLORS.accent,
    selectedDayTextColor: '#ffffff',
    todayTextColor: COLORS.accent,
    dayTextColor: COLORS.text,
    textDisabledColor: COLORS.textSecondary,
    monthTextColor: COLORS.text,
    arrowColor: COLORS.text,
    textMonthFontWeight: 'bold' as const,
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={isDesktop ? styles.desktopInner : undefined}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={16} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEditing ? 'แก้ไขรายรับ' : 'เพิ่มรายรับ'}
          </Text>
        </View>

        <View style={styles.form}>

          {/* ── Amount ── */}
          <View style={styles.field}>
            <Text style={styles.label}>จำนวนเงิน (฿)</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={COLORS.textSecondary}
            />
            {amount !== '' && !isNaN(parseFloat(amount)) && (
              <Text style={styles.amountPreview}>{formatCurrency(parseFloat(amount))}</Text>
            )}
          </View>

          {/* ── Category ── */}
          <View style={styles.field}>
            <Text style={styles.label}>หมวดหมู่</Text>
            <View style={styles.categoryGrid}>
              {INCOME_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.categoryChipText, category === cat && styles.categoryChipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Description ── */}
          <View style={styles.field}>
            <Text style={styles.label}>รายละเอียด</Text>
            <TextInput
              style={[styles.input, { minHeight: 56 }]}
              value={description}
              onChangeText={setDescription}
              placeholder="ไม่บังคับ"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          {/* ── Date ── */}
          <View style={styles.field}>
            <Text style={styles.label}>วันที่</Text>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setShowCalendar(!showCalendar)}
            >
              <Text style={styles.dateBtnText}> {formatDateLabel(date)}</Text>
              <Ionicons
                name={showCalendar ? 'chevron-up' : 'chevron-down'}
                size={10}
                color={COLORS.textSecondary}
                style={{ marginLeft: 'auto' }}
              />
            </TouchableOpacity>

            {showCalendar && (
              <Calendar
                current={date}
                onDayPress={(day: DateData) => {
                  setDate(day.dateString);
                  setShowCalendar(false);
                }}
                markedDates={{ [date]: { selected: true, selectedColor: COLORS.accent } }}
                theme={calendarTheme}
                style={styles.calendar}
              />
            )}
          </View>

          {/* ── Time ── */}
          <View style={styles.field}>
            <Text style={styles.label}>เวลา</Text>
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={15} color={COLORS.accent} style={styles.timeIcon} />
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

          {/* ── Buttons ── */}
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>
              บันทึก
            </Text>
          </TouchableOpacity>

          {isEditing && (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={14} color={COLORS.error} />
              <Text style={styles.deleteBtnText}> ลบรายรับ</Text>
            </TouchableOpacity>
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
  desktopInner: {
    alignSelf: 'center' as const,
    width: '100%',
    maxWidth: 640,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: COLORS.success,
    gap: 12,
  },
  backBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'NotoSansThai_400Regular',
    color: '#ffffff',
  },

  // ── Form ──
  form: {
    padding: 24,
    gap: 28,
  },
  field: {
    gap: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 0,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: COLORS.text,
    fontSize: 16,
    fontFamily: 'NotoSansThai_300Light',
  },
  amountPreview: {
    fontSize: 13,
    color: COLORS.accent,
    fontFamily: 'NotoSansThai_300Light',
  },

  // ── Category grid ──
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  categoryChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: `${COLORS.accent}20`,
  },
  categoryChipText: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  categoryChipTextActive: {
    color: COLORS.accent,
    fontFamily: 'NotoSansThai_400Regular',
  },

  // ── Date picker ──
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateBtnText: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.text,
  },
  calendar: {
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
    paddingVertical:24
  },

  // ── Time picker ──
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timeIcon: { paddingHorizontal: 16 },
  timeInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.text,
  },

  // ── Buttons ──
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    marginTop: 8,
    gap: 8,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.error,
    paddingVertical: 14,
    gap: 8,
  },
  deleteBtnText: {
    color: COLORS.error,
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
