import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TEXT, formatCurrency, formatCurrencyWithType } from '../utils/constants';
import { ActionButton } from './ActionButton';
import { InvestmentCycle, BasketKey, basketLabel, DEFAULT_CYCLE_TARGET } from '../types/cycle';
import { CycleStatus, CycleHistory, SymbolExit } from '../utils/cycles';

// ── การ์ด "รอบนี้" ──
// ทุกคอมโพเนนต์ในไฟล์นี้อยู่ที่ module scope โดยตั้งใจ (กฎ §1.13 ใน CLAUDE.md):
// ประกาศคอมโพเนนต์ในตัว render ของหน้าจอ = ชนิดใหม่ทุกรอบ render = subtree ถูก remount
// ซึ่งทำให้ TextInput ข้างในเสียโฟกัสทุกตัวอักษร

// เกินเท่านี้ถือว่าเป้าอยู่ไกลผิดปกติ → โชว์บรรทัดข้อเท็จจริงเตือน (ไม่ใช่คำสั่งให้ทำอะไร)
const FAR_BOUNCE_PERCENT = 40;

const pct = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

const fmtDateTH = (iso: string): string =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

export const CycleCard: React.FC<{
  cycle: InvestmentCycle;
  status: CycleStatus;
  /** ไม้ในตะกร้านี้ที่ยังไม่อยู่รอบไหน — ดึงเข้าเองเท่านั้น ระบบไม่ดึงให้อัตโนมัติ
   *  (ไม่งั้นไม้ที่ตั้งใจถอนออกจากตะกร้าจะถูกลากกลับเข้ามาทุกครั้งที่เปิดหน้า) */
  orphanCount?: number;
  /** ราคาที่ต้องขายรายตัว (utils/cycles#exitPlanForCycle) — ส่งมาจากจอ เพราะต้องใช้ค่าธรรมเนียมของแพลตฟอร์ม */
  exits?: SymbolExit[];
  onPullOrphans?: () => void;
  onPressClose: () => void;
  onPressSettings: () => void;
  style?: StyleProp<ViewStyle>;
}> = ({ cycle, status, orphanCount = 0, exits = [], onPullOrphans, onPressClose, onPressSettings, style }) => {
  const profit = status.profitTHB;
  const profitPercent = status.profitPercent;
  const isUp = (profit ?? 0) >= 0;
  // แถบความคืบหน้าเทียบเป้า — ติดลบก็ให้แถบว่าง ไม่ใช่แถบกลับทาง
  const progress =
    profitPercent == null || cycle.targetProfitPercent <= 0
      ? 0
      : Math.max(0, Math.min(1, profitPercent / cycle.targetProfitPercent));
  const bounce = status.requiredBouncePercent;
  // พับไว้เป็นค่าเริ่มต้น — การ์ดต้องเห็นปุ่ม "ปิดรอบทั้งตะกร้า" โดยไม่ต้องเลื่อน
  const [showExits, setShowExits] = useState(false);
  // ตอนพับ โชว์ตัวที่ใกล้ถึงเป้าที่สุด (ช่องว่าง % น้อยสุด) — เลขที่มีโอกาสได้ใช้ก่อนเพื่อน
  const nearest = exits
    .filter((e) => e.targetPrice != null && e.gapPercent != null)
    .sort((a, b) => (a.gapPercent as number) - (b.gapPercent as number))[0];
  // ภาษีคิดครั้งเดียวจากกำไรรวมของรอบ ตัวเลขจึงเท่ากันทุกแถว — พิมพ์ที่หมายเหตุพอ
  const taxSample = exits.find((e) => e.taxTHB != null && (e.taxTHB as number) > 0);
  const taxNote = !exits.some((e) => e.taxIncluded)
    ? ' · ยังไม่รวมภาษีกำไร (ไปกรอกเงินเดือนที่หน้าภาษีก่อน ราคานี้จะยังต่ำกว่าความจริง)'
    : taxSample
      ? ` · เผื่อภาษีกำไรไว้แล้ว ~฿${formatCurrency(taxSample.taxTHB as number)} (คิดจากฐานเงินเดือนของคุณ)`
      : ' · รอบนี้ไม่มีภาษีกำไรที่ต้องเผื่อ';

  return (
    <View style={[styles.card, style]}>
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={1}>
          <Ionicons name="repeat-outline" size={18} color={COLORS.primary} /> รอบที่ {cycle.cycleNo} ·{' '}
          {basketLabel(cycle.basket)}
        </Text>
        <TouchableOpacity onPress={onPressSettings} hitSlop={8}>
          <Ionicons name="options-outline" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
      <Text style={styles.sub}>
        เริ่ม {fmtDateTH(cycle.startedAt)} · {status.days} วัน · {status.legCount} ไม้
      </Text>

      {profitPercent == null ? (
        <Text style={styles.sub}>
          ยังไม่มีไม้ในรอบนี้ — ลงไม้ตามสัญญาณแล้วรายการจะเข้ารอบนี้ให้เอง
        </Text>
      ) : (
        <>
          <View style={styles.kpiRow}>
            <Text style={[styles.amount, { color: isUp ? COLORS.success : COLORS.error }]}>
              {pct(profitPercent)}
            </Text>
            <Text style={[styles.kpiSide, { color: isUp ? COLORS.success : COLORS.error }]}>
              {profit != null ? `${profit >= 0 ? '+' : '−'}฿${formatCurrency(Math.abs(profit))}` : ''}
            </Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.sub}>
            เป้ากำไรรวมของรอบ +{cycle.targetProfitPercent}% (คิดบนต้นทุนที่ลงในรอบนี้)
          </Text>

          {/* เลขที่ต้องอยู่คู่กับ % กำไรเสมอ — % กำไรอย่างเดียวหลอกตาเวลาเติมไม้ */}
          {bounce != null && bounce > 0 && (
            <Text style={styles.bounce}>
              มูลค่าต้องขึ้นอีก {bounce.toFixed(1)}% ถึงจะถึงเป้า
            </Text>
          )}
          {status.met && (
            <Text style={styles.metLine}>
              <Ionicons name="checkmark-circle-outline" size={13} color={COLORS.success} /> ถึงเป้าแล้ว
              — ปิดรอบได้
            </Text>
          )}
        </>
      )}

      {/* กระสุนที่เหลือ = ตัวเลขที่ตัดสินความเป็นความตายของกลยุทธ์นี้ */}
      <Text style={styles.line}>
        ลงไปแล้ว ฿{formatCurrency(status.investedTHB)}
        {status.budgetTHB != null ? ` / งบ ฿${formatCurrency(status.budgetTHB)}` : ' (ยังไม่ได้ตั้งงบ)'}
        {status.roundsLeft != null ? ` · เหลือลงได้อีก ${status.roundsLeft} ไม้` : ''}
      </Text>
      {status.overBudget && (
        <Text style={styles.warn}>ใช้เกินงบของรอบไปแล้ว — ตั้งงบใหม่หรือหยุดเติมไม้</Text>
      )}
      {bounce != null && bounce > FAR_BOUNCE_PERCENT && (
        <Text style={styles.warn}>
          รอบนี้ต้องเด้ง {bounce.toFixed(0)}% ถึงจะถึงเป้า · ลงมาแล้ว {status.legCount} ไม้
        </Text>
      )}
      {status.missingPriceCount > 0 && (
        <Text style={styles.warn}>
          มี {status.missingPriceCount} ไม้ที่ยังไม่มีราคาปัจจุบัน — กำไรรวมต่ำกว่าความจริง
        </Text>
      )}
      {/* ── ราคาที่ต้องตั้งขาย ──
          %กำไรบอกได้แค่ "ยังไม่ถึง" แต่เอาไปตั้งคำสั่งขายไม่ได้ ต้องมานั่งคิดเองทุกครั้ง
          สองเลขนี้เอาไปตั้งได้เลย: รวมค่าธรรมเนียมขาย + เผื่อภาษีกำไรแล้ว (ดู utils/cycles)
          พับได้เพราะรอบที่มีหลายตัวจะยาวจนดันปุ่มปิดรอบตกจอ */}
      {exits.length > 0 && (
        <View style={styles.exitBox}>
          <TouchableOpacity
            style={styles.exitHead}
            onPress={() => setShowExits((v) => !v)}
            accessibilityRole="button"
          >
            <Text style={styles.exitTitle}>ตั้งขายที่ราคาไหน</Text>
            <Text style={styles.exitHeadSub} numberOfLines={1}>
              {showExits ? `${exits.length} ตัว` : nearest
                ? `${nearest.symbol} ${formatCurrencyWithType(nearest.targetPrice as number, nearest.currency)}${
                    exits.length > 1 ? ` +${exits.length - 1}` : ''
                  }`
                : `${exits.length} ตัว`}
            </Text>
            <Ionicons
              name={showExits ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>

          {showExits && (
            <>
              {exits.map((e) => (
                <View key={`${e.symbol}:${e.currency}`} style={styles.exitRow}>
                  <View style={styles.exitMain}>
                    <Text style={styles.exitSymbol} numberOfLines={1}>
                      {e.symbol}
                    </Text>
                    <Text style={styles.exitSub} numberOfLines={1}>
                      {e.quantity} หน่วย · ทุนเฉลี่ย {formatCurrencyWithType(e.avgBuyPrice, e.currency)}
                      {e.currentPrice != null
                        ? ` · ตอนนี้ ${formatCurrencyWithType(e.currentPrice, e.currency)}`
                        : ' · ยังไม่มีราคา'}
                    </Text>
                  </View>
                  <View style={styles.exitPrices}>
                    <Text style={styles.exitTarget}>
                      {e.targetPrice != null
                        ? formatCurrencyWithType(e.targetPrice, e.currency)
                        : 'ถึงเป้าแล้ว'}
                    </Text>
                    <Text style={styles.exitBe}>
                      คุ้มทุน {formatCurrencyWithType(e.breakEvenPrice, e.currency)}
                      {e.gapPercent != null ? ` · อีก ${e.gapPercent.toFixed(1)}%` : ''}
                    </Text>
                  </View>
                </View>
              ))}
              <Text style={styles.exitNote}>
                ราคาถึงเป้า = ขายตัวนี้ที่ราคานี้แล้วทั้งรอบถึงเป้า โดยตัวอื่นขายที่ราคาปัจจุบัน ·
                รวมค่าธรรมเนียมขายแล้ว
                {taxNote}
                {exits.some((e) => e.feeUnknown)
                  ? '\nบางตัวยังไม่ได้ตั้งค่าธรรมเนียมของแพลตฟอร์ม — ราคานี้จึงยังไม่รวมค่าธรรมเนียม ไปตั้งที่ โปรไฟล์ → สกุลเงิน & แพลตฟอร์ม'
                  : ''}
              </Text>
            </>
          )}
        </View>
      )}

      {status.legCountBySymbol.length > 0 && (
        <Text style={styles.sub} numberOfLines={2}>
          {status.legCountBySymbol
            .map((s) => `${s.symbol} ${s.count}${cycle.maxLegsPerSymbol ? `/${cycle.maxLegsPerSymbol}` : ''}`)
            .join(' · ')}
        </Text>
      )}

      {orphanCount > 0 && onPullOrphans && (
        <ActionButton
          label={`มี ${orphanCount} ไม้ในตะกร้านี้ที่ยังไม่อยู่รอบ — ดึงเข้ารอบ`}
          icon="download-outline"
          size="sm"
          onPress={onPullOrphans}
          style={styles.pullRow}
        />
      )}

      {/* กดได้ตลอด ไม่ใช่โผล่มาตอนถึงเป้า — การปิดก่อนเป้าเป็นการตัดสินใจที่ชอบธรรม */}
      <TouchableOpacity
        style={[styles.closeBtn, status.met && styles.closeBtnMet]}
        onPress={onPressClose}
        disabled={status.legCount === 0}
      >
        <Ionicons
          name="albums-outline"
          size={14}
          color={status.met ? COLORS.surface : COLORS.primary}
        />
        <Text style={[styles.closeBtnText, status.met && styles.closeBtnTextMet]}>
          {' '}ปิดรอบทั้งตะกร้า
        </Text>
      </TouchableOpacity>
    </View>
  );
};

