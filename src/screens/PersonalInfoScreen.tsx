import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { UserProfile, ageFromBirthDate } from '../types/userProfile';
import { getUserProfile, saveUserProfile, isUserProfileTableMissing } from '../services/userProfileStorage';
import { useAuth } from '../hooks/useAuth';
import { useResponsive } from '../utils/responsive';
import { COLORS, FONTS, TEXT, toChristianYear } from '../utils/constants';
import { notify } from '../utils/dialog';

// ── หน้านี้คือ "ตัวเราในแอป" ไม่ใช่ตัวแปรภาษี ──
//
// ก่อนหน้านี้หน้านี้เหลือช่องเดียวคือวันเกิด และเนื้อหาทั้งหน้าอธิบายแต่กลไกภาษี
// (ยกเว้นเงินได้ 190,000 / RMF อายุ 55) — อ่านแล้วเป็นหน้าตกค้างของหน้าภาษี ไม่ใช่ข้อมูลส่วนตัว
//
// คำถามที่ใช้ตัดสินสิทธิ์ลดหย่อน (สถานภาพสมรส / บุตร / พ่อแม่ในอุปการะ / เราเป็นผู้พิการ)
// อยู่ที่หน้าค่าลดหย่อนตามเดิม และ **ห้ามย้ายกลับมาที่นี่** — ต้องกรอกแล้วเห็นยอดลดหย่อน
// ขยับในหน้าเดียวกัน ไม่ใช่เดินสองหน้า (เหตุผลเดิมของการย้ายเมื่อ 2026-08-13)
//
// วันเกิดยังอยู่ที่นี่เพราะเป็นข้อมูลของตัวเราจริง ๆ (บอกอายุ) ส่วนที่มันถูกเอาไปใช้
// คำนวณภาษีด้วยเป็นผลพลอยได้ ไม่ใช่เหตุผลที่มันอยู่ตรงนี้

/** แถวข้อมูลที่แก้ไม่ได้ — มาจากบัญชีที่ใช้เข้าระบบ ไม่ใช่ของที่เรากรอกเอง
 *  ⚠️ ต้องอยู่นอกตัว screen (กฎข้อ 1.13) ไม่งั้น TextInput ในหน้าเดียวกันจะหลุดโฟกัสทุกตัวอักษร */
const ReadRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.readRow}>
    <Text style={styles.readLabel}>{label}</Text>
    <Text style={styles.readValue} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

