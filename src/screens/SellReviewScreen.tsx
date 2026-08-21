import React, { useState, useCallback } from 'react';
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
import { RealizedTrade } from '../types/investment';
import { getRealizedTrades } from '../services/realizedStorage';
import { fetchPricesForItems, isPriceRefreshable } from '../services/priceApi';
import {
  reviewSells,
  priceKeyOf,
  SellReviewSummary,
  SellReviewRow,
  DIAGNOSIS_TEXT,
  MIN_DAYS_TO_JUDGE,
  FLAT_BAND_PERCENT,
} from '../utils/sellReview';
import { COLORS, TEXT, FONTS, formatCurrency, formatCurrencyWithType } from '../utils/constants';
import { ActionButton } from '../components/ActionButton';
import { notify } from '../utils/dialog';
import { useResponsive } from '../utils/responsive';
import { MascotEmpty } from '../components/Mascot';

const CARD_BASIS = 420;

const fmtDateTH = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
};

const VERDICT_META = {
  too_early: { icon: 'trending-up', color: COLORS.warning, label: 'ขายเร็วเกิน' },
  well_timed: { icon: 'checkmark-circle', color: COLORS.success, label: 'ขายถูกจังหวะ' },
  flat: { icon: 'remove', color: COLORS.textSecondary, label: 'เสมอ' },
  too_recent: { icon: 'time-outline', color: COLORS.textSecondary, label: 'ขายยังไม่นาน' },
  unknown: { icon: 'help-circle-outline', color: COLORS.textSecondary, label: 'เทียบไม่ได้' },
} as const;

