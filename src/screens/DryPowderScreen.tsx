import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Investment, RealizedTrade, DEFAULT_CURRENCIES } from '../types/investment';
import { getInvestments } from '../services/investmentStorage';
import { getRealizedTrades } from '../services/realizedStorage';
import { getCurrencies } from '../services/currencyStorage';
import {
  getInvestmentPlan,
  saveInvestmentPlan,
  InvestmentPlan,
  DryPowderItem,
  sumDryPowderItems,
} from '../services/investmentPlanStorage';
import {
  powderStatus,
  countSymbols,
  SPAN_PRESETS,
  DEFAULT_STEP_PERCENT,
  DEFAULT_SPAN_DAYS,
  DEFAULT_EVERY_DAYS,
} from '../utils/dryPowder';
import {
  COLORS,
  formatCurrency,
  formatCurrencyWithType,
  convertToTHB,
  convertFromTHB,
  toChristianYear,
} from '../utils/constants';
import { notify, confirmAsk } from '../utils/dialog';
import { useResponsive } from '../utils/responsive';

const fmtDateTH = (iso: string): string =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

/** "เหลือกี่ครั้งต่อหุ้น" หารไม่ลงตัวได้ (17 ไม้ / 5 หุ้น) — ทศนิยม 1 ตำแหน่งเฉพาะตอนไม่ลงตัว */
const fmtRounds = (n: number): string => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/** ค่าตั้งต้นของก้อนใหม่ — คิดไว้ที่ utils/dryPowder ที่เดียว จอแค่ยืมมาใส่ตอนสร้าง */
const SEED_POWDER = {
  powderSpanDays: DEFAULT_SPAN_DAYS,
  powderEveryDays: DEFAULT_EVERY_DAYS,
  powderStepPercent: DEFAULT_STEP_PERCENT,
};

/**
 * แถวปรับตัวเลข — ต้องอยู่ระดับโมดูล ไม่ใช่ในตัว render ของหน้าจอ
 * (ประกาศในตัว render = React มองเป็น component คนละตัวทุกครั้งที่ re-render แล้ว remount ทิ้ง)
 */
const StepperRow = ({
  label,
  value,
  hint,
  onStep,
}: {
  label: string;
  value: string;
  hint?: string;
  onStep: (delta: number) => void;
}) => (
  <View style={styles.stepperRow}>
    <Text style={styles.planLineLabel}>{label}</Text>
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepperBtn} onPress={() => onStep(-1)}>
        <Ionicons name="remove" size={16} color={COLORS.primary} />
      </TouchableOpacity>
      <Text style={styles.stepperValue}>{value}</Text>
      <TouchableOpacity style={styles.stepperBtn} onPress={() => onStep(1)}>
        <Ionicons name="add" size={16} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
    <Text style={styles.stepperHint}>{hint ?? ''}</Text>
  </View>
);

/**
 * หน้า "เงินรอลงทุน" — กระสุนมีเท่าไหร่ · ไม้ถัดไปเท่าไหร่ · รับดิ่งได้อีกกี่ %
 *
 * ยอดเงินไม่หักอัตโนมัติเมื่อซื้อ — ผู้ใช้กรอกยอดจริงทับเมื่อไหร่ก็ได้ ระบบแค่เตือนถ้าซื้อหลังวันที่จด
 * ขนาดไม้คิดที่ utils/dryPowder.ts ที่เดียว (จอรอบลงทุน/การ์ดถึงคิวลงไม้ ใช้ตัวเดียวกัน)
 * ตัวหารคือ "ไม้ที่ยังเหลือ" ไม่ใช่ "ไม้ทั้งหมด" — ไม่งั้นแก้ยอดทีขนาดไม้หดที
 */