/** ยังไม่มีรอบเปิดในตะกร้าไหนเลย — การ์ดชวนเปิดรอบแรก */
export const CycleStartCard: React.FC<{
  baskets: { basket: BasketKey; legCount: number; costTHB: number }[];
  onStart: (basket: BasketKey) => void;
  style?: StyleProp<ViewStyle>;
}> = ({ baskets, onStart, style }) => (
  <View style={[styles.card, style]}>
    <Text style={styles.title}>
      <Ionicons name="repeat-outline" size={18} color={COLORS.primary} /> รอบลงทุน — ยังไม่ได้เปิดรอบ
    </Text>
    <Text style={styles.sub}>
      รอบ = ตะกร้าที่ลงไม้เพิ่มเรื่อย ๆ ตอนราคาร่วง แล้วปิดทั้งตะกร้าเมื่อกำไรรวมถึงเป้า
      {'\n'}เปิดแยกตามประเภทสินทรัพย์ เพราะกฎภาษีและจังหวะราคาคนละแบบกัน
    </Text>
    {baskets.length === 0 ? (
      <Text style={styles.sub}>ยังไม่มีรายการลงทุน — เพิ่มไม้แรกก่อนแล้วค่อยเปิดรอบ</Text>
    ) : (
      baskets.map((b) => (
        <TouchableOpacity key={b.basket} style={styles.startRow} onPress={() => onStart(b.basket)}>
          <View style={styles.startRowLeft}>
            <Text style={styles.startRowName}>{basketLabel(b.basket)}</Text>
            <Text style={styles.sub}>
              ถืออยู่ {b.legCount} ไม้ · ต้นทุน ฿{formatCurrency(b.costTHB)} · เป้าเริ่มต้น +
              {DEFAULT_CYCLE_TARGET[b.basket] ?? 12}%
            </Text>
          </View>
          <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
        </TouchableOpacity>
      ))
    )}
  </View>
);

