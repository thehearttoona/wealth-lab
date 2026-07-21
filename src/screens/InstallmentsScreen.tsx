import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, InstallmentPlan } from '../types';
import { getInstallmentPlans, deleteInstallmentPlan } from '../services/installmentStorage';
import { formatCurrency, COLORS } from '../utils/constants';
import {
  getCurrentMonthKey,
  addMonths,
  isPlanActiveInMonth,
  isPlanCompleted,
  getInstallmentNumber,
  getEstimatedTotalForMonth,
} from '../utils/installments';
import { useResponsive } from '../utils/responsive';

type InstallmentsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Installments'>;

export default function InstallmentsScreen() {
  const navigation = useNavigation<InstallmentsScreenNavigationProp>();
  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  const { isDesktop } = useResponsive();

  const loadData = async () => {
    const data = await getInstallmentPlans();
    setPlans(data);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const handleDelete = async (id: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?')) {
        await deleteInstallmentPlan(id);
        loadData();
      }
    } else {
      Alert.alert('ลบรายการ', 'คุณต้องการลบรายการนี้ใช่หรือไม่?', [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ลบ', style: 'destructive', onPress: async () => { await deleteInstallmentPlan(id); loadData(); } },
      ]);
    }
  };

  const currentMonth = getCurrentMonthKey();
  const nextMonth = addMonths(currentMonth, 1);

  const activePlans = plans
    .filter((p) => !isPlanCompleted(p, currentMonth))
    .sort((a, b) => a.startMonth.localeCompare(b.startMonth));
  const completedPlans = plans.filter((p) => isPlanCompleted(p, currentMonth));

  const estimateThisMonth = getEstimatedTotalForMonth(plans, currentMonth);
  const estimateNextMonth = getEstimatedTotalForMonth(plans, nextMonth);

  const formatMonthLabel = (monthKey: string) => {
    const [y, m] = monthKey.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
  };

  const renderPlanCard = (plan: InstallmentPlan, completed: boolean) => {
    const installmentNo = getInstallmentNumber(plan, currentMonth);
    return (
      <View key={plan.id} style={styles.planItem}>
        <TouchableOpacity
          style={styles.planContent}
          onPress={() => navigation.navigate('AddInstallment', { plan })}
        >
          <View style={styles.planLeft}>
            <Text style={styles.planName}>{plan.name}</Text>
            <Text style={styles.planCategory}>{plan.category}</Text>
            {plan.totalMonths > 1 ? (
              <Text style={styles.planProgress}>
                {completed
                  ? `ผ่อนครบแล้ว ${plan.totalMonths} งวด`
                  : installmentNo !== null
                    ? `งวดที่ ${installmentNo}/${plan.totalMonths}`
                    : `ยังไม่เริ่ม — เริ่ม ${formatMonthLabel(plan.startMonth)}`}
              </Text>
            ) : (
              <Text style={styles.planProgress}>
                {plan.startMonth > currentMonth
                  ? `ยังไม่ถึงกำหนด — ${formatMonthLabel(plan.startMonth)}`
                  : 'จ่ายเต็มจำนวน'}
              </Text>
            )}
          </View>
          <View style={styles.planRight}>
            <Text style={styles.planAmount}>{formatCurrency(plan.monthlyAmount)}</Text>
            <Text style={styles.planAmountSub}>/เดือน</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(plan.id)}>
          <FontAwesome name="trash" size={14} color="#d32f2f" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={[styles.content, isDesktop && { maxWidth: 900, alignSelf: 'center' as const, width: '100%' as any }]}>
        <View style={styles.estimateRow}>
          <View style={styles.estimateCard}>
            <Text style={styles.estimateLabel}>ประมาณการเดือนนี้</Text>
            <Text style={styles.estimateValue}>{formatCurrency(estimateThisMonth)}</Text>
            <Text style={styles.estimateSub}>{formatMonthLabel(currentMonth)}</Text>
          </View>
          <View style={[styles.estimateCard, styles.estimateCardHighlight]}>
            <Text style={styles.estimateLabel}>ประมาณการเดือนหน้า</Text>
            <Text style={[styles.estimateValue, { color: COLORS.primary }]}>{formatCurrency(estimateNextMonth)}</Text>
            <Text style={styles.estimateSub}>{formatMonthLabel(nextMonth)}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('AddInstallment', {})}>
          <FontAwesome name="plus-circle" size={18} color="#ffffff" />
          <Text style={styles.addButtonText}> เพิ่มรายการผ่อน/ค่าใช้จ่าย</Text>
        </TouchableOpacity>

        <View style={styles.listContainer}>
          {activePlans.length === 0 ? (
            <Text style={styles.emptyText}>ยังไม่มีรายการที่กำลังผ่อนอยู่</Text>
          ) : (
            activePlans.map((p) => renderPlanCard(p, false))
          )}
        </View>

        {completedPlans.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>ผ่อนครบแล้ว</Text>
            <View style={styles.listContainer}>
              {completedPlans.map((p) => renderPlanCard(p, true))}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingTop: 60 },

  estimateRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  estimateCard: {
    flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  estimateCardHighlight: { borderColor: COLORS.primary },
  estimateLabel: {
    fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
    fontFamily: 'NotoSansThai_400Regular', color: COLORS.textSecondary, marginBottom: 8,
  },
  estimateValue: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  estimateSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4 },

  addButton: {
    backgroundColor: COLORS.primary, borderRadius: 0, padding: 16,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginBottom: 20,
  },
  addButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },

  sectionTitle: {
    fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
    fontFamily: 'NotoSansThai_400Regular', color: COLORS.textSecondary,
    marginTop: 24, marginBottom: 12,
  },

  listContainer: {},
  planItem: {
    flexDirection: 'row', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12,
  },
  planContent: { flex: 1, padding: 16, flexDirection: 'row', justifyContent: 'space-between' },
  planLeft: { flex: 1 },
  planName: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  planCategory: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 },
  planProgress: { fontSize: 12, color: COLORS.accent },
  planRight: { alignItems: 'flex-end', justifyContent: 'center' },
  planAmount: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  planAmountSub: { fontSize: 11, color: COLORS.textSecondary },
  deleteButton: {
    padding: 16, justifyContent: 'center', alignItems: 'center',
    borderLeftWidth: 1, borderLeftColor: COLORS.border,
  },

  emptyText: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 14, marginTop: 24, marginBottom: 8 },
});
