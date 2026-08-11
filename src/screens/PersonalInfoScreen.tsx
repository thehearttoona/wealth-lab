import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  UserProfile,
  MaritalStatus,
  MARITAL_LABELS,
  ageFromBirthDate,
} from '../types/userProfile';
import { getUserProfile, saveUserProfile, isUserProfileTableMissing } from '../services/userProfileStorage';
import { useResponsive } from '../utils/responsive';
import { COLORS, FONTS, TEXT, toChristianYear } from '../utils/constants';
import { notify } from '../utils/dialog';

// หน้านี้กรอก "ตัวเรา" เท่านั้น — ข้อเท็จจริงที่ข้ามปี ไม่ต้องกรอกใหม่ทุกปีภาษี
//
// สิ่งที่จงใจ "ไม่" อยู่ในหน้านี้ และย้ายไปหน้าภาษีแล้ว:
//   · คำถามรายปี (ผ่อนบ้าน / ม.33 / PVD / ฝากครรภ์ / อยู่ไทย 180 วัน) → TaxYearFacts เก็บแยกตามปี
//   · สรุปสิทธิ์ลดหย่อน + ยอดยกเว้นเงินได้ 190,000 → เป็นผลของปีภาษี ต้องอ่านคู่กับตัวเลขของปีนั้น
// เอากลับมาใส่ที่นี่ไม่ได้ เพราะจะกลายเป็น "หน้าภาษีเล็ก" ที่มีเลขคนละชุดกับหน้าภาษีจริง
//
// ทุกข้อข้ามได้ และ "ยังไม่ตอบ" ต้องต่างจาก "ตอบว่าไม่" — ดู deductionAdvice.ts

type CountKey = 'childrenBefore2561' | 'childrenFrom2561' | 'parentsSupported' | 'disabledSupported';

const COUNT_FIELDS: { key: CountKey; label: string; hint: string }[] = [
  { key: 'childrenBefore2561', label: 'บุตรที่เกิดก่อนปี 2561', hint: 'นับเฉพาะที่อายุ ≤20 ปี หรือ ≤25 ปีและกำลังศึกษา' },
  { key: 'childrenFrom2561', label: 'บุตรที่เกิดตั้งแต่ปี 2561', hint: 'แยกช่องเพราะอัตราลดหย่อนต่างจากกลุ่มก่อน 2561' },
  { key: 'parentsSupported', label: 'พ่อแม่ที่เราใช้สิทธิ์อุปการะ', hint: 'อายุ 60+ · เงินได้ทั้งปีไม่เกิน 30,000 · ตกลงกับพี่น้องแล้วว่าเราเป็นคนใช้' },
  { key: 'disabledSupported', label: 'คนพิการ/ทุพพลภาพในอุปการะ', hint: 'ต้องมีชื่อเราเป็นผู้ดูแลในบัตรประจำตัวคนพิการ' },
];

/**
 * แถวคำถามใช่/ไม่ใช่ — ⚠️ ต้องอยู่นอก component เท่านั้น
 * ถ้าประกาศข้างใน ทุกตัวอักษรที่พิมพ์จะทำให้ React เห็นเป็นคอมโพเนนต์ชนิดใหม่แล้ว remount
 * ทั้งก้อน ช่องกรอกหลุดโฟกัสทันที (บั๊กที่เคยทำให้ TaxScreen กรอกอะไรไม่ได้เลย)
 */