/** ประวัติรอบที่ปิดแล้ว — ตัววัดที่มาแทน CAGR รายไม้ (ยุบไว้ กดกางดู) */
export const CycleHistoryCard: React.FC<{
  history: CycleHistory;
  expanded: boolean;
  onToggle: () => void;
  style?: StyleProp<ViewStyle>;
}> = ({ history, expanded, onToggle, style }) => {
  if (history.cycleCount === 0) return null;
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.title}>
        <Ionicons name="ribbon-outline" size={18} color={COLORS.primary} /> ประวัติรอบที่ปิดแล้ว
      </Text>
      <Text style={styles.sub}>
        {history.cycleCount} รอบ · กำไรรวม ฿{formatCurrency(history.totalProfitTHB)} ·{' '}
        {history.winCount}/{history.cycleCount} รอบที่กำไร
        {history.avgDays != null ? ` · เฉลี่ย ${Math.round(history.avgDays)} วัน/รอบ` : ''}
        {history.avgProfitPercent != null ? ` · ${pct(history.avgProfitPercent)}/รอบ` : ''}
      </Text>
      <ActionButton
        icon={expanded ? 'chevron-up' : 'chevron-down'}
        label={expanded ? 'ซ่อนรายรอบ' : `ดูรายรอบ (${history.cycleCount})`}
        size="sm"
        onPress={onToggle}
        style={styles.toggle}
      />
      {expanded &&
        history.rows.map((r) => (
          <View key={r.cycle.id} style={styles.histRow}>
            <Text style={styles.histName} numberOfLines={1}>
              รอบ {r.cycle.cycleNo} · {basketLabel(r.cycle.basket)}{' '}
              <Text style={styles.sub}>
                {r.days} วัน · ลง ฿{formatCurrency(r.investedTHB)}
              </Text>
            </Text>
            <Text
              style={[
                styles.histPct,
                { color: r.profitTHB >= 0 ? COLORS.success : COLORS.error },
              ]}
            >
              {r.profitPercent != null ? pct(r.profitPercent) : '—'}
              <Text style={styles.sub}>
                {r.annualPercent != null
                  ? ` · ≈${pct(r.annualPercent)}/ปี`
                  : r.tooShort
                  ? ' · รอบสั้นเกินคิดต่อปี'
                  : ''}
              </Text>
            </Text>
          </View>
        ))}
    </View>
  );
};

