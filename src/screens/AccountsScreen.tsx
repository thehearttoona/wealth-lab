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
import { Currency, INVESTMENT_PLATFORMS } from '../types/investment';
import { getAccounts, saveAccount, updateAccount, deleteAccount } from '../services/accountStorage';
import { getCurrencies } from '../services/currencyStorage';
import { getPlatforms } from '../services/platformStorage';
import { COLORS, RADIUS, getCurrencySymbol, formatCurrency } from '../utils/constants';
import { ActionButton } from '../components/ActionButton';
import { notify, confirmAsk } from '../utils/dialog';
import { MascotEmpty } from '../components/Mascot';

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
  const [platform, setPlatform] = useState<string>('');

  // ตัวเลือกสกุลเงิน/แพลตฟอร์ม มาจากรายการที่ผู้ใช้จัดการเอง — ว่างเมื่อไหร่ค่อย fallback ค่าเริ่มต้น
  const [currencyOptions, setCurrencyOptions] = useState<string[]>(ACCOUNT_CURRENCIES);
  const [platformOptions, setPlatformOptions] = useState<string[]>(INVESTMENT_PLATFORMS);

  const load = useCallback(async () => {
    try {
      setAccounts(await getAccounts());
    } catch {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
    try {
      const [curList, platList] = await Promise.all([getCurrencies(), getPlatforms()]);
      if (curList.length > 0) setCurrencyOptions(curList.map((c) => c.code));
      if (platList.length > 0) setPlatformOptions(platList.map((p) => p.name));
    } catch {
      // ใช้ค่าเริ่มต้นต่อไป
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
    setPlatform('');
    setModalVisible(true);
  };

  const openEdit = (acc: Account) => {
    setEditing(acc);
    setName(acc.name);
    setCurrency(acc.currency);
    setRole(acc.role);
    setBalanceInput(acc.manualBalance != null ? acc.manualBalance.toString() : '');
    setPlatform(acc.platform || '');
    setModalVisible(true);
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
      platform: role === 'reserve' && platform ? platform : undefined,
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
    if (!(await confirmAsk('ลบบัญชี', `ลบบัญชี "${editing.name}" ?`, 'ลบ'))) return;
    try {
      await deleteAccount(editing.id);
      setModalVisible(false);
      await load();
    } catch (e: any) {
      notify('ลบไม่สำเร็จ\n' + (e?.message || String(e)));
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
      {/* เดสก์ท็อปไม่มีเพดานความกว้างแล้ว — เนื้อหาใช้เต็ม pane (ดู utils/responsive.ts) */}
      <ScrollView contentContainerStyle={styles.listContent}>
        <Text style={styles.intro}>
          แยกบัญชีตามหน้าที่ของเงิน — ใช้จ่าย / รอลงทุน / พักรายได้ เพื่อ import statement แยกบัญชี และไม่ให้เงินโอนระหว่างกันนับซ้ำ
        </Text>

        {accounts.length === 0 ? (
          <MascotEmpty>ยังไม่มีบัญชี — กด "เพิ่มบัญชี" เพื่อเริ่ม</MascotEmpty>
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
                  {acc.platform ? ` • ${acc.platform}` : ''}
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
          {/* chip 3 ชุด (สกุลเงิน/บทบาท/แพลตฟอร์ม) wrap ได้เรื่อย ๆ → การ์ดต้องเลื่อนเองและมีเพดานความสูง */}
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={styles.modalCardContent}
            showsVerticalScrollIndicator={false}
          >
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
              {currencyOptions.map((c) => (
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

            {role === 'reserve' && (
              <>
                <Text style={styles.modalLabel}>แพลตฟอร์มที่ผูก (ไม่บังคับ)</Text>
                <View style={styles.chipRow}>
                  {platformOptions.map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.chip, platform === p && styles.chipActive]}
                      onPress={() => setPlatform(platform === p ? '' : p)}
                    >
                      <Text style={[styles.chipText, platform === p && styles.chipTextActive]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.hint}>
                  เลือกให้ตรงกับ platform ของสินทรัพย์ → ระบบจะหักต้นทุนที่ซื้อบน platform นี้ออกจากยอดที่เติม เหลือ = เงินสดรอลงทุนจริง
                </Text>
              </>
            )}

            <Text style={styles.modalLabel}>
              {role === 'reserve' ? 'ยอดที่เติมเข้าทั้งหมด (ไม่บังคับ)' : 'ยอดคงเหลือ (ไม่บังคับ)'}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={balanceInput}
              onChangeText={setBalanceInput}
              keyboardType="numeric"
              placeholder={
                role === 'reserve'
                  ? 'ยอดที่โอนเข้าแพลตฟอร์มนี้ทั้งหมด ระบบจะหักที่ซื้อไปแล้วให้'
                  : 'กรอกเองสำหรับกระเป๋าที่ไม่ได้ import เช่น USDT wallet'
              }
              placeholderTextColor={COLORS.textSecondary}
            />

            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSave}>
              <Text style={styles.modalSaveBtnText}>{editing ? 'บันทึกการแก้ไข' : 'เพิ่มบัญชี'}</Text>
            </TouchableOpacity>
            <View style={styles.modalBottomRow}>
              {editing && (
                <ActionButton
                  label="ลบบัญชี"
                  icon="trash-outline"
                  variant="danger"
                  onPress={handleDelete}
                />
              )}
              <ActionButton
                label="ยกเลิก"
                variant="quiet"
                onPress={() => setModalVisible(false)}
                style={styles.modalCancelBtn}
              />
            </View>
          </ScrollView>
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
  hint: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    lineHeight: 16,
    marginTop: 4,
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
  cardBalanceMuted: { fontSize: 14, color: COLORS.textSecondary, fontFamily: 'NotoSansThai_400Regular' },
  addBtn: {
    borderRadius: RADIUS.md,
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
    borderRadius: RADIUS.md,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // maxWidth กันการ์ดกางเต็มจอบนเดสก์ท็อป / maxHeight+flexGrow:0 ให้สูงตามเนื้อหาแต่ไม่เกินจอ
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '100%',
    flexGrow: 0,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
  },
  modalCardContent: { padding: 20 },
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
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, fontFamily: 'NotoSansThai_400Regular', color: COLORS.text },
  chipTextActive: { color: '#ffffff' },
  modalSaveBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 13, alignItems: 'center', marginTop: 20 },
  modalSaveBtnText: { color: '#ffffff', fontSize: 15, fontFamily: 'NotoSansThai_600SemiBold' },
  modalBottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  modalCancelBtn: { marginLeft: 'auto' },
});
