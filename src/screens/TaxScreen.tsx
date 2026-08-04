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
  TaxMonth,
  emptyTaxProfile,
  emptyTaxMonths,
  sumTaxMonths,
  MONTH_LABELS_TH,
  TAX_BRACKETS,
  DEFAULT_GAIN_RULES,
  GAIN_RULE_LABELS,
  GainTaxRule,
  SALARY_EXPENSE_CAP,
  PERSONAL_ALLOWANCE,
  SOCIAL_SECURITY_CAP,
} from '../types/tax';
import { calculateTax, gainRuleFor, taxYearOf, projectFullYear } from '../utils/taxCalc';
import { useResponsive } from '../utils/responsive';
import { getRealizedTrades } from '../services/realizedStorage';
import { getIncomes } from '../services/incomeStorage';
import { getTaxProfile, saveTaxProfile, getTaxYears, isTaxTableMissing } from '../services/taxStorage';
import { COLORS, FONTS, TEXT, formatCurrency } from '../utils/constants';
import { notify } from '../utils/dialog';

const currentBuddhistYear = () => new Date().getFullYear() + 543;

// แปลง input เป็นตัวเลข — ผู้ใช้พิมพ์ comma มาได้ และช่องว่างต้องเป็น 0 ไม่ใช่ NaN
const num = (s: string): number => {
  const n = parseFloat((s || '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// เหลือแค่ 2 ช่องที่เป็น "ยอดทั้งปี" จริง ๆ
// เงินเดือน/โบนัส/หัก ณ ที่จ่าย/ประกันสังคม ย้ายไปตารางรายเดือนแล้ว (กรอกจากสลิปตรง ๆ)
type FormKey = 'otherIncome' | 'extraDeductions';

const FIELDS: { key: FormKey; label: string; hint?: string }[] = [
  {
    key: 'otherIncome',
    label: 'เงินได้อื่นที่ต้องนำมารวม (ทั้งปี)',
    hint: 'เช่น ดอกเบี้ย ค่าเช่า — ส่วนนี้ไม่ได้หักค่าใช้จ่าย 50%',
  },
  {
    key: 'extraDeductions',
    label: 'ลดหย่อนอื่น ๆ (รวมก้อนเดียว, ทั้งปี)',
    hint: 'RMF/SSF, ประกันชีวิต, บุตร, ดอกเบี้ยบ้าน, บริจาค — รวมยอดมาใส่ช่องนี้',
  },
];

// คอลัมน์ในตารางรายเดือน — ตรงกับสลิปเงินเดือน 1 ใบ
const MONTH_COLUMNS: { key: keyof Omit<TaxMonth, 'month'>; label: string }[] = [
  { key: 'salary', label: 'เงินเดือน' },
  { key: 'bonus', label: 'โบนัส' },
  { key: 'withheld', label: 'หัก ณ ที่จ่าย' },
  { key: 'socialSecurity', label: 'ประกันสังคม' },
];

export default function TaxScreen() {
  const { isDesktop } = useResponsive();
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
  const monthTotals = useMemo(() => sumTaxMonths(profile.months), [profile.months]);
  // ยอดที่กรอกจริง vs คาดทั้งปี — ต้องแยกกัน ไม่งั้นกรอก 8 เดือนแล้วเห็นภาษีต่ำกว่าจริง ~5 เท่า
  const projection = useMemo(() => projectFullYear(profile, trades), [profile, trades]);

  const setField = (key: FormKey, value: string) =>
    setProfile((p) => ({ ...p, [key]: num(value) }));

  const setMonthField = (month: number, key: keyof Omit<TaxMonth, 'month'>, value: string) =>
    setProfile((p) => ({
      ...p,
      months: (p.months || emptyTaxMonths()).map((m) =>
        m.month === month ? { ...m, [key]: num(value) } : m
      ),
    }));

  // เงินเดือนส่วนใหญ่เท่ากันทุกเดือน — ถ้าไม่มีปุ่มนี้ต้องพิมพ์ซ้ำ 12 รอบ × 4 ช่อง
  const copyMonthDown = (month: number) => {
    setProfile((p) => {
      const src = (p.months || []).find((m) => m.month === month);
      if (!src) return p;
      return {
        ...p,
        months: (p.months || []).map((m) =>
          m.month > month
            ? // โบนัสไม่ก๊อปลงไป — ไม่ได้รับทุกเดือน ก๊อปไปจะทำให้เงินได้สูงเกินจริง
              { ...m, salary: src.salary, withheld: src.withheld, socialSecurity: src.socialSecurity }
            : m
        ),
      };
    });
  };

  const setRule = (type: InvestmentType, rule: GainTaxRule) =>
    setProfile((p) => ({ ...p, gainRules: { ...(p.gainRules || {}), [type]: rule } }));

  /**
   * เติมเงินเดือน/โบนัสจากรายรับที่บันทึกไว้ — เป็นตัวช่วย "เติมครั้งเดียว" ไม่ใช่การผูกข้อมูล
   * ค่าที่เติมจะถูกเก็บใน tax_profiles.months ทันที ฝั่งภาษีจึงยังมีแหล่งความจริงเดียวคือตารางนี้
   *
   * เดิมฟังก์ชันนี้เฉลี่ยเงินเดือนแล้วเดา salaryMonths จาก "จำนวนเดือนที่มีข้อมูล" ซึ่งเป็นบั๊ก:
   * กดกลางปีแล้วประมาณการทั้งปีกลายเป็นยอดถึงปัจจุบันเงียบ ๆ (เงินเดือน 50,000 กดเดือน ส.ค.
   * ได้ภาษี ฿4,200 แทน ฿20,600) ตอนนี้ลงยอดจริงรายเดือน ไม่เฉลี่ย ไม่เดาจำนวนเดือน
   * แล้วให้การ์ด "คาดทั้งปี" ทำหน้าที่ประมาณเดือนที่เหลือแยกออกมาชัด ๆ
   *
   * แตะแค่คอลัมน์เงินเดือน/โบนัส — หัก ณ ที่จ่ายและประกันสังคมไม่มีใน incomes จึงไม่ล้างของที่กรอกไว้
   */
  const fillFromIncomes = () => {
    const ofYear = incomes.filter((i) => taxYearOf(i.date) === year);
    const salaryRows = ofYear.filter((i) => i.category === 'เงินเดือน');
    const bonusRows = ofYear.filter((i) => i.category === 'โบนัส');
    if (salaryRows.length === 0 && bonusRows.length === 0) {
      notify(`ปี ${year} ยังไม่มีรายรับหมวด "เงินเดือน" หรือ "โบนัส" ที่บันทึกไว้`);
      return;
    }

    const byMonth = (rows: typeof ofYear) => {
      const acc = new Map<number, number>();
      rows.forEach((i) => {
        // date อาจเป็น พ.ศ. ในข้อมูลเก่า — taxYearOf กรองปีให้แล้ว ที่นี่เอาแค่เลขเดือน
        const mm = parseInt(i.date.slice(5, 7), 10);
        if (mm >= 1 && mm <= 12) acc.set(mm, (acc.get(mm) || 0) + i.amount);
      });
      return acc;
    };
    const salaryByMonth = byMonth(salaryRows);
    const bonusByMonth = byMonth(bonusRows);

    setProfile((p) => ({
      ...p,
      months: (p.months || emptyTaxMonths()).map((m) => ({
        ...m,
        salary: salaryByMonth.get(m.month) ?? m.salary,
        bonus: bonusByMonth.get(m.month) ?? m.bonus,
      })),
    }));

    const total = salaryRows.reduce((s, i) => s + i.amount, 0);
    notify(
      `เติมจากรายรับปี ${year} แล้ว — เงินเดือน ${salaryByMonth.size} เดือน รวม ${formatCurrency(total)}\n` +
        'หัก ณ ที่จ่าย/ประกันสังคม ต้องกรอกจากสลิปเอง (ไม่มีในหน้ารายรับ)'
    );
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

  // เดสก์ท็อปไม่มีเพดานความกว้างแล้ว — เนื้อหาใช้เต็ม pane (ดู utils/responsive.ts)
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

      {/* ── คำตอบ: ภาษีจากที่กรอกจริง ── */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>
          {breakdown.filledMonths >= 12
            ? 'ภาษีทั้งปี (ประมาณการ)'
            : `ภาษีจากที่กรอกจริง ${breakdown.filledMonths}/12 เดือน`}
        </Text>
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

      {/* ── คาดทั้งปี ──
          ขั้นบันไดภาษีไม่เป็นเชิงเส้น ยอด 8 เดือนคิดตรง ๆ จะได้ภาษีต่ำกว่าจริงหลายเท่า
          จึงต้องโชว์แยกเป็นอีกการ์ด ไม่ใช่เอาไปปนกับเลข "ที่กรอกจริง" ด้านบน */}
      {projection.projected && (
        <View style={styles.projectCard}>
          <Text style={styles.projectLabel}>
            คาดทั้งปี — ถ้าเดือนที่เหลือได้เท่าเดือน {MONTH_LABELS_TH[projection.basedOnMonth - 1]}
          </Text>
          <Text style={styles.projectValue}>{formatCurrency(projection.projected.tax)}</Text>
          <Text style={styles.projectFoot}>
            เงินได้จากงาน {formatCurrency(projection.projected.salaryIncome)} · เงินได้สุทธิ{' '}
            {formatCurrency(projection.projected.netIncome)} · อยู่ขั้น{' '}
            {(projection.projected.marginalRate * 100).toFixed(0)}%
            {'\n'}
            {projection.projected.balance > 0
              ? `ถ้าหัก ณ ที่จ่ายเดินต่อแบบนี้ สิ้นปีต้องจ่ายเพิ่ม ${formatCurrency(projection.projected.balance)}`
              : `ถ้าหัก ณ ที่จ่ายเดินต่อแบบนี้ สิ้นปีได้คืน ${formatCurrency(Math.abs(projection.projected.balance))}`}
          </Text>
          <Text style={styles.projectWarn}>
            โบนัสไม่ถูกประมาณให้ (ไม่ได้รับทุกเดือน) — ถ้าปีนี้จะได้โบนัสอีก ให้ใส่ในเดือนที่คาดว่าจะได้
          </Text>
        </View>
      )}

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
        {/* ── ตารางรายเดือน: กรอกจากสลิปเงินเดือนเดือนต่อเดือน ── */}
        <Text style={styles.tableTitle}>กรอกจากสลิปเงินเดือน (รายเดือน)</Text>
        <Text style={styles.tableHint}>
          ภาษีทั้งปีคิดจากยอดรวม ดังนั้นกรอกรายเดือนไม่ได้ทำให้ภาษีเปลี่ยน — แต่ได้หัก ณ ที่จ่ายที่ตรงจริง
          (แต่ละเดือนไม่เท่ากัน) และแยก "ที่เกิดจริงแล้ว" กับ "คาดทั้งปี" ออกจากกันได้
        </Text>

        <TouchableOpacity style={styles.fillBtn} onPress={fillFromIncomes}>
          <Ionicons name="download-outline" size={15} color={COLORS.primary} />
          <Text style={styles.fillBtnText}>เติมเงินเดือน/โบนัสจากหน้ารายรับ (ครั้งเดียว)</Text>
        </TouchableOpacity>

        {/* หัวตารางเฉพาะเดสก์ท็อป — มือถือใช้ label ในแต่ละช่องแทน เพราะ 4 ช่องในแถวเดียวแคบเกิน */}
        {isDesktop && (
          <View style={styles.mRowHead}>
            <Text style={[styles.mHeadCell, styles.mMonthCell]}>เดือน</Text>
            {MONTH_COLUMNS.map((c) => (
              <Text key={c.key} style={[styles.mHeadCell, styles.mInputCell]}>{c.label}</Text>
            ))}
            <Text style={[styles.mHeadCell, styles.mCopyCell]}> </Text>
          </View>
        )}

        {(profile.months || emptyTaxMonths()).map((m) => (
          <View key={m.month} style={[styles.mRow, !isDesktop && styles.mRowMobile]}>
            <Text style={[styles.mMonthLabel, isDesktop && styles.mMonthCell]}>
              {MONTH_LABELS_TH[m.month - 1]}
            </Text>
            <View style={[styles.mFields, !isDesktop && styles.mFieldsMobile]}>
              {MONTH_COLUMNS.map((c) => (
                <View key={c.key} style={[styles.mInputCell, !isDesktop && styles.mInputCellMobile]}>
                  {!isDesktop && <Text style={styles.mMiniLabel}>{c.label}</Text>}
                  <TextInput
                    style={styles.mInput}
                    value={m[c.key] ? String(m[c.key]) : ''}
                    onChangeText={(v) => setMonthField(m.month, c.key, v)}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={COLORS.textSecondary}
                  />
                </View>
              ))}
            </View>
            {m.month < 12 && (
              <TouchableOpacity
                style={[styles.mCopyBtn, isDesktop && styles.mCopyCell]}
                onPress={() => copyMonthDown(m.month)}
              >
                <Ionicons name="arrow-down-outline" size={13} color={COLORS.primary} />
                <Text style={styles.mCopyText}>{isDesktop ? '' : ' เติมลงเดือนที่เหลือ'}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        {/* แถวรวม — ตัวเลขชุดนี้คือฐานที่เอาไปคิดภาษีจริง */}
        <View style={styles.mTotalRow}>
          <Text style={styles.mTotalLabel}>
            รวม {monthTotals.filledMonths}/12 เดือน
          </Text>
          <Text style={styles.mTotalValue}>
            เงินเดือน+โบนัส {formatCurrency(monthTotals.salary + monthTotals.bonus)} · หัก ณ ที่จ่าย{' '}
            {formatCurrency(monthTotals.withheld)} · ปกส. {formatCurrency(monthTotals.socialSecurity)}
            {monthTotals.socialSecurity > SOCIAL_SECURITY_CAP
              ? ` (ลดหย่อนได้แค่ ${formatCurrency(SOCIAL_SECURITY_CAP)})`
              : ''}
          </Text>
        </View>

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

  // การ์ด "คาดทั้งปี" — สีเตือนเพราะเป็นเลขพยากรณ์ ไม่ใช่เลขที่เกิดขึ้นจริงแล้ว
  projectCard: {
    ...card,
    padding: 16,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },
  projectLabel: { ...TEXT.caption, color: COLORS.textSecondary },
  projectValue: { ...TEXT.amount, color: COLORS.text, marginTop: 2 },
  projectFoot: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 8, lineHeight: 17 },
  projectWarn: { ...TEXT.hint, color: COLORS.warning, marginTop: 8, lineHeight: 16 },

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

  // ── ตารางรายเดือน ──
  tableTitle: { ...TEXT.subtitle, color: COLORS.text, marginTop: 16 },
  tableHint: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 4, lineHeight: 16 },
  mRowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  mHeadCell: { ...TEXT.hint, color: COLORS.textSecondary },
  mRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  // มือถือ: เดือนอยู่บรรทัดบน ช่องกรอกลงมาเป็น 2×2 — 4 ช่องเรียงแถวเดียวบนจอ 350px แคบเกินกรอกไม่ได้
  mRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    paddingBottom: 10,
  },
  mMonthLabel: { ...TEXT.label, color: COLORS.text },
  mMonthCell: { width: 44 },
  mFields: { flexDirection: 'row', gap: 8, flex: 1, minWidth: 0 },
  mFieldsMobile: { flexWrap: 'wrap', marginTop: 6 },
  // flex + minWidth:0 คู่กันบังคับ — <input> บนเว็บมี intrinsic width ~20 ตัวอักษร ถ้าไม่ใส่จะล้นแถว
  mInputCell: { flex: 1, minWidth: 0 },
  mInputCellMobile: { flexBasis: '46%', flexGrow: 1 },
  mMiniLabel: { ...TEXT.hint, color: COLORS.textSecondary, marginBottom: 3 },
  mInput: {
    ...TEXT.caption,
    minWidth: 0,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  mCopyCell: { width: 30 },
  mCopyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  mCopyText: { ...TEXT.hint, color: COLORS.primary },
  mTotalRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  mTotalLabel: { ...TEXT.label, color: COLORS.text },
  mTotalValue: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 3, lineHeight: 17 },

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
