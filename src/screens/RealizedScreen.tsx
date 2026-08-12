import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { Investment, RealizedTrade } from '../types/investment';
import {
  getInvestments,
  updateInvestment,
  saveInvestment,
} from '../services/investmentStorage';
import { getRealizedTrades, deleteRealizedTrade } from '../services/realizedStorage';
import { summarizeRealized, analyzeRealizedTrade } from '../utils/realizedAnalysis';
import { getPortfolioGoal } from '../services/portfolioGoalStorage';
import { PortfolioGoal } from '../utils/investmentGoals';
import { TaxProfile, emptyTaxProfile } from '../types/tax';
import { getTaxProfile } from '../services/taxStorage';
import { UserProfile, incomeExemptionFor } from '../types/userProfile';
import { getUserProfile } from '../services/userProfileStorage';
import { calculateTax, taxYearOf } from '../utils/taxCalc';
import {
  COLORS,
  formatCurrency,
  formatCurrencyWithType,
  toChristianYear,
} from '../utils/constants';
import { notify, confirmAsk } from '../utils/dialog';
import { useResponsive } from '../utils/responsive';

// ปีภาษีปัจจุบันเป็น พ.ศ. — ใช้ทั้งดึง TaxProfile และกรองไม้ที่ขายปีนี้
const currentTaxYear = new Date().getFullYear() + 543;

const fmtDateTH = (iso: string): string =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

/**
 * หน้า "ผลงานที่ขายแล้ว" — แยกออกมาจากพอร์ตเพราะเป็นคนละคำถาม
 * พอร์ต = "ตอนนี้ถืออะไรอยู่" · หน้านี้ = "ที่ขายไปแล้วทำได้เท่าไหร่ และเสียภาษีเท่าไหร่"
 * ตัวเลขทุกตัวมาจาก realized_trades ก้อนเดียวกับที่การ์ดสรุปในพอร์ตใช้ จึงไม่มีทางไม่ตรงกัน
 */
