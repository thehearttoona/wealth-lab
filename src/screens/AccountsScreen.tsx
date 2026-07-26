import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { Account, AccountRole, ACCOUNT_ROLES, ACCOUNT_CURRENCIES } from '../types/account';
import { Currency } from '../types/investment';
import { getAccounts, saveAccount, updateAccount, deleteAccount } from '../services/accountStorage';
import { COLORS, getCurrencySymbol, formatCurrency } from '../utils/constants';

const roleLabel = (role: AccountRole) =>
  ACCOUNT_ROLES.find((r) => r.value === role)?.label || role;
const roleIcon = (role: AccountRole) =>
  ACCOUNT_ROLES.find((r) => r.value === role)?.icon || 'ellipsis-horizontal-outline';

export default function AccountsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  // modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>('THB');
  const [role, setRole] = useState<AccountRole>('spending');
  const [balanceInput, setBalanceInput] = useState('');

  const load = useCallback(async () => {
    try {
      setAccounts(await getAccounts());
    } catch {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openAdd = () => {
    setEditing(null);
    setName('');
    setCurrency('THB');
    setRole('spending');
    setBalanceInput('');
    setModalVisible(true);
  };

  const openEdit = (acc: Account) => {
    setEditing(acc);
    setName(acc.name);
    setCurrency(acc.currency);
    setRole(acc.role);
    setBalanceInput(acc.manualBalance != null ? acc.manualBalance.toString() : '');
    setModalVisible(true);
  };

  const notify = (msg: string) => {
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert('', msg);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      notify('กรุณาใส่ชื่อบัญชี');
      return;
    }
    const manualBalance = balanceInput.trim() ? parseFloat(balanceInput) : undefined;
    const account: Account = {
      id: editing?.id ?? Date.now().toString(),
      name: name.trim(),
      currency,
      role,
      manualBalance: Number.isFinite(manualBalance as number) ? manualBalance : undefined,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    };
    try {
      if (editing) await updateAccount(account);
      else await saveAccount(account);
      setModalVisible(false);
      await load();
    } catch (e: any) {
      notify('บันทึกไม่สำเร็จ\n' + (e?.message || String(e)));
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    const doDelete = async () => {
      try {
        await deleteAccount(editing.id);
        setModalVisible(false);
        await load();
      } catch (e: any) {
        notify('ลบไม่สำเร็จ\n' + (e?.message || String(e)));
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`ลบบัญชี "${editing.name}" ?`)) doDelete();
    } else {
      Alert.alert('ลบบัญชี', `ลบบัญชี "${editing.name}" ?`, [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ลบ', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.listContent}>
        <Text style={styles.intro}>
          แยกบัญชีตามหน้าที่ของเงิน — ใช้จ่าย / รอลงทุน / พักรายได้ เพื่อ import statement แยกบัญชี และไม่ให้เงินโอนระหว่างกันนับซ้ำ
        </Text>

        {accounts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="wallet-outline" size={28} color={COLORS.textSecondary} />
            <Text style={styles.emptyText}>ยังไม่มีบัญชี — กด "เพิ่มบัญชี" เพื่อเริ่ม</Text>
          </View>
        ) : (
          accounts.map((acc) => (
            <TouchableOpacity key={acc.id} style={styles.card} onPress={() => openEdit(acc)}>
              <View style={styles.cardIcon}>
                <Ionicons name={roleIcon(acc.role) as any} size={22} color={COLORS.primary} />
              </View>
              <View style={styles.cardMid}>
                <Text style={styles.cardName}>{acc.name}</Text>
                <Text style={styles.cardSub}>
                  {roleLabel(acc.role)} • {acc.currency}
                </Text>
              </View>
              <View style={styles.cardRight}>
                {acc.manualBalance != null ? (
                  <Text style={styles.cardBalance}>
                    {getCurrencySymbol(acc.currency)}
                    {formatCurrency(acc.manualBalance)}
                  </Text>
                ) : (
                  <Text style={styles.cardBalanceMuted}>—</Text>
                )}
                <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
              </View>
            </TouchableOpacity>
          ))
        )}

        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add-circle-outline" size={20} color="#ffffff" />
          <Text style={styles.addBtnText}>เพิ่มบัญชี</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.importBtn}
          onPress={() => navigation.navigate('ImportStatement')}
          disabled={accounts.length === 0}
        >
          <Ionicons name="download-outline" size={18} color={COLORS.primary} />
          <Text style={styles.importBtnText}>นำเข้า statement (K PLUS)</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Add/Edit modal ── */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              <Ionicons name="wallet-outline" size={18} color={COLORS.primary} />{' '}
              {editing ? 'แก้ไขบัญชี' : 'เพิ่มบัญชี'}
            </Text>

            <Text style={styles.modalLabel}>ชื่อบัญชี</Text>
            <TextInput
              style={styles.modalInput}
              value={name}
              onChangeText={setName}
              placeholder="เช่น บริษัท, ลงทุนบาท, USD รอลงทุน"
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.modalLabel}>สกุลเงิน</Text>
            <View style={styles.chipRow}>
              {ACCOUNT_CURRENCIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, currency === c && styles.chipActive]}
                  onPress={() => setCurrency(c)}
                >
                  <Text style={[styles.chipText, currency === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>บทบาท</Text>
            <View style={styles.chipRow}>
              {ACCOUNT_ROLES.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.chip, role === r.value && styles.chipActive]}
                  onPress={() => setRole(r.value)}
                >
                  <Text style={[styles.chipText, role === r.value && styles.chipTextActive]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>ยอดคงเหลือ (ไม่บังคับ)</Text>
            <TextInput
              style={styles.modalInput}
              value={balanceInput}
              onChangeText={setBalanceInput}
              keyboardType="numeric"
              placeholder="กรอกเองสำหรับกระเป๋าที่ไม่ได้ import เช่น USDT wallet"
              placeholderTextColor={COLORS.textSecondary}
            />

            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSave}>
              <Text style={styles.modalSaveBtnText}>{editing ? 'บันทึกการแก้ไข' : 'เพิ่มบัญชี'}</Text>
            </TouchableOpacity>
            <View style={styles.modalBottomRow}>
              {editing && (
                <TouchableOpacity onPress={handleDelete}>
                  <Text style={styles.modalDeleteText}>ลบบัญชี</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  listContent: { padding: 16, gap: 10 },
  intro: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    marginBottom: 4,
    lineHeight: 18,
  },
  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  emptyText: { fontSize: 13, fontFamily: 'NotoSansThai_400Regular', color: COLORS.textSecondary },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 12,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${COLORS.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardMid: { flex: 1 },
  cardName: { fontSize: 15, fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.text },
  cardSub: { fontSize: 12, fontFamily: 'NotoSansThai_400Regular', color: COLORS.textSecondary, marginTop: 2 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardBalance: { fontSize: 14, fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.text },
  cardBalanceMuted: { fontSize: 14, color: COLORS.textSecondary },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    marginTop: 6,
  },
  addBtnText: { color: '#ffffff', fontSize: 15, fontFamily: 'NotoSansThai_600SemiBold' },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
    paddingVertical: 12,
    marginTop: 8,
  },
  importBtnText: { color: COLORS.primary, fontSize: 14, fontFamily: 'NotoSansThai_600SemiBold' },
  // modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 16, fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.text, marginBottom: 12 },
  modalLabel: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_500Medium',
    color: COLORS.textSecondary,
    marginTop: 12,
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, fontFamily: 'NotoSansThai_400Regular', color: COLORS.text },
  chipTextActive: { color: '#ffffff' },
  modalSaveBtn: { backgroundColor: COLORS.primary, paddingVertical: 13, alignItems: 'center', marginTop: 20 },
  modalSaveBtnText: { color: '#ffffff', fontSize: 15, fontFamily: 'NotoSansThai_600SemiBold' },
  modalBottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  modalDeleteText: { color: COLORS.error, fontSize: 13, fontFamily: 'NotoSansThai_500Medium' },
  modalCancelText: { color: COLORS.textSecondary, fontSize: 13, fontFamily: 'NotoSansThai_500Medium', marginLeft: 'auto' },
});
