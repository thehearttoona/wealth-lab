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
import { RootStackParamList, Expense, RecurringBill } from '../types';
import { saveExpense, updateExpense, saveRecurringBill, updateRecurringBill } from '../services/storage';
import { EXPENSE_CATEGORIES, COLORS } from '../utils/constants';
import { useResponsive } from '../utils/responsive';

type AddExpenseScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'AddExpense'
>;
type AddExpenseScreenRouteProp = RouteProp<RootStackParamList, 'AddExpense'>;

export default function AddExpenseScreen() {
  const navigation = useNavigation<AddExpenseScreenNavigationProp>();
  const route = useRoute<AddExpenseScreenRouteProp>();
  const { type, expense, bill } = route.params;
  const { isDesktop } = useResponsive();

  const isEditing = !!(expense || bill);
  const editingData = expense || bill;

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [dueDay, setDueDay] = useState('1');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [customAmount, setCustomAmount] = useState('');
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayLocal = `${yyyy}-${mm}-${dd}`;
  const [expenseDate, setExpenseDate] = useState(() => todayLocal);
  console.log(expenseDate);
  // console.log('AddExpenseScreen render', { type, expense, bill });
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
      setDueDay(bill.dueDay.toString());
      // โหลดจำนวนเงิน custom ของเดือนที่เลือก (ถ้ามี)
      if (bill.monthlyAmounts && bill.monthlyAmounts[selectedMonth]) {
        setCustomAmount(bill.monthlyAmounts[selectedMonth].toString());
      }
    }
  }, [expense, bill, selectedMonth]);

  
  const handleSave = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      if (Platform.OS === 'web') {
        window.alert('กรุณากรอกจำนวนเงินที่ถูกต้อง');
      } else {
        Alert.alert('ข้อผิดพลาด', 'กรุณากรอกจำนวนเงินที่ถูกต้อง');
      }
      return;
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
          if (Platform.OS === 'web') {
            window.alert('แก้ไขรายจ่ายเรียบร้อย');
          } else {
            Alert.alert('สำเร็จ', 'แก้ไขรายจ่ายเรียบร้อย');
          }
        } else {
          await saveExpense(expenseData);
          if (Platform.OS === 'web') {
            window.alert('บันทึกรายจ่ายเรียบร้อย');
          } else {
            Alert.alert('สำเร็จ', 'บันทึกรายจ่ายเรียบร้อย');
          }
        }
      } else {
        const existingMonthlyAmounts = bill?.monthlyAmounts || {};
        const monthlyAmounts = { ...existingMonthlyAmounts };

        // ถ้ามีการกำหนด custom amount ให้บันทึก
        if (customAmount && parseFloat(customAmount) !== parseFloat(amount)) {
          monthlyAmounts[selectedMonth] = parseFloat(customAmount);
        } else if (monthlyAmounts[selectedMonth]) {
          // ถ้าไม่มี custom amount แล้วแต่เคยมี ให้ลบออก
          delete monthlyAmounts[selectedMonth];
        }

        const billData: RecurringBill = {
          id: bill?.id || Date.now().toString(),
          name: description || category,
          amount: parseFloat(amount),
          category,
          dueDay: parseInt(dueDay),
          isActive: bill?.isActive ?? true,
          monthlyAmounts: Object.keys(monthlyAmounts).length > 0 ? monthlyAmounts : undefined,
        };

        if (isEditing && bill) {
          await updateRecurringBill(billData);
          if (Platform.OS === 'web') {
            window.alert('แก้ไขรายจ่ายประจำเดือนเรียบร้อย');
          } else {
            Alert.alert('สำเร็จ', 'แก้ไขรายจ่ายประจำเดือนเรียบร้อย');
          }
        } else {
          await saveRecurringBill(billData);
          if (Platform.OS === 'web') {
            window.alert('บันทึกรายจ่ายประจำเดือนเรียบร้อย');
          } else {
            Alert.alert('สำเร็จ', 'บันทึกรายจ่ายประจำเดือนเรียบร้อย');
          }
        }
      }
      navigation.goBack();
    } catch (error) {
      if (Platform.OS === 'web') {
        window.alert('ไม่สามารถบันทึกข้อมูลได้');
      } else {
        Alert.alert('ข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้');
      }
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={[
        styles.content,
        isDesktop && { maxWidth: 600, alignSelf: 'center' as const, width: '100%' as any },
      ]}>
        <Text style={styles.label}>จำนวนเงิน (บาท)</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="0.00"
          placeholderTextColor={COLORS.textSecondary}
        />

        <Text style={styles.label}>หมวดหมู่</Text>
        {isDesktop ? (
          <View style={styles.categoryScrollWrapper}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 }}>
              {EXPENSE_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryButton,
                    { marginRight: 0 },
                    category === cat && styles.categoryButtonSelected,
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      category === cat && styles.categoryTextSelected,
                    ]}
                  >
                    {cat}
                  </Text>
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
              nestedScrollEnabled={true}
            >
              {EXPENSE_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryButton,
                    category === cat && styles.categoryButtonSelected,
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      category === cat && styles.categoryTextSelected,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <Text style={styles.label}>
          {type === 'daily' ? 'รายละเอียด' : 'ชื่อรายการ'}
        </Text>
        <TextInput
          style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
          value={description}
          onChangeText={setDescription}
          placeholder={type === 'daily' ? '' : 'เช่น ค่าเช่าบ้าน, ค่าโทรศัพท์'}
          placeholderTextColor={COLORS.textSecondary}
          multiline
          numberOfLines={4}
        />

        {type === 'daily' && (
          <>
            <Text style={styles.label}>วันที่</Text>
            <TextInput
              style={styles.input}
              value={expenseDate}
              onChangeText={setExpenseDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.textSecondary}
            />
            <Text style={styles.hintText}>
              รูปแบบ: ปี-เดือน-วัน (เช่น 2026-01-30)
            </Text>
          </>
        )}
    
        {type === 'recurring' && (
          <>
            <Text style={styles.label}>วันที่ต้องจ่ายในแต่ละเดือน</Text>
            <TextInput
              style={styles.input}
              value={dueDay}
              onChangeText={setDueDay}
              keyboardType="numeric"
              placeholder="1-31"
              placeholderTextColor={COLORS.textSecondary}
            />

            {isEditing && bill && (
              <>
                <View style={styles.monthSection}>
                  <Text style={styles.label}>กำหนดยอดเงินสำหรับเดือนนี้</Text>
                  <View style={styles.monthSelector}>
                    <TouchableOpacity
                      onPress={() => {
                        const [year, month] = selectedMonth.split('-').map(Number);
                        const date = new Date(year, month - 1 - 1, 1);
                        setSelectedMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
                      }}
                      style={styles.monthArrow}
                    >
                      <FontAwesome name="chevron-left" size={16} color={COLORS.primary} />
                    </TouchableOpacity>
                    <Text style={styles.selectedMonthText}>
                      {(() => {
                        const [year, month] = selectedMonth.split('-').map(Number);
                        const date = new Date(year, month - 1, 1);
                        return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
                      })()}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        const [year, month] = selectedMonth.split('-').map(Number);
                        const date = new Date(year, month - 1 + 1, 1);
                        setSelectedMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
                      }}
                      style={styles.monthArrow}
                    >
                      <FontAwesome name="chevron-right" size={16} color={COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.label}>ยอดเงินเดือนนี้ (ปล่อยว่างถ้าเหมือนปกติ)</Text>
                <TextInput
                  style={styles.input}
                  value={customAmount}
                  onChangeText={setCustomAmount}
                  keyboardType="decimal-pad"
                  placeholder={`ปกติ: ${amount} บาท`}
                  placeholderTextColor={COLORS.textSecondary}
                />
                <Text style={styles.hintText}>
                  หมายเหตุ: ถ้าต้องการปรับยอดเงินเฉพาะเดือนนี้ ให้กรอกจำนวนใหม่ ไม่เช่นนั้นจะใช้ยอดเงินปกติ
                </Text>
              </>
            )}
          </>
        )}

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
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 24,
  },
  label: {
    fontSize: 10,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
    marginBottom: 12,
    marginTop: 24,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    padding: 16,
    fontSize: 16,
    fontFamily: 'NotoSansThai_300Light',
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
  },
  categoryScrollWrapper: {
    marginVertical: 12,
  },
  categoryContainer: {
    flexGrow: 0,
  },
  categoryContentContainer: {
    paddingRight: 24,
    paddingVertical: 8,
  },
  categoryButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 0,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 12,
  },
  categoryButtonSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 0.5,
    color: COLORS.text,
  },
  categoryTextSelected: {
    color: '#ffffff',
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 0,
    padding: 18,
    alignItems: 'center',
    marginTop: 40,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  monthSection: {
    marginTop: 16,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 16,
  },
  monthArrow: {
    padding: 8,
  },
  selectedMonthText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
    minWidth: 150,
    textAlign: 'center',
  },
  hintText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 8,
    lineHeight: 16,
  },
});