export default function RealizedScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDesktop } = useResponsive();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [realizedTrades, setRealizedTrades] = useState<RealizedTrade[]>([]);
  const [goal, setGoal] = useState<PortfolioGoal | null>(null);
  const [taxProfile, setTaxProfile] = useState<TaxProfile | null>(null);
  const [person, setPerson] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setInvestments(await getInvestments());
    } catch {
      setInvestments([]);
    }
    try {
      setRealizedTrades(await getRealizedTrades());
    } catch {
      // ยังไม่ได้รัน sql/realized_trades.sql — หน้านี้จะขึ้นสถานะว่างแทน
      setRealizedTrades([]);
    }
    try {
      setGoal(await getPortfolioGoal());
    } catch {
      setGoal(null);
    }
    try {
      setTaxProfile(await getTaxProfile(currentTaxYear));
    } catch {
      setTaxProfile(null);
    }
    try {
      setPerson(await getUserProfile());
    } catch {
      setPerson(null);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [loadData])
  );

  const realized = summarizeRealized(realizedTrades);
  const realizedResults = realizedTrades.map(analyzeRealizedTrade);

  // ไม้ที่ขายในปีภาษีนี้ — ฐานของการ์ดภาษี (ต้องส่ง opts ชุดเดียวกับหน้าภาษี ไม่งั้นเลขไม่ตรงกัน)
  const tradesThisTaxYear = useMemo(
    () => realizedTrades.filter((t) => taxYearOf(t.sellDate) === currentTaxYear),
    [realizedTrades]
  );
  const taxOpts = useMemo(
    () => ({ incomeExemption: incomeExemptionFor(person, currentTaxYear).amount }),
    [person]
  );
  const taxThisYear = useMemo(() => {
    if (tradesThisTaxYear.length === 0) return null;
    const b = calculateTax(taxProfile ?? emptyTaxProfile(currentTaxYear), realizedTrades, taxOpts);
    return {
      grossGain: b.gains.reduce((s, g) => s + g.gain, 0),
      assessable: b.gainIncome,
      tax: b.taxFromGains,
      marginalRate: b.marginalRate,
    };
  }, [tradesThisTaxYear, realizedTrades, taxProfile, taxOpts]);

  // ── ย้อนคืนการขาย: กดขายผิด/กรอกเลขผิด ต้องกู้กลับได้ ──
  // คืนของเข้าพอร์ตก่อน แล้วค่อยลบบันทึกการขาย — ถ้าลำดับกลับกันแล้วพังกลางทาง ของจะหายทั้งสองที่
  const undoSell = async (trade: RealizedTrade) => {
    try {
      // อ่านพอร์ตสด ๆ จาก DB ก่อน ห้ามเชื่อ state ที่อาจค้าง —
      // update ที่ไม่เจอแถวจะ "ผ่าน" แบบไม่มี error แล้วเราจะเผลอลบบันทึกการขายทิ้ง
      const fresh = await getInvestments();
      const snap = trade.sourceInvestment;
      const platform = trade.platform ?? snap?.platform;
      // ── ห้ามรวมข้ามไม้เด็ดขาด ──
      // ตัวเดียวกันมีได้หลายไม้ (ซื้อหลายรอบ/คนละโบรก = หลายแถว ต้นทุนต่างกัน)
      // เกณฑ์ "ไม้เดียวกัน": id จาก snapshot ตรง หรือ symbol+ประเภท+แพลตฟอร์ม+ราคาซื้อ ตรงกันหมด
      const samePrice = (p?: number) => p != null && Math.abs(p - trade.buyPrice) < 1e-6;
      const samePlatform = (p?: string) => (p || '') === (platform || '');
      const target =
        fresh.find((i) => !!snap && i.id === snap.id && samePrice(i.buyPrice)) ??
        fresh.find(
          (i) =>
            i.symbol === trade.symbol &&
            i.type === trade.assetType &&
            samePlatform(i.platform) &&
            samePrice(i.buyPrice)
        );
      const feeShare = snap
        ? snap.quantity > 0 ? (snap.fees || 0) * (trade.quantity / snap.quantity) : 0
        : trade.fees || 0;

      let restoredId: string;
      if (target) {
        // ขายบางส่วนของไม้นี้ → บวกจำนวนกลับเข้าไม้เดิม (บวกกลับ ไม่ทับค่าเดิม เผื่อขายหลายรอบ)
        restoredId = target.id;
        await updateInvestment({
          ...target,
          quantity: target.quantity + trade.quantity,
          fees: (target.fees || 0) + feeShare,
        });
      } else {
        // ไม้เดิมไม่อยู่แล้ว (ขายหมด) หรือพิสูจน์ไม่ได้ว่าเป็นไม้เดียวกัน → สร้างเป็นแถวใหม่แยกไม้
        restoredId = snap && !fresh.some((i) => i.id === snap.id) ? snap.id : Date.now().toString();
        await saveInvestment(
          snap
            ? { ...snap, id: restoredId, quantity: trade.quantity, fees: feeShare, platform }
            : {
                id: restoredId,
                type: trade.assetType,
                symbol: trade.symbol,
                name: trade.name || trade.symbol,
                quantity: trade.quantity,
                buyPrice: trade.buyPrice,
                currency: trade.currency,
                buyDate: trade.buyDate,
                fees: feeShare,
                platform,
              }
        );
      }

      // ยืนยันจาก DB ว่าของกลับเข้าพอร์ตจริง แล้วค่อยลบบันทึกการขาย
      const after = await getInvestments();
      const restored = after.find((i) => i.id === restoredId);
      if (!restored) {
        throw new Error('บันทึกกลับเข้าพอร์ตไม่สำเร็จ — ยังเก็บบันทึกการขายไว้ให้ ลองกดย้อนคืนอีกครั้ง');
      }

      await deleteRealizedTrade(trade.id);
      const where = restored.platform ? ` ที่ ${restored.platform}` : '';
      notify(
        target
          ? `ย้อนคืนแล้ว — ${restored.symbol || restored.name}${where} ไม้เดิมกลับเป็น ${restored.quantity} หน่วย`
          : `ย้อนคืนแล้ว — ${restored.symbol || restored.name} ${restored.quantity} หน่วย @ ${formatCurrencyWithType(restored.buyPrice, restored.currency)}${where} เพิ่มกลับเป็นรายการแยกไม้`
      );
      await loadData();
    } catch (e: any) {
      notify(`ย้อนคืนไม่สำเร็จ: ${String(e?.message || e)}`);
      loadData();
    }
  };

  const handleUndoSell = async (trade: RealizedTrade) => {
    const at = trade.platform ? ` (${trade.platform})` : '';
    const label = `${trade.symbol || trade.name}${at} ${trade.quantity} หน่วย`;
    const msg = `ย้อนคืนการขาย ${label}?\nรายการจะกลับเข้าพอร์ต${at ? ` ที่ ${trade.platform}` : ''} และบันทึกการขายนี้จะถูกลบ`;
    if (await confirmAsk('ย้อนคืนการขาย', msg, 'ย้อนคืน')) undoSell(trade);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (realized.tradeCount === 0) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            <Ionicons name="ribbon-outline" size={18} color={COLORS.primary} /> ยังไม่มีการขายที่บันทึกไว้
          </Text>
          <Text style={styles.cardEmpty}>
            กดปุ่ม "ขาย" ที่การ์ดของแต่ละรายการในหน้าพอร์ต แล้วผลกำไรจริงจะมาสรุปที่หน้านี้ —
            กำไรลอยตัวของที่ยังถืออยู่ไม่นับ
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={isDesktop ? styles.cardGrid : undefined}>
        {/* ── ผลงานจริง (realized): กำไรที่ขายแล้วเท่านั้น ไม่นับกำไรลอยตัว ── */}
        <View style={[styles.card, isDesktop && styles.cardGridItem]}>
          <Text style={styles.cardTitle}>
            <Ionicons name="ribbon-outline" size={18} color={COLORS.primary} /> ผลงานจริง (ที่ขายแล้ว)
          </Text>
          <View style={styles.kpiRow}>
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>กำไรจริง</Text>
              <Text style={[styles.kpiValue, realized.totalPnlTHB < 0 && styles.kpiValueNeg]}>
                {realized.totalPnlTHB >= 0 ? '+' : ''}{formatCurrency(realized.totalPnlTHB)}
              </Text>
            </View>
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>คิดเป็น</Text>
              <Text style={[styles.kpiValue, realized.totalPnlPercent < 0 && styles.kpiValueNeg]}>
                {realized.totalPnlPercent >= 0 ? '+' : ''}{realized.totalPnlPercent.toFixed(1)}%
              </Text>
            </View>
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>ชนะ {realized.winCount}/{realized.tradeCount} ดีล</Text>
              <Text style={styles.kpiValue}>{realized.winRatePercent.toFixed(0)}%</Text>
            </View>
          </View>
          <View style={styles.planLine}>
            <Text style={styles.planLineLabel}>
              ผลตอบแทนจริงต่อปี (ถือเฉลี่ย {realized.avgHoldYears.toFixed(1)} ปี)
            </Text>
            <Text style={styles.planLineValue}>
              {realized.annualReturnPercent != null
                ? `${realized.annualReturnPercent >= 0 ? '+' : ''}${realized.annualReturnPercent.toFixed(1)}%`
                : realized.tooShort
                  ? 'ถือสั้นเกินไป'
                  : '—'}
            </Text>
          </View>
          {/* จุดที่สำคัญที่สุด: ของจริง vs ที่ตั้งไว้ */}
          {goal?.expectedAnnualReturnPercent != null && realized.annualReturnPercent != null && (
            <Text
              style={[
                styles.subText,
                {
                  color:
                    realized.annualReturnPercent >= goal.expectedAnnualReturnPercent
                      ? COLORS.success
                      : COLORS.error,
                },
              ]}
            >
              {realized.annualReturnPercent >= goal.expectedAnnualReturnPercent
                ? `ทำได้จริง ${realized.annualReturnPercent.toFixed(1)}%/ปี · เป้าที่ตั้งไว้ ${goal.expectedAnnualReturnPercent}% — เกินเป้า`
                : `ทำได้จริง ${realized.annualReturnPercent.toFixed(1)}%/ปี · เป้าที่ตั้งไว้ ${goal.expectedAnnualReturnPercent}% — ยังไม่ถึงเป้า`}
            </Text>
          )}
          {realized.bestTrade && realized.worstTrade && realized.tradeCount > 1 && (
            <Text style={styles.subText}>
              ดีที่สุด {realized.bestTrade.trade.symbol} {realized.bestTrade.pnlPercent >= 0 ? '+' : ''}
              {realized.bestTrade.pnlPercent.toFixed(1)}% • แย่ที่สุด {realized.worstTrade.trade.symbol}{' '}
              {realized.worstTrade.pnlPercent >= 0 ? '+' : ''}{realized.worstTrade.pnlPercent.toFixed(1)}%
            </Text>
          )}

          {/* ทบทวนจังหวะขาย — เทียบราคาที่ขายไปกับราคาวันนี้ ตอบว่าควรใช้กฎขายแบบไหน */}
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => navigation.navigate('SellReview')}
          >
            <Ionicons name="analytics-outline" size={14} color={COLORS.primary} />
            <Text style={styles.linkRowText}> ทบทวนจังหวะขาย — ขายแล้วมันขึ้นต่อไหม</Text>
          </TouchableOpacity>
        </View>

        {/* ── ภาษีจากกำไรที่ขายปีนี้ ── */}
        {taxThisYear && (
          <TouchableOpacity
            style={[styles.card, isDesktop && styles.cardGridItem]}
            onPress={() => navigation.navigate('Tax')}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                <Ionicons name="receipt-outline" size={18} color={COLORS.primary} /> ภาษีจากกำไรที่ขาย ปี {currentTaxYear}
              </Text>
              <Text style={styles.cardEdit}>{taxProfile ? 'ดูรายละเอียด' : 'ตั้งค่า'}</Text>
            </View>
            <View style={styles.kpiRow}>
              <View style={styles.kpiCell}>
                <Text style={styles.kpiLabel}>กำไรที่ขายปีนี้</Text>
                <Text style={styles.kpiValue}>{formatCurrency(taxThisYear.grossGain)}</Text>
              </View>
              <View style={styles.kpiCell}>
                <Text style={styles.kpiLabel}>เข้าฐานภาษี</Text>
                <Text style={styles.kpiValue}>{formatCurrency(taxThisYear.assessable)}</Text>
              </View>
              <View style={styles.kpiCell}>
                <Text style={styles.kpiLabel}>ภาษีประมาณ</Text>
                <Text style={styles.kpiValue}>{formatCurrency(taxThisYear.tax)}</Text>
              </View>
            </View>
            <Text style={styles.cardSub}>
              {!taxProfile
                ? 'ยังไม่ได้กรอกเงินเดือนที่หน้า "ภาษี" — ภาษีจึงคิดจากกำไรอย่างเดียว ยังไม่ใช่ขั้นจริง'
                : taxThisYear.assessable === 0
                  ? 'กำไรปีนี้อยู่ในกลุ่มที่ได้รับยกเว้นทั้งหมด (หุ้นไทย/กองทุนไทย)'
                  : `คิดบนฐานเงินได้ปีนี้ — กำไรส่วนนี้ตกขั้น ${(taxThisYear.marginalRate * 100).toFixed(0)}%`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── รายดีล + ปุ่มย้อนคืน: กดขายผิด/กรอกเลขผิด ต้องกู้กลับได้ ──
          หน้านี้มีหน้าที่เดียวคือรายการที่ขายแล้ว จึงกางไว้เลย ไม่ต้องมีปุ่มกาง/ยุบเหมือนตอนอยู่ในพอร์ต */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          <Ionicons name="list-outline" size={18} color={COLORS.primary} /> รายการที่ขายแล้ว ({realized.tradeCount})
        </Text>
        {realizedResults.map((r) => (
          <View key={r.trade.id} style={styles.realizedRow}>
            <View style={styles.realizedRowLeft}>
              <Text style={styles.realizedRowTitle} numberOfLines={1}>
                {r.trade.symbol || r.trade.name}
              </Text>
              <Text style={styles.realizedRowSub}>
                {r.trade.quantity} หน่วย • ขาย {fmtDateTH(toChristianYear(r.trade.sellDate))} @{' '}
                {formatCurrencyWithType(r.trade.sellPrice, r.trade.currency)}
                {r.trade.platform ? ` • ${r.trade.platform}` : ''}
              </Text>
              {/* เหตุผลที่ขาย — ตัวที่ทำให้ประวัติกลายเป็นสมุดทบทวนฝีมือ ไม่ใช่แค่ตารางเลข */}
              {r.trade.notes ? (
                <Text style={styles.realizedRowNote} numberOfLines={2}>
                  “{r.trade.notes}”
                </Text>
              ) : null}
            </View>
            <Text
              style={[styles.realizedRowPnl, { color: r.pnlTHB >= 0 ? COLORS.success : COLORS.error }]}
            >
              {r.pnlTHB >= 0 ? '+' : ''}{formatCurrency(r.pnlTHB)}
              {'\n'}
              <Text style={styles.realizedRowPnlPct}>
                {r.pnlPercent >= 0 ? '+' : ''}{r.pnlPercent.toFixed(1)}%
              </Text>
            </Text>
            <TouchableOpacity style={styles.undoButton} onPress={() => handleUndoSell(r.trade)}>
              <Ionicons name="arrow-undo-outline" size={14} color={COLORS.primary} />
              <Text style={styles.undoButtonText}> ย้อนคืน</Text>
            </TouchableOpacity>
          </View>
        ))}
        {realizedResults.some((r) => !r.trade.sourceInvestment) && (
          <Text style={styles.subText}>
            * บางรายการยังไม่มีข้อมูลสำรอง (ขายไว้ก่อนมีฟีเจอร์นี้) — ย้อนคืนได้ตามจำนวน/ต้นทุน/แพลตฟอร์ม
            แต่โน้ตกับเป้าหมายกำไรจะไม่กลับมา
          </Text>
        )}
        {/* ของที่ยังถืออยู่ ไม่เกี่ยวกับหน้านี้ — บอกไว้กันเข้าใจผิดว่าพอร์ตหายไปไหน */}
        <Text style={styles.subText}>
          ตอนนี้ยังถืออยู่ {investments.length} รายการ — กำไรลอยตัวของก้อนนั้นดูที่หน้าพอร์ต
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingVertical: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  // เดสก์ท็อปวางการ์ดสรุปเป็นกริด wrap — ไม่มี maxWidth (ดู CLAUDE.md §1.3)
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 16,
    marginHorizontal: 16,
  },
  cardGridItem: {
    flexBasis: 520,
    flexGrow: 1,
    minWidth: 0,
    marginHorizontal: 0,
    marginBottom: 0,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 16,
    marginHorizontal: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  cardEdit: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.primary,
  },
  cardSub: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    marginTop: 8,
  },
  cardEmpty: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: 8,
  },
  kpiRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  kpiCell: {
    flex: 1,
    backgroundColor: `${COLORS.primary}0D`,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  kpiLabel: {
    fontSize: 10,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 15,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
  },
  kpiValueNeg: { color: COLORS.error },
  planLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 12,
  },
  planLineLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  planLineValue: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
    textAlign: 'right',
  },
  subText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.accent,
    marginTop: 3,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  linkRowText: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
  },
  realizedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  realizedRowLeft: { flex: 1 },
  realizedRowTitle: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  realizedRowSub: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  realizedRowNote: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.primary,
    marginTop: 2,
  },
  realizedRowPnl: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    textAlign: 'right',
  },
  realizedRowPnlPct: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  undoButtonText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.primary,
  },
});
