import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { UserProfile, ageFromBirthDate } from '../types/userProfile';
import { getUserProfile, saveUserProfile, isUserProfileTableMissing } from '../services/userProfileStorage';
import { useResponsive } from '../utils/responsive';
import { COLORS, FONTS, TEXT, toChristianYear } from '../utils/constants';
import { notify } from '../utils/dialog';

// หน้านี้เหลือข้อเดียว: วันเกิด
//
// ทำไมเหลือข้อเดียว: อีก 4 กลุ่ม (สถานภาพสมรส / บุตร / พ่อแม่ / เราเป็นผู้พิการ)
// ถูกกรอกเพื่อ "ตัดสินสิทธิ์ลดหย่อน" อย่างเดียว แต่ต้องเดินมากรอกอีกหน้าหนึ่งก่อน
// แล้วค่อยเดินกลับไปหน้าค่าลดหย่อน — ตอนนี้ย้ายไปอยู่บนสุดของหน้าค่าลดหย่อนแล้ว
// กรอกที่เดียวจบ เห็นผลกับยอดลดหย่อนทันทีในหน้าเดียวกัน
//
// วันเกิดไม่ย้ายตามไป เพราะไม่ได้ใช้แค่กับค่าลดหย่อน: มันเป็นตัวตัดสิน
// "ยกเว้นเงินได้ 190,000 ของผู้มีอายุ 65+" ซึ่งหักก่อนค่าใช้จ่าย 50% (คนละขั้นกับลดหย่อน)
// และใช้นับถอยหลังเงื่อนไข RMF ที่ต้องถือถึงอายุ 55 — เป็นข้อมูลของ "ตัวเรา" จริง ๆ

// ปีภาษีปัจจุบันเป็น พ.ศ. — หน้าค่าลดหย่อนผูกกับปี ต้องส่งไปด้วยเสมอ
const currentBuddhistYear = () => new Date().getFullYear() + 543;

export default function PersonalInfoScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveUserProfile(profile);
      notify('บันทึกวันเกิดแล้ว', 'สำเร็จ');
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
        กรอกครั้งเดียว ใช้ได้ทุกปีภาษี — ไม่ได้ส่งออกไปไหน เก็บอยู่ในฐานข้อมูลของคุณเอง
      </Text>

      {/* ── วันเกิด ── */}
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

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <>
            <Ionicons name="save-outline" size={16} color="#ffffff" />
            <Text style={styles.saveBtnText}> บันทึกวันเกิด</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.groupTitle}>วันเกิดถูกเอาไปใช้ตรงไหน</Text>
      <View style={styles.card}>
        <Text style={styles.fieldHint}>
          · ยกเว้นเงินได้ 190,000 สำหรับผู้มีอายุ 65 ปีขึ้นไป — หักออกก่อนค่าใช้จ่าย 50%
          จึงไม่ใช่ค่าลดหย่อน และใส่ในช่องลดหย่อนแทนกันไม่ได้{'\n'}
          · เงื่อนไข RMF ที่ต้องถือจนอายุ 55
        </Text>
      </View>

      {/* คำถามที่เหลือย้ายไปหน้าค่าลดหย่อนแล้ว — ต้องมีทางเดินไปให้ ไม่ใช่แค่บอกว่าย้ายไป */}
      <TouchableOpacity
        style={styles.navRow}
        onPress={() => navigation.navigate('TaxDeduction', { year: currentBuddhistYear() })}
      >
        <Ionicons name="pricetags-outline" size={18} color={COLORS.primary} />
        <View style={styles.navRowMain}>
          <Text style={styles.navRowTitle}>สถานภาพสมรส · บุตร · พ่อแม่ในอุปการะ</Text>
          <Text style={styles.navRowSub}>
            ย้ายไปอยู่บนสุดของหน้าค่าลดหย่อนแล้ว เพราะกรอกแล้วต้องเห็นยอดลดหย่อนขยับในหน้าเดียวกัน
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
      </TouchableOpacity>
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
  groupTitle: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 20, marginBottom: 6, marginLeft: 2 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 16,
  },
  fieldLabel: { ...TEXT.body, color: COLORS.text },
  fieldHint: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 3, lineHeight: 18 },
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
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  saveBtnText: { ...TEXT.subtitle, fontFamily: FONTS.semibold, color: '#ffffff' },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
  },
  // flex + minWidth:0 คู่กันบังคับ — ข้อความยาวจะดันลูกศรหลุดขอบการ์ดบนเว็บ
  navRowMain: { flex: 1, minWidth: 0 },
  navRowTitle: { ...TEXT.body, color: COLORS.text },
  navRowSub: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 3, lineHeight: 16 },
});