const styles = StyleSheet.create({
  // ชุดเดียวกับ styles.goalCard ในหน้าพอร์ต (มุมเหลี่ยม เส้นขอบบาง) — ต้องดูเป็นการ์ดตระกูลเดียวกัน
  // กริดเดสก์ท็อปทับ marginHorizontal/marginBottom ให้เองผ่าน styles.cardGridItem ที่ส่งมาเป็น style
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { ...TEXT.title, color: COLORS.text, flex: 1, minWidth: 0 },
  sub: { ...TEXT.caption, color: COLORS.textSecondary, marginTop: 2 },
  line: { ...TEXT.body, color: COLORS.text, marginTop: 8 },
  kpiRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8 },
  amount: { ...TEXT.amount },
  kpiSide: { ...TEXT.subtitle, marginBottom: 3 },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.divider,
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  bounce: { ...TEXT.label, color: COLORS.text, marginTop: 6 },
  metLine: { ...TEXT.label, color: COLORS.success, marginTop: 6 },
  warn: { ...TEXT.caption, color: COLORS.warning, marginTop: 6 },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  closeBtnMet: { backgroundColor: COLORS.primary },
  closeBtnText: { ...TEXT.label, color: COLORS.primary },
  closeBtnTextMet: { color: COLORS.surface },
  startRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    marginTop: 8,
  },
  startRowLeft: { flex: 1, minWidth: 0 },
  startRowName: { ...TEXT.subtitle, color: COLORS.text },
  // ── กล่องราคาที่ต้องตั้งขาย ──
  exitBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    gap: 6,
  },
  exitHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // minWidth: 0 ให้บรรทัดสรุปหดได้ ไม่ดัน chevron หลุดขอบการ์ดบนเว็บ
  exitHeadSub: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    fontSize: 11.5,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  exitTitle: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  // minWidth: 0 ที่คอลัมน์ซ้ายจำเป็นบนเว็บ ไม่งั้นชื่อยาวดันคอลัมน์ราคาหลุดขอบการ์ด
  exitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exitMain: { flex: 1, minWidth: 0 },
  exitSymbol: { fontSize: 13, fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.text },
  exitSub: { fontSize: 10.5, fontFamily: 'NotoSansThai_300Light', color: COLORS.textSecondary },
  exitPrices: { alignItems: 'flex-end' },
  exitTarget: { fontSize: 14, fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.success },
  exitBe: { fontSize: 10.5, fontFamily: 'NotoSansThai_300Light', color: COLORS.textSecondary },
  exitNote: {
    fontSize: 10.5,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  pullRow: { alignSelf: 'stretch', marginTop: 10 },
  toggle: { alignSelf: 'flex-start', marginTop: 10 },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  histName: { ...TEXT.body, color: COLORS.text, flex: 1, minWidth: 0 },
  histPct: { ...TEXT.label },
});
