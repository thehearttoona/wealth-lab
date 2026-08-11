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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { InvestmentType, RealizedTrade, INVESTMENT_TYPES } from '../types/investment';
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
  socialSecurityLimits,
  DEDUCTION_ITEMS,
  DEDUCTION_GROUP_LABELS,
  DEDUCTION_CAP_GROUPS,
  DeductionItem,
  DeductionGroup,
  TaxYearFactKey,
  TAX_YEAR_FACT_FIELDS,
} from '../types/tax';
import {
  calculateTax,
  gainRuleFor,
  projectFullYear,
  socialSecurityForSalary,
  estimateWithholding,
} from '../utils/taxCalc';
import { useResponsive } from '../utils/responsive';
import { getRealizedTrades } from '../services/realizedStorage';
import { UserProfile, incomeExemptionFor, isUserProfileAnswered } from '../types/userProfile';
import { getUserProfile } from '../services/userProfileStorage';
import { adviseDeductions, autoFillableDeductions } from '../utils/deductionAdvice';
import { getTaxProfile, saveTaxProfile, getTaxYears, isTaxTableMissing } from '../services/taxStorage';
import { COLORS, FONTS, TEXT, formatCurrency } from '../utils/constants';
import { notify, confirmAsk } from '../utils/dialog';

const currentBuddhistYear = () => new Date().getFullYear() + 543;

