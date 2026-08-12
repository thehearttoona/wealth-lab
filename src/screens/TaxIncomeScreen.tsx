import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { RealizedTrade } from '../types/investment';
import {
  TaxProfile,
  TaxMonth,
  emptyTaxProfile,
  emptyTaxMonths,
  sumTaxMonths,
  MONTH_LABELS_TH,
  SALARY_EXPENSE_CAP,
  PERSONAL_ALLOWANCE,
  socialSecurityLimits,
} from '../types/tax';
import { calculateTax, socialSecurityForSalary, estimateWithholding } from '../utils/taxCalc';
import { useResponsive } from '../utils/responsive';
import { getRealizedTrades } from '../services/realizedStorage';
import { UserProfile, incomeExemptionFor } from '../types/userProfile';
import { getUserProfile } from '../services/userProfileStorage';
import { getTaxProfile, saveTaxProfile, isTaxTableMissing } from '../services/taxStorage';
import { COLORS, formatCurrency } from '../utils/constants';
import { notify, confirmAsk } from '../utils/dialog';
import { NumberInput, num, taxStyles as styles } from '../components/TaxFormKit';

// คอลัมน์ในตารางรายเดือน — ตรงกับสลิปเงินเดือน 1 ใบ
const MONTH_COLUMNS: { key: keyof Omit<TaxMonth, 'month'>; label: string }[] = [
  { key: 'salary', label: 'เงินเดือน' },
  { key: 'bonus', label: 'โบนัส' },
  { key: 'withheld', label: 'หัก ณ ที่จ่าย' },
  { key: 'socialSecurity', label: 'ประกันสังคม' },
];

/** บรรทัดในกล่องสรุปการคำนวณ — ซ้ายคำอธิบาย ขวาตัวเลข (ติดลบ = ตัวหัก) */
const CalcLine: React.FC<{ label: string; value: number }> = ({ label, value }) => {
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
};

/**
 * หน้า "เงินได้รายเดือน" — แยกออกมาจากหน้าภาษี
 * เดิมตาราง 12 เดือน × 5 ช่อง อยู่ในหัวข้อยุบได้ของหน้าภาษี ซึ่งกางแล้วยาวจนหาการ์ดคำตอบไม่เจอ
 * ปีที่แก้อยู่มาจากหน้าภาษีทาง route param — หน้านี้ไม่มีตัวเลือกปีของตัวเอง เพื่อไม่ให้มีสองที่ที่เปลี่ยนปีได้
 */
export default function TaxIncomeScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'TaxIncome'>>();
  const year = route.params.year;
  const { isDesktop } = useResponsive();
  const [profile, setProfile] = useState<TaxProfile>(emptyTaxProfile(year));
  const [trades, setTrades] = useState<RealizedTrade[]>([]);
  const [person, setPerson] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);

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
        console.error('TaxIncomeScreen load error:', e);
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

  // ยกเว้นเงินได้ 190,000 (อายุ 65+/ผู้พิการ) — ต้องส่ง opts ชุดเดียวกับหน้าภาษี ไม่งั้นเลขไม่ตรงกัน
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

  const setField = (value: string) => setProfile((p) => ({ ...p, otherIncome: num(value) }));

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
          — ส่วนที่หักเกินจะไปโผล่เป็น "ได้คืน" ตอนยื่นภาษี ซึ่งเป็นเลขที่หน้าภาษีมีไว้บอก
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
          const gross = (m.salary || 0) + (m.bonus || 0);
          const net = gross - (m.withheld || 0) - (m.socialSecurity || 0);
          // ช่อง "รับจริง" กรอกกลับได้ — ยอดเข้าบัญชีคือเลขที่ผู้ใช้รู้แน่ที่สุด (เห็นในแอปธนาคาร)
          const netCell = gross > 0 ? (
            <NumberInput
              style={styles.mInput}
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
                  ไม่งั้นช่องกรอกแถวสุดท้ายกว้างไม่เท่าแถวอื่น */}
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
          <Text style={styles.mTotalLabel}>รวม {monthTotals.filledMonths}/12 เดือน</Text>
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

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>เงินได้อื่นที่ต้องนำมารวม (ทั้งปี)</Text>
          <NumberInput
            style={styles.input}
            display={profile.otherIncome ? String(profile.otherIncome) : ''}
            onChangeNumber={setField}
          />
          <Text style={styles.fieldHint}>เช่น ดอกเบี้ย ค่าเช่า — ส่วนนี้ไม่ได้หักค่าใช้จ่าย 50%</Text>
        </View>

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
      </View>
    </ScrollView>
  );
}
