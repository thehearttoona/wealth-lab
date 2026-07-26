import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Account } from '../types/account';
import { getAccounts } from '../services/accountStorage';
import { parseKBankStatement } from '../utils/statementParser';
import { ImportRow, ImportRowType, saveImportRows } from '../services/importStorage';
import { EXPENSE_CATEGORIES, COLORS, getCurrencySymbol, formatCurrency } from '../utils/constants';
import { INCOME_CATEGORIES } from '../services/incomeStorage';

interface EditRow extends ImportRow {
  time: string;
  include: boolean;
  needsReview: boolean;
}

const TYPE_OPTS: { value: ImportRowType; label: string }[] = [
  { value: 'income', label: 'รับ' },
  { value: 'expense', label: 'จ่าย' },
  { value: 'transfer', label: 'โอนระหว่างบัญชี' },
  { value: 'invest', label: 'ย้ายไปลงทุน' },
];

export default function ImportStatementScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>('');
  const [rawText, setRawText] = useState('');
  const [rows, setRows] = useState<EditRow[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const accs = await getAccounts();
      setAccounts(accs);
      if (accs.length && !accountId) setAccountId(accs[0].id);
    } catch {
      setAccounts([]);
    }
  }, [accountId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const currency = selectedAccount?.currency || 'THB';

  const notify = (msg: string) => {
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert('', msg);
  };

  const handleParse = () => {
    const parsed = parseKBankStatement(rawText);
    if (parsed.length === 0) {
      notify('ไม่พบรายการ — ตรวจว่าวางข้อความจาก statement ครบไหม');
      return;
    }
    setRows(
      parsed.map((p, i) => ({
        id: `${Date.now()}_${i}`,
        date: p.date,
        time: p.time,
        amount: p.amount,
        type: p.direction === 'in' ? 'income' : 'expense',
        category: p.direction === 'in'
          ? (p.description.includes('เงินเดือน') ? 'เงินเดือน' : INCOME_CATEGORIES[INCOME_CATEGORIES.length - 1])
          : EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1],
        description: p.description,
        currency,
        direction: p.direction,
        include: true,
        needsReview: p.needsReview,
      }))
    );
  };

  const setRow = (id: string, patch: Partial<EditRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const setType = (id: string, type: ImportRowType) => {
    // เปลี่ยนประเภท → รีเซ็ตหมวดให้เข้าชุด
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        let category = r.category;
        if (type === 'income' && !INCOME_CATEGORIES.includes(category)) category = INCOME_CATEGORIES[INCOME_CATEGORIES.length - 1];
        if (type === 'expense' && !EXPENSE_CATEGORIES.includes(category)) category = EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
        return { ...r, type, category };
      })
    );
  };

  const setAllInclude = (val: boolean) => setRows((prev) => prev.map((r) => ({ ...r, include: val })));

  const included = rows.filter((r) => r.include);
  const sumIn = included.filter((r) => r.direction === 'in').reduce((s, r) => s + r.amount, 0);
  const sumOut = included.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amount, 0);
  const countBy = (t: ImportRowType) => included.filter((r) => r.type === t).length;

  const handleSave = async () => {
    if (!accountId) {
      notify('เลือกบัญชีก่อน');
      return;
    }
    if (included.length === 0) {
      notify('ยังไม่ได้เลือกรายการ');
      return;
    }
    setSaving(true);
    try {
      const payload: ImportRow[] = included.map(({ include, needsReview, time, ...r }) => ({ ...r, currency }));
      const res = await saveImportRows(payload, accountId);
      notify(`บันทึกสำเร็จ ${res.saved} รายการ${res.skipped ? ` (ข้ามซ้ำ ${res.skipped})` : ''}`);
      setRows([]);
      setRawText('');
    } catch (e: any) {
      notify('บันทึกไม่สำเร็จ\n' + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  };

  const cats = (type: ImportRowType) =>
    type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* เลือกบัญชี */}
        <Text style={styles.label}>นำเข้าเข้าบัญชี</Text>
        {accounts.length === 0 ? (
          <Text style={styles.warn}>ยังไม่มีบัญชี — ไปสร้างบัญชีก่อนที่หน้า "บัญชีของฉัน"</Text>
        ) : (
          <View style={styles.chipRow}>
            {accounts.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[styles.chip, accountId === a.id && styles.chipActive]}
                onPress={() => setAccountId(a.id)}
              >
                <Text style={[styles.chipText, accountId === a.id && styles.chipTextActive]}>
                  {a.name} ({a.currency})
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* วางข้อความ */}
        <Text style={styles.label}>วางข้อความจาก statement (K PLUS)</Text>
        <TextInput
          style={styles.textarea}
          value={rawText}
          onChangeText={setRawText}
          placeholder={'เปิด PDF → ลากคลุมรายการ → copy มาวางที่นี่'}
          placeholderTextColor={COLORS.textSecondary}
          multiline
          textAlignVertical="top"
        />
        <TouchableOpacity style={styles.parseBtn} onPress={handleParse}>
          <Ionicons name="git-branch-outline" size={18} color="#ffffff" />
          <Text style={styles.parseBtnText}> แยกรายการ</Text>
        </TouchableOpacity>

        {rows.length > 0 && (
          <>
            {/* สรุป */}
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLine}>
                เลือก {included.length}/{rows.length} รายการ • รับ {countBy('income')} · จ่าย {countBy('expense')} · โอน {countBy('transfer')} · ลงทุน {countBy('invest')}
              </Text>
              <Text style={styles.summaryLine}>
                เงินเข้า <Text style={{ color: COLORS.success }}>+{getCurrencySymbol(currency)}{formatCurrency(sumIn)}</Text>
                {'   '}เงินออก <Text style={{ color: COLORS.error }}>-{getCurrencySymbol(currency)}{formatCurrency(sumOut)}</Text>
              </Text>
              <View style={styles.selectRow}>
                <TouchableOpacity onPress={() => setAllInclude(true)}>
                  <Text style={styles.selectLink}>เลือกทั้งหมด</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setAllInclude(false)}>
                  <Text style={styles.selectLink}>เอาออกทั้งหมด</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* รายการ */}
            {rows.map((r) => (
              <View key={r.id} style={[styles.row, !r.include && styles.rowOff]}>
                <View style={styles.rowTop}>
                  <TouchableOpacity onPress={() => setRow(r.id, { include: !r.include })} style={styles.checkbox}>
                    <Ionicons
                      name={r.include ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={r.include ? COLORS.primary : COLORS.textSecondary}
                    />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowDesc} numberOfLines={2}>{r.description}</Text>
                    <Text style={styles.rowMeta}>
                      {r.date} {r.time}
                      {r.needsReview ? '  ⚠ ตรวจสอบ' : ''}
                    </Text>
                  </View>
                  <Text style={[styles.rowAmt, { color: r.direction === 'in' ? COLORS.success : COLORS.error }]}>
                    {r.direction === 'in' ? '+' : '-'}{getCurrencySymbol(currency)}{formatCurrency(r.amount)}
                  </Text>
                </View>

                {/* ประเภท */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
                  {TYPE_OPTS.map((t) => (
                    <TouchableOpacity
                      key={t.value}
                      style={[styles.miniChip, r.type === t.value && styles.miniChipActive]}
                      onPress={() => setType(r.id, t.value)}
                    >
                      <Text style={[styles.miniChipText, r.type === t.value && styles.miniChipTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* หมวด (เฉพาะรับ/จ่าย) */}
                {(r.type === 'income' || r.type === 'expense') && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
                    {cats(r.type).map((c) => (
                      <TouchableOpacity
                        key={c}
                        style={[styles.catChip, r.category === c && styles.catChipActive]}
                        onPress={() => setRow(r.id, { category: c })}
                      >
                        <Text style={[styles.catChipText, r.category === c && styles.catChipTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            ))}

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>บันทึก {included.length} รายการ</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, gap: 8 },
  label: { fontSize: 13, fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.text, marginTop: 10 },
  warn: { fontSize: 12, fontFamily: 'NotoSansThai_400Regular', color: COLORS.error },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
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
  textarea: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    minHeight: 140,
    padding: 12,
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
    marginTop: 4,
  },
  parseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    marginTop: 8,
  },
  parseBtnText: { color: '#ffffff', fontSize: 14, fontFamily: 'NotoSansThai_600SemiBold' },
  summaryBox: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginTop: 12,
    gap: 6,
  },
  summaryLine: { fontSize: 12, fontFamily: 'NotoSansThai_400Regular', color: COLORS.text },
  selectRow: { flexDirection: 'row', gap: 16, marginTop: 2 },
  selectLink: { fontSize: 12, fontFamily: 'NotoSansThai_500Medium', color: COLORS.primary },
  row: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    marginTop: 8,
    gap: 8,
  },
  rowOff: { opacity: 0.45 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  checkbox: { paddingTop: 1 },
  rowDesc: { fontSize: 12, fontFamily: 'NotoSansThai_400Regular', color: COLORS.text, lineHeight: 17 },
  rowMeta: { fontSize: 11, fontFamily: 'NotoSansThai_400Regular', color: COLORS.textSecondary, marginTop: 2 },
  rowAmt: { fontSize: 13, fontFamily: 'NotoSansThai_600SemiBold' },
  typeScroll: { flexGrow: 0 },
  catScroll: { flexGrow: 0 },
  miniChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    marginRight: 6,
  },
  miniChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  miniChipText: { fontSize: 11, fontFamily: 'NotoSansThai_400Regular', color: COLORS.text },
  miniChipTextActive: { color: '#ffffff' },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.background,
    marginRight: 6,
  },
  catChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  catChipText: { fontSize: 11, fontFamily: 'NotoSansThai_400Regular', color: COLORS.textSecondary },
  catChipTextActive: { color: '#ffffff' },
  saveBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 30,
  },
  saveBtnText: { color: '#ffffff', fontSize: 15, fontFamily: 'NotoSansThai_600SemiBold' },
});
