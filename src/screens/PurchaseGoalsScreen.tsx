import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  PurchaseGoal,
  DEFAULT_PURCHASE_MULTIPLIER,
  PURCHASE_MULTIPLIER_PRESETS,
} from '../types/purchaseGoal';
import { DEFAULT_CURRENCIES } from '../types/investment';
import {
  getPurchaseGoals,
  savePurchaseGoal,
  updatePurchaseGoal,
  deletePurchaseGoal,
  reorderPurchaseGoals,
  setPurchaseGoalBought,
  isPurchaseGoalTableMissing,
} from '../services/purchaseGoalStorage';
import { getCurrencies } from '../services/currencyStorage';
import { getRealizedTrades } from '../services/realizedStorage';
import { summarizeRealized } from '../utils/realizedAnalysis';
import { planPurchaseGoals, PurchaseGoalProgress } from '../utils/purchaseGoals';
import { COLORS, RADIUS, TEXT, FONTS, formatCurrency, formatCurrencyWithType, convertToTHB } from '../utils/constants';
import { ActionButton } from '../components/ActionButton';
import { notify, confirmAsk } from '../utils/dialog';
import { useResponsive } from '../utils/responsive';
import { Mascot, MascotState, MascotEmpty } from '../components/Mascot';

// ความกว้างการ์ดในคิวบนเดสก์ท็อป — หน้านี้ไม่มีเพดานความกว้างแล้ว (ดู utils/responsive.ts)
// ถ้าเรียงคอลัมน์เดียว การ์ดจะกว้างเท่าจอ แถบ progress สูง 8px จะยืดยาวจนอ่านค่าไม่ได้
// เลยใช้กริด wrap แบบเดียวกับการ์ดสรุปในหน้าพอร์ต — ลำดับคิวยังอ่านได้จากเลขบนป้ายอันดับ
const QUEUE_CARD_BASIS = 420;

// อารมณ์ของน้องหมุดบนการ์ดสรุป — สะท้อน "ตอนนี้ปลดล็อกอะไรได้บ้าง" ตัวเดียวกับที่ตัวเลขบอก
// ไม่ใช่ของประดับ: มองรูปก่อนอ่านเลขก็รู้แล้วว่ามีของให้ไปเอาหรือยัง
// ยังไม่มีของในคิว = หลับ (ไม่ใช่เศร้า — ไม่มีคิวไม่ใช่ความล้มเหลว)
const mascotFor = (pendingCount: number, unlockedCount: number, realizedTHB: number): MascotState => {
  if (pendingCount === 0) return 'sleep';
  if (unlockedCount > 0) return 'cheer';
  if (realizedTHB <= 0) return 'sad';
  return 'happy';
};

