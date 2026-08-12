import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { RealizedTrade } from '../types/investment';
import {
  TaxProfile,
  emptyTaxProfile,
  PERSONAL_ALLOWANCE,
  DEDUCTION_ITEMS,
  DEDUCTION_GROUP_LABELS,
  DEDUCTION_CAP_GROUPS,
  DeductionItem,
  DeductionGroup,
  TaxYearFactKey,
  TAX_YEAR_FACT_FIELDS,
} from '../types/tax';
import { calculateTax } from '../utils/taxCalc';
import { getRealizedTrades } from '../services/realizedStorage';
import { UserProfile, incomeExemptionFor, isUserProfileAnswered } from '../types/userProfile';
import { getUserProfile } from '../services/userProfileStorage';
import { adviseDeductions, autoFillableDeductions } from '../utils/deductionAdvice';
import { getTaxProfile, saveTaxProfile, isTaxTableMissing } from '../services/taxStorage';
import { COLORS, formatCurrency } from '../utils/constants';
import { notify, confirmAsk } from '../utils/dialog';
import { NumberInput, num, taxStyles as styles } from '../components/TaxFormKit';

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

/**
 * หน้า "ค่าลดหย่อน" — แยกออกมาจากหน้าภาษี
 * 18 รายการ + ข้อเท็จจริงรายปี 5 ข้อ กางอยู่ในหัวข้อเดียวของหน้าภาษีแล้วยาวเกินกว่าจะหาช่องที่ต้องการเจอ
 * ปีที่แก้อยู่มาจากหน้าภาษีทาง route param (year_facts ผูกกับปี — ปีเก่าต้องไม่เปลี่ยนตามปีใหม่)
 */
export default function TaxDeductionScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'TaxDeduction'>>();
  const year = route.params.year;
  const [profile, setProfile] = useState<TaxProfile>(emptyTaxProfile(year));
  const [trades, setTrades] = useState<RealizedTrade[]>([]);
  const [person, setPerson] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  // เงื่อนไขของค่าลดหย่อน — เปิดทีละรายการ (คีย์ของ DEDUCTION_ITEMS)
  const [openCondition, setOpenCondition] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTrades(await getRealizedTrades());
    } catch {
      setTrades([]);
    }
    try {
      setPerson(await getUserProfile());
    } catch {
      setPerson(null);
    }
    try {
      const p = await getTaxProfile(year);
      setProfile(p ?? emptyTaxProfile(year));
      setTableMissing(false);
    } catch (e) {
      if (isTaxTableMissing(e)) {
        setTableMissing(true);
        setProfile(emptyTaxProfile(year));
      } else {
        console.error('TaxDeductionScreen load error:', e);
      }
    } finally {
      setLoading(false);
    }
  }, [year]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load])
  );

  const taxOpts = useMemo(
    () => ({ incomeExemption: incomeExemptionFor(person, year).amount }),
    [person, year]
  );
  const breakdown = useMemo(() => calculateTax(profile, trades, taxOpts), [profile, trades, taxOpts]);

  // ประตูของหน้านี้: ไม่มีข้อมูลส่วนตัว = ทุกสิทธิ์เป็น "ยังไม่รู้" และคิดยอดจากจำนวนคนไม่ได้
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
        keys
          .map((k) => `${DEDUCTION_ITEMS.find((i) => i.key === k)?.label}: ${formatCurrency(autoFillable[k])}`)
          .join('\n')
    );
  };

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

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveTaxProfile({ ...profile, year });
      notify('บันทึกค่าลดหย่อนแล้ว', 'สำเร็จ');
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {tableMissing && (
        <Text style={styles.warnBox}>
          ยังใช้ไม่ได้ — เอาไฟล์ `sql/tax_profiles.sql` ไปรันที่ Supabase SQL editor ก่อน 1 ครั้ง
          (กรอกดูเล่นได้ แต่กดบันทึกจะยังไม่ผ่าน)
        </Text>
      )}
      <Text style={styles.yearBar}>
        กำลังแก้ปีภาษี {year} · เปลี่ยนปีได้ที่หน้าภาษี
      </Text>

      <View style={styles.card}>
        {/* ── ประตู: ไม่มีข้อมูลส่วนตัว = ตัดสินสิทธิ์ไม่ได้ ── */}
        {!profileAnswered ? (
          <View>
            <View style={styles.lockBox}>
              <Ionicons name="person-circle-outline" size={22} color={COLORS.primary} />
              <Text style={styles.lockTitle}>ยังกรอกไม่ได้</Text>
              <Text style={styles.lockText}>
                หน้านี้ต้องรู้ข้อมูลส่วนตัวก่อน (วันเกิด สถานภาพสมรส จำนวนคนในอุปการะ)
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
                อยู่ที่นี่ไม่ใช่หน้าข้อมูลส่วนตัว เพราะทุกข้อเปลี่ยนได้ทุกปี (ผ่อนบ้านหมด ย้ายงาน ฯลฯ)
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
                          display={
                            profile.deductions?.[item.key] ? String(profile.deductions[item.key]) : ''
                          }
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
      </View>
    </ScrollView>
  );
}