export default function SellReviewScreen() {
  const { isDesktop } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SellReviewSummary | null>(null);
  const [tradeCount, setTradeCount] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let trades: RealizedTrade[] = [];
    try {
      trades = await getRealizedTrades();
    } catch {
      // ยังไม่ได้รัน sql/realized_trades.sql — ไม่มีประวัติขายให้ทบทวน
      trades = [];
    }
    setTradeCount(trades.length);

    if (trades.length === 0) {
      setSummary(reviewSells([], {}));
      setLoading(false);
      return;
    }

    // ดึงราคาครั้งเดียวต่อ "ตัว+สกุล" ไม่ใช่ต่อไม้ — ขาย BTC 5 ครั้งต้องยิง API ครั้งเดียว
    // (Twelve Data แผนฟรี 800 request/วัน ยิงซ้ำต่อไม้จะกินโควตาฟรี ๆ)
    const uniq = new Map<string, { type: string; symbol: string; currency: string }>();
    trades.forEach((t) => {
      if (!isPriceRefreshable(t.assetType) || !t.symbol) return;
      const k = priceKeyOf(t);
      if (!uniq.has(k)) {
        uniq.set(k, { type: t.assetType, symbol: t.symbol, currency: t.currency || 'THB' });
      }
    });

    let prices: { [k: string]: number } = {};
    try {
      prices = await fetchPricesForItems(
        [...uniq.entries()].map(([k, v]) => ({ id: k, type: v.type, symbol: v.symbol, currency: v.currency }))
      );
    } catch {
      notify('ดึงราคาปัจจุบันไม่สำเร็จ — ลองใหม่อีกครั้ง');
    }

    setSummary(reviewSells(trades, prices));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.centerText}>กำลังดึงราคาปัจจุบันของไม้ที่ขายไป…</Text>
      </View>
    );
  }

  if (!summary || tradeCount === 0) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <MascotEmpty>
          ยังไม่มีประวัติการขาย{'\n'}
          พอเริ่มกด "ขาย" ที่รายการลงทุน หน้านี้จะบอกได้ว่าจังหวะขายของคุณเป็นอย่างไร
        </MascotEmpty>
      </ScrollView>
    );
  }

  const d = DIAGNOSIS_TEXT[summary.diagnosis];
  const worse = summary.netTHB > 0; // ถ้าไม่ขายจะมีเงินมากกว่า
  // เรียงตามขนาดผลกระทบ — ไม้ที่พลาดก้อนใหญ่คือไม้ที่ต้องเรียนรู้จากมันที่สุด
  const sorted = [...summary.rows].sort(
    (a, b) => Math.abs(b.deltaTHB ?? 0) - Math.abs(a.deltaTHB ?? 0)
  );
  const visible = showAll ? sorted : sorted.slice(0, 5);

  const renderRow = (r: SellReviewRow) => {
    const meta = VERDICT_META[r.verdict];
    const t = r.trade;
    return (
      <View key={t.id} style={[styles.card, isDesktop && styles.cardGridItem]}>
        <View style={styles.cardTop}>
          <Ionicons name={meta.icon as any} size={16} color={meta.color} />
          <View style={styles.cardTitleCol}>
            <Text style={styles.cardName} numberOfLines={1}>{t.symbol || t.name}</Text>
            <Text style={styles.cardSub}>
              {t.quantity} หน่วย · ขาย {fmtDateTH(t.sellDate)} @{' '}
              {formatCurrencyWithType(t.sellPrice, t.currency)}
              {r.priceNow != null ? ` → วันนี้ ${formatCurrencyWithType(r.priceNow, t.currency)}` : ''}
            </Text>
          </View>
          <Text style={[styles.cardVerdict, { color: meta.color }]}>{meta.label}</Text>
        </View>

        <Text style={styles.cardLine}>
          กำไรที่ได้จริงตอนขาย{' '}
          <Text style={r.realizedPnlTHB >= 0 ? styles.pos : styles.neg}>
            {r.realizedPnlTHB >= 0 ? '+' : ''}{formatCurrency(r.realizedPnlTHB)}
          </Text>
        </Text>

        {r.deltaTHB != null && r.sinceSellPercent != null ? (
          <Text style={styles.cardLine}>
            {r.deltaTHB > 0
              ? `ถ้าถือไว้ถึงวันนี้จะได้เพิ่มอีก ${formatCurrency(r.deltaTHB)}`
              : r.deltaTHB < 0
                ? `ถ้าถือไว้ถึงวันนี้จะหายไป ${formatCurrency(Math.abs(r.deltaTHB))}`
                : 'ถือไว้ถึงวันนี้ได้เท่าเดิม'}
            {`  (${r.sinceSellPercent >= 0 ? '+' : ''}${r.sinceSellPercent.toFixed(1)}%)`}
          </Text>
        ) : (
          <Text style={styles.cardHint}>
            {t.assetType === 'fund'
              ? 'กองทุนไทยไม่มี API ราคา (NAV กรอกมือ) — เทียบไม่ได้'
              : 'ดึงราคาปัจจุบันไม่ได้ — เทียบไม่ได้'}
          </Text>
        )}

        {r.verdict === 'too_recent' && (
          <Text style={styles.cardHint}>
            ขายไป {r.daysSinceSell} วัน — ยังไม่ถึง {MIN_DAYS_TO_JUDGE} วัน จึงไม่นับเข้าข้อสรุป
          </Text>
        )}
        {t.notes ? <Text style={styles.cardNote}>“{t.notes}”</Text> : null}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── คำตอบ: นิสัยการขาย ── */}
      <View style={[styles.heroCard, { borderLeftColor: summary.diagnosis === 'well_timed' ? COLORS.success : COLORS.warning }]}>
        <Text style={styles.heroLabel}>วินิจฉัยจังหวะขายของคุณ</Text>
        <Text style={styles.heroValue}>{d.title}</Text>
        <Text style={styles.heroAdvice}>{d.advice}</Text>
      </View>

      {/* ── ตัวเลขสรุป ── */}
      <View style={styles.statCard}>
        <Text style={styles.statHeadline}>
          {summary.judged === 0
            ? 'ยังไม่มีไม้ที่ตัดสินได้'
            : worse
              ? `ถ้าไม่ขายอะไรเลย จะมีเงินมากกว่านี้ ${formatCurrency(summary.netTHB)}`
              : `ที่ขายไปดีกว่าถือไว้ ${formatCurrency(Math.abs(summary.netTHB))}`}
        </Text>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>ขายเร็วเกิน</Text>
            <Text style={[styles.kpiValue, { color: COLORS.warning }]}>{summary.tooEarly}</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>ขายถูกจังหวะ</Text>
            <Text style={[styles.kpiValue, { color: COLORS.success }]}>{summary.wellTimed}</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>เสมอ (±{FLAT_BAND_PERCENT}%)</Text>
            <Text style={styles.kpiValue}>{summary.flat}</Text>
          </View>
        </View>

        <Text style={styles.statLine}>
          พลาดกำไรรวม {formatCurrency(summary.missedTHB)} · หนีขาดทุนได้รวม{' '}
          {formatCurrency(summary.savedTHB)}
        </Text>
        {summary.medianSincePercent != null && (
          <Text style={styles.statLine}>
            ราคาขยับหลังขาย (ค่ากลาง) {summary.medianSincePercent >= 0 ? '+' : ''}
            {summary.medianSincePercent.toFixed(1)}%
          </Text>
        )}

        {/* นับไม้ที่ตกออกจากข้อสรุปให้เห็นเสมอ — ไม่งั้นจะดูเหมือนสรุปจากทุกไม้ */}
        <Text style={styles.statFoot}>
          ตัดสินได้ {summary.judged} จาก {tradeCount} ไม้
          {summary.tooRecent > 0 ? ` · ขายไม่ถึง ${MIN_DAYS_TO_JUDGE} วัน ${summary.tooRecent} ไม้` : ''}
          {summary.unknown > 0 ? ` · ไม่มีราคาให้เทียบ ${summary.unknown} ไม้` : ''}
        </Text>
      </View>

      {/* ── ข้อจำกัดที่ต้องอ่านก่อนเชื่อ ── */}
      <View style={styles.caveatCard}>
        <Text style={styles.caveatTitle}>
          <Ionicons name="alert-circle-outline" size={14} color={COLORS.textSecondary} /> อ่านก่อนเชื่อตัวเลขนี้
        </Text>
        <Text style={styles.caveatText}>
          • เทียบกับ "ราคาวันนี้" ซึ่งเป็นแค่จุดเวลาหนึ่ง — พรุ่งนี้ตัวเลขชุดนี้เปลี่ยน{'\n'}
          • เงินที่ขายไปคุณเอาไปลงทุนต่อแล้ว ถ้าตัวใหม่ทำได้ดีกว่า การขายก็คือถูกแล้ว
          หน้านี้บอกแค่ "ค่าเสียโอกาสของไม้นั้น" ไม่ได้บอกว่าคุณตัดสินใจผิด{'\n'}
          • ยังไม่คิดภาษีและค่าธรรมเนียม — หุ้นไทย/กองทุนไทยขายกำไรได้รับยกเว้น แต่คริปโต/หุ้นนอกเสียภาษี
          ต้นทุนการขายจริงจึงไม่เท่ากันทุกชนิด
        </Text>
      </View>

      {/* ── รายไม้ ── */}
      <Text style={styles.sectionTitle}>
        รายไม้ (เรียงตามผลกระทบมากสุด)
      </Text>
      <View style={isDesktop ? styles.cardGrid : undefined}>{visible.map(renderRow)}</View>

      {sorted.length > 5 && (
        <ActionButton
          icon={showAll ? 'chevron-up' : 'chevron-down'}
          label={showAll ? 'ย่อรายการ' : `ดูทั้งหมด (${sorted.length} ไม้)`}
          size="sm"
          onPress={() => setShowAll((v) => !v)}
          style={styles.toggleRow}
        />
      )}
    </ScrollView>
  );
}

