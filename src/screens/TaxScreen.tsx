import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { InvestmentType, RealizedTrade, INVESTMENT_TYPES } from '../types/investment';
import { Income } from '../types';
import {
  TaxProfile,
  emptyTaxProfile,
  TAX_BRACKETS,
  DEFAULT_GAIN_RULES,
  GAIN_RULE_LABELS,
  GainTaxRule,
  SALARY_EXPENSE_CAP,
  PERSONAL_ALLOWANCE,
  SOCIAL_SECURITY_CAP,
} from '../types/tax';
import { calculateTax, gainRuleFor, taxYearOf } from '../utils/taxCalc';
import { getRealizedTrades } from '../services/realizedStorage';
import { getIncomes } from '../services/incomeStorage';
import { getTaxProfile, saveTaxProfile, getTaxYears, isTaxTableMissing } from '../services/taxStorage';
import { COLORS, FONTS, TEXT, formatCurrency } from '../utils/constants';
import { notify } from '../utils/dialog';
import { useResponsive } from '../utils/responsive';

const currentBuddhistYear = () => new Date().getFullYear() + 543;

// แปลง input เป็นตัวเลข — ผู้ใช้พิมพ์ comma มาได้ และช่องว่างต้องเป็น 0 ไม่ใช่ NaN
const num = (s: string): number => {
  const n = parseFloat((s || '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

type FormKey =
  | 'monthlySalary'
  | 'salaryMonths'
  | 'bonus'
  | 'otherIncome'
  | 'socialSecurity'
  | 'withheld'
  | 'extraDeductions';

const FIELDS: { key: FormKey; label: string; hint?: string }[] = [
  { key: 'monthlySalary', label: 'เงินเดือน (ต่อเดือน)' },
  { key: 'salaryMonths', label: 'ได้รับกี่เดือนในปีนี้', hint: 'เข้างานกลางปีก็ปรับได้ ปกติ 12' },
  { key: 'bonus', label: 'โบนัส / เงินได้จากงานอื่นทั้งปี' },
  {
    key: 'otherIncome',
    label: 'เงินได้อื่นที่ต้องนำมารวม',
    hint: 'เช่น ดอกเบี้ย ค่าเช่า — ส่วนนี้ไม่ได้หักค่าใช้จ่าย 50%',
  },
  { key: 'socialSecurity', label: 'ประกันสังคมที่จ่ายทั้งปี', hint: `ลดหย่อนได้ไม่เกิน ${formatCurrency(SOCIAL_SECURITY_CAP)}` },
  {
    key: 'extraDeductions',
    label: 'ลดหย่อนอื่น ๆ (รวมก้อนเดียว)',
    hint: 'RMF/SSF, ประกันชีวิต, บุตร, ดอกเบี้ยบ้าน, บริจาค — รวมยอดมาใส่ช่องนี้',
  },
  { key: 'withheld', label: 'ภาษีหัก ณ ที่จ่ายที่ถูกหักไปแล้ว', hint: 'ดูจากหนังสือรับรอง 50 ทวิ' },
];

export default function TaxScreen() {
  const { isDesktop, contentMaxWidth } = useResponsive();
  const [year, setYear] = useState(currentBuddhistYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [profile, setProfile] = useState<TaxProfile>(emptyTaxProfile(currentBuddhistYear()));
  const [trades, setTrades] = useState<RealizedTrade[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  // ยุบรายละเอียดไว้ก่อน โชว์แค่คำตอบ — กางเองเมื่ออยากเห็นที่มา
  const [openSection, setOpenSection] = useState<'form' | 'gains' | 'rules' | 'brackets' | null>('form');

  const load = useCallback(async (targetYear: number) => {
    setLoading(true);
    try {
      const [t, inc] = await Promise.all([getRealizedTrades(), getIncomes()]);
      setTrades(t);
      setIncomes(inc);
      try {
        const [p, years] = await Promise.all([getTaxProfile(targetYear), getTaxYears()]);
        setProfile(p ?? emptyTaxProfile(targetYear));
        setAvailableYears(years);
        setTableMissing(false);
      } catch (e) {
        if (isTaxTableMissing(e)) {
          setTableMissing(true);
          setProfile(emptyTaxProfile(targetYear));
        } else throw e;
      }
    } catch (e) {
      console.error('TaxScreen load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      load(year);
    }, [load, year])
  );

  const breakdown = useMemo(() => calculateTax(profile, trades), [profile, trades]);

  const setField = (key: FormKey, value: string) =>
    setProfile((p) => ({ ...p, [key]: num(value) }));

  const setRule = (type: InvestmentType, rule: GainTaxRule) =>
    setProfile((p) => ({ ...p, gainRules: { ...(p.gainRules || {}), [type]: rule } }));

  // เดาเงินเดือน/โบนัสจากรายรับที่บันทึกไว้แล้ว — ไม่ต้องกรอกซ้ำถ้าลงบันทึกอยู่ทุกเดือน
  const fillFromIncomes = () => {
    const ofYear = incomes.filter((i) => taxYearOf(i.date) === year);
    const salaryRows = ofYear.filter((i) => i.category === 'เงินเดือน');
    const bonusRows = ofYear.filter((i) => i.category === 'โบนัส');
    if (salaryRows.length === 0 && bonusRows.length === 0) {
      notify(`ปี ${year} ยังไม่มีรายรับหมวด "เงินเดือน" หรือ "โบนัส" ที่บันทึกไว้`);
      return;
    }
    const salaryTotal = salaryRows.reduce((s, i) => s + i.amount, 0);
    // นับ "เดือนที่มีเงินเดือนเข้า" ไม่ใช่จำนวนรายการ เผื่อบันทึกเดือนละหลายรอบ
    const months = new Set(salaryRows.map((i) => i.date.slice(0, 7))).size;
    setProfile((p) => ({
      ...p,
      monthlySalary: months > 0 ? Math.round(salaryTotal / months) : p.monthlySalary,
      salaryMonths: months > 0 ? months : p.salaryMonths,
      bonus: bonusRows.reduce((s, i) => s + i.amount, 0) || p.bonus,
    }));
    notify(`ดึงจากรายรับปี ${year} แล้ว — เงินเดือน ${months} เดือน รวม ${formatCurrency(salaryTotal)}`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveTaxProfile({ ...profile, year });
      setAvailableYears((ys) => (ys.includes(year) ? ys : [year, ...ys].sort((a, b) => b - a)));
      notify('บันทึกข้อมูลภาษีแล้ว', 'สำเร็จ');
    } catch (e) {
      if (isTaxTableMissing(e)) {
        setTableMissing(true);
        notify('ยังใช้ไม่ได้ — เอาไฟล์ sql/tax_profiles.sql ไปรันที่ Supabase SQL editor ก่อน 1 ครั้ง');
      } else {
        notify(`บันทึกไม่สำเร็จ\n${(e as any)?.message || e}`, 'ข้อผิดพลาด');
      }
    } finally {
      setSaving(false);
    }
  };

  const yearOptions = useMemo(() => {
    const now = currentBuddhistYear();
    return [...new Set([now, now - 1, now - 2, ...availableYears])].sort((a, b) => b - a);
  }, [availableYears]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const owesMore = breakdown.balance > 0;

  const Section = ({
    id,
    title,
    subtitle,
    children,
  }: {
    id: 'form' | 'gains' | 'rules' | 'brackets';
    title: string;
    subtitle?: string;
    children: React.ReactNode;
  }) => {
    const open = openSection === id;
    return (
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => setOpenSection(open ? null : id)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
          </View>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={COLORS.textSecondary}
          />
        </TouchableOpacity>
        {open ? <View style={styles.sectionBody}>{children}</View> : null}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        isDesktop && { maxWidth: contentMaxWidth, width: '100%', alignSelf: 'center' },
      ]}
    >
      {tableMissing && (
        <Text style={styles.warnBox}>
          ยังใช้ไม่ได้ — เอาไฟล์ `sql/tax_profiles.sql` ไปรันที่ Supabase SQL editor ก่อน 1 ครั้ง
          (กรอกดูเล่นได้ แต่กดบันทึกจะยังไม่ผ่าน)
        </Text>
      )}

      {/* ── เลือกปีภาษี ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.yearRow}>
        {yearOptions.map((y) => (
          <TouchableOpacity
            key={y}
            style={[styles.yearChip, y === year && styles.yearChipActive]}
            onPress={() => setYear(y)}
          >
            <Text style={[styles.yearChipText, y === year && styles.yearChipTextActive]}>
              ปี {y}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── คำตอบ: ภาษีทั้งปี ── */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>ภาษีทั้งปี (ประมาณการ)</Text>
        <Text style={styles.heroValue}>{formatCurrency(breakdown.tax)}</Text>
        <View style={styles.heroSplit}>
          <View style={styles.heroSplitCell}>
            <Text style={styles.heroSplitLabel}>หัก ณ ที่จ่ายแล้ว</Text>
            <Text style={styles.heroSplitValue}>{formatCurrency(breakdown.withheld)}</Text>
          </View>
          <View style={styles.heroSplitCell}>
            <Text style={styles.heroSplitLabel}>{owesMore ? 'ต้องจ่ายเพิ่ม' : 'ได้คืน'}</Text>
            <Text
              style={[
                styles.heroSplitValue,
                { color: owesMore ? COLORS.error : COLORS.success },
              ]}
            >
              {formatCurrency(Math.abs(breakdown.balance))}
            </Text>
          </View>
        </View>
        <Text style={styles.heroFoot}>
          เงินได้สุทธิ {formatCurrency(breakdown.netIncome)} · อยู่ขั้น{' '}
          {(breakdown.marginalRate * 100).toFixed(0)}% · อัตราที่จ่ายจริง{' '}
          {(breakdown.effectiveRate * 100).toFixed(1)}%
        </Text>
      </View>

      {/* ── ภาษีจากกำไรขาย ── */}
      <View style={styles.gainCard}>
        <Text style={styles.gainCardLabel}>ภาษีที่มาจากกำไรขายปีนี้</Text>
        <Text style={styles.gainCardValue}>{formatCurrency(breakdown.taxFromGains)}</Text>
        <Text style={styles.gainCardHint}>
          {breakdown.gainIncome > 0
            ? `จากกำไรที่ต้องเสียภาษี ${formatCurrency(breakdown.gainIncome)}`
            : 'กำไรที่ขายปีนี้ยังไม่มีส่วนที่ต้องเสียภาษี'}
        </Text>
      </View>

      {/* ── ฟอร์มรายได้ ── */}
      <Section
        id="form"
        title="รายได้ & ลดหย่อน"
        subtitle={`เงินได้จากงาน ${formatCurrency(breakdown.salaryIncome)}`}
      >
        <TouchableOpacity style={styles.fillBtn} onPress={fillFromIncomes}>
          <Ionicons name="download-outline" size={15} color={COLORS.primary} />
          <Text style={styles.fillBtnText}>ดึงจากรายรับที่บันทึกไว้ในแอป</Text>
        </TouchableOpacity>

        {FIELDS.map((f) => (
          <View key={f.key} style={styles.field}>
            <Text style={styles.fieldLabel}>{f.label}</Text>
            <TextInput
              style={styles.input}
              value={profile[f.key] ? String(profile[f.key]) : ''}
              onChangeText={(v) => setField(f.key, v)}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={COLORS.textSecondary}
            />
            {f.hint ? <Text style={styles.fieldHint}>{f.hint}</Text> : null}
          </View>
        ))}

        <View style={styles.calcBox}>
          <CalcLine label="เงินได้จากงาน" value={breakdown.salaryIncome} />
          <CalcLine
            label={`หักค่าใช้จ่าย 50% (ไม่เกิน ${formatCurrency(SALARY_EXPENSE_CAP)})`}
            value={-breakdown.salaryExpense}
          />
          {breakdown.otherIncome > 0 && <CalcLine label="เงินได้อื่น" value={breakdown.otherIncome} />}
          {breakdown.gainIncome > 0 && (
            <CalcLine label="กำไรขายที่ต้องเสียภาษี" value={breakdown.gainIncome} />
          )}
          <CalcLine label="ลดหย่อนส่วนตัว" value={-PERSONAL_ALLOWANCE} />
          {breakdown.socialSecurity > 0 && (
            <CalcLine label="ประกันสังคม" value={-breakdown.socialSecurity} />
          )}
          {breakdown.extraDeductions > 0 && (
            <CalcLine label="ลดหย่อนอื่น" value={-breakdown.extraDeductions} />
          )}
          <View style={styles.calcTotal}>
            <Text style={styles.calcTotalLabel}>เงินได้สุทธิ</Text>
            <Text style={styles.calcTotalValue}>{formatCurrency(breakdown.netIncome)}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveBtnText}>บันทึกข้อมูลปี {year}</Text>
          )}
        </TouchableOpacity>
      </Section>

      {/* ── กำไรขายแยกชนิด ── */}
      <Section
        id="gains"
        title="กำไรจากการขายปีนี้"
        subtitle={
          breakdown.gains.length > 0
            ? `${breakdown.gains.reduce((s, g) => s + g.tradeCount, 0)} ไม้`
            : 'ยังไม่มีรายการขายในปีนี้'
        }
      >
        {breakdown.gains.length === 0 ? (
          <Text style={styles.emptyText}>
            ยังไม่มีการขายที่บันทึกไว้ในปี {year}{'\n'}
            บันทึกการขายที่หน้าพอร์ตแล้วตัวเลขจะมาที่นี่เอง
          </Text>
        ) : (
          breakdown.gains.map((g) => (
            <View key={g.type} style={styles.gainRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.gainRowTitle}>
                  {DEFAULT_GAIN_RULES[g.type].label}
                  <Text style={styles.gainRowCount}> · {g.tradeCount} ไม้</Text>
                </Text>
                <Text style={styles.gainRowRule}>{GAIN_RULE_LABELS[g.rule]}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text
                  style={[
                    styles.gainRowValue,
                    { color: g.gain >= 0 ? COLORS.success : COLORS.error },
                  ]}
                >
                  {g.gain >= 0 ? '+' : ''}
                  {formatCurrency(g.gain)}
                </Text>
                <Text style={styles.gainRowAssessable}>
                  {g.assessable > 0 ? `นำมาคิดภาษี ${formatCurrency(g.assessable)}` : 'ไม่เข้าฐานภาษี'}
                </Text>
              </View>
            </View>
          ))
        )}
        <Text style={styles.noteText}>
          ขาดทุนไม่ถูกนำไปหักกลบกับเงินเดือน — บุคคลธรรมดายกยอดขาดทุนไปหักเงินได้อื่นไม่ได้
        </Text>
      </Section>

      {/* ── กฎรายสินทรัพย์ ── */}
      <Section id="rules" title="กฎภาษีรายสินทรัพย์" subtitle="แก้ได้ถ้ากฎเปลี่ยน">
        {INVESTMENT_TYPES.map((t) => {
          const active = gainRuleFor(t.value, profile);
          return (
            <View key={t.value} style={styles.ruleBlock}>
              <View style={styles.ruleHeader}>
                <Ionicons name={t.icon} size={15} color={COLORS.primary} />
                <Text style={styles.ruleLabel}>{t.label}</Text>
              </View>
              <View style={styles.ruleChips}>
                {(['exempt', 'taxable', 'taxable_on_remit'] as GainTaxRule[]).map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.ruleChip, active === r && styles.ruleChipActive]}
                    onPress={() => setRule(t.value, r)}
                  >
                    <Text style={[styles.ruleChipText, active === r && styles.ruleChipTextActive]}>
                      {GAIN_RULE_LABELS[r]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.ruleNote}>{DEFAULT_GAIN_RULES[t.value].note}</Text>
            </View>
          );
        })}

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>นำเงินจากต่างประเทศเข้าไทยแล้วกี่ %</Text>
          <TextInput
            style={styles.input}
            value={
              profile.remittedRatio === undefined
                ? ''
                : String(Math.round(profile.remittedRatio * 100))
            }
            onChangeText={(v) =>
              setProfile((p) => ({
                ...p,
                remittedRatio: v.trim() === '' ? undefined : Math.min(100, Math.max(0, num(v))) / 100,
              }))
            }
            keyboardType="numeric"
            placeholder="100"
            placeholderTextColor={COLORS.textSecondary}
          />
          <Text style={styles.fieldHint}>
            ใช้กับกฎ "เสียเมื่อนำเงินเข้าไทย" — เว้นว่าง = ถือว่านำเข้าทั้งหมด
          </Text>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveBtnText}>บันทึกกฎที่ตั้งไว้</Text>
          )}
        </TouchableOpacity>
      </Section>

      {/* ── ขั้นบันได ── */}
      <Section id="brackets" title="ขั้นบันไดภาษี" subtitle="อ้างอิง">
        {TAX_BRACKETS.map((b, i) => {
          const lower = i === 0 ? 0 : (TAX_BRACKETS[i - 1].upTo as number);
          const inThisBracket =
            breakdown.netIncome > lower && (b.upTo === null || breakdown.netIncome <= b.upTo);
          return (
            <View key={i} style={[styles.bracketRow, inThisBracket && styles.bracketRowActive]}>
              <Text style={[styles.bracketRange, inThisBracket && styles.bracketTextActive]}>
                {b.upTo === null
                  ? `เกิน ${formatCurrency(lower)}`
                  : `${formatCurrency(lower + (i === 0 ? 0 : 1))} – ${formatCurrency(b.upTo)}`}
              </Text>
              <Text style={[styles.bracketRate, inThisBracket && styles.bracketTextActive]}>
                {b.rate === 0 ? 'ยกเว้น' : `${(b.rate * 100).toFixed(0)}%`}
              </Text>
            </View>
          );
        })}
      </Section>

      <Text style={styles.disclaimer}>
        ตัวเลขทั้งหมดเป็น "ประมาณการ" เพื่อวางแผนเท่านั้น ไม่ใช่คำแนะนำทางภาษี{'\n'}
        คิดแบบพื้นฐาน: เงินได้จากงาน + เงินได้อื่น หักค่าใช้จ่าย 50% (≤{formatCurrency(SALARY_EXPENSE_CAP)}),
        ลดหย่อนส่วนตัว {formatCurrency(PERSONAL_ALLOWANCE)}, ประกันสังคม (≤{formatCurrency(SOCIAL_SECURITY_CAP)})
        และลดหย่อนอื่นที่กรอกเอง — ยังไม่รวมเครดิตภาษีเงินปันผลและกรณีพิเศษอื่น{'\n'}
        กฎเงินได้ต่างประเทศและคริปโตเปลี่ยนบ่อย ควรยืนยันกับสรรพากรหรือผู้ทำบัญชีก่อนใช้ยื่นจริง
      </Text>
    </ScrollView>
  );
}