export default function DryPowderScreen() {
  const { isDesktop } = useResponsive();
  const [plan, setPlan] = useState<InvestmentPlan | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [realizedTrades, setRealizedTrades] = useState<RealizedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [powderModalVisible, setPowderModalVisible] = useState(false);
  const [powderRows, setPowderRows] = useState<
    { id: string; label: string; amount: string; currency: string }[]
  >([]);
  // ตัวเลือกสกุลเงิน = ของที่ตั้งไว้ในหน้า "สกุลเงิน & แพลตฟอร์ม" (ไม่ hardcode)
  const [currencyOptions, setCurrencyOptions] = useState<string[]>(
    DEFAULT_CURRENCIES.map((c) => c.code)
  );

  const today = new Date().toISOString().slice(0, 10);

  // กดถี่ ๆ ไม่ยิง DB ทุกครั้ง — อัปเดตจอทันที แล้วค่อยเซฟหลังหยุดกด
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPlan = React.useRef<InvestmentPlan | null>(null);

  const loadData = useCallback(async () => {
    try {
      setPlan(await getInvestmentPlan());
      pendingPlan.current = null;
    } catch {
      setPlan(null);
    }
    try {
      setInvestments(await getInvestments());
    } catch {
      setInvestments([]);
    }
    try {
      setRealizedTrades(await getRealizedTrades());
    } catch {
      setRealizedTrades([]);
    }
    try {
      const curList = await getCurrencies();
      if (curList.length > 0) setCurrencyOptions(curList.map((c) => c.code));
    } catch {
      // ยังไม่ได้รัน SQL แคตตาล็อก → ใช้ค่าเริ่มต้น
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [loadData])
  );

  const patchPlan = (patch: Partial<InvestmentPlan>, immediate = false) => {
    const base: InvestmentPlan = pendingPlan.current ?? plan ?? { setAsidePercent: 0, dcaRounds: 0 };
    const next: InvestmentPlan = { ...base, ...patch };
    pendingPlan.current = next;
    setPlan(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const flush = () => {
      const toSave = pendingPlan.current;
      pendingPlan.current = null;
      if (toSave) {
        saveInvestmentPlan(toSave).catch(() =>
          notify('บันทึกไม่สำเร็จ — ถ้ายังไม่ได้รัน sql/investment_plan_leg_sizing.sql ให้รันก่อน')
        );
      }
    };
    if (immediate) flush();
    else saveTimer.current = setTimeout(flush, 700);
  };

  // ── จดยอดเงินรอลงทุน ──
  // สกุลเริ่มต้นของแถวใหม่ = ตัวแรกในแคตตาล็อก (ปกติคือ THB)
  const newPowderRow = (seed = 0) => ({
    id: `p${Date.now()}-${seed}`,
    label: '',
    amount: '',
    currency: currencyOptions[0] || 'THB',
  });

  const openPowderModal = () => {
    const items = plan?.dryPowderItems;
    if (items && items.length > 0) {
      setPowderRows(
        items.map((i) => ({
          id: i.id,
          label: i.label || '',
          amount: i.amount ? i.amount.toString() : '',
          currency: i.currency || 'THB',
        }))
      );
    } else if (plan?.dryPowder && plan.dryPowder > 0) {
      // เคยจดเป็นยอดรวมก้อนเดียว (เก็บเป็น THB) → ยกมาเป็นรายการแรก ของเดิมไม่หาย
      setPowderRows([
        { id: `p${Date.now()}-0`, label: '', amount: plan.dryPowder.toString(), currency: 'THB' },
      ]);
    } else {
      setPowderRows([newPowderRow()]);
    }
    setPowderModalVisible(true);
  };

  const updatePowderRow = (
    id: string,
    patch: Partial<{ label: string; amount: string; currency: string }>
  ) => setPowderRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removePowderRow = (id: string) =>
    setPowderRows((rows) => (rows.length <= 1 ? [newPowderRow()] : rows.filter((r) => r.id !== id)));

  const parseAmount = (s: string) => parseFloat(s.replace(/,/g, '').trim());

  const handleSavePowder = async () => {
    const prevById = new Map((plan?.dryPowderItems || []).map((i) => [i.id, i]));
    const items: DryPowderItem[] = [];
    for (const r of powderRows) {
      const raw = r.amount.replace(/,/g, '').trim();
      // แถวที่ไม่ได้กรอกอะไรเลย = ข้ามไป (ลบรายการได้ด้วยการล้างค่าให้ว่าง)
      if (raw === '' && !r.label.trim()) continue;
      const amount = parseAmount(r.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        notify(`ยอดของ "${r.label.trim() || 'รายการที่ยังไม่มีชื่อ'}" ต้องเป็นตัวเลขไม่ติดลบ`);
        return;
      }
      const prev = prevById.get(r.id);
      const currency = r.currency || 'THB';
      items.push({
        id: r.id,
        label: r.label.trim(),
        amount,
        currency,
        // ยอด/สกุลเดิมไม่เปลี่ยน = คงวันที่จดเดิม เปลี่ยนแล้วถึงประทับวันใหม่
        asOf:
          prev && prev.amount === amount && (prev.currency ?? 'THB') === currency
            ? prev.asOf ?? today
            : today,
      });
    }
    const total = sumDryPowderItems(items);
    try {
      // ยังไม่มีแถวในตาราง = สร้างขึ้นมาใหม่โดยไม่ต้องให้กรอกแผนก่อน
      const base: InvestmentPlan = plan ?? { setAsidePercent: 0, dcaRounds: 0 };
      // จดยอดครั้งแรก = ตั้งหมุดของก้อนให้เลย ผู้ใช้จะได้ไม่ต้องไปกด "เริ่มก้อนใหม่" ก่อนใช้งาน
      // (แค่ "แก้ยอด" ครั้งต่อ ๆ ไปห้ามแตะหมุด ไม่งั้นตัวนับไม้รีเซ็ตแล้วสูตรกลับไปพังแบบเดิม)
      const firstTime = !base.powderBaseTHB || base.powderBaseTHB <= 0;
      const seed: Partial<InvestmentPlan> =
        firstTime && total > 0
          ? {
              powderBaseTHB: total,
              powderStartedAt: today,
              powderLegsUsed: 0,
              powderSpanDays: base.powderSpanDays ?? SEED_POWDER.powderSpanDays,
              powderEveryDays: base.powderEveryDays ?? SEED_POWDER.powderEveryDays,
              powderStepPercent: base.powderStepPercent ?? SEED_POWDER.powderStepPercent,
            }
          : {};
      const next: InvestmentPlan = {
        ...base,
        ...seed,
        dryPowderItems: items.length > 0 ? items : undefined,
        // dryPowder = ยอดรวมเสมอ ส่วนที่คำนวณต่อ (ขนาดไม้/คำเตือน) จึงใช้ตัวเดิมได้
        dryPowder: total > 0 ? total : undefined,
        dryPowderAsOf:
          total <= 0 ? undefined : total !== base.dryPowder ? today : base.dryPowderAsOf,
      };
      await saveInvestmentPlan(next);
      pendingPlan.current = null;
      setPlan(next);
      setPowderModalVisible(false);
    } catch {
      notify('จดยอดไม่สำเร็จ — ถ้ายังไม่ได้รัน sql/investment_plan_dry_powder.sql ให้รันก่อน');
    }
  };

  // ยอดรวมสด ๆ ของแถวที่กำลังกรอกใน modal (เป็น THB) — โชว์ให้เห็นก่อนกดจด
  const powderRowsTotal = powderRows.reduce((s, r) => {
    const n = parseFloat(r.amount.replace(/,/g, ''));
    return s + (Number.isFinite(n) && n > 0 ? convertToTHB(n, r.currency || 'THB') : 0);
  }, 0);

  // ── ตัวเลขของก้อนปัจจุบัน ──
  // จำนวนหุ้น = นับ "ตัว" จากพอร์ต ไม่ใช่นับแถว (ไม้ของหุ้นเดียวกันเป็นคนละแถวใน investments)
  const symbolCount = countSymbols(investments);
  const status = powderStatus(plan, symbolCount);
  const dryPowder = status.remainingTHB;
  // ยอดที่จดไว้เป็นคนละสกุล รวมกันเป็นบาทไว้แล้ว — โชว์คู่กับดอลลาร์ด้วย
  // เพราะไม้ที่ลงบน Binance คิดเป็น USD จะได้ไม่ต้องหารในหัวเองทุกครั้ง
  const dryPowderUSD = dryPowder > 0 ? convertFromTHB(dryPowder, 'USD') : 0;
  const nextLegUSD = status.nextLegTHB != null ? convertFromTHB(status.nextLegTHB, 'USD') : null;

  // ซื้อไปแล้วกี่รายการหลังวันที่กำหนด — สัญญาณว่ายอด/ตัวนับที่จดไว้เก่าแล้ว
  const purchasesSince = (asOf?: string): { count: number; cost: number } | null => {
    if (!asOf) return null;
    let count = 0;
    let cost = 0;
    const add = (dateStr: string, amount: number) => {
      if (toChristianYear(dateStr || '').slice(0, 10) <= asOf) return;
      count++;
      cost += amount;
    };
    investments.forEach((inv) =>
      add(inv.buyDate, convertToTHB(inv.buyPrice, inv.currency) * inv.quantity + (inv.fees || 0))
    );
    realizedTrades.forEach((t) => add(t.buyDate, convertToTHB(t.buyPrice, t.currency) * t.quantity));
    return { count, cost };
  };

  const boughtSincePowder = dryPowder > 0 ? purchasesSince(plan?.dryPowderAsOf) : null;
  const boughtSinceStart = purchasesSince(plan?.powderStartedAt);
  // ตัวนับไม้เป็นของที่ผู้ใช้กดเอง (เหมือนยอดเงินที่ไม่หักอัตโนมัติ) — ไม่ตรงก็แค่เตือน
  const legsMismatch =
    plan?.powderStartedAt != null &&
    boughtSinceStart != null &&
    boughtSinceStart.count !== status.legsUsed;

  const startNewBatch = async () => {
    if (dryPowder <= 0) {
      notify('จดยอดเงินรอลงทุนก่อน แล้วค่อยเริ่มก้อนใหม่');
      return;
    }
    const ok = await confirmAsk(
      'เริ่มก้อนใหม่',
      `ตั้งทุนตั้งต้นของก้อนเป็น ฿${formatCurrency(dryPowder)} และนับไม้ใหม่จาก 0\n` +
        'ใช้ตอนเติมเงินเข้าพอร์ตหรือขึ้นรอบใหม่ — ถ้าแค่แก้ยอดให้ตรงจริง ไม่ต้องกดปุ่มนี้',
      'เริ่มก้อนใหม่'
    );
    if (!ok) return;
    patchPlan(
      {
        powderBaseTHB: dryPowder,
        powderStartedAt: today,
        powderLegsUsed: 0,
        powderSpanDays: plan?.powderSpanDays ?? SEED_POWDER.powderSpanDays,
        powderEveryDays: plan?.powderEveryDays ?? SEED_POWDER.powderEveryDays,
        powderStepPercent: plan?.powderStepPercent ?? SEED_POWDER.powderStepPercent,
      },
      true
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* ── เดสก์ท็อป: สองการ์ดเรียงซ้าย-ขวา ──
            สองใบนี้อ่านคู่กันเสมอ ("กระสุนมีเท่าไหร่" → "ไม้ละเท่าไหร่") วางซ้อนกันแล้ว
            ต้องเลื่อนขึ้นลงเทียบ ทั้งที่จอกว้างมีที่ว่างข้าง ๆ เหลือเฟือ
            ต่ำกว่าเดสก์ท็อป (รวมแท็บเล็ต 768–1023) ยังเรียงลงมาเหมือนเดิม — แบ่งครึ่งตรงนั้น
            แถวสเต็ปเปอร์ในการ์ดขวาจะโดนบีบจนป้ายกับปุ่มชนกัน */}
        <View style={isDesktop ? styles.splitRow : undefined}>
        {/* ── การ์ด 1: กระสุนมีเท่าไหร่ ── */}
        <View style={[styles.card, isDesktop && styles.splitCol]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>
              <Ionicons name="cash-outline" size={18} color={COLORS.primary} /> เงินรอลงทุน
            </Text>
            <TouchableOpacity onPress={openPowderModal}>
              <Text style={styles.cardEdit}>{dryPowder > 0 ? 'แก้ยอด' : 'จดยอด'}</Text>
            </TouchableOpacity>
          </View>

          {dryPowder <= 0 ? (
            <Text style={styles.cardEmpty}>
              กด "จดยอด" ใส่เงินที่พร้อมลงตอนนี้ → ระบบจะบอกว่าไม้ถัดไปเท่าไหร่ และรับดิ่งได้อีกกี่ %
            </Text>
          ) : (
            <>
              {(plan?.dryPowderItems || []).map((it) => (
                <View key={it.id} style={styles.planLine}>
                  <Text style={styles.planLineLabel}>
                    {it.label || 'ไม่ระบุชื่อ'}
                    {it.asOf ? ` · ${fmtDateTH(it.asOf)}` : ''}
                  </Text>
                  <Text style={styles.planLineValue}>
                    {formatCurrencyWithType(it.amount, it.currency ?? 'THB')}
                    {(it.currency ?? 'THB') !== 'THB'
                      ? ` (${formatCurrency(convertToTHB(it.amount, it.currency))})`
                      : ''}
                  </Text>
                </View>
              ))}
              <View style={[styles.planLine, styles.totalRow]}>
                <Text style={styles.totalLabel}>
                  กระสุนที่เหลือ
                  {(plan?.dryPowderItems?.length ?? 0) > 0
                    ? ` (${plan?.dryPowderItems?.length} รายการ)`
                    : ''}
                </Text>
                <View style={styles.dualCurrencyValue}>
                  <Text style={styles.totalValue}>฿{formatCurrency(dryPowder)}</Text>
                  <Text style={styles.dualCurrencySub}>
                    ≈ {formatCurrencyWithType(dryPowderUSD, 'USD')}
                  </Text>
                </View>
              </View>
              {status.spentTHB != null && status.spentTHB > 0 && plan?.powderBaseTHB ? (
                <Text style={styles.subTextMuted}>
                  ทุนตั้งต้นของก้อน ฿{formatCurrency(plan.powderBaseTHB)}
                  {plan.powderStartedAt ? ` · เริ่ม ${fmtDateTH(plan.powderStartedAt)}` : ''} · ลงไปแล้ว ฿
                  {formatCurrency(status.spentTHB)}
                </Text>
              ) : null}
              {boughtSincePowder && boughtSincePowder.count > 0 && plan?.dryPowderAsOf ? (
                <Text style={[styles.subText, { color: COLORS.warning }]}>
                  <Ionicons name="alert-circle-outline" size={13} color={COLORS.warning} />
                  {' '}ซื้อไป {boughtSincePowder.count} รายการ (~{formatCurrency(boughtSincePowder.cost)})
                  หลังจดยอดเมื่อ {fmtDateTH(plan.dryPowderAsOf)} — กด "แก้ยอด" ให้ตรงจริง
                </Text>
              ) : plan?.dryPowderAsOf ? (
                <Text style={styles.subTextMuted}>
                  จดยอดไว้เมื่อ {fmtDateTH(plan.dryPowderAsOf)} · ยังไม่มีการซื้อหลังจากนั้น
                </Text>
              ) : null}
            </>
          )}
        </View>

        {/* ── การ์ด 2: ไม้ถัดไปเท่าไหร่ (คำตอบก่อน แล้วค่อยตามด้วยปุ่มปรับ) ── */}
        <View style={[styles.card, isDesktop && styles.splitColWide]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>
              <Ionicons name="layers-outline" size={18} color={COLORS.primary} /> ขนาดไม้
            </Text>
            <TouchableOpacity onPress={startNewBatch}>
              <Text style={styles.cardEdit}>เริ่มก้อนใหม่</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroRow}>
            <View style={styles.heroMain}>
              <Text style={styles.heroLabel}>ไม้ถัดไป</Text>
              <Text style={styles.heroValue}>
                {status.nextLegTHB == null ? '—' : `฿${formatCurrency(status.nextLegTHB)}`}
              </Text>
              {nextLegUSD != null && (
                <Text style={styles.heroSub}>≈ {formatCurrencyWithType(nextLegUSD, 'USD')}</Text>
              )}
            </View>
            <View style={styles.heroSide}>
              <Text style={styles.heroLabel}>เหลืออีก</Text>
              <Text style={styles.heroSideValue}>{status.legsLeft} ไม้</Text>
              <Text style={styles.heroSub}>
                ลงไปแล้ว {status.legsUsed}/{status.legsPlanned}
              </Text>
            </View>
          </View>

          {/* ที่มาของเลข — เขียนตัวหารตามที่ใช้จริง ไม่ใช่ตามที่อยากให้ดูสวย */}
          <Text style={styles.formulaText}>
            {status.nextLegTHB != null
              ? `฿${formatCurrency(status.remainingTHB)} ÷ ${status.legsLeft} ไม้ที่เหลือ`
              : 'ยังคิดไม้ถัดไปไม่ได้'}
            {'\n'}ไม้ทั้งก้อน {status.legsPlanned} ไม้ = {status.symbolCount} หุ้น ×{' '}
            {status.roundsPerSymbol} ครั้ง (กระจาย {status.spanDays} วัน · ซื้อทุก {status.everyDays}{' '}
            วัน)
          </Text>

          {status.reason ? <Text style={styles.reasonText}>{status.reason}</Text> : null}

          {status.symbolCountAssumed ? (
            <Text style={styles.subTextMuted}>
              ยังไม่มีหุ้นในพอร์ต — คิดที่ 1 ตัวไปก่อน ซื้อตัวแรกแล้วเลขนี้จะปรับตามจำนวนหุ้นจริงเอง
            </Text>
          ) : null}

          {status.depthCoveredPercent != null && status.legsLeft > 0 ? (
            <View style={styles.depthBox}>
              <Text style={styles.depthLabel}>รับดิ่งได้อีกประมาณ</Text>
              <Text style={styles.depthValue}>{status.depthCoveredPercent.toFixed(0)}%</Text>
              <Text style={styles.depthHint}>
                = เหลือ {fmtRounds(status.roundsLeftPerSymbol)} ครั้ง/หุ้น × ระยะห่าง{' '}
                {plan?.powderStepPercent ?? DEFAULT_STEP_PERCENT}%/ไม้
              </Text>
            </View>
          ) : null}

          {status.underfunded && status.plannedLegTHB != null ? (
            <Text style={[styles.subText, { color: COLORS.warning }]}>
              <Ionicons name="alert-circle-outline" size={13} color={COLORS.warning} />
              {' '}ไม้ที่เหลือหดลงจากแผน (แผนไว้ ฿{formatCurrency(status.plannedLegTHB)}) — ลงเกินแผนไปแล้ว
              เติมเงินแล้วเริ่มก้อนใหม่ หรือย่นช่วงเวลาให้สั้นลง
            </Text>
          ) : null}

          {legsMismatch && boughtSinceStart ? (
            <Text style={styles.subTextMuted}>
              ซื้อไป {boughtSinceStart.count} รายการหลังเริ่มก้อน แต่ตัวนับอยู่ที่ {status.legsUsed} —
              ปรับ "ลงไปแล้ว" ให้ตรงถ้าจำนวนไม้ไม่ตรงกัน
            </Text>
          ) : null}

          {/* ── ปุ่มปรับ ── */}
          <View style={styles.settingsBox}>
            {/* ช่วงเวลาคือ "สไตล์" ของก้อน — สั้น = ไม้ใหญ่ลงเร็ว, ยาว = ไม้เล็กรับดิ่งได้ลึก */}
            <Text style={styles.settingsLabel}>สไตล์การลงเงิน — กระจายก้อนนี้ให้หมดในกี่วัน</Text>
            <View style={styles.chipRow}>
              {SPAN_PRESETS.map((s) => {
                const active = status.spanDays === s.days;
                return (
                  <TouchableOpacity
                    key={s.days}
                    style={[styles.spanChip, active && styles.chipActive]}
                    onPress={() => patchPlan({ powderSpanDays: s.days })}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.shapeHint}>
              {SPAN_PRESETS.find((s) => s.days === status.spanDays)?.hint ??
                `กระจาย ${status.spanDays} วัน`}
            </Text>

            <StepperRow
              label="ซื้อทุก ๆ"
              value={`${status.everyDays} วัน`}
              hint={`${status.roundsPerSymbol} ครั้ง/หุ้น`}
              onStep={(d) =>
                patchPlan({
                  powderEveryDays: Math.max(
                    1,
                    Math.min(90, (plan?.powderEveryDays ?? DEFAULT_EVERY_DAYS) + d)
                  ),
                })
              }
            />
            <StepperRow
              label="ลงไปแล้ว"
              value={`${status.legsUsed}`}
              hint={`จาก ${status.legsPlanned} ไม้`}
              onStep={(d) =>
                patchPlan({
                  powderLegsUsed: Math.max(
                    0,
                    Math.min(status.legsPlanned, (plan?.powderLegsUsed ?? 0) + d)
                  ),
                })
              }
            />
            <StepperRow
              label="ระยะห่างต่อไม้"
              value={`${plan?.powderStepPercent ?? DEFAULT_STEP_PERCENT}%`}
              hint="ต่ำกว่าไม้ก่อน"
              onStep={(d) =>
                patchPlan({
                  powderStepPercent: Math.max(
                    1,
                    Math.min(50, (plan?.powderStepPercent ?? DEFAULT_STEP_PERCENT) + d)
                  ),
                })
              }
            />
          </View>
        </View>
        </View>
        {/* ── จบแถวสองคอลัมน์ ── */}

        {/* เลขไม้ถัดไปนี้เป็นตัวเดียวกับที่การ์ดรอบลงทุนใช้แปลงงบเป็น "เหลือกี่ไม้" — บอกไว้ให้รู้ว่าเกี่ยวกัน */}
        <Text style={styles.hint}>
          ยอด "ไม้ถัดไป" คือตัวที่หน้า "รอบลงทุน" ใช้แปลงงบที่เหลือของรอบให้เป็นจำนวนไม้ที่ยังลงได้
          {'\n'}จำนวนหุ้นนับสดจากพอร์ต — ซื้อหุ้นตัวใหม่เข้ามา ไม้ทั้งก้อนจะเพิ่มตามและขนาดไม้จะเล็กลงเอง
          {'\n'}ตัวหารคือไม้ที่ยังเหลือ ไม่ใช่ไม้ทั้งก้อน — ลงตามแผนขนาดไม้จะคงที่ ลงเกินแผนไม้ที่เหลือถึงจะหด
        </Text>
      </ScrollView>

      {/* ── Modal จดยอดเงินรอลงทุน — จดแยกได้หลายรายการ ยอดรวมคือผลบวกของทุกแถว ── */}
      <Modal
        visible={powderModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPowderModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          {/* แถวจดยอดเพิ่มได้ไม่จำกัด → ความสูงไม่มีเพดาน ต้องให้การ์ดเลื่อนเองแน่ ๆ */}
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={styles.modalCardContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>
              <Ionicons name="cash-outline" size={18} color={COLORS.primary} /> จดยอดเงินรอลงทุน
            </Text>
            <Text style={styles.modalLabel}>เงินที่พร้อมลงทุนตอนนี้ — จดแยกรายการได้</Text>
            {powderRows.map((r, idx) => (
              <View key={r.id} style={styles.powderItemBox}>
                <View style={styles.powderRow}>
                  <TextInput
                    style={[styles.modalInput, styles.powderRowLabel]}
                    value={r.label}
                    onChangeText={(v) => updatePowderRow(r.id, { label: v })}
                    placeholder={idx === 0 ? 'ชื่อ/แหล่งเงิน เช่น Dime' : 'ชื่อ/แหล่งเงิน'}
                    placeholderTextColor={COLORS.textSecondary}
                  />
                  <TextInput
                    style={[styles.modalInput, styles.powderRowAmount]}
                    value={r.amount}
                    onChangeText={(v) => updatePowderRow(r.id, { amount: v })}
                    keyboardType="numeric"
                    placeholder="ยอด"
                    placeholderTextColor={COLORS.textSecondary}
                  />
                  <TouchableOpacity style={styles.powderRowDelete} onPress={() => removePowderRow(r.id)}>
                    <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
                {/* สกุลเงินของแถวนี้ — ตัวเลือกมาจากหน้า "สกุลเงิน & แพลตฟอร์ม" ที่ตั้งไว้ */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.powderCurrencyRow}>
                  {currencyOptions.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.powderCurBtn, r.currency === c && styles.chipActive]}
                      onPress={() => updatePowderRow(r.id, { currency: c })}
                    >
                      <Text style={[styles.chipText, r.currency === c && styles.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ))}
            <TouchableOpacity
              style={styles.powderAddBtn}
              onPress={() => setPowderRows((rows) => [...rows, newPowderRow(rows.length)])}
            >
              <Ionicons name="add" size={16} color={COLORS.primary} />
              <Text style={styles.powderAddBtnText}> เพิ่มรายการ</Text>
            </TouchableOpacity>
            <View style={[styles.planLine, styles.totalRow]}>
              <Text style={styles.totalLabel}>ยอดรวมที่จะจด (แปลงเป็น THB)</Text>
              <Text style={styles.totalValue}>{formatCurrency(powderRowsTotal)}</Text>
            </View>
            <Text style={styles.modalHint}>
              ยอดนี้ไม่หักอัตโนมัติ — ซื้อเสร็จแล้วกลับมาแก้ยอดของรายการนั้นได้เลย
              (ล้างทั้งชื่อและยอดของแถว = ลบรายการนั้นทิ้ง)
              {'\n'}แก้ยอดตรงนี้ไม่แตะทุนตั้งต้นและตัวนับไม้ — เติมเงินเข้าก้อนใหม่ให้กด "เริ่มก้อนใหม่"
              {plan?.dryPowderAsOf ? ` · จดล่าสุด ${fmtDateTH(plan.dryPowderAsOf)}` : ''}
            </Text>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSavePowder}>
              <Text style={styles.modalSaveBtnText}>จดยอด ({formatCurrency(powderRowsTotal)})</Text>
            </TouchableOpacity>
            <View style={styles.modalBottomRow}>
              <TouchableOpacity onPress={() => setPowderModalVisible(false)}>
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingVertical: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
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
    marginBottom: 10,
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
  cardEmpty: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  // ── เดสก์ท็อป: การ์ดสองใบเรียงซ้าย-ขวา ──
  // ระยะห่างมาจาก gap/padding ของแถว การ์ดจึงต้องล้าง margin ของตัวเองทิ้ง (ดู splitCol)
  splitRow: {
    flexDirection: 'row',
    // การ์ดซ้ายเนื้อหาน้อยกว่ามาก — ปล่อยให้สูงตามเนื้อหาจริง ไม่ยืดตามใบขวา
    alignItems: 'flex-start',
    gap: 16,
    paddingHorizontal: 16,
  },
  // flex ต้องมากับ minWidth:0 เสมอบนเว็บ ไม่งั้นบรรทัดยาว ๆ ในการ์ดดันคอลัมน์จนล้นแถว
  splitCol: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 0,
    marginBottom: 0,
  },
  // การ์ด "ขนาดไม้" กว้างกว่าเพราะมีแถวสเต็ปเปอร์ (ป้าย + ปุ่ม − / ตัวเลข / ปุ่ม + + คำอธิบาย)
  // กับชิปสไตล์การลงเงิน 6 ตัว ถ้าแบ่งเท่ากันชิปจะตกบรรทัดตั้งแต่จอ 1024
  splitColWide: {
    flex: 1.35,
    minWidth: 0,
    marginHorizontal: 0,
    marginBottom: 0,
  },
  hint: {
    marginHorizontal: 16,
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    lineHeight: 17,
  },
  // ── คำตอบหลัก: ไม้ถัดไป | เหลืออีกกี่ไม้ ──
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
  },
  heroMain: { flex: 1, minWidth: 0 },
  heroSide: { alignItems: 'flex-end' },
  heroLabel: {
    fontSize: 10,
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  heroValue: {
    fontSize: 26,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
  },
  heroSideValue: {
    fontSize: 18,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  heroSub: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  // ที่มาของเลขไม้ถัดไป — โชว์ตัวหารจริง กันคนคิดว่าแอปเสกเลขมา
  formulaText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    lineHeight: 17,
    marginTop: 4,
  },
  reasonText: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: 4,
  },
  depthBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  depthLabel: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  depthValue: {
    fontSize: 18,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.accent,
  },
  depthHint: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  settingsBox: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  settingsLabel: {
    fontSize: 10,
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
    marginTop: 10,
    marginBottom: 6,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepperBtn: { paddingHorizontal: 10, paddingVertical: 5 },
  stepperValue: {
    minWidth: 40,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  stepperHint: {
    width: 92,
    textAlign: 'right',
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  shapeHint: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
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
  // ยอดสองสกุลในบรรทัดเดียว — บาทเป็นตัวหลัก ดอลลาร์ห้อยข้างล่างตัวเล็กกว่า
  dualCurrencyValue: { alignItems: 'flex-end' },
  dualCurrencySub: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  // 6 ตัวเลือกในแถวเดียวบนมือถือจะแคบจนอ่านไม่ออก — ให้ตัดบรรทัดแทนการบีบ
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  spanChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  chipTextActive: { color: '#ffffff', fontFamily: 'NotoSansThai_600SemiBold' },
  totalRow: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  totalLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  totalValue: {
    fontSize: 15,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
  },
  subText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.accent,
    marginTop: 6,
    lineHeight: 17,
  },
  subTextMuted: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 6,
    lineHeight: 17,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  // การ์ดเป็น ScrollView: style = กล่องนอก (สูงได้ไม่เกินจอ), contentContainerStyle = padding ข้างใน
  modalCard: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '100%',
    flexGrow: 0,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCardContent: { padding: 24 },
  modalTitle: {
    fontSize: 16,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 10,
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
    marginBottom: 8,
    marginTop: 12,
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    fontSize: 16,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.text,
  },
  modalHint: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 6,
    lineHeight: 16,
  },
  powderItemBox: {
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  powderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  powderCurrencyRow: { flexGrow: 0 },
  powderCurBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  // minWidth: 0 คือหัวใจ — บนเว็บ TextInput กลายเป็น <input> ที่มีความกว้างในตัว ~20 ตัวอักษร
  // และ flex item ได้ min-width:auto มาโดยปริยาย → flexShrink ย่อไม่ลงต่ำกว่านั้น
  powderRowLabel: { flex: 3, minWidth: 0, padding: 10, fontSize: 14, fontFamily: 'NotoSansThai_400Regular' },
  powderRowAmount: { flex: 2, minWidth: 0, padding: 10, fontSize: 14, textAlign: 'right', fontFamily: 'NotoSansThai_400Regular' },
  powderRowDelete: { paddingHorizontal: 2, paddingVertical: 6 },
  powderAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  powderAddBtnText: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
  },
  modalSaveBtn: {
    backgroundColor: COLORS.primary,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  modalSaveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  modalBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  modalCancelText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    marginLeft: 'auto',
  },
});
