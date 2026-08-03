import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, CHART, TEXT, FONTS, formatCurrency } from '../../utils/constants';
import { CategorySlice } from '../../utils/activityLog';

// แท่งแนวนอน เรียงมาก→น้อย
// - แนวนอนเพราะชื่อหมวดภาษาไทยยาว วางแนวตั้งแล้วป้ายจะชนกันหรือต้องเอียง
// - สีเดียวทั้งหมด: หมวดไม่มีลำดับในตัวเอง การไล่เฉดตามยอดคือเอาช่องทางสี
//   ไปย้ำสิ่งที่ความยาวแท่งบอกอยู่แล้ว (และทำให้ตกเกณฑ์ contrast ที่ปลายอ่อน)
// - ตัวเลขอยู่นอกแท่งเสมอ ไม่ยัดเข้าไปข้างใน จะได้ไม่โดนแท่งสั้นๆ ตัดตัวหนังสือ
interface Props {
  data: CategorySlice[];
}

export default function CategoryBars({ data }: Props) {
  const max = Math.max(...data.map((d) => d.amount), 1);
  const total = data.reduce((s, d) => s + d.amount, 0);

  return (
    <View style={styles.wrap}>
      {data.map((d) => {
        const pct = Math.round((d.amount / total) * 100);
        return (
          <View key={d.category} style={styles.row}>
            <View style={styles.labelRow}>
              <Text style={styles.category} numberOfLines={1}>
                {d.category}
              </Text>
              <Text style={styles.amount}>{formatCurrency(d.amount)}</Text>
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${Math.max(2, (d.amount / max) * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.pct}>{pct}%</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  row: { gap: 5 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  category: {
    ...TEXT.body,
    color: COLORS.text,
    flexShrink: 1,
  },
  amount: {
    ...TEXT.body,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: CHART.grid,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: CHART.bar,
  },
  pct: {
    ...TEXT.hint,
    color: COLORS.textSecondary,
  },
});
