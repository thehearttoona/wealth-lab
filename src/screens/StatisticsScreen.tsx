import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Insight, getAllInsights } from '../utils/aiAnalysis';
import { COLORS, FONTS, TEXT, formatCurrency } from '../utils/constants';
import { useResponsive } from '../utils/responsive';

// หน้านี้เคยเหลือมาจากธีมมืดชุดเก่า: พื้นการ์ดฮาร์ดโค้ดเป็น #2A1F0E/#162030
// อ่านแทบไม่ออกบนพื้นสว่าง, หัวข้อเป็นอิโมจิ (📊 💰 ℹ️) ซึ่งเลิกใช้ทั้งแอปแล้ว
// และ insight.icon เป็นชื่อไอคอน Ionicons แต่ถูกวาดเป็น "ข้อความ" — จอจึงขึ้นคำว่า
// "bulb-outline" ตรง ๆ ตอนนี้ใช้ชุดเดียวกับหน้าอื่น: การ์ดขาวขอบเทา + Ionicons + COLORS

/** สีของ insight แต่ละชนิด — ดึงจาก COLORS อย่างเดียว ห้ามฮาร์ดโค้ดเพิ่ม (CLAUDE.md §1.10) */
const INSIGHT_COLOR: Record<Insight['type'], string> = {
  warning: COLORS.warning,
  alert: COLORS.error,
  tip: COLORS.primary,
  success: COLORS.success,
};

export default function StatisticsScreen() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const { isDesktop } = useResponsive();

  const loadInsights = async () => {
    setLoading(true);
    const allInsights = await getAllInsights();
    setInsights(allInsights);
    setLoading(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadInsights();
    }, [])
  );

  const renderInsight = (insight: Insight, index: number) => {
    const color = INSIGHT_COLOR[insight.type] ?? COLORS.primary;
    return (
      <View
        key={index}
        style={[styles.card, { borderLeftWidth: 3, borderLeftColor: color }, isDesktop && styles.cardDesktop]}
      >
        <View style={styles.cardHead}>
          <Ionicons name={insight.icon as any} size={18} color={color} />
          <Text style={[styles.cardTitle, { color }]}>{insight.title}</Text>
        </View>
        <Text style={styles.cardMessage}>{insight.message}</Text>

        {insight.actionable && (
          <View style={styles.actionBox}>
            <Text style={styles.actionLabel}>ทำอะไรได้</Text>
            <Text style={styles.actionText}>{insight.actionable}</Text>
          </View>
        )}

        {insight.savingPotential != null && insight.savingPotential > 0 && (
          <Text style={styles.savingText}>
            ถ้าทำตามนี้ ประหยัดได้ราว {formatCurrency(insight.savingPotential)} ต่อเดือน
          </Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.centerText}>กำลังวิเคราะห์ข้อมูล...</Text>
      </View>
    );
  }

  // เดสก์ท็อปไม่มีเพดานความกว้าง — เนื้อหาใช้เต็ม pane (ดู utils/responsive.ts)
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* แถวหัว: จำนวนข้อสังเกต + ปุ่มคำนวณใหม่ — ไม่มีแบนเนอร์สีเต็มความกว้างแล้ว
          ชื่อหน้าอยู่บน header ของ Stack อยู่แล้ว เขียนซ้ำเป็นแบนเนอร์คือกินจอเปล่า ๆ */}
      <View style={styles.topRow}>
        <Text style={styles.topText}>
          {insights.length > 0 ? `พบ ${insights.length} ข้อสังเกต` : 'ยังไม่มีข้อสังเกต'}
        </Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadInsights}>
          <Ionicons name="refresh-outline" size={15} color={COLORS.primary} />
          <Text style={styles.refreshBtnText}> คำนวณใหม่</Text>
        </TouchableOpacity>
      </View>

      {insights.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ยังไม่มีข้อมูลเพียงพอ</Text>
          <Text style={styles.cardMessage}>
            เริ่มบันทึกรายจ่ายและการลงทุนสักระยะ แล้วหน้านี้จะเริ่มชี้จุดที่ผิดปกติให้เอง
          </Text>
        </View>
      ) : (
        <View style={isDesktop ? styles.gridDesktop : undefined}>
          {insights.map((insight, index) => renderInsight(insight, index))}
        </View>
      )}

      <Text style={styles.footNote}>
        ข้อสังเกตทั้งหมดคิดจากข้อมูลในฐานข้อมูลของคุณเองด้วยกฎตายตัวในเครื่อง
        ไม่ได้ส่งข้อมูลออกไปไหน และไม่ได้เรียกโมเดลภาษาใด ๆ
        {'\n'}เกณฑ์ที่ใช้ เช่น หมวดเดียวเกิน 30% ของรายจ่าย · เดือนนี้ต่างจากเดือนก่อนเกิน 20%
        · หุ้นเกิน 70% หรือคริปโตเกิน 20% ของพอร์ต
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  centerText: { ...TEXT.body, color: COLORS.textSecondary, marginTop: 14 },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  topText: { ...TEXT.body, color: COLORS.text, flex: 1, minWidth: 0 },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  refreshBtnText: { ...TEXT.caption, color: COLORS.primary, fontFamily: FONTS.medium },

  gridDesktop: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  // flexBasis ต้องมาคู่กับความกว้าง ไม่งั้น flex:1 (= flex-basis 0%) ชนะแล้วการ์ดยุบ (CLAUDE.md §1.7)
  cardDesktop: { flexGrow: 1, flexBasis: 380, marginBottom: 0 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  // flex + minWidth:0 คู่กันบังคับ — หัวข้อยาวจะดันไอคอนหลุดขอบการ์ดบนเว็บ
  cardTitle: { ...TEXT.title, color: COLORS.text, flex: 1, minWidth: 0 },
  cardMessage: { ...TEXT.caption, color: COLORS.text, lineHeight: 20 },
  actionBox: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  actionLabel: { ...TEXT.hint, color: COLORS.textSecondary, marginBottom: 3 },
  actionText: { ...TEXT.caption, color: COLORS.text, lineHeight: 19 },
  savingText: { ...TEXT.caption, color: COLORS.success, fontFamily: FONTS.medium, marginTop: 10 },

  footNote: { ...TEXT.hint, color: COLORS.textSecondary, lineHeight: 17, marginTop: 16 },
});