// แปลง input เป็นตัวเลข — ผู้ใช้พิมพ์ comma มาได้ ช่องว่างต้องเป็น 0 ไม่ใช่ NaN
const num = (s: string): number => {
  const n = parseFloat((s || '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const fmtDateTH = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
};

export default function PurchaseGoalsScreen() {
  const { isDesktop } = useResponsive();
  const [goals, setGoals] = useState<PurchaseGoal[]>([]);
  const [realizedProfit, setRealizedProfit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  // ของที่ซื้อแล้วยุบไว้ก่อน — ลิสต์นี้ยาวขึ้นเรื่อย ๆ และไม่ใช่ของที่ต้องดูทุกวัน
  const [showPurchased, setShowPurchased] = useState(false);

  // modal เพิ่ม/แก้ไข
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<PurchaseGoal | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [currency, setCurrency] = useState('THB');
  const [multiplierInput, setMultiplierInput] = useState(String(DEFAULT_PURCHASE_MULTIPLIER));
  const [noteInput, setNoteInput] = useState('');
  const [currencyOptions, setCurrencyOptions] = useState<string[]>(
    DEFAULT_CURRENCIES.map((c) => c.code)
  );

  const load = useCallback(async () => {
    // กำไร realized อ่านแยกจากเป้าหมาย — ยังไม่ได้รัน sql/realized_trades.sql ก็ต้องเปิดหน้านี้ได้
    // (จะเห็นกำไร 0 แล้วทุกชิ้นล็อกหมด ซึ่งตรงตามความจริงว่า "ยังไม่มีกำไรที่ขายจริง")
    try {
      const trades = await getRealizedTrades();
      setRealizedProfit(summarizeRealized(trades).totalPnlTHB);
    } catch {
      setRealizedProfit(0);
    }
    try {
      setGoals(await getPurchaseGoals());
      setTableMissing(false);
    } catch (e) {
      if (isPurchaseGoalTableMissing(e)) {
        setTableMissing(true);
        setGoals([]);
      } else {
        notify('โหลดเป้าหมายไม่สำเร็จ\n' + ((e as any)?.message || String(e)));
      }
    } finally {
      setLoading(false);
    }
    try {
      const curList = await getCurrencies();
      if (curList.length > 0) setCurrencyOptions(curList.map((c) => c.code));
    } catch {
      // ใช้ค่าเริ่มต้นต่อไป
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const plan = useMemo(() => planPurchaseGoals(goals, realizedProfit), [goals, realizedProfit]);

  // ── modal ──
  const openAdd = () => {
    setEditing(null);
    setNameInput('');
    setPriceInput('');
    setCurrency('THB');
    setMultiplierInput(String(DEFAULT_PURCHASE_MULTIPLIER));
    setNoteInput('');
    setModalVisible(true);
  };

  const openEdit = (goal: PurchaseGoal) => {
    setEditing(goal);
    setNameInput(goal.name);
    setPriceInput(String(goal.price));
    setCurrency(goal.currency);
    setMultiplierInput(String(goal.multiplier));
    setNoteInput(goal.note || '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    const name = nameInput.trim();
    if (!name) {
      notify('ใส่ชื่อรางวัลก่อน');
      return;
    }
    const price = num(priceInput);
    if (price <= 0) {
      notify('ราคาของต้องมากกว่า 0');
      return;
    }
    const multiplier = num(multiplierInput);
    if (multiplier <= 0) {
      notify('ตัวคูณต้องมากกว่า 0 — ปกติใช้ 10 เท่า');
      return;
    }

    setBusy(true);
    try {
      if (editing) {
        await updatePurchaseGoal({ ...editing, name, price, currency, multiplier, note: noteInput.trim() || undefined });
      } else {
        await savePurchaseGoal({
          id: Date.now().toString(),
          name,
          price,
          currency,
          multiplier,
          // ต่อท้ายคิว — ของใหม่ไม่ควรแซงของที่รอมาก่อน
          // ใช้ max+1 ไม่ใช่ goals.length: ลบของกลางลิสต์ไปแล้ว length จะน้อยกว่า sortOrder สูงสุด
          // ทำให้เลขชนกับของที่มีอยู่ (ยังเรียงถูกเพราะ tie-break ด้วย createdAt แต่ก็ไม่ควรปล่อยให้ชน)
          sortOrder: goals.reduce((mx, g) => Math.max(mx, g.sortOrder), -1) + 1,
          note: noteInput.trim() || undefined,
          createdAt: new Date().toISOString(),
        });
      }
      setModalVisible(false);
      await load();
    } catch (e) {
      if (isPurchaseGoalTableMissing(e)) {
        setTableMissing(true);
        notify('ยังใช้ไม่ได้ — เอาไฟล์ sql/purchase_goals.sql ไปรันที่ Supabase SQL editor ก่อน 1 ครั้ง');
      } else {
        notify('บันทึกไม่สำเร็จ\n' + ((e as any)?.message || String(e)));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (goal: PurchaseGoal) => {
    const ok = await confirmAsk('ลบเป้าหมาย', `ลบ "${goal.name}" ออกจากคิว?`, 'ลบ');
    if (!ok) return;
    setBusy(true);
    try {
      await deletePurchaseGoal(goal.id);
      setModalVisible(false);
      await load();
    } catch (e) {
      notify('ลบไม่สำเร็จ\n' + ((e as any)?.message || String(e)));
    } finally {
      setBusy(false);
    }
  };

  // เลื่อนคิวขึ้น/ลง — สลับกับเพื่อนบ้านในลิสต์ "ที่ยังไม่ซื้อ" แล้วเขียน sort_order ใหม่ทั้งคิว
  const move = async (index: number, delta: number) => {
    const order = plan.pending.map((p) => p.goal);
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    // อัปเดตจอทันทีก่อนรอ DB — ไม่งั้นกดเลื่อนแล้วรู้สึกเหมือนปุ่มไม่ทำงาน
    setGoals((prev) => {
      const byId = new Map(next.map((g, i) => [g.id, i]));
      return prev.map((g) => (byId.has(g.id) ? { ...g, sortOrder: byId.get(g.id)! } : g));
    });
    try {
      await reorderPurchaseGoals(next.map((g) => g.id));
    } catch (e) {
      notify('เลื่อนคิวไม่สำเร็จ\n' + ((e as any)?.message || String(e)));
      await load();
    }
  };

  const handleBuy = async (p: PurchaseGoalProgress) => {
    const ok = await confirmAsk(
      'ซื้อแล้ว?',
      `ยืนยันว่าซื้อ "${p.goal.name}" แล้ว\n\nโควตากำไร ${formatCurrency(p.requiredTHB)} ของชิ้นนี้จะถูกตัดออกจากกอง — ของที่รอคิวอยู่ข้างหลังจะถอยกลับไปสะสมใหม่`,
      'ซื้อแล้ว'
    );
    if (!ok) return;
    setBusy(true);
    try {
      await setPurchaseGoalBought(p.goal.id, true);
      await load();
    } catch (e) {
      notify('บันทึกไม่สำเร็จ\n' + ((e as any)?.message || String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleUnbuy = async (goal: PurchaseGoal) => {
    const ok = await confirmAsk(
      'เอากลับเข้าคิว',
      `ยกเลิกสถานะ "ซื้อแล้ว" ของ "${goal.name}"?\n\nจะกลับไปต่อท้ายคิว ไม่ไปแซงของที่รออยู่`,
      'เอากลับ'
    );
    if (!ok) return;
    setBusy(true);
    try {
      await setPurchaseGoalBought(goal.id, false);
      // sort_order เดิมของชิ้นนี้ค้างจากตอนก่อนซื้อ ถ้าไม่เขียนใหม่มันจะเด้งไปแซงคิว
      // (reorderPurchaseGoals เขียน sort_order เฉพาะของที่ยังไม่ซื้อ เลขจึงชนกันได้)
      await reorderPurchaseGoals([...plan.pending.map((p) => p.goal.id), goal.id]);
      await load();
    } catch (e) {
      notify('บันทึกไม่สำเร็จ\n' + ((e as any)?.message || String(e)));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const renderPendingCard = (p: PurchaseGoalProgress, index: number) => {
    const pct = Math.max(0, Math.min(100, p.progressRatio * 100));
    return (
      <View
        key={p.goal.id}
        style={[styles.card, p.unlocked && styles.cardUnlocked, isDesktop && styles.cardGridItem]}
      >
        <View style={styles.cardTop}>
          <View style={styles.rankBadge}>
            <Text style={styles.rankText}>{p.queueRank}</Text>
          </View>
          <View style={styles.cardTitleCol}>
            <Text style={styles.cardName} numberOfLines={1}>{p.goal.name}</Text>
            <Text style={styles.cardPrice}>
              ราคา {formatCurrencyWithType(p.goal.price, p.goal.currency)}
              {p.goal.currency !== 'THB' ? ` (${formatCurrency(p.priceTHB)})` : ''}
              {'  ·  '}ต้องกำไร {p.goal.multiplier}× = {formatCurrency(p.requiredTHB)}
            </Text>
          </View>
          {/* ปุ่มเลื่อนคิว — คิวคือหัวใจของกฎนี้ ต้องจัดลำดับได้ในที่เดียวกับที่เห็นความคืบหน้า */}
          <View style={styles.moveCol}>
            <TouchableOpacity
              style={[styles.moveBtn, index === 0 && styles.moveBtnOff]}
              disabled={index === 0}
              onPress={() => move(index, -1)}
            >
              <Ionicons name="chevron-up" size={14} color={index === 0 ? COLORS.border : COLORS.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.moveBtn, index === plan.pending.length - 1 && styles.moveBtnOff]}
              disabled={index === plan.pending.length - 1}
              onPress={() => move(index, 1)}
            >
              <Ionicons
                name="chevron-down"
                size={14}
                color={index === plan.pending.length - 1 ? COLORS.border : COLORS.primary}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${pct}%`, backgroundColor: p.unlocked ? COLORS.success : COLORS.primary },
            ]}
          />
        </View>

        <View style={styles.cardBottom}>
          <Text style={styles.progressText}>
            {p.unlocked
              ? `ปลดล็อกแล้ว — กันกำไรไว้ครบ ${formatCurrency(p.requiredTHB)}`
              : `${formatCurrency(p.allocatedTHB)} / ${formatCurrency(p.requiredTHB)}  (${pct.toFixed(0)}%) · ขาดอีก ${formatCurrency(p.remainingTHB)}`}
          </Text>
        </View>

        {!p.unlocked && (
          <Text style={styles.hint}>
            ปลดล็อกเมื่อกำไรที่ขายจริงสะสมถึง {formatCurrency(p.unlockAtTHB)}
            {p.queueRank > 1 ? ' (รวมโควตาของชิ้นที่อยู่หน้าคิว)' : ''}
          </Text>
        )}
        {p.goal.note ? <Text style={styles.note}>“{p.goal.note}”</Text> : null}

        <View style={styles.actionRow}>
          {p.unlocked && (
            <TouchableOpacity style={styles.buyBtn} onPress={() => handleBuy(p)} disabled={busy}>
              <Ionicons name="checkmark-circle-outline" size={14} color="#ffffff" />
              <Text style={styles.buyBtnText}> ซื้อแล้ว</Text>
            </TouchableOpacity>
          )}
          <ActionButton label="แก้ไข" icon="create-outline" size="sm" onPress={() => openEdit(p.goal)} />
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {tableMissing && (
        <Text style={styles.warnBox}>
          ยังใช้ไม่ได้ — เอาไฟล์ `sql/purchase_goals.sql` ไปรันที่ Supabase SQL editor ก่อน 1 ครั้ง
        </Text>
      )}

      {/* ── การ์ดสรุป: กองกำไรที่เอามาใช้ปลดล็อกได้ ── */}
      <View style={styles.summaryCard}>
        {/* น้องหมุดอยู่ขวาของยอด ไม่ใช่กลางการ์ด — ตัวเลขยังเป็นพระเอก
            minWidth: 0 ที่คอลัมน์ซ้ายจำเป็นบนเว็บ ไม่งั้นข้อความยาวดันมาสคอตหลุดขอบ (§1.4) */}
        <View style={styles.summaryTop}>
          <View style={styles.summaryTopMain}>
            <Text style={styles.summaryLabel}>กำไรที่ขายจริงสะสม</Text>
            <Text style={[styles.summaryValue, realizedProfit < 0 && { color: COLORS.error }]}>
              {formatCurrency(plan.realizedProfitTHB)}
            </Text>
            <Text style={styles.summarySub}>
              นับเฉพาะไม้ที่ปิดแล้ว — กำไรลอยตัวไม่นับ เพราะยังเอาไปซื้อของไม่ได้
            </Text>
          </View>
          <Mascot
            state={mascotFor(plan.pending.length, plan.unlockedCount, plan.realizedProfitTHB)}
            size={72}
          />
        </View>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>กันไว้ให้ของที่ซื้อแล้ว</Text>
            <Text style={styles.kpiValue}>{formatCurrency(plan.spentTHB)}</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>เหลือให้คิว</Text>
            <Text style={styles.kpiValue}>{formatCurrency(plan.availableTHB)}</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>ปลดล็อกแล้ว</Text>
            <Text style={styles.kpiValue}>
              {plan.unlockedCount}/{plan.pending.length}
            </Text>
          </View>
        </View>

        {/* โควตาที่ซื้อไปแล้วเกินกำไรที่มีจริง — เกิดตอนย้อนคืนการขาย/แก้ราคาขายทีหลัง
            ถ้าไม่บอก จะเห็นแค่ "ทุกชิ้นล็อก 0%" แล้วงงว่าทำไมกำไรมีแต่ปลดล็อกไม่ได้ */}
        {plan.spentTHB > plan.realizedProfitTHB && (
          <Text style={[styles.nextUpText, { color: COLORS.warning }]}>
            ของที่ซื้อแล้วกินโควตา {formatCurrency(plan.spentTHB)} ซึ่งเกินกำไรที่ขายจริงตอนนี้{' '}
            {formatCurrency(plan.realizedProfitTHB)} อยู่{' '}
            {formatCurrency(plan.spentTHB - plan.realizedProfitTHB)} — คิวจะยังไม่ขยับจนกำไรไล่ทัน
          </Text>
        )}

        {plan.nextUp && (
          <Text style={styles.nextUpText}>
            ชิ้นถัดไป: {plan.nextUp.goal.name} — ขาดอีก {formatCurrency(plan.nextUp.remainingTHB)}
          </Text>
        )}
        {!plan.nextUp && plan.pending.length > 0 && (
          <Text style={[styles.nextUpText, { color: COLORS.success }]}>
            ปลดล็อกครบทุกชิ้นในคิวแล้ว
          </Text>
        )}
      </View>

      <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
        <Ionicons name="add-circle-outline" size={18} color="#ffffff" />
        <Text style={styles.addBtnText}> เพิ่มรางวัล</Text>
      </TouchableOpacity>

      {/* ── คิวของที่ยังไม่ซื้อ ── */}
      <Text style={styles.sectionTitle}>คิวรางวัล</Text>
      {plan.pending.length === 0 ? (
        <MascotEmpty>
            ยังไม่มีรางวัลในคิว{'\n'}ใส่ของที่อยากได้ แล้วระบบจะบอกว่าต้องทำกำไรอีกเท่าไหร่ถึงจะปลดล็อก
        </MascotEmpty>
      ) : (
        <View style={isDesktop ? styles.cardGrid : undefined}>
          {plan.pending.map(renderPendingCard)}
        </View>
      )}

      {/* ── ของที่ซื้อแล้ว (ยุบไว้) ── */}
      {plan.purchased.length > 0 && (
        <>
          <ActionButton
            icon={showPurchased ? 'chevron-up' : 'chevron-down'}
            label={showPurchased ? 'ซ่อนของที่ซื้อแล้ว' : `ของที่ซื้อแล้ว (${plan.purchased.length})`}
            size="sm"
            onPress={() => setShowPurchased((v) => !v)}
            style={styles.toggleRow}
          />

          {showPurchased &&
            plan.purchased.map((p) => (
              <View key={p.goal.id} style={[styles.card, styles.cardBought]}>
                <View style={styles.cardTop}>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                  <View style={styles.cardTitleCol}>
                    <Text style={styles.cardName} numberOfLines={1}>{p.goal.name}</Text>
                    <Text style={styles.cardPrice}>
                      {formatCurrencyWithType(p.goal.price, p.goal.currency)}
                      {'  ·  '}ใช้โควตากำไร {formatCurrency(p.requiredTHB)}
                      {p.goal.purchasedAt ? `  ·  ${fmtDateTH(p.goal.purchasedAt)}` : ''}
                    </Text>
                  </View>
                </View>
                <View style={styles.actionRow}>
                  <ActionButton
                    label="เอากลับเข้าคิว"
                    icon="arrow-undo-outline"
                    size="sm"
                    onPress={() => handleUnbuy(p.goal)}
                  />
                  <ActionButton
                    label="แก้ไข"
                    icon="create-outline"
                    size="sm"
                    onPress={() => openEdit(p.goal)}
                  />
                </View>
              </View>
            ))}
        </>
      )}

      <Text style={styles.ruleNote}>
        กฎ: รางวัลราคา X ต้องทำกำไรที่ขายจริงให้ได้ {DEFAULT_PURCHASE_MULTIPLIER}×X ก่อนจึงปลดล็อก ·
        กำไรก้อนเดียวไม่ถูกนับซ้ำ — ชิ้นบนคิวกินโควตาก่อน ที่เหลือจึงไหลลงชิ้นถัดไป
      </Text>

      {/* ── Modal เพิ่ม/แก้ไข ── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          {/* การ์ดต้องเลื่อนเองได้ — body ของเว็บตั้ง overflow:hidden ถ้าฟอร์มสูงเกินจอ ปุ่มบันทึกจะกดไม่ได้ */}
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={styles.modalCardContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>
              {editing ? 'แก้ไขรางวัล' : 'เพิ่มรางวัล'}
            </Text>

            <Text style={styles.modalLabel}>ชื่อรางวัล</Text>
            <TextInput
              style={styles.modalInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="เช่น iPad Pro, นาฬิกา, ทริปญี่ปุ่น"
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.modalLabel}>ราคารางวัล</Text>
            <TextInput
              style={styles.modalInput}
              value={priceInput}
              onChangeText={setPriceInput}
              placeholder="0"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="numeric"
            />

            <Text style={styles.modalLabel}>สกุลเงิน</Text>
            <View style={styles.chipRow}>
              {currencyOptions.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, c === currency && styles.chipActive]}
                  onPress={() => setCurrency(c)}
                >
                  <Text style={[styles.chipText, c === currency && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>ต้องทำกำไรกี่เท่าของราคา</Text>
            <View style={styles.chipRow}>
              {PURCHASE_MULTIPLIER_PRESETS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.chip, String(m) === multiplierInput && styles.chipActive]}
                  onPress={() => setMultiplierInput(String(m))}
                >
                  <Text
                    style={[styles.chipText, String(m) === multiplierInput && styles.chipTextActive]}
                  >
                    {m}×
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.modalInput, { marginTop: 8 }]}
              value={multiplierInput}
              onChangeText={setMultiplierInput}
              placeholder={String(DEFAULT_PURCHASE_MULTIPLIER)}
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="numeric"
            />

            {/* พรีวิวเลขจริงก่อนกดบันทึก — ตัวเลข 10 เท่ามันใหญ่กว่าที่คนคาดไว้เสมอ
                ต้องโชว์ยอด THB ด้วย เพราะเกณฑ์จริงเทียบกับกำไร realized ที่เป็น THB
                (ถ้าโชว์แต่สกุลของของ เช่น "$20,000" จะเข้าใจผิดว่าเทียบกับกำไรเป็นดอลลาร์) */}
            {num(priceInput) > 0 && num(multiplierInput) > 0 && (
              <Text style={styles.preview}>
                ต้องทำกำไรที่ขายจริงให้ได้{' '}
                <Text style={styles.previewStrong}>
                  {formatCurrency(convertToTHB(num(priceInput) * num(multiplierInput), currency))}
                </Text>{' '}
                ก่อนจะซื้อชิ้นนี้ได้
                {currency !== 'THB'
                  ? ` (= ${formatCurrencyWithType(num(priceInput) * num(multiplierInput), currency)} แปลงด้วยเรตที่ตั้งไว้)`
                  : ''}
              </Text>
            )}

            <Text style={styles.modalLabel}>โน้ต (ไม่ใส่ก็ได้)</Text>
            <TextInput
              style={styles.modalInput}
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="เหตุผลที่อยากได้ / รุ่นที่จะซื้อ"
              placeholderTextColor={COLORS.textSecondary}
            />

            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSave} disabled={busy}>
              {busy ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.modalSaveBtnText}>บันทึก</Text>
              )}
            </TouchableOpacity>

            <View style={styles.modalBottomRow}>
              {editing && (
                <ActionButton
                  label="ลบเป้าหมายนี้"
                  icon="trash-outline"
                  variant="danger"
                  onPress={() => handleDelete(editing)}
                />
              )}
              <ActionButton
                label="ยกเลิก"
                variant="quiet"
                onPress={() => setModalVisible(false)}
                style={styles.modalCancelBtn}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnBox: {
    ...TEXT.caption,
    color: COLORS.warning,
    backgroundColor: `${COLORS.warning}14`,
    borderWidth: 1,
    borderColor: COLORS.warning,
    padding: 12,
    marginBottom: 12,
  },

  // ── การ์ดสรุป ──
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
  },
  // แถวบนของการ์ดสรุป: ข้อความซ้าย มาสคอตขวา
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryTopMain: { flex: 1, minWidth: 0 },
  summaryLabel: { ...TEXT.caption, color: COLORS.textSecondary },
  summaryValue: { ...TEXT.amount, color: COLORS.text, marginTop: 2 },
  summarySub: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 4 },
  kpiRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  kpiCell: { flex: 1, backgroundColor: `${COLORS.primary}0D`, paddingVertical: 10, paddingHorizontal: 8 },
  kpiLabel: { fontSize: 10, fontFamily: FONTS.regular, color: COLORS.textSecondary, marginBottom: 2 },
  kpiValue: { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.text },
  nextUpText: { ...TEXT.caption, color: COLORS.text, marginTop: 12 },

  addBtn: {
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    marginBottom: 20,
  },
  addBtnText: { color: '#ffffff', fontSize: 14, fontFamily: FONTS.semibold },

  sectionTitle: { ...TEXT.title, color: COLORS.text, marginBottom: 10 },
  empty: {
    ...TEXT.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: 24,
    lineHeight: 20,
  },

  // ── การ์ดรายชิ้น ──
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12,
  },
  cardUnlocked: { borderColor: COLORS.success },
  cardBought: { opacity: 0.75 },
  // กริด wrap สำหรับเดสก์ท็อป — flexBasis คุมว่าแถวหนึ่งวางได้กี่ใบ, flexGrow ให้กินที่ว่างจนเต็มแถว
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 },
  cardGridItem: {
    flexBasis: QUEUE_CARD_BASIS,
    flexGrow: 1,
    // ขาด minWidth:0 แล้ว flexShrink จะทำงานไม่ได้บนเว็บ (ชื่อของยาว ๆ จะดันการ์ดล้น)
    minWidth: 0,
    // margin เดิมของ card ถูกแทนด้วย gap ของกริด
    marginBottom: 0,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rankBadge: {
    width: 22,
    height: 22,
    backgroundColor: `${COLORS.primary}18`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: 11, fontFamily: FONTS.semibold, color: COLORS.primary },
  // minWidth:0 จำเป็นบนเว็บ ไม่งั้นชื่อยาวจะดันการ์ดล้นแทนที่จะถูกตัดด้วย numberOfLines
  cardTitleCol: { flex: 1, minWidth: 0 },
  cardName: { ...TEXT.subtitle, color: COLORS.text },
  cardPrice: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 2 },
  moveCol: { gap: 4 },
  moveBtn: {
    borderRadius: RADIUS.sm,
    width: 26,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  moveBtnOff: { opacity: 0.4 },

  track: { height: 8, backgroundColor: COLORS.border, marginTop: 12, overflow: 'hidden' },
  fill: { height: '100%' },
  cardBottom: { marginTop: 6 },
  progressText: { ...TEXT.caption, color: COLORS.text },
  hint: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 4 },
  note: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 6, fontStyle: 'italic' },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 },
  buyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.success,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  buyBtnText: { color: '#ffffff', fontSize: 13, fontFamily: FONTS.semibold },

  toggleRow: { alignSelf: 'flex-start', marginVertical: 8 },

  ruleNote: {
    ...TEXT.hint,
    color: COLORS.textSecondary,
    marginTop: 20,
    lineHeight: 18,
  },

  // ── modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // maxWidth กันการ์ดกางเต็มจอบนเดสก์ท็อป / maxHeight+flexGrow:0 ให้สูงตามเนื้อหาแต่ไม่เกินจอ
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '100%',
    flexGrow: 0,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
  },
  modalCardContent: { padding: 20 },
  modalTitle: { ...TEXT.title, color: COLORS.text, marginBottom: 12 },
  modalLabel: {
    ...TEXT.caption,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
    marginTop: 12,
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.text,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { ...TEXT.caption, color: COLORS.text },
  chipTextActive: { color: '#ffffff' },
  preview: {
    ...TEXT.caption,
    color: COLORS.textSecondary,
    backgroundColor: `${COLORS.accent}1A`,
    padding: 10,
    marginTop: 12,
    lineHeight: 19,
  },
  previewStrong: { fontFamily: FONTS.semibold, color: COLORS.text },
  modalSaveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 20,
  },
  modalSaveBtnText: { color: '#ffffff', fontSize: 15, fontFamily: FONTS.semibold },
  modalBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  modalCancelBtn: { marginLeft: 'auto' },
});
