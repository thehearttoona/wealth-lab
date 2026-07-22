import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, MonthlySummary } from '../types';
import { saveMonthlySummary } from '../services/monthlySummaryStorage';
import { formatCurrency, COLORS } from '../utils/constants';
import { useResponsive } from '../utils/responsive';

type AddMonthlySummaryScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'AddMonthlySummary'
>;

type AddMonthlySummaryScreenRouteProp = RouteProp<
  RootStackParamList,
  'AddMonthlySummary'
>;

export default function AddMonthlySummaryScreen() {
  const navigation = useNavigation<AddMonthlySummaryScreenNavigationProp>();
  const route = useRoute<AddMonthlySummaryScreenRouteProp>();
  const { isDesktop } = useResponsive();

  const { summary, month } = route.params || {};
  const isEditing = !!summary;

  const [selectedMonth, setSelectedMonth] = useState(
    summary?.month || month || (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    })()
  );
  const [totalExpense, setTotalExpense] = useState(
    summary?.totalExpense?.toString() || ''
  );
  const [notes, setNotes] = useState(summary?.notes || '');

  const handleSave = async () => {
    if (!totalExpense || parseFloat(totalExpense) <= 0) {
      if (Platform.OS === 'web') {
        window.alert('กรุณากรอกยอดรายจ่ายรวม');
      } else {
        Alert.alert('ข้อผิดพลาด', 'กรุณากรอกยอดรายจ่ายรวม');
      }
      return;
    }

    const newSummary: MonthlySummary = {
      id: summary?.id || `${Date.now()}`,
      month: selectedMonth,
      totalExpense: parseFloat(totalExpense),
      notes: notes.trim(),
      createdAt: summary?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await saveMonthlySummary(newSummary);
      navigation.goBack();
    } catch (error) {
      if (Platform.OS === 'web') {
        window.alert('เกิดข้อผิดพลาดในการบันทึก');
      } else {
        Alert.alert('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการบันทึก');
      }
    }
  };

  const getMonthDisplay = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
  };

  const changeMonth = (offset: number) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <FontAwesome name="arrow-left" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditing ? 'แก้ไขรายจ่ายรายเดือน' : 'เพิ่มรายจ่ายรายเดือน'}
        </Text>
      </View>

      <View style={[
        styles.content,
        isDesktop && { maxWidth: 600, alignSelf: 'center' as const, width: '100%' as any },
      ]}>
        <View style={styles.section}>
          <Text style={styles.label}>เดือน</Text>
          <View style={styles.monthSelector}>
            <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthButton}>
              <FontAwesome name="chevron-left" size={20} color={COLORS.primary} />
            </TouchableOpacity>
            <Text style={styles.monthText}>{getMonthDisplay()}</Text>
            <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthButton}>
              <FontAwesome name="chevron-right" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>ยอดรายจ่ายรวมของเดือน *</Text>
          <TextInput
            style={styles.input}
            value={totalExpense}
            onChangeText={setTotalExpense}
            placeholder="0.00"
            keyboardType="decimal-pad"
            placeholderTextColor={COLORS.textSecondary}
          />
          {totalExpense && parseFloat(totalExpense) > 0 && (
            <Text style={styles.previewText}>
              {formatCurrency(parseFloat(totalExpense))}
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>บันทึกเพิ่มเติม</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="เช่น ค่าใช้จ่ายสูงเพราะซื้อของเพิ่ม..."
            multiline
            numberOfLines={4}
            placeholderTextColor={COLORS.textSecondary}
          />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <FontAwesome name="save" size={18} color="#ffffff" />
          <Text style={styles.saveButtonText}> บันทึก</Text>
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
  header: {
    backgroundColor: COLORS.primary,
    padding: 20,
    paddingTop: 60,
    paddingBottom: 30,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    fontFamily: 'NotoSansThai_600SemiBold',
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    fontFamily: 'NotoSansThai_600SemiBold',
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    padding: 16,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  previewText: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
    fontFamily: 'NotoSansThai_600SemiBold',
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  monthButton: {
    padding: 8,
  },
  monthText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    minWidth: 180,
    textAlign: 'center',
    fontFamily: 'NotoSansThai_600SemiBold',
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 0,
    padding: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'NotoSansThai_400Regular',
  },
});