function CalcLine({ label, value }: { label: string; value: number }) {
  const negative = value < 0;
  return (
    <View style={styles.calcLine}>
      <Text style={styles.calcLineLabel}>{label}</Text>
      <Text style={[styles.calcLineValue, negative && { color: COLORS.textSecondary }]}>
        {negative ? '−' : ''}
        {formatCurrency(Math.abs(value))}
      </Text>
    </View>
  );
}

const card = {
  backgroundColor: COLORS.surface,
  borderWidth: 1,
  borderColor: COLORS.border,
  borderRadius: 12,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnBox: {
    ...TEXT.caption,
    color: COLORS.warning,
    backgroundColor: `${COLORS.warning}12`,
    borderWidth: 1,
    borderColor: `${COLORS.warning}40`,
    borderRadius: 10,
    padding: 12,
    lineHeight: 18,
    marginBottom: 12,
  },

  // ปีภาษี
  yearRow: { flexGrow: 0, marginBottom: 12 },
  yearChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    marginRight: 8,
  },
  yearChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  yearChipText: { ...TEXT.caption, color: COLORS.text },
  yearChipTextActive: { color: '#ffffff', fontFamily: FONTS.semibold },

  // การ์ดคำตอบ
  heroCard: { ...card, padding: 18 },
  heroLabel: { ...TEXT.caption, color: COLORS.textSecondary },
  heroValue: {
    fontSize: 32,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
    marginTop: 2,
    marginBottom: 14,
  },
  heroSplit: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    paddingTop: 12,
  },
  heroSplitCell: { flex: 1 },
  heroSplitLabel: { ...TEXT.hint, color: COLORS.textSecondary },
  heroSplitValue: { ...TEXT.title, color: COLORS.text, marginTop: 2 },
  heroFoot: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 12, lineHeight: 17 },

  gainCard: { ...card, padding: 16, marginTop: 12, borderLeftWidth: 3, borderLeftColor: COLORS.accent },
  gainCardLabel: { ...TEXT.caption, color: COLORS.textSecondary },
  gainCardValue: { ...TEXT.amount, color: COLORS.text, marginTop: 2 },
  gainCardHint: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 4 },

  // section แบบยุบได้
  section: { ...card, marginTop: 12, overflow: 'hidden' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
  },
  sectionTitle: { ...TEXT.title, color: COLORS.text },
  sectionSubtitle: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 2 },
  sectionBody: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    gap: 4,
  },

  fillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    marginTop: 16,
    marginBottom: 4,
  },
  fillBtnText: { ...TEXT.caption, color: COLORS.primary, fontFamily: FONTS.medium },

  field: { marginTop: 14 },
  fieldLabel: { ...TEXT.label, color: COLORS.textSecondary, marginBottom: 6 },
  fieldHint: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 4, lineHeight: 16 },
  input: {
    ...TEXT.body,
    minWidth: 0,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },

  calcBox: {
    marginTop: 18,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
  },
  calcLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
  calcLineLabel: { ...TEXT.caption, color: COLORS.textSecondary, flex: 1 },
  calcLineValue: { ...TEXT.caption, fontFamily: FONTS.medium, color: COLORS.text },
  calcTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  calcTotalLabel: { ...TEXT.subtitle, color: COLORS.text },
  calcTotalValue: { ...TEXT.subtitle, fontFamily: FONTS.semibold, color: COLORS.primary },

  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 18,
  },
  saveBtnText: { ...TEXT.subtitle, fontFamily: FONTS.semibold, color: '#ffffff' },

  // กำไรแยกชนิด
  gainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  gainRowTitle: { ...TEXT.body, color: COLORS.text },
  gainRowCount: { ...TEXT.hint, color: COLORS.textSecondary },
  gainRowRule: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 2 },
  gainRowValue: { ...TEXT.body, fontFamily: FONTS.semibold },
  gainRowAssessable: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 2 },
  emptyText: { ...TEXT.caption, color: COLORS.textSecondary, lineHeight: 20, marginTop: 14 },
  noteText: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 12, lineHeight: 16 },

  // กฎรายสินทรัพย์
  ruleBlock: {
    marginTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  ruleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  ruleLabel: { ...TEXT.subtitle, color: COLORS.text },
  ruleChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ruleChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    backgroundColor: COLORS.background,
  },
  ruleChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  ruleChipText: { ...TEXT.hint, color: COLORS.text },
  ruleChipTextActive: { color: '#ffffff', fontFamily: FONTS.medium },
  ruleNote: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 8, lineHeight: 16 },

  // ขั้นบันได
  bracketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  bracketRowActive: { backgroundColor: `${COLORS.primary}12` },
  bracketRange: { ...TEXT.caption, color: COLORS.textSecondary },
  bracketRate: { ...TEXT.caption, fontFamily: FONTS.medium, color: COLORS.textSecondary },
  bracketTextActive: { color: COLORS.primary, fontFamily: FONTS.semibold },

  disclaimer: {
    ...TEXT.hint,
    color: COLORS.textSecondary,
    lineHeight: 17,
    marginTop: 20,
    paddingHorizontal: 4,
  },
});