const BoolRow: React.FC<{
  label: string;
  hint: string;
  value?: boolean;
  onChange: (v: boolean) => void;
  bordered?: boolean;
}> = ({ label, hint, value, onChange, bordered }) => (
  <View style={[styles.row, bordered && styles.rowBorder]}>
    <View style={styles.rowInfo}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldHint}>{hint}</Text>
    </View>
    <View style={styles.yesNo}>
      {[true, false].map((v) => {
        const active = value === v;
        return (
          <TouchableOpacity
            key={String(v)}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(v)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{v ? 'ใช่' : 'ไม่'}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

export default function PersonalInfoScreen() {
  const { isDesktop } = useResponsive();
  const [profile, setProfile] = useState<UserProfile>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProfile((await getUserProfile()) ?? {});
      setTableMissing(false);
    } catch (e) {
      if (isUserProfileTableMissing(e)) setTableMissing(true);
      else console.error('PersonalInfoScreen load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load])
  );

  const setCount = (key: CountKey, raw: string) => {
    const trimmed = raw.trim();
    const n = parseInt(trimmed.replace(/[^0-9]/g, ''), 10);
    setProfile((p) => ({ ...p, [key]: trimmed === '' || Number.isNaN(n) ? undefined : n }));
  };

  // กดค่าเดิมซ้ำ = ยกเลิกคำตอบ กลับไปเป็น "ยังไม่ตอบ" — ไม่งั้นตอบผิดแล้วแก้กลับไม่ได้
  const setBool = (key: 'spouseHasIncome' | 'isDisabled', value: boolean) =>
    setProfile((p) => ({ ...p, [key]: p[key] === value ? undefined : value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveUserProfile(profile);
      notify('บันทึกข้อมูลส่วนตัวแล้ว — หน้าภาษีจะดึงไปใช้ตัดสินสิทธิ์ลดหย่อนให้เอง', 'สำเร็จ');
    } catch (e) {
      if (isUserProfileTableMissing(e)) {
        setTableMissing(true);
        notify('ยังใช้ไม่ได้ — เอาไฟล์ sql/user_profile.sql ไปรันที่ Supabase SQL editor ก่อน 1 ครั้ง');
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

  const age = ageFromBirthDate(profile.birthDate);

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}>
      {tableMissing && (
        <Text style={styles.warnBox}>
          ยังใช้ไม่ได้ — เอาไฟล์ `sql/user_profile.sql` ไปรันที่ Supabase SQL editor ก่อน 1 ครั้ง
          (กรอกดูได้ แต่กดบันทึกจะยังไม่ผ่าน)
        </Text>
      )}

      <Text style={styles.intro}>
        กรอกครั้งเดียว ใช้ได้ทุกปีภาษี — เป็นข้อมูลที่ไม่เปลี่ยนบ่อย
        {'\n'}ไม่ได้ส่งออกไปไหน เก็บอยู่ในฐานข้อมูลของคุณเอง ข้ามข้อที่ไม่อยากตอบได้
      </Text>

      {/* ── วันเกิด ── */}
      <Text style={styles.groupTitle}>วันเกิด</Text>
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>วันเกิด (ปี-เดือน-วัน)</Text>
        <TextInput
          style={styles.input}
          value={profile.birthDate || ''}
          onChangeText={(v) => setProfile((p) => ({ ...p, birthDate: toChristianYear(v.trim()) || undefined }))}
          placeholder="1995-03-21"
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="none"
        />
        <Text style={styles.fieldHint}>
          {age != null
            ? `อายุ ${age} ปี`
            : 'พิมพ์เป็น ค.ศ. ได้เลย ถ้าใส่ พ.ศ. มาระบบจะแปลงให้'}
        </Text>
      </View>

      {/* ── สถานภาพสมรส ── */}
      <Text style={styles.groupTitle}>สถานภาพ</Text>
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>สถานภาพสมรส</Text>
        <View style={styles.chipRow}>
          {(Object.keys(MARITAL_LABELS) as MaritalStatus[]).map((s) => {
            const active = profile.maritalStatus === s;
            return (
              <TouchableOpacity
                key={s}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setProfile((p) => ({ ...p, maritalStatus: active ? undefined : s }))}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{MARITAL_LABELS[s]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.fieldHint}>กดซ้ำที่ตัวเลือกเดิม = ล้างคำตอบกลับเป็น "ยังไม่ระบุ"</Text>
        <BoolRow
          label="คู่สมรสมีเงินได้"
          hint="ตอบเฉพาะกรณีจดทะเบียนสมรส"
          value={profile.spouseHasIncome}
          onChange={(v) => setBool('spouseHasIncome', v)}
          bordered
        />
      </View>

      {/* ── จำนวนคนในอุปการะ ── */}
      <Text style={styles.groupTitle}>คนในอุปการะ</Text>
      <View style={styles.card}>
        {COUNT_FIELDS.map((f, i) => (
          <View key={f.key} style={[styles.row, i > 0 && styles.rowBorder]}>
            <View style={styles.rowInfo}>
              <Text style={styles.fieldLabel}>{f.label}</Text>
              <Text style={styles.fieldHint}>{f.hint}</Text>
            </View>
            <TextInput
              style={[styles.input, styles.countInput]}
              value={profile[f.key] === undefined ? '' : String(profile[f.key])}
              onChangeText={(v) => setCount(f.key, v)}
              keyboardType="numeric"
              placeholder="—"
              placeholderTextColor={COLORS.textSecondary}
              selectTextOnFocus
            />
          </View>
        ))}
      </View>

      {/* ── ตัวเรา ── */}
      <Text style={styles.groupTitle}>อื่น ๆ</Text>
      <View style={styles.card}>
        <BoolRow
          label="เป็นผู้พิการที่มีบัตรประจำตัวคนพิการ"
          hint="กดซ้ำที่คำตอบเดิม = ล้างกลับเป็นยังไม่ระบุ"
          value={profile.isDisabled}
          onChange={(v) => setBool('isDisabled', v)}
        />
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <>
            <Ionicons name="save-outline" size={16} color="#ffffff" />
            <Text style={styles.saveBtnText}> บันทึกข้อมูลส่วนตัว</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.footNote}>
        ข้อมูลนี้ถูกนำไปใช้ที่หน้า "ภาษี" → หัวข้อค่าลดหย่อน ซึ่งเป็นที่เดียวที่บอกว่าปีนั้นใช้สิทธิ์อะไรได้
        และคิดยอดจากจำนวนคนให้อัตโนมัติ — คำถามที่เปลี่ยนทุกปี (ผ่อนบ้าน ประกันสังคม ฯลฯ) อยู่ในหน้านั้นด้วย
      </Text>
    </ScrollView>
  );
}

// เดสก์ท็อปไม่มีเพดานความกว้าง — เนื้อหาใช้เต็ม pane (ดู utils/responsive.ts)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  contentDesktop: { paddingTop: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  warnBox: {
    ...TEXT.caption,
    color: COLORS.warning,
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    lineHeight: 18,
  },
  intro: { ...TEXT.hint, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 12 },
  groupTitle: { ...TEXT.hint, color: COLORS.textSecondary, marginBottom: 6, marginLeft: 2 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 16,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rowBorder: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.divider },
  // flex + minWidth:0 คู่กันบังคับ — ไม่งั้นข้อความยาวดันช่องกรอกล้นการ์ดบนเว็บ
  rowInfo: { flex: 1, minWidth: 0 },
  fieldLabel: { ...TEXT.body, color: COLORS.text },
  fieldHint: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 3, lineHeight: 16 },
  input: {
    ...TEXT.body,
    minWidth: 0,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
  },
  countInput: { width: 76, textAlign: 'center', marginTop: 0 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  yesNo: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { ...TEXT.caption, color: COLORS.textSecondary },
  chipTextActive: { color: '#ffffff', fontFamily: FONTS.medium },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  saveBtnText: { ...TEXT.subtitle, fontFamily: FONTS.semibold, color: '#ffffff' },
  footNote: { ...TEXT.hint, color: COLORS.textSecondary, lineHeight: 17, marginTop: 14 },
});
