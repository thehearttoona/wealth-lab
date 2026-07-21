import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, InstallmentPlan } from '../types';
import { saveInstallmentPlan, updateInstallmentPlan } from '../services/installmentStorage';
import { EXPENSE_CATEGORIES, COLORS, formatCurrency } from '../utils/constants';
import { getCurrentMonthKey, addMonths } from '../utils/installments';
import { useResponsive } from '../utils/responsive';

type AddInstallmentScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AddInstallment'>;
type AddInstallmentScreenRouteProp = RouteProp<RootStackParamList, 'AddInstallment'>;

export default function AddInstallmentScreen() {
  const navigation = useNavigation<AddInstallmentScreenNavigationProp>();
  const route = useRoute<AddInstallmentScreenRouteProp>();
  const { plan } = route.params || {};
  const { isDesktop } = useResponsive();
  const isEditing = !!plan;

  const [name, setName] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [totalAmount, setTotalAmount] = useState('');
  const [isInstallment, setIsInstallment] = useState(false);
  const [totalMonths, setTotalMonths] = useState('3');
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [monthlyAmountTouched, setMonthlyAmountTouched] = useState(false);
  const [startMonth, setStartMonth] = useState(getCurrentMonthKey());

  useEffect(() => {
    if (plan) {
      setName(plan.name);
      setCategory(plan.category);
      setTotalAmount(plan.totalAmount.toString());
      setIsInstallment(plan.totalMonths > 1);
      setTotalMonths(plan.totalMonths.toString());
      setMonthlyAmount(plan.monthlyAmount.toString());
      setMonthlyAmountTouched(true);
      setStartMonth(plan.startMonth);
    }
  }, [plan]);

  // auto-คำนวณยอดต่อเดือน จนกว่าผู้ใช้จะแก้เอง
  useEffect(() => {
    if (monthlyAmountTouched) return;
    const total = parseFloat(totalAmount.replace(/,/g, ''));
    const months = isInstallment ? parseInt(totalMonths, 10) : 1;
    if (!isNaN(total) && months > 0) {
      setMonthlyAmount((total / months).toFixed(2));
    }
  }, [totalAmount, totalMonths, isInstallment, monthlyAmountTouched]);

  const showMsg = (msg: string) => {
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert('', msg);
  };

  const formatMonthLabel = (monthKey: string) => {
    const [y, m] = monthKey.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
  };

  const handleSave = async () => {
    const total = parseFloat(totalAmount.replace(/,/g, ''));
    if (!name.trim()) { showMsg('กรุณากรอกชื่อรายการ'); return; }
    if (!total || total <= 0) { showMsg('กรุณากรอกยอดเงินที่ถูกต้อง'); return; }

    const months = isInstallment ? parseInt(totalMonths, 10) : 1;
    if (isInstallment && (!months || months < 2)) {
      showMsg('จำนวนงวดผ่อนต้องมากกว่า 1 เดือน');
      return;
    }
    const perMonth = parseFloat(monthlyAmount.replace(/,/g, ''));
    if (!perMonth || perMonth <= 0) { showMsg('กรุณากรอกยอดต่อเดือนที่ถูกต้อง'); return; }

    const planData: InstallmentPlan = {
      id: plan?.id || Date.now().toString(),
      name: name.trim(),
      category,
      totalAmount: total,
      totalMonths: months,
      monthlyAmount: perMonth,
      startMonth,
      createdAt: plan?.createdAt || new Date().toISOString(),
    };

    try {
      if (isEditing) {
        await updateInstallmentPlan(planData);
      } else {
        await saveInstallmentPlan(planData);
      }
      showMsg(isEditing ? 'แก้ไขรายการแล้ว' : 'บันทึกรายการแล้ว');
      navigation.goBack();
    } catch {
      showMsg('บันทึกไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={[styles.content, isDesktop && { maxWidth: 600, alignSelf: 'center' as const, width: '100%' as any }]}>
        <Text style={styles.label}>ชื่อรายการ</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="เช่น มือถือใหม่, เครื่องซักผ้า"
          placeholderTextColor={COLORS.textSecondary}
        />

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

        <Text style={styles.label}>ยอดเงินรวม (฿)</Text>
        <TextInput
          style={styles.input}
          value={totalAmount}
          onChangeText={setTotalAmount}
          keyboardType="numeric"
          placeholder="0.00"
          placeholderTextColor={COLORS.textSecondary}
        />

        <Text style={styles.label}>รูปแบบการจ่าย</Text>
        <View style={styles.paymentTypeRow}>
          <TouchableOpacity
            style={[styles.paymentTypeChip, !isInstallment && styles.paymentTypeChipActive]}
            onPress={() => { setIsInstallment(false); setMonthlyAmountTouched(false); }}
          >
            <Text style={[styles.paymentTypeText, !isInstallment && styles.paymentTypeTextActive]}>
              จ่ายเต็มจำนวน (เดือนเดียว)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.paymentTypeChip, isInstallment && styles.paymentTypeChipActive]}
            onPress={() => { setIsInstallment(true); setMonthlyAmountTouched(false); }}
          >
            <Text style={[styles.paymentTypeText, isInstallment && styles.paymentTypeTextActive]}>
              ผ่อนชำระ
            </Text>
          </TouchableOpacity>
        </View>

        {isInstallment && (
          <>
            <Text style={styles.label}>ผ่อนกี่เดือน</Text>
            <TextInput
              style={styles.input}
              value={totalMonths}
              onChangeText={(t) => { setTotalMonths(t.replace(/\D/g, '')); setMonthlyAmountTouched(false); }}
              keyboardType="numeric"
              placeholder="3"
              placeholderTextColor={COLORS.textSecondary}
            />
          </>
        )}

        <Text style={styles.label}>ยอดต่อเดือน (฿) — แก้ไขได้</Text>
        <TextInput
          style={styles.input}
          value={monthlyAmount}
          onChangeText={(t) => { setMonthlyAmount(t); setMonthlyAmountTouched(true); }}
          keyboardType="numeric"
          placeholder="0.00"
          placeholderTextColor={COLORS.textSecondary}
        />

        <Text style={styles.label}>เริ่มงวดแรกเดือนไหน</Text>
        <View style={styles.monthNavigator}>
          <TouchableOpacity onPress={() => setStartMonth((m) => addMonths(m, -1))} style={styles.monthNavBtn}>
            <FontAwesome name="chevron-left" size={16} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.monthNavigatorLabel}>{formatMonthLabel(startMonth)}</Text>
          <TouchableOpacity onPress={() => setStartMonth((m) => addMonths(m, 1))} style={styles.monthNavBtn}>
            <FontAwesome name="chevron-right" size={16} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {isInstallment && totalMonths && (
          <Text style={styles.summaryHint}>
            จะจ่าย {formatCurrency(parseFloat(monthlyAmount) || 0)} ทุกเดือน เป็นเวลา {totalMonths} เดือน
            {' '}(ถึง {formatMonthLabel(addMonths(startMonth, parseInt(totalMonths || '1', 10) - 1))})
          </Text>
        )}

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>{isEditing ? 'บันทึกการแก้ไข' : 'บันทึก'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 24 },
  label: {
    fontSize: 11, fontWeight: '400', fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5, textTransform: 'uppercase', color: COLORS.textSecondary,
    marginBottom: 12, marginTop: 24,
  },
  input: {
    backgroundColor: COLORS.surface, borderRadius: 0, padding: 16,
    fontSize: 16, fontFamily: 'NotoSansThai_300Light',
    borderWidth: 1, borderColor: COLORS.border, color: COLORS.text,
  },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  categoryChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  categoryChipActive: { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}20` },
  categoryChipText: { fontSize: 12, fontFamily: 'NotoSansThai_300Light', color: COLORS.textSecondary },
  categoryChipTextActive: { color: COLORS.primary, fontFamily: 'NotoSansThai_400Regular' },

  paymentTypeRow: { flexDirection: 'row', gap: 8 },
  paymentTypeChip: {
    flex: 1, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  paymentTypeChipActive: { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}20` },
  paymentTypeText: {
    fontSize: 13, fontFamily: 'NotoSansThai_300Light', color: COLORS.textSecondary, textAlign: 'center',
  },
  paymentTypeTextActive: { color: COLORS.primary, fontFamily: 'NotoSansThai_400Regular' },

  monthNavigator: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  monthNavBtn: { padding: 16 },
  monthNavigatorLabel: {
    fontSize: 15, fontWeight: '600', fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.text,
  },

  summaryHint: {
    marginTop: 16, fontSize: 12, fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary, lineHeight: 18,
  },

  saveButton: {
    backgroundColor: COLORS.primary, borderRadius: 0, padding: 18,
    alignItems: 'center', marginTop: 40, borderWidth: 1, borderColor: COLORS.primary,
  },
  saveButtonText: {
    color: '#ffffff', fontSize: 13, fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular', letterSpacing: 1.5, textTransform: 'uppercase',
  },
});