const card = {
  backgroundColor: COLORS.surface,
  borderWidth: 1,
  borderColor: COLORS.border,
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centerText: { ...TEXT.caption, color: COLORS.textSecondary },
  empty: { ...TEXT.caption, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 40, lineHeight: 20 },

  heroCard: { ...card, padding: 16, borderLeftWidth: 3 },
  heroLabel: { ...TEXT.caption, color: COLORS.textSecondary },
  heroValue: { ...TEXT.screenTitle, color: COLORS.text, marginTop: 2 },
  heroAdvice: { ...TEXT.caption, color: COLORS.text, marginTop: 8, lineHeight: 20 },

  statCard: { ...card, padding: 16, marginTop: 12 },
  statHeadline: { ...TEXT.title, color: COLORS.text, lineHeight: 24 },
  kpiRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  kpiCell: { flex: 1, backgroundColor: `${COLORS.primary}0D`, paddingVertical: 10, paddingHorizontal: 8 },
  kpiLabel: { fontSize: 10, fontFamily: FONTS.regular, color: COLORS.textSecondary, marginBottom: 2 },
  kpiValue: { fontSize: 18, fontFamily: FONTS.semibold, color: COLORS.text },
  statLine: { ...TEXT.caption, color: COLORS.textSecondary, marginTop: 8 },
  statFoot: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 10, lineHeight: 17 },

  caveatCard: { ...card, padding: 14, marginTop: 12, backgroundColor: COLORS.divider },
  caveatTitle: { ...TEXT.label, color: COLORS.textSecondary },
  caveatText: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 6, lineHeight: 18 },

  sectionTitle: { ...TEXT.title, color: COLORS.text, marginTop: 20, marginBottom: 10 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 },
  // flexBasis คุมจำนวนใบต่อแถว, flexGrow กินที่ว่างจนเต็ม, minWidth:0 บังคับให้ shrink ได้บนเว็บ
  cardGridItem: { flexBasis: CARD_BASIS, flexGrow: 1, minWidth: 0, marginBottom: 0 },

  card: { ...card, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitleCol: { flex: 1, minWidth: 0 },
  cardName: { ...TEXT.subtitle, color: COLORS.text },
  cardSub: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },
  cardVerdict: { ...TEXT.hint, fontFamily: FONTS.medium },
  cardLine: { ...TEXT.caption, color: COLORS.textSecondary, marginTop: 8 },
  cardHint: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 8, lineHeight: 16 },
  cardNote: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 6, fontStyle: 'italic' },
  pos: { color: COLORS.success, fontFamily: FONTS.semibold },
  neg: { color: COLORS.error, fontFamily: FONTS.semibold },

  toggleRow: { alignSelf: 'center', marginVertical: 12 },
});