// แปลง input เป็นตัวเลข — ผู้ใช้พิมพ์ comma มาได้ และช่องว่างต้องเป็น 0 ไม่ใช่ NaN
const num = (s: string): number => {
  const n = parseFloat((s || '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// เหลือช่องเดียวที่เป็น "ยอดทั้งปี" แบบก้อนเดียว
// เงินเดือน/โบนัส/หัก ณ ที่จ่าย/ประกันสังคม อยู่ในตารางรายเดือน ส่วนลดหย่อนแยกเป็นรายการแล้ว
type FormKey = 'otherIncome';

const FIELDS: { key: FormKey; label: string; hint?: string }[] = [
  {
    key: 'otherIncome',
    label: 'เงินได้อื่นที่ต้องนำมารวม (ทั้งปี)',
    hint: 'เช่น ดอกเบี้ย ค่าเช่า — ส่วนนี้ไม่ได้หักค่าใช้จ่าย 50%',
  },
];

/** เพดานของรายการนั้นเป็นข้อความสั้น ๆ ไว้โชว์ท้ายช่องกรอก */
const capTextOf = (item: DeductionItem, assessableIncome: number): string | null => {
  const parts: string[] = [];
  if (item.capPercentOfIncome != null) {
    const byPercent = (assessableIncome * item.capPercentOfIncome) / 100;
    parts.push(`${item.capPercentOfIncome}% ของเงินได้ = ${formatCurrency(byPercent)}`);
  }
  if (item.cap != null) parts.push(`เพดาน ${formatCurrency(item.cap)}`);
  if (parts.length === 0) return null;
  return `ใช้ได้ ${parts.join(' · ')}${parts.length > 1 ? ' (เอาตัวที่น้อยกว่า)' : ''}`;
};

// คอลัมน์ในตารางรายเดือน — ตรงกับสลิปเงินเดือน 1 ใบ
const MONTH_COLUMNS: { key: keyof Omit<TaxMonth, 'month'>; label: string }[] = [
  { key: 'salary', label: 'เงินเดือน' },
  { key: 'bonus', label: 'โบนัส' },
  { key: 'withheld', label: 'หัก ณ ที่จ่าย' },
  { key: 'socialSecurity', label: 'ประกันสังคม' },
];

type SectionId = 'form' | 'deduct' | 'gains' | 'method' | 'rules' | 'brackets';

/** บรรทัดในสูตร — ซ้ายคำอธิบาย ขวาตัวเลข (เว้น value ไว้ = บรรทัดข้อความล้วน) */
const FormulaLine: React.FC<{ label: string; value?: string; strong?: boolean }> = ({
  label,
  value,
  strong,
}) => (
  <View style={[styles.formulaRow, strong && styles.formulaRowStrong]}>
    <Text style={[styles.formulaLabel, strong && styles.formulaLabelStrong]}>{label}</Text>
    {value !== undefined && (
      <Text style={[styles.formulaValue, strong && styles.formulaValueStrong]}>{value}</Text>
    )}
  </View>
);

/**
 * ⚠️ ต้องอยู่นอก TaxScreen เท่านั้น — ห้ามย้ายกลับเข้าไปประกาศในตัว component
 * ถ้าประกาศข้างใน ทุกครั้งที่ state ขยับ (= ทุกตัวอักษรที่พิมพ์) React จะเห็นเป็น
 * "คอมโพเนนต์ชนิดใหม่" แล้ว unmount/mount ทั้งก้อนใหม่ → ช่องกรอกทุกช่องหลุดโฟกัส
 * ทันทีที่พิมพ์ตัวแรก กลายเป็นกรอกอะไรไม่ได้เลยทั้งหน้า (บั๊กที่เพิ่งแก้ไป)
 */
const Section: React.FC<{
  id: SectionId;
  title: string;
  subtitle?: string;
  openId: SectionId | null;
  onToggle: (id: SectionId) => void;
  children: React.ReactNode;
}> = ({ id, title, subtitle, openId, onToggle, children }) => {
  const open = openId === id;
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHeader} onPress={() => onToggle(id)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textSecondary} />
      </TouchableOpacity>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
};

/**
 * ช่องกรอกตัวเลขที่เก็บ "ข้อความดิบ" ไว้ระหว่างพิมพ์ แล้วส่งค่าที่แปลงแล้วออกไปให้ฟอร์ม
 * ถ้าผูก value กับตัวเลขตรง ๆ (String(number)) ทุกคีย์จะถูก normalize ทับ:
 * พิมพ์ "1234." จุดจะหายทันที ทศนิยมจึงพิมพ์ไม่ได้ และลบจนว่างก็เด้งเป็น 0
 * พอ blur ค่อย sync กลับเป็นเลขมาตรฐาน (null = ไม่ได้กำลังพิมพ์ ให้ยึดค่าจาก props)
 */
const NumberInput: React.FC<{
  /** ค่าที่จะโชว์ตอนไม่ได้พิมพ์ — ให้ผู้เรียกจัดรูปเอง (แต่ละช่องมีกฎ "ว่าง" ของตัวเอง) */
  display: string;
  onChangeNumber: (raw: string) => void;
  style?: any;
  placeholder?: string;
}> = ({ display, onChangeNumber, style, placeholder }) => {
  const [typing, setTyping] = useState<string | null>(null);
  return (
    <TextInput
      style={style}
      value={typing ?? display}
      onChangeText={(v) => {
        setTyping(v);
        onChangeNumber(v);
      }}
      onBlur={() => setTyping(null)}
      keyboardType="numeric"
      // ทุกช่องมีเลขเดิมอยู่แล้ว (ระบบเติมให้/ก๊อปลงมา) การแก้จึงเป็นการ "พิมพ์ทับ" เกือบทุกครั้ง
      // ถ้าไม่ select ให้ ผู้ใช้ต้องลากคลุมเองทุกช่อง หรือพิมพ์ต่อท้ายเลขเดิมโดยไม่ตั้งใจ
      selectTextOnFocus
      placeholder={placeholder ?? '0'}
      placeholderTextColor={COLORS.textSecondary}
    />
  );
};

export default function TaxScreen() {
  const { isDesktop } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [year, setYear] = useState(currentBuddhistYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [profile, setProfile] = useState<TaxProfile>(emptyTaxProfile(currentBuddhistYear()));
  const [trades, setTrades] = useState<RealizedTrade[]>([]);
  const [person, setPerson] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  // ยุบรายละเอียดไว้ก่อน โชว์แค่คำตอบ — กางเองเมื่ออยากเห็นที่มา
  const [openSection, setOpenSection] = useState<SectionId | null>('form');
  // เงื่อนไขของค่าลดหย่อน — เปิดทีละรายการ (คีย์ของ DEDUCTION_ITEMS)
  const [openCondition, setOpenCondition] = useState<string | null>(null);

  const load = useCallback(async (targetYear: number) => {
    setLoading(true);
    try {
      setTrades(await getRealizedTrades());
      // ข้อมูลส่วนตัวเป็นของเสริม — ตารางยังไม่มีก็ยังใช้หน้าภาษีได้ปกติ แค่ไม่มีคำแนะนำสิทธิ์
      try {
        setPerson(await getUserProfile());
      } catch {
        setPerson(null);
      }
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

  // ยกเว้นเงินได้ 190,000 (อายุ 65+/ผู้พิการ) — มาจากข้อมูลส่วนตัว ไม่ใช่ของที่กรอกในหน้านี้
  // ต้องส่งเข้าทุกการคำนวณด้วย opts เดียวกัน ไม่งั้นการ์ดคาดทั้งปีกับการ์ดหลักจะไม่ตรงกัน
  const exemption = useMemo(() => incomeExemptionFor(person, year), [person, year]);
  const taxOpts = useMemo(() => ({ incomeExemption: exemption.amount }), [exemption.amount]);

  const breakdown = useMemo(() => calculateTax(profile, trades, taxOpts), [profile, trades, taxOpts]);
  const monthTotals = useMemo(() => sumTaxMonths(profile.months), [profile.months]);
  // เงินที่เข้าบัญชีจริงทั้งปี = เงินได้ − หัก ณ ที่จ่าย − ประกันสังคม
  // (ปกส. ที่หักจริงทั้งจำนวน ไม่ใช่เพดานลดหย่อน 9,000 — คนละเรื่องกัน)
  const netReceived =
    monthTotals.salary + monthTotals.bonus - monthTotals.withheld - monthTotals.socialSecurity;
  // เพดานประกันสังคมของปีที่เลือกอยู่ — ต่างกันตามปี (2569 ขยับเป็นฐาน 17,500 / 875 ต่อเดือน)
  const ssoLimits = socialSecurityLimits(year);
  // ค่ากลางทางของการหัก ณ ที่จ่าย — ใช้กางสูตรให้ดูในหัวข้อ "วิธีคิดตัวเลข"
  // เรียกฟังก์ชันตัวเดียวกับปุ่มคำนวณ สูตรที่โชว์จึงเป็นสูตรที่ใช้จริงเสมอ
  const wh = useMemo(() => estimateWithholding(profile), [profile]);
  // ประตูของหัวข้อค่าลดหย่อน: ไม่มีข้อมูลส่วนตัว = ทุกสิทธิ์เป็น "ยังไม่รู้" และคิดยอดจากจำนวนคนไม่ได้
  // จึงล็อกไว้แล้วชี้ไปกรอกก่อน ดีกว่าโชว์ช่องกรอก 18 ช่องที่ไม่มีป้ายบอกอะไรเลย
  // ล็อกแค่หัวข้อนี้ — เงินเดือน/ภาษีกำไรขาย/สรุปภาษี ยังใช้ได้ปกติเพราะไม่ต้องพึ่งข้อมูลส่วนตัว
  const profileAnswered = isUserProfileAnswered(person);
  // คำแนะนำสิทธิ์ลดหย่อน — มาจาก 2 แหล่ง: ตัวตน (ข้ามปี) + ข้อเท็จจริงของปีที่เลือกอยู่
  const adviceByKey = useMemo(() => {
    const list = adviseDeductions(person, profile.yearFacts);
    return new Map(list.map((a) => [a.item.key, a]));
  }, [person, profile.yearFacts]);
  const autoFillable = useMemo(
    () => autoFillableDeductions([...adviceByKey.values()]),
    [adviceByKey]
  );

  /** เติมยอดที่คำนวณจากจำนวนคนได้ (คู่สมรส/บุตร/พ่อแม่/คนพิการ) — ไม่แตะช่องที่ต้องดูใบเสร็จ */
  const fillFromPersonalInfo = async () => {
    const keys = Object.keys(autoFillable);
    if (keys.length === 0) {
      notify('ยังไม่มีรายการที่คำนวณให้ได้ — ไปกรอกข้อมูลส่วนตัวที่ โปรไฟล์ → ข้อมูลส่วนตัว ก่อน');
      return;
    }
    const overwriting = keys.filter((k) => (profile.deductions?.[k] ?? 0) > 0);
    if (overwriting.length > 0) {
      const ok = await confirmAsk(
        'เขียนทับของเดิม?',
        `จะเขียนทับ ${overwriting.length} ช่องที่กรอกไว้แล้ว ด้วยยอดที่คำนวณจากจำนวนคน`,
        'เติมให้'
      );
      if (!ok) return;
    }
    setProfile((p) => ({ ...p, deductions: { ...(p.deductions || {}), ...autoFillable } }));
    notify(
      `เติมให้แล้ว ${keys.length} รายการ\n` +
        keys.map((k) => `${DEDUCTION_ITEMS.find((i) => i.key === k)?.label}: ${formatCurrency(autoFillable[k])}`).join('\n')
    );
  };
  // ยอดที่กรอกจริง vs คาดทั้งปี — ต้องแยกกัน ไม่งั้นกรอก 8 เดือนแล้วเห็นภาษีต่ำกว่าจริง ~5 เท่า
  const projection = useMemo(
    () => projectFullYear(profile, trades, taxOpts),
    [profile, trades, taxOpts]
  );

  const setField = (key: FormKey, value: string) =>
    setProfile((p) => ({ ...p, [key]: num(value) }));

  // ลดหย่อนรายรายการ — เก็บเฉพาะคีย์ที่มีค่า > 0 จะได้ไม่บวม jsonb ด้วยเลข 0 สิบกว่าคีย์
  const setDeduction = (key: string, value: string) =>
    setProfile((p) => {
      const next = { ...(p.deductions || {}) };
      const n = num(value);
      if (n > 0) next[key] = n;
      else delete next[key];
      return { ...p, deductions: next };
    });

  // ข้อเท็จจริงรายปี — กดคำตอบเดิมซ้ำ = ล้างกลับเป็น "ยังไม่ตอบ" (ต่างจาก "ตอบว่าไม่")
  const setYearFact = (key: TaxYearFactKey, value: boolean) =>
    setProfile((p) => {
      const next = { ...(p.yearFacts || {}) };
      if (next[key] === value) delete next[key];
      else next[key] = value;
      return { ...p, yearFacts: Object.keys(next).length > 0 ? next : undefined };
    });

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
   * เติมประกันสังคม + หัก ณ ที่จ่าย จากเงินเดือนที่กรอกไว้ (ครั้งเดียว แก้ทับได้)
   * ทั้งสองค่าเป็น "ค่าประมาณ" — ของจริงต้องดูสลิป จึงต้องถามก่อนทับของที่กรอกมือไว้แล้ว
   * ลำดับสำคัญ: ใส่ประกันสังคมก่อน เพราะมันเป็นตัวลดหย่อนที่ทำให้ภาษี (และหัก ณ ที่จ่าย) ลดลง
   */
  const fillPayrollDeductions = async () => {
    const months = profile.months || emptyTaxMonths();
    if (!months.some((m) => (m.salary || 0) > 0)) {
      notify('ยังไม่มีเงินเดือนในตาราง — กรอกเงินเดือนอย่างน้อย 1 เดือนก่อน');
      return;
    }
    const hasManual = months.some((m) => (m.withheld || 0) > 0 || (m.socialSecurity || 0) > 0);
    if (hasManual) {
      const ok = await confirmAsk(
        'เขียนทับของเดิม?',
        'มีหัก ณ ที่จ่าย/ประกันสังคมที่กรอกไว้แล้ว การคำนวณให้จะเขียนทับทุกเดือนที่มีเงินเดือน',
        'คำนวณให้'
      );
      if (!ok) return;
    }

    const withSSO = months.map((m) => ({
      ...m,
      socialSecurity: socialSecurityForSalary(m.salary, year),
    }));
    const est = estimateWithholding({ ...profile, months: withSSO });
    setProfile((p) => ({ ...p, months: est.months }));

    const t = sumTaxMonths(est.months);
    notify(
      `คำนวณให้แล้ว — ประกันสังคมรวม ${formatCurrency(t.socialSecurity)} · หัก ณ ที่จ่ายรวม ${formatCurrency(t.withheld)}\n` +
        'หัก ณ ที่จ่ายคิดแบบเดียวกับที่ฝ่ายบุคคลหักจริง (เงินเดือนเดือนนั้น × 12 ' +
        'ไม่เอาประกันสังคมมาลดหย่อน) ยอดจึงตรงกับสลิป — ส่วนที่หักเกินจะไปโผล่เป็น "ได้คืน" ตอนยื่นภาษี\n' +
        'ถ้าเดือนไหนยังไม่ตรง พิมพ์ยอดจากสลิปทับได้เลย'
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

  const toggleSection = (id: SectionId) => setOpenSection((cur) => (cur === id ? null : id));

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
        openId={openSection}
        onToggle={toggleSection}
        title="รายได้ & ลดหย่อน"
        subtitle={`เงินได้จากงาน ${formatCurrency(breakdown.salaryIncome)}`}
      >
        {/* ── ตารางรายเดือน: กรอกจากสลิปเงินเดือนเดือนต่อเดือน ── */}
        <Text style={styles.tableTitle}>กรอกจากสลิปเงินเดือน (รายเดือน)</Text>
        <Text style={styles.tableHint}>
          ภาษีทั้งปีคิดจากยอดรวม ดังนั้นกรอกรายเดือนไม่ได้ทำให้ภาษีเปลี่ยน — แต่ได้หัก ณ ที่จ่ายที่ตรงจริง
          (แต่ละเดือนไม่เท่ากัน) และแยก "ที่เกิดจริงแล้ว" กับ "คาดทั้งปี" ออกจากกันได้
        </Text>

        <TouchableOpacity style={styles.fillBtn} onPress={fillPayrollDeductions}>
          <Ionicons name="calculator-outline" size={15} color={COLORS.primary} />
          <Text style={styles.fillBtnText}>คำนวณประกันสังคม + หัก ณ ที่จ่าย จากเงินเดือน</Text>
        </TouchableOpacity>
        <Text style={styles.tableHint}>
          ประกันสังคม ปี {year} = 5% ของเงินเดือน (ฐานไม่เกิน {formatCurrency(ssoLimits.baseCap)} → สูงสุด{' '}
          {ssoLimits.monthlyCap}/เดือน){'\n'}
          หัก ณ ที่จ่าย = จำลองวิธีที่ฝ่ายบุคคลหักจริง — ตั้งยอดจาก "เงินเดือนเดือนแรก × 12" ครั้งเดียว
          แล้วหักเท่ากันทุกเดือน (ขึ้นเงินเดือนกลางปี payroll ไม่ได้คำนวณใหม่){'\n'}
          ไม่เอาประกันสังคมมาลดหย่อนในขั้นนี้ เพราะลดหย่อนตัวนั้นต้องยื่น ล.ย.01 ก่อน payroll ส่วนใหญ่จึงหักเผื่อไว้
          — ส่วนที่หักเกินจะไปโผล่เป็น "ได้คืน" ตอนยื่นภาษี ซึ่งเป็นเลขที่หน้านี้มีไว้บอก
        </Text>
        <Text style={styles.tableHint}>
          ช่อง "รับจริง" กรอกกลับได้ — ใส่ยอดที่เข้าบัญชีจริงตามสลิป ระบบจะถอดกลับเป็นหัก ณ ที่จ่ายให้เอง
          (รับจริง = เงินเดือน + โบนัส − หัก ณ ที่จ่าย − ประกันสังคม){'\n'}
          ข้อควรรู้: ถ้าสลิปมีรายการหักอื่นด้วย เช่น กองทุนสำรองเลี้ยงชีพหรือประกันกลุ่ม ยอดที่ถอดกลับได้
          จะรวมของพวกนั้นเข้าไปในหัก ณ ที่จ่ายด้วย ทำให้ดูเหมือนจ่ายภาษีไว้เกิน — กรณีนั้นให้พิมพ์ตัวเลข
          ภาษีจากสลิปลงช่อง "หัก ณ ที่จ่าย" ตรง ๆ แทน
        </Text>

        {/* หัวตารางเฉพาะเดสก์ท็อป — มือถือใช้ label ในแต่ละช่องแทน เพราะ 4 ช่องในแถวเดียวแคบเกิน */}
        {isDesktop && (
          <View style={styles.mRowHead}>
            <Text style={[styles.mHeadCell, styles.mCopyCell]}> </Text>
            <Text style={[styles.mHeadCell, styles.mMonthCell]}>เดือน</Text>
            {MONTH_COLUMNS.map((c) => (
              <Text key={c.key} style={[styles.mHeadCell, styles.mInputCell]}>{c.label}</Text>
            ))}
            <Text style={[styles.mHeadCell, styles.mNetCol]}>รับจริง (จากสลิป)</Text>
          </View>
        )}

        {(profile.months || emptyTaxMonths()).map((m) => {
          // เงินที่เข้าบัญชีจริงของเดือนนั้น — สลิปหักภาษีกับประกันสังคมออกก่อนโอน
          // ไม่ใช่ตัวเลขที่ใช้คิดภาษี (ภาษีคิดจากเงินได้ก่อนหัก) แต่เป็นเลขที่เอาไปวางแผนใช้จ่ายได้
          const gross = (m.salary || 0) + (m.bonus || 0);
          const net = gross - (m.withheld || 0) - (m.socialSecurity || 0);
          // ช่อง "รับจริง" กรอกกลับได้ — ยอดเข้าบัญชีคือเลขที่ผู้ใช้รู้แน่ที่สุด (เห็นในแอปธนาคาร)
          // ส่วนหัก ณ ที่จ่ายเป็นค่าที่ระบบเดา ไม่มีทางตรงสลิปเป๊ะ จึงให้ถอดกลับจากยอดที่รู้แทน
          const netCell = gross > 0 ? (
            <NumberInput
              style={styles.mInput}
              // โชว์เป็นเลขดิบเหมือนอีก 4 ช่อง (34000 ไม่ใช่ 34,000.00) — ช่องกรอกที่มีคอมม่า/ทศนิยม
              // ทำให้พิมพ์ทับยากและอ่านสลับกับช่องข้าง ๆ ไม่ออกว่าอันไหนกรอกได้
              display={net ? String(Math.round(net * 100) / 100) : ''}
              onChangeNumber={(v) =>
                setMonthField(m.month, 'withheld', String(Math.max(0, gross - (m.socialSecurity || 0) - num(v))))
              }
            />
          ) : (
            <Text style={[styles.mInput, styles.mNetPlaceholder]}>—</Text>
          );
          return (
            <View key={m.month} style={[styles.mRow, !isDesktop && styles.mRowMobile]}>
              {/* ลูกศรอยู่หน้าสุดและ "จองที่" ไว้ทุกแถว แม้ ธ.ค. จะไม่มีปุ่ม
                  เดิมปุ่มอยู่ท้ายแถวและหายไปในเดือน ธ.ค. ทำให้ช่องกรอกแถวสุดท้ายกว้างไม่เท่าแถวอื่น */}
              {isDesktop && (
                <View style={styles.mCopyCell}>
                  {m.month < 12 && (
                    <TouchableOpacity style={styles.mCopyBtn} onPress={() => copyMonthDown(m.month)}>
                      <Ionicons name="arrow-down-outline" size={13} color={COLORS.primary} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {isDesktop ? (
                <Text style={[styles.mMonthLabel, styles.mMonthCell]}>
                  {MONTH_LABELS_TH[m.month - 1]}
                </Text>
              ) : (
                <Text style={styles.mMonthLabel}>{MONTH_LABELS_TH[m.month - 1]}</Text>
              )}
              <View style={[styles.mFields, !isDesktop && styles.mFieldsMobile]}>
                {MONTH_COLUMNS.map((c) => (
                  <View key={c.key} style={[styles.mInputCell, !isDesktop && styles.mInputCellMobile]}>
                    {!isDesktop && <Text style={styles.mMiniLabel}>{c.label}</Text>}
                    <NumberInput
                      style={styles.mInput}
                      display={m[c.key] ? String(m[c.key]) : ''}
                      onChangeNumber={(v) => setMonthField(m.month, c.key, v)}
                    />
                  </View>
                ))}
                {/* มือถือ: "รับจริง" ลงไปอยู่ในกริดช่องกรอกด้วยกัน เพราะแถวเป็นแนวตั้งอยู่แล้ว */}
                {!isDesktop && (
                  <View style={[styles.mInputCell, styles.mInputCellMobile]}>
                    <Text style={styles.mMiniLabel}>รับจริง</Text>
                    {netCell}
                  </View>
                )}
              </View>
              {isDesktop && <View style={styles.mNetCol}>{netCell}</View>}
              {!isDesktop && m.month < 12 && (
                <TouchableOpacity style={styles.mCopyBtn} onPress={() => copyMonthDown(m.month)}>
                  <Ionicons name="arrow-down-outline" size={13} color={COLORS.primary} />
                  <Text style={styles.mCopyText}> เติมลงเดือนที่เหลือ</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* แถวรวม — ตัวเลขชุดนี้คือฐานที่เอาไปคิดภาษีจริง */}
        <View style={styles.mTotalRow}>
          <Text style={styles.mTotalLabel}>
            รวม {monthTotals.filledMonths}/12 เดือน
          </Text>
          <Text style={styles.mTotalValue}>
            เงินเดือน+โบนัส {formatCurrency(monthTotals.salary + monthTotals.bonus)} · หัก ณ ที่จ่าย{' '}
            {formatCurrency(monthTotals.withheld)} · ปกส. {formatCurrency(monthTotals.socialSecurity)}
            {monthTotals.socialSecurity > ssoLimits.annualCap
              ? ` (ลดหย่อนได้แค่ ${formatCurrency(ssoLimits.annualCap)})`
              : ''}
            {'\n'}
            รับจริงรวม {formatCurrency(netReceived)} · เฉลี่ยเดือนละ{' '}
            {monthTotals.filledMonths > 0
              ? formatCurrency(netReceived / monthTotals.filledMonths)
              : formatCurrency(0)}{' '}
            (เฉลี่ยจาก {monthTotals.filledMonths} เดือนที่กรอก)
          </Text>
        </View>

        {FIELDS.map((f) => (
          <View key={f.key} style={styles.field}>
            <Text style={styles.fieldLabel}>{f.label}</Text>
            <NumberInput
              style={styles.input}
              display={profile[f.key] ? String(profile[f.key]) : ''}
              onChangeNumber={(v) => setField(f.key, v)}
            />
            {f.hint ? <Text style={styles.fieldHint}>{f.hint}</Text> : null}
          </View>
        ))}

        <View style={styles.calcBox}>
          {breakdown.incomeExemption > 0 && (
            <CalcLine
              label={`ยกเว้นเงินได้ 190,000 (${exemption.reason})`}
              value={-breakdown.incomeExemption}
            />
          )}
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

      {/* ── ค่าลดหย่อนแยกรายการ ──
          เดิมเป็นช่อง "ลดหย่อนอื่น ๆ" ก้อนเดียว ซึ่งกรอกเกินสิทธิ์ได้โดยไม่มีอะไรเตือน
          (RMF เพดาน 30% ของเงินได้, กลุ่มเกษียณรวม 500,000, ประกันชีวิต+สุขภาพ 100,000 ฯลฯ)
          แยกเป็นรายการแล้วหน้าจอทำหน้าที่ 2 อย่างพร้อมกัน: บอกว่าปีนี้ลดหย่อนอะไรได้บ้าง และตัดเพดานให้ */}
      <Section
        id="deduct"
        openId={openSection}
        onToggle={toggleSection}
        title="ค่าลดหย่อน — ปีนี้ใช้อะไรได้บ้าง"
        subtitle={
          !profileAnswered
            ? 'ต้องกรอกข้อมูลส่วนตัวก่อน'
            : breakdown.extraDeductions > 0
              ? `ใช้ไปแล้ว ${formatCurrency(breakdown.extraDeductions)}`
              : 'ยังไม่ได้กรอก — กดดูรายการทั้งหมด'
        }
      >
        {/* ── ประตู: ไม่มีข้อมูลส่วนตัว = ตัดสินสิทธิ์ไม่ได้ ── */}
        {!profileAnswered ? (
          <View>
            <View style={styles.lockBox}>
              <Ionicons name="person-circle-outline" size={22} color={COLORS.primary} />
              <Text style={styles.lockTitle}>ยังกรอกไม่ได้</Text>
              <Text style={styles.lockText}>
                หัวข้อนี้ต้องรู้ข้อมูลส่วนตัวก่อน (วันเกิด สถานภาพสมรส จำนวนคนในอุปการะ)
                ระบบจะได้บอกว่าปีนี้ใช้สิทธิ์อะไรได้ อะไรไม่ได้ และคิดยอดที่มาจากจำนวนคนให้อัตโนมัติ
              </Text>
              <TouchableOpacity
                style={styles.lockBtn}
                onPress={() => navigation.navigate('PersonalInfo')}
              >
                <Text style={styles.lockBtnText}>ไปกรอกข้อมูลส่วนตัว</Text>
                <Ionicons name="arrow-forward" size={14} color="#ffffff" />
              </TouchableOpacity>
            </View>
            {/* ยอดเก่าที่กรอกไว้ก่อนหน้ายังถูกคิดภาษีอยู่ — ต้องบอก ไม่งั้นดูเหมือนหายไปทั้งก้อน */}
            {breakdown.extraDeductions > 0 && (
              <Text style={styles.lockKeepNote}>
                ยอดลดหย่อน {formatCurrency(breakdown.extraDeductions)} ที่กรอกไว้ก่อนหน้านี้
                ยังถูกนำไปคำนวณอยู่ ไม่ได้ถูกลบ — กรอกข้อมูลส่วนตัวแล้วจะกลับมาแก้ไขได้
              </Text>
            )}
          </View>
        ) : (
          <>
        <Text style={styles.tableHint}>
          ลดหย่อนส่วนตัว {formatCurrency(PERSONAL_ALLOWANCE)} และประกันสังคม{' '}
          {formatCurrency(breakdown.socialSecurity)} ระบบใส่ให้อัตโนมัติแล้ว ไม่ต้องกรอกซ้ำในนี้{'\n'}
          กรอก "ยอดที่จ่ายจริง" ลงไปได้เลย ระบบจะตัดให้เหลือเท่าที่สิทธิ์อนุญาตเอง
        </Text>

        {/* ── ข้อเท็จจริงของปีนี้ ──
            อยู่ในหน้าภาษีไม่ใช่หน้าข้อมูลส่วนตัว เพราะทุกข้อเปลี่ยนได้ทุกปี (ผ่อนบ้านหมด ย้ายงาน ฯลฯ)
            เก็บใน tax_profiles.year_facts ของปีที่เลือกอยู่ ปีเก่าจึงไม่เปลี่ยนตามปีใหม่ */}
        <Text style={styles.factTitle}>ปี {year} — ตอบ 5 ข้อนี้เพื่อให้ระบบตัดสิทธิ์ให้ถูก</Text>
        <View style={styles.factCard}>
          {TAX_YEAR_FACT_FIELDS.map((f, i) => (
            <View key={f.key} style={[styles.factRow, i > 0 && styles.factRowBorder]}>
              <View style={styles.factInfo}>
                <Text style={styles.factLabel}>{f.label}</Text>
                <Text style={styles.factHint}>{f.hint}</Text>
              </View>
              <View style={styles.yesNo}>
                {[true, false].map((v) => {
                  const active = profile.yearFacts?.[f.key] === v;
                  return (
                    <TouchableOpacity
                      key={String(v)}
                      style={[styles.factChip, active && styles.factChipActive]}
                      onPress={() => setYearFact(f.key, v)}
                    >
                      <Text style={[styles.factChipText, active && styles.factChipTextActive]}>
                        {v ? 'ใช่' : 'ไม่'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
          <Text style={styles.factFoot}>
            กดคำตอบเดิมซ้ำ = ล้างกลับเป็นยังไม่ตอบ · ข้อที่ยังไม่ตอบจะไม่ถูกตัดสินว่าใช้ไม่ได้
          </Text>
        </View>

        {/* เติมยอดที่คิดจากจำนวนคนได้เลย — ส่วนที่เหลือยังต้องดูใบเสร็จ/หนังสือรับรอง */}
        <TouchableOpacity style={styles.fillBtn} onPress={fillFromPersonalInfo}>
          <Ionicons name="person-circle-outline" size={15} color={COLORS.primary} />
          <Text style={styles.fillBtnText}>
            เติมจากข้อมูลส่วนตัว ({Object.keys(autoFillable).length} รายการ)
          </Text>
        </TouchableOpacity>

        {breakdown.deductionsCapped.length > 0 && (
          <View style={styles.capWarnBox}>
            <Text style={styles.capWarnTitle}>กรอกเกินสิทธิ์ — ส่วนเกินไม่ถูกนำมาหัก</Text>
            {breakdown.deductionsCapped.map((c) => (
              <Text key={c.key} style={styles.capWarnText}>
                {c.label}: กรอก {formatCurrency(c.entered)} · หักได้ {formatCurrency(c.allowed)} —{' '}
                {c.reason}
              </Text>
            ))}
          </View>
        )}

        {(Object.keys(DEDUCTION_GROUP_LABELS) as DeductionGroup[]).map((g) => {
          const items = DEDUCTION_ITEMS.filter((i) => i.group === g);
          if (items.length === 0) return null;
          const capGroup = items.find((i) => i.capGroup)?.capGroup;
          return (
            <View key={g}>
              <Text style={styles.deductGroupTitle}>{DEDUCTION_GROUP_LABELS[g]}</Text>
              {capGroup && (
                <Text style={styles.deductGroupCap}>
                  เพดานรวมทั้งกลุ่ม {formatCurrency(DEDUCTION_CAP_GROUPS[capGroup].cap)}
                </Text>
              )}
              {items.map((item) => {
                const capText = capTextOf(item, breakdown.salaryIncome + breakdown.otherIncome);
                const openCond = openCondition === item.key;
                const adv = adviceByKey.get(item.key);
                return (
                  <View key={item.key} style={styles.deductRow}>
                    <View style={styles.deductInfo}>
                      <Text style={styles.deductLabel}>{item.label}</Text>
                      {/* ป้ายสิทธิ์จากข้อมูลส่วนตัว — "ยังไม่รู้" ต้องต่างจาก "ใช้ไม่ได้"
                          ไม่งั้นคนที่ยังไม่กรอกโปรไฟล์จะนึกว่าตัวเองไม่มีสิทธิ์แล้วเสียสิทธิ์จริง */}
                      {adv && adv.status !== 'unknown' && (
                        <Text
                          style={[
                            styles.eligBadge,
                            adv.status === 'eligible' ? styles.eligOk : styles.eligNo,
                          ]}
                        >
                          {adv.status === 'eligible' ? 'ใช้สิทธิ์ได้' : 'ใช้ไม่ได้'} — {adv.reason}
                        </Text>
                      )}
                      <Text style={styles.deductNote}>{item.note}</Text>
                      {capText && <Text style={styles.deductCap}>{capText}</Text>}
                      {/* เงื่อนไขซ่อนไว้ กดดูทีละรายการ — กางทั้ง 18 รายการพร้อมกันจะยาวจนหาช่องกรอกไม่เจอ */}
                      {item.conditions && item.conditions.length > 0 && (
                        <TouchableOpacity
                          style={styles.condToggle}
                          onPress={() => setOpenCondition(openCond ? null : item.key)}
                        >
                          <Ionicons
                            name={openCond ? 'chevron-up' : 'chevron-down'}
                            size={12}
                            color={COLORS.primary}
                          />
                          <Text style={styles.condToggleText}>
                            {openCond ? ' ปิดเงื่อนไข' : ` เงื่อนไขการใช้สิทธิ์ (${item.conditions.length})`}
                          </Text>
                        </TouchableOpacity>
                      )}
                      {openCond &&
                        item.conditions?.map((c, i) => (
                          <Text key={i} style={styles.condText}>
                            •  {c}
                          </Text>
                        ))}
                    </View>
                    <NumberInput
                      style={[styles.input, styles.deductInput]}
                      display={profile.deductions?.[item.key] ? String(profile.deductions[item.key]) : ''}
                      onChangeNumber={(v) => setDeduction(item.key, v)}
                    />
                  </View>
                );
              })}
            </View>
          );
        })}

        <View style={styles.mTotalRow}>
          <Text style={styles.mTotalLabel}>รวมลดหย่อนที่หักได้จริง</Text>
          <Text style={styles.mTotalValue}>
            {formatCurrency(breakdown.extraDeductions)} (ยังไม่รวมส่วนตัว{' '}
            {formatCurrency(PERSONAL_ALLOWANCE)} + ประกันสังคม{' '}
            {formatCurrency(breakdown.socialSecurity)})
          </Text>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveBtnText}>บันทึกค่าลดหย่อนปี {year}</Text>
          )}
        </TouchableOpacity>
          </>
        )}
      </Section>

      {/* ── กำไรขายแยกชนิด ── */}
      <Section
        id="gains"
        openId={openSection}
        onToggle={toggleSection}
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

      {/* ── วิธีคิดตัวเลข ──
          เขียนสูตรไว้ในหน้าจอ ไม่ใช่แค่ในโค้ด เพราะจุดที่คนงงที่สุดคือ "หัก ณ ที่จ่าย"
          ซึ่งไม่ได้คิดเป็นรายเดือน แต่ประมาณภาษีทั้งปีตั้งแต่เดือนแรกแล้วเก็บล่วงหน้าเฉลี่ย 12 งวด
          ตัวเลขในสูตรแทนค่าจริงของผู้ใช้ ไม่ใช่ตัวอย่างสมมติ จะได้ตรวจสอบกับสลิปได้ทันที */}
      <Section
        id="method"
        openId={openSection}
        onToggle={toggleSection}
        title="วิธีคิดตัวเลข (แทนค่าจริงของคุณแล้ว)"
        subtitle="หัก ณ ที่จ่ายคิดทั้งปีก่อน แล้วเก็บล่วงหน้าเดือนละเท่า ๆ กัน"
      >
        <Text style={styles.formulaBlockTitle}>① ประกันสังคม — คิดจากเงินเดือนตรง ๆ</Text>
        <Text style={styles.formulaNote}>
          5% ของเงินเดือน แต่ฐานที่ใช้คูณถูกล็อกไว้ระหว่าง {formatCurrency(1650)} ถึง{' '}
          {formatCurrency(ssoLimits.baseCap)} ของปี {year} — เงินเดือนเกินเพดานจึงจ่ายเท่ากันหมด
        </Text>
        <FormulaLine label={`ฐานที่ใช้คูณ (เพดานปี ${year})`} value={formatCurrency(ssoLimits.baseCap)} />
        <FormulaLine label="× 5%" value={`${ssoLimits.monthlyCap} / เดือน`} strong />

        <Text style={styles.formulaBlockTitle}>② หัก ณ ที่จ่าย — เก็บภาษีล่วงหน้า</Text>
        <Text style={styles.formulaNote}>
          ตรงนี้คือจุดที่คนงงกันมากที่สุด: ฝ่ายบุคคล<Text style={styles.formulaEm}>ไม่ได้</Text>คิดภาษีเป็นรายเดือน
          แต่ประมาณเงินได้ทั้งปีตั้งแต่เดือนแรก คิดภาษีทั้งปีออกมาก้อนเดียว แล้วหาร 12 เก็บล่วงหน้าไปเรื่อย ๆ
          พอขึ้นเงินเดือนกลางปีก็ไม่ได้คำนวณใหม่ ยอดหักจึงเท่าเดิมทั้งปี
        </Text>
        <FormulaLine
          label={`เงินเดือนเดือนแรก ${formatCurrency(wh.annualBase / 12)} × 12`}
          value={formatCurrency(wh.annualBase)}
        />
        <FormulaLine
          label={`− ค่าใช้จ่าย 50% (ไม่เกิน ${formatCurrency(SALARY_EXPENSE_CAP)})`}
          value={`−${formatCurrency(wh.expense)}`}
        />
        <FormulaLine label="− ลดหย่อนส่วนตัว" value={`−${formatCurrency(PERSONAL_ALLOWANCE)}`} />
        <FormulaLine label="= เงินได้สุทธิที่ใช้หัก" value={formatCurrency(wh.netForEmployer)} />
        <FormulaLine label="ภาษีทั้งปีตามขั้นบันได" value={formatCurrency(wh.annualTax)} />
        <FormulaLine label="÷ 12 (ปัดขึ้น)" value={`${wh.flatMonthly} / เดือน`} strong />
        <Text style={styles.formulaNote}>
          ขั้นนี้ไม่ได้เอาประกันสังคมมาลดหย่อน (ต้องยื่น ล.ย.01 ก่อน) จึงหักเกินไว้ก่อน
          — ส่วนเกินได้คืนตอนยื่นภาษี ดูข้อ ④
        </Text>

        <Text style={styles.formulaBlockTitle}>③ รับจริง — เงินที่เข้าบัญชี</Text>
        <FormulaLine label="เงินเดือน + โบนัส − หัก ณ ที่จ่าย − ประกันสังคม" />
        <FormulaLine label="รับจริงทั้งปี" value={formatCurrency(netReceived)} strong />

        <Text style={styles.formulaBlockTitle}>④ ตอนยื่นภาษีจริง — คิดใหม่ทั้งปี ลดหย่อนครบ</Text>
        <Text style={styles.formulaNote}>
          คนละสูตรกับข้อ ② โดยตั้งใจ — ข้อ ② ตอบว่า "สลิปหักไปเท่าไหร่" (ขึ้นกับวิธีของนายจ้าง)
          ส่วนข้อนี้ตอบว่า "จริง ๆ ต้องเสียเท่าไหร่" (ตามกฎหมาย) ผลต่างคือยอดได้คืน/จ่ายเพิ่ม
        </Text>
        {breakdown.incomeExemption > 0 && (
          <FormulaLine
            label={`ยกเว้นเงินได้ 190,000 — ${exemption.reason} (หักก่อนคิดค่าใช้จ่าย 50%)`}
            value={`−${formatCurrency(breakdown.incomeExemption)}`}
          />
        )}
        <FormulaLine label="เงินได้จากงานทั้งปี (ยอดจริงในตาราง)" value={formatCurrency(breakdown.salaryIncome)} />
        <FormulaLine label="− ค่าใช้จ่าย 50%" value={`−${formatCurrency(breakdown.salaryExpense)}`} />
        <FormulaLine label="− ลดหย่อนส่วนตัว" value={`−${formatCurrency(PERSONAL_ALLOWANCE)}`} />
        <FormulaLine
          label={`− ประกันสังคม (ไม่เกิน ${formatCurrency(ssoLimits.annualCap)})`}
          value={`−${formatCurrency(breakdown.socialSecurity)}`}
        />
        {breakdown.extraDeductions > 0 && (
          <FormulaLine label="− ลดหย่อนอื่น" value={`−${formatCurrency(breakdown.extraDeductions)}`} />
        )}
        {breakdown.otherIncome > 0 && (
          <FormulaLine label="+ เงินได้อื่น" value={formatCurrency(breakdown.otherIncome)} />
        )}
        {breakdown.gainIncome > 0 && (
          <FormulaLine label="+ กำไรขายที่ต้องเสียภาษี" value={formatCurrency(breakdown.gainIncome)} />
        )}
        <FormulaLine label="= เงินได้สุทธิ" value={formatCurrency(breakdown.netIncome)} />
        <FormulaLine label="ภาษีที่ต้องเสียทั้งปี" value={formatCurrency(breakdown.tax)} />
        <FormulaLine label="− หัก ณ ที่จ่ายที่ถูกหักไปแล้ว" value={`−${formatCurrency(breakdown.withheld)}`} />
        <FormulaLine
          label={breakdown.balance > 0 ? 'ต้องจ่ายเพิ่ม' : 'ได้คืน'}
          value={formatCurrency(Math.abs(breakdown.balance))}
          strong
        />
      </Section>

      {/* ── กฎรายสินทรัพย์ ── */}
      <Section
        id="rules"
        openId={openSection}
        onToggle={toggleSection}
        title="กฎภาษีรายสินทรัพย์"
        subtitle="แก้ได้ถ้ากฎเปลี่ยน"
      >
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
          <NumberInput
            style={styles.input}
            placeholder="100"
            display={
              profile.remittedRatio === undefined
                ? ''
                : String(Math.round(profile.remittedRatio * 100))
            }
            onChangeNumber={(v) =>
              setProfile((p) => ({
                ...p,
                remittedRatio: v.trim() === '' ? undefined : Math.min(100, Math.max(0, num(v))) / 100,
              }))
            }
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
      <Section
        id="brackets"
        openId={openSection}
        onToggle={toggleSection}
        title="ขั้นบันไดภาษี"
        subtitle="อ้างอิง"
      >
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
        ลดหย่อนส่วนตัว {formatCurrency(PERSONAL_ALLOWANCE)}, ประกันสังคม (≤{formatCurrency(ssoLimits.annualCap)})
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

  gainCard: { ...card, padding: 16, marginTop: 12 },
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
  // คอลัมน์ "รับจริง" ท้ายแถว — ความกว้างตายตัวเพื่อให้ตัวเลขทุกแถวชิดขวาตรงกัน
  mNetCol: { width: 104 },
  mHeadCellRight: { textAlign: 'right' },
  mNetPlaceholder: { color: COLORS.textSecondary, textAlign: 'center' },
  mTotalRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  mTotalLabel: { ...TEXT.label, color: COLORS.text },
  mTotalValue: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 3, lineHeight: 17 },

  // ── รายการค่าลดหย่อน ──
  deductGroupTitle: { ...TEXT.label, color: COLORS.text, marginTop: 16 },
  deductGroupCap: { ...TEXT.hint, color: COLORS.warning, marginTop: 2 },
  deductRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  // flex + minWidth:0 คู่กันบังคับ — ไม่งั้นข้อความยาว ๆ ดันช่องกรอกล้นออกนอกการ์ด
  deductInfo: { flex: 1, minWidth: 0 },
  deductLabel: { ...TEXT.body, color: COLORS.text },
  deductNote: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },
  deductCap: { ...TEXT.hint, color: COLORS.primary, marginTop: 2 },
  deductInput: { width: 120, marginTop: 0 },
  eligBadge: { ...TEXT.hint, marginTop: 3, lineHeight: 16 },
  eligOk: { color: COLORS.success },
  eligNo: { color: COLORS.textSecondary },
  condToggle: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  condToggleText: { ...TEXT.hint, color: COLORS.primary, fontFamily: FONTS.medium },
  condText: { ...TEXT.hint, color: COLORS.textSecondary, lineHeight: 17, marginTop: 4 },
  capWarnBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
  },
  capWarnTitle: { ...TEXT.label, color: COLORS.warning },
  capWarnText: { ...TEXT.hint, color: COLORS.text, marginTop: 4, lineHeight: 16 },

  // ── ประตูเมื่อยังไม่มีข้อมูลส่วนตัว ──
  lockBox: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    marginTop: 4,
  },
  lockTitle: { ...TEXT.subtitle, color: COLORS.text, marginTop: 8 },
  lockText: {
    ...TEXT.hint,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 6,
  },
  lockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 18,
    marginTop: 14,
  },
  lockBtnText: { ...TEXT.caption, color: '#ffffff', fontFamily: FONTS.medium },
  lockKeepNote: { ...TEXT.hint, color: COLORS.warning, lineHeight: 17, marginTop: 12 },

  // ── ข้อเท็จจริงของปีภาษี (คำถามใช่/ไม่ใช่ 5 ข้อ) ──
  factTitle: { ...TEXT.label, color: COLORS.text, marginTop: 16 },
  factCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
  },
  factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  factRowBorder: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.divider },
  // flex + minWidth:0 คู่กันบังคับ — ไม่งั้นคำอธิบายยาวดันปุ่มใช่/ไม่ ล้นการ์ดบนเว็บ
  factInfo: { flex: 1, minWidth: 0 },
  factLabel: { ...TEXT.body, color: COLORS.text },
  factHint: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },
  factFoot: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 10, lineHeight: 16 },
  yesNo: { flexDirection: 'row', gap: 6 },
  factChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  factChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  factChipText: { ...TEXT.caption, color: COLORS.textSecondary },
  factChipTextActive: { color: '#ffffff', fontFamily: FONTS.medium },

  // ── บล็อกสูตรในหัวข้อ "วิธีคิดตัวเลข" ──
  formulaBlockTitle: { ...TEXT.label, color: COLORS.text, marginTop: 16, marginBottom: 6 },
  formulaNote: { ...TEXT.hint, color: COLORS.textSecondary, lineHeight: 17, marginBottom: 8 },
  formulaEm: { ...TEXT.hint, color: COLORS.error },
  formulaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 3,
  },
  // บรรทัดผลลัพธ์ของแต่ละก้อน — ขีดเส้นบนเหมือนการบวกเลขในกระดาษ
  formulaRowStrong: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  formulaLabel: { ...TEXT.hint, color: COLORS.textSecondary, flex: 1, lineHeight: 17 },
  formulaLabelStrong: { ...TEXT.label, color: COLORS.text },
  formulaValue: { ...TEXT.caption, color: COLORS.text, textAlign: 'right' },
  formulaValueStrong: { ...TEXT.subtitle, color: COLORS.primary, textAlign: 'right' },

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