export default function PersonalInfoScreen() {
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
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
      // ส่ง profile ทั้งก้อนที่โหลดมา ไม่ใช่เฉพาะช่องในหน้านี้ — คำตอบเรื่องภาษีที่กรอกไว้
      // ที่หน้าค่าลดหย่อนอยู่ในก้อนเดียวกัน ถ้าส่งไม่ครบจะถูกทับเป็น null ทั้งชุด
      await saveUserProfile(profile);
      notify('บันทึกข้อมูลส่วนตัวแล้ว', 'สำเร็จ');
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
  const email = user?.email || '-';
  // ชื่อจากบัญชี Google — ใช้เป็น placeholder ให้เห็นว่าถ้าไม่ตั้งเองจะได้ชื่อนี้
  const googleName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    email.split('@')[0];
  const photo =
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined);
  const shownName = profile.displayName?.trim() || googleName;
  const initial = (shownName || 'U').charAt(0).toUpperCase();
  const provider = (user?.app_metadata?.provider as string | undefined) || 'email';
  const joined = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '-';

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}>
      {tableMissing && (
        <Text style={styles.warnBox}>
          ยังใช้ไม่ได้ — เอาไฟล์ `sql/user_profile.sql` ไปรันที่ Supabase SQL editor ก่อน 1 ครั้ง
          (กรอกดูได้ แต่กดบันทึกจะยังไม่ผ่าน)
        </Text>
      )}

      <Text style={styles.intro}>
        ข้อมูลของตัวคุณเอง กรอกครั้งเดียวใช้ได้ตลอด — ไม่ได้ส่งออกไปไหน เก็บอยู่ในฐานข้อมูลของคุณเอง
      </Text>

      {/* ── ตัวตนในแอป ── */}
      <View style={styles.card}>
        <View style={styles.identityHead}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
          <View style={styles.identityHeadMain}>
            <Text style={styles.identityName} numberOfLines={1}>{shownName}</Text>
            <Text style={styles.identityMeta} numberOfLines={1}>{email}</Text>
          </View>
        </View>

        <Text style={styles.fieldLabel}>ชื่อที่แสดงในแอป</Text>
        <TextInput
          style={styles.input}
          value={profile.displayName || ''}
          onChangeText={(v) => setProfile((p) => ({ ...p, displayName: v || undefined }))}
          placeholder={googleName}
          placeholderTextColor={COLORS.textSecondary}
        />
        <Text style={styles.fieldHint}>
          เว้นว่างไว้ = ใช้ชื่อจากบัญชี {provider} ({googleName})
        </Text>
      </View>

      {/* ── บัญชีที่ใช้เข้าระบบ: อ่านอย่างเดียว ── */}
      <Text style={styles.groupTitle}>บัญชีที่ใช้เข้าระบบ</Text>
      <View style={styles.card}>
        <ReadRow label="อีเมล" value={email} />
        <ReadRow label="เข้าสู่ระบบด้วย" value={provider} />
        <ReadRow label="สมัครเมื่อ" value={joined} />
        <Text style={styles.fieldHint}>
          สามอย่างนี้มาจากบัญชีที่ใช้ล็อกอิน แก้ในแอปไม่ได้ — ต้องเปลี่ยนที่ผู้ให้บริการ
        </Text>
      </View>

      {/* ── วันเกิด ── */}
      <Text style={styles.groupTitle}>วันเกิด</Text>
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>ปี-เดือน-วัน</Text>
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

      {/* ── โน้ตส่วนตัว ──
          คอลัมน์ notes มีอยู่ในตารางกับ mapper ทั้งสองทางมานานแล้ว แต่ไม่เคยมีหน้าจอไหนใช้ */}
      <Text style={styles.groupTitle}>โน้ตส่วนตัว</Text>
      <View style={styles.card}>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={profile.notes || ''}
          onChangeText={(v) => setProfile((p) => ({ ...p, notes: v || undefined }))}
          placeholder="อะไรก็ได้ที่อยากจดไว้เกี่ยวกับตัวเอง"
          placeholderTextColor={COLORS.textSecondary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <Text style={styles.fieldHint}>เห็นแค่คุณคนเดียว ไม่ถูกเอาไปคิดอะไรทั้งนั้น</Text>
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <>
            <Ionicons name="save-outline" size={16} color="#ffffff" />
            <Text style={styles.saveBtnText}> บันทึก</Text>
          </>
        )}
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
  groupTitle: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 4, marginBottom: 6, marginLeft: 2 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 16,
  },

  // ── หัวการ์ดตัวตน ──
  identityHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  // flex + minWidth:0 คู่กันบังคับ — อีเมลยาวจะดันการ์ดจนล้นบนเว็บ
  identityHeadMain: { flex: 1, minWidth: 0 },
  identityName: { ...TEXT.title, color: COLORS.text },
  identityMeta: { ...TEXT.caption, color: COLORS.textSecondary, marginTop: 2 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...TEXT.amount, color: '#ffffff' },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.divider,
  },

  // ── แถวอ่านอย่างเดียว ──
  readRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
  },
  readLabel: { ...TEXT.body, color: COLORS.textSecondary },
  // ต้องมี flexShrink ไม่งั้นอีเมลยาวดันป้ายซ้ายจนหลุดขอบ (ญาติของกฎ 1.4)
  readValue: { ...TEXT.body, color: COLORS.text, flexShrink: 1, minWidth: 0, textAlign: 'right' },

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
  inputMultiline: { minHeight: 88, marginTop: 0 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  saveBtnText: { ...TEXT.subtitle, fontFamily: FONTS.semibold, color: '#ffffff' },
});
