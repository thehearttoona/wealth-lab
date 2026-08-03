import React, { useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Rect, Line } from 'react-native-svg';
import { COLORS, CHART, TEXT, FONTS, formatCurrency } from '../../utils/constants';
import { MonthFlow } from '../../utils/activityLog';

// แท่งคู่ต่อเดือน: เข้า (เขียว) / ออก (น้ำเงิน) — ตอบคำถามเดียว "เดือนไหนใช้เกินตัว"
// วาดด้วยพิกัดพิกเซลจริง (วัดจาก onLayout) แทนการยืด viewBox
// ไม่งั้น preserveAspectRatio="none" จะยืดแกน x จนมุมมนของแท่งเบี้ยวไปด้วย
const PLOT_H = 132;
const RADIUS = 4;      // ปลายแท่งมน ยึดกับเส้นฐาน
const PAIR_GAP = 2;    // ช่องว่างระหว่างสองแท่งในคู่ — เว้นพื้นหลัง ไม่ใช้เส้นขอบ
const BAR_MAX_W = 14;

interface Props {
  data: MonthFlow[];
}

export default function MonthlyFlowChart({ data }: Props) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const max = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 1);
  const slotW = width / Math.max(data.length, 1);
  const barW = Math.min(BAR_MAX_W, Math.max(4, (slotW - PAIR_GAP) / 2 - 6));

  // direct-label เฉพาะเดือนที่ใช้เกินรายรับมากสุด — ไม่ติดตัวเลขทุกแท่ง
  const worst = data.reduce<MonthFlow | null>(
    (acc, d) =>
      d.expense > d.income && (!acc || d.expense - d.income > acc.expense - acc.income) ? d : acc,
    null
  );

  return (
    <View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: CHART.income }]} />
          <Text style={styles.legendText}>รายรับ</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: CHART.expense }]} />
          <Text style={styles.legendText}>รายจ่าย</Text>
        </View>
      </View>

      <View onLayout={onLayout}>
        {width > 0 && (
          <Svg width={width} height={PLOT_H + 1}>
            {/* เส้นฐาน hairline ทึบ — เส้นประจะอ่านเป็น "เกณฑ์" ทั้งที่เป็นแค่กริด */}
            <Line x1={0} y1={PLOT_H} x2={width} y2={PLOT_H} stroke={CHART.grid} strokeWidth={1} />
            {data.map((d, i) => {
              const cx = i * slotW + slotW / 2;
              const inH = (d.income / max) * PLOT_H;
              const exH = (d.expense / max) * PLOT_H;
              return (
                <React.Fragment key={d.monthKey}>
                  {d.income > 0 && (
                    <Rect
                      x={cx - barW - PAIR_GAP / 2}
                      y={PLOT_H - inH}
                      width={barW}
                      height={inH}
                      rx={Math.min(RADIUS, barW / 2)}
                      fill={CHART.income}
                    />
                  )}
                  {d.expense > 0 && (
                    <Rect
                      x={cx + PAIR_GAP / 2}
                      y={PLOT_H - exH}
                      width={barW}
                      height={exH}
                      rx={Math.min(RADIUS, barW / 2)}
                      fill={CHART.expense}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </Svg>
        )}
      </View>

      <View style={styles.axis}>
        {data.map((d) => (
          <Text key={d.monthKey} style={styles.axisLabel}>
            {d.label}
          </Text>
        ))}
      </View>

      {worst && (
        <Text style={styles.callout}>
          {worst.label} ใช้เกินรายรับ {formatCurrency(worst.expense - worst.income)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { ...TEXT.caption, color: COLORS.textSecondary },
  axis: { flexDirection: 'row', marginTop: 6 },
  axisLabel: { ...TEXT.hint, flex: 1, textAlign: 'center', color: COLORS.textSecondary },
  callout: {
    ...TEXT.caption,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
    marginTop: 10,
  },
});
