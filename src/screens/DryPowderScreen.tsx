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
  COLORS,
  formatCurrency,
  formatCurrencyWithType,
  convertToTHB,
  convertFromTHB,
  toChristianYear,
} from '../utils/constants';
import { notify } from '../utils/dialog';

const fmtDateTH = (iso: string): string =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

/**
 * หน้า "เงินรอลงทุน" — ยกการ์ดเงินรอลงทุนออกมาจากพอร์ต
 * ตอบคำถามเดียว: มีกระสุนเท่าไหร่ · แบ่งลงได้ครั้งละเท่าไหร่ · ทุกกี่วัน
 * ตั้งใจไม่หักอัตโนมัติเมื่อซื้อ — ผู้ใช้กรอกยอดจริงทับเมื่อไหร่ก็ได้ ระบบแค่เตือนถ้าซื้อหลังวันที่จด
 */
export default function DryPowderScreen() {
  const [plan, setPlan] = useState<InvestmentPlan | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [realizedTrades, setRealizedTrades] = useState<RealizedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [powderMonths, setPowderMonths] = useState(1); // จะกระจายเงินก้อนนี้กี่เดือน
  const [powderModalVisible, setPowderModalVisible] = useState(false);
  const [powderRows, setPowderRows] = useState<
    { id: string; label: string; amount: string; currency: string }[]
  >([]);
  // ตัวเลือกสกุลเงิน = ของที่ตั้งไว้ในหน้า "สกุลเงิน & แพลตฟอร์ม" (ไม่ hardcode)
  const [currencyOptions, setCurrencyOptions] = useState<string[]>(
    DEFAULT_CURRENCIES.map((c) => c.code)
  );

  const loadData = useCallback(async () => {
    try {
      setPlan(await getInvestmentPlan());
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

  // ── แบ่งลงกี่ครั้งต่อเดือน ──
  // กดถี่ ๆ ไม่ยิง DB ทุกครั้ง — อัปเดตจอทันที แล้วค่อยเซฟหลังหยุดกด
  const roundsSaveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const changeDcaRounds = (delta: number) => {
    const base: InvestmentPlan = plan ?? { setAsidePercent: 0, dcaRounds: 0 };
    const next = Math.max(0, Math.min(60, base.dcaRounds + delta));
    const nextPlan: InvestmentPlan = { ...base, dcaRounds: next };
    setPlan(nextPlan);
    if (roundsSaveTimer.current) clearTimeout(roundsSaveTimer.current);
    roundsSaveTimer.current = setTimeout(() => {
      saveInvestmentPlan(nextPlan).catch(() => notify('บันทึกจำนวนครั้งไม่สำเร็จ'));
    }, 700);
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
    const today = new Date().toISOString().slice(0, 10);
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
      const next: InvestmentPlan = {
        ...base,
        dryPowderItems: items.length > 0 ? items : undefined,
        // dryPowder = ยอดรวมเสมอ ส่วนที่คำนวณต่อ (ลงได้ครั้งละ/คำเตือน) จึงใช้ตัวเดิมได้
        dryPowder: total > 0 ? total : undefined,
        dryPowderAsOf:
          total <= 0 ? undefined : total !== base.dryPowder ? today : base.dryPowderAsOf,
      };
      await saveInvestmentPlan(next);
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

  const dcaRoundsCount = plan?.dcaRounds && plan.dcaRounds > 0 ? plan.dcaRounds : null;
  const dryPowder = plan?.dryPowder && plan.dryPowder > 0 ? plan.dryPowder : 0;
  const powderItemCount = plan?.dryPowderItems?.length ?? 0;
  const powderTotalRounds = dcaRoundsCount ? dcaRoundsCount * powderMonths : null;
  const powderPerRound = powderTotalRounds && dryPowder > 0 ? dryPowder / powderTotalRounds : null;
  const powderEveryDays = dcaRoundsCount ? 30 / dcaRoundsCount : null;
  // ยอดที่จดไว้เป็นคนละสกุล รวมกันเป็นบาทไว้แล้ว — โชว์คู่กับดอลลาร์ด้วย
  // เพราะไม้ที่ลงบน Binance คิดเป็น USD จะได้ไม่ต้องหารในหัวเองทุกครั้ง
  const dryPowderUSD = dryPowder > 0 ? convertFromTHB(dryPowder, 'USD') : 0;
  const powderPerRoundUSD = powderPerRound != null ? convertFromTHB(powderPerRound, 'USD') : null;
  // ซื้อไปแล้วกี่รายการหลังวันที่จดยอด — สัญญาณว่ายอดที่จดไว้เก่าแล้ว
  const boughtSincePowder = (() => {
    const asOf = plan?.dryPowderAsOf;
    if (!asOf || dryPowder <= 0) return null;
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
    return count > 0 ? { count, cost, asOf } : null;
  })();

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
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>
              <Ionicons name="cash-outline" size={18} color={COLORS.primary} /> เงินรอลงทุน · แบ่งลงกี่ครั้ง
            </Text>
            <TouchableOpacity onPress={openPowderModal}>
              <Text style={styles.cardEdit}>{dryPowder > 0 ? 'แก้ยอด' : 'จดยอด'}</Text>
            </TouchableOpacity>
          </View>

          {/* แบ่งลงกี่ครั้ง/เดือน — ปรับตรงนี้ ไม่มี modal แผนแยก */}
          <View style={styles.roundsRow}>
            <Text style={styles.planLineLabel}>แบ่งลงกี่ครั้ง / เดือน</Text>
            <View style={styles.roundsStepper}>
              <TouchableOpacity style={styles.roundsBtn} onPress={() => changeDcaRounds(-1)}>
                <Ionicons name="remove" size={16} color={COLORS.primary} />
              </TouchableOpacity>
              <Text style={styles.roundsValue}>{dcaRoundsCount ?? '—'}</Text>
              <TouchableOpacity style={styles.roundsBtn} onPress={() => changeDcaRounds(1)}>
                <Ionicons name="add" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.roundsHint}>
              {powderEveryDays ? `~${Math.max(1, Math.round(powderEveryDays))} วัน/ครั้ง` : 'ยังไม่ตั้ง'}
            </Text>
          </View>

          {dryPowder <= 0 ? (
            <Text style={styles.cardEmpty}>
              กด "จดยอด" ใส่เงินที่พร้อมลงตอนนี้ → ระบบจะบอกว่าลงได้ครั้งละเท่าไหร่ ทุกกี่วัน
            </Text>
          ) : !dcaRoundsCount ? (
            <Text style={styles.cardEmpty}>
              มีเงินรอลงทุน {formatCurrency(dryPowder)} — กด + ตั้ง "แบ่งลงกี่ครั้ง/เดือน" ก่อน ถึงจะหารให้ได้
            </Text>
          ) : (
            <>
              <View style={styles.chipRow}>
                {[1, 3, 6, 12].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.chip, m === powderMonths && styles.chipActive]}
                    onPress={() => setPowderMonths(m)}
                  >
                    <Text style={[styles.chipText, m === powderMonths && styles.chipTextActive]}>
                      {m} เดือน
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* รายการย่อยที่จดไว้ — แยกตามแหล่งเงิน/โบรก */}
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
              <View style={styles.planLine}>
                <Text style={styles.planLineLabel}>
                  เงินรอลงทุนที่จดไว้
                  {powderItemCount > 0 ? ` (รวม ${powderItemCount} รายการ)` : ''}
                </Text>
                <View style={styles.dualCurrencyValue}>
                  <Text style={styles.planLineValue}>฿{formatCurrency(dryPowder)}</Text>
                  <Text style={styles.dualCurrencySub}>≈ {formatCurrencyWithType(dryPowderUSD, 'USD')}</Text>
                </View>
              </View>
              <View style={[styles.planLine, styles.reserveTotalRow]}>
                <Text style={[styles.reserveTotalLabel, { flex: 1 }]}>
                  ลงได้ครั้งละ ({dcaRoundsCount} ครั้ง/ด. × {powderMonths} ด. = {powderTotalRounds} ครั้ง)
                </Text>
                <View style={styles.dualCurrencyValue}>
                  <Text style={styles.reserveTotalValue}>
                    {powderPerRound == null ? '—' : `฿${formatCurrency(powderPerRound)}`}
                  </Text>
                  {powderPerRoundUSD != null && (
                    <Text style={styles.dualCurrencySub}>
                      ≈ {formatCurrencyWithType(powderPerRoundUSD, 'USD')}
                    </Text>
                  )}
                </View>
              </View>
              {boughtSincePowder ? (
                <Text style={[styles.subText, { color: COLORS.warning }]}>
                  <Ionicons name="alert-circle-outline" size={13} color={COLORS.warning} />
                  {' '}ซื้อไป {boughtSincePowder.count} รายการ (~{formatCurrency(boughtSincePowder.cost)}) หลังจดยอดเมื่อ{' '}
                  {fmtDateTH(boughtSincePowder.asOf)} — กด "แก้ยอด" อัปเดตเงินรอลงทุนให้ตรงจริง
                </Text>
              ) : plan?.dryPowderAsOf ? (
                <Text style={styles.subText}>
                  จดยอดไว้เมื่อ {fmtDateTH(plan.dryPowderAsOf)} · ยังไม่มีการซื้อหลังจากนั้น
                </Text>
              ) : null}
            </>
          )}
        </View>

        {/* เลขต่อครั้งนี้เป็นตัวเดียวกับที่การ์ดรอบลงทุนใช้แปลงงบเป็น "เหลือกี่ไม้" — บอกไว้ให้รู้ว่าเกี่ยวกัน */}
        <Text style={styles.hint}>
          ยอด "ลงได้ครั้งละ" ที่กรอบ 1 เดือน คือตัวที่หน้า "รอบลงทุน" ใช้แปลงงบที่เหลือของรอบ
          ให้เป็นจำนวนไม้ที่ยังลงได้
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
            <View style={[styles.planLine, styles.reserveTotalRow]}>
              <Text style={styles.reserveTotalLabel}>ยอดรวมที่จะจด (แปลงเป็น THB)</Text>
              <Text style={styles.reserveTotalValue}>{formatCurrency(powderRowsTotal)}</Text>
            </View>
            <Text style={styles.modalHint}>
              ยอดนี้ไม่หักอัตโนมัติ — ซื้อเสร็จแล้วกลับมาแก้ยอดของรายการนั้นได้เลย
              (ล้างทั้งชื่อและยอดของแถว = ลบรายการนั้นทิ้ง)
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
  hint: {
    marginHorizontal: 16,
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    lineHeight: 17,
  },
  roundsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  roundsStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  roundsBtn: { paddingHorizontal: 10, paddingVertical: 5 },
  roundsValue: {
    minWidth: 34,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  roundsHint: {
    width: 92,
    textAlign: 'right',
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
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
  chipRow: { flexDirection: 'row', gap: 6, marginTop: 12, marginBottom: 6 },
  chip: {
    flex: 1,
    paddingVertical: 7,
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
  reserveTotalRow: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  reserveTotalLabel: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  reserveTotalValue: {
    fontSize: 15,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
  },
  subText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.accent,
    marginTop: 3,
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
