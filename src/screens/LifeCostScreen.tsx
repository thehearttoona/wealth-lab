import React, { useCallback, useMemo, useState } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  LifeCost,
  LifeCostKind,
  LIFE_COST_KINDS,
  LIFE_COST_PRESETS,
  lifeCostKindLabel,
} from '../types/lifeCost';
import {
  getLifeCosts,
  saveLifeCost,
  updateLifeCost,
  deleteLifeCost,
  setLifeCostReserved,
  restartLifeCostCycle,
  isLifeCostTableMissing,
} from '../services/lifeCostStorage';
import { summarizeLifeCosts, addMonths, LifeCostStatus } from '../utils/lifeCost';
import { requiredMonthlyContribution } from '../utils/investmentGoals';
import { buildExpenseLadder, avgMonthlyBill, OutflowItem } from '../utils/expenseLadder';
import { INFLATION_RATE } from '../utils/portfolioCoverage';
import { getRecurringBills } from '../services/storage';
import { RecurringBill } from '../types';
import { getPortfolioSummary } from '../services/investmentStorage';
import { COLORS, RADIUS, TEXT, FONTS, formatCurrency, toChristianYear } from '../utils/constants';
import { ActionButton } from '../components/ActionButton';
import { Mascot, MascotEmpty, MascotState } from '../components/Mascot';
import { MenuRow, MenuCard } from '../components/MenuRow';
import { loadLifeLedger } from '../services/ledgerProfit';
import { LifeLedger } from '../utils/lifeLedger';
import { notify, confirmAsk } from '../utils/dialog';
import { useResponsive } from '../utils/responsive';

const CARD_BASIS = 420;

// ── "ให้พอร์ตจ่ายค่าเสื่อมแทน" ──
// ผลตอบแทนที่ใช้คิดเป็น "ข้อสมมติ" ไม่ใช่คำสัญญา จึงให้เลือกเองและพิมพ์กำกับบนจอเสมอ
const RETURN_STEPS = [5, 7, 10];
const HORIZON_STEPS = [5, 10, 15, 20];

const fmtDateTH = (iso: string): string =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

const num = (s: string): number => {
  const n = parseFloat((s || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

/** ไอคอนประจำหมวด — ไล่สายตาหาของที่ต้องการก่อนอ่านชื่อ */
const kindIcon = (k: LifeCostKind): any =>
  LIFE_COST_KINDS.find((x) => x.value === k)?.icon ?? 'ellipsis-horizontal-outline';

/**
 * อารมณ์ของน้องหมุด = สถานะเงินกันของทั้งชุด ไม่ใช่ของประดับ
 * เลยกำหนดแล้ว = ตื่นตัว · ตามหลัง = เศร้า · ทันหมด = ดีใจ · ยังไม่มีรายการ = หลับ
 */
const moodFor = (count: number, overdue: number, gap: number): MascotState => {
  if (count === 0) return 'sleep';
  if (overdue > 0) return 'alert';
  if (gap > 0) return 'sad';
  return 'cheer';
};

/**
 * หน้า "ค่าเสื่อมของชีวิต" — ของที่จะต้องจ่ายอีกแน่ ๆ แค่ยังไม่ถึงวัน
 *
 * ตัวเลขเดียวที่หน้านี้มีไว้ตอบคือ "ต้องกันเดือนละเท่าไหร่" (ดู utils/lifeCost.ts)
 * ⚠️ ยอดนี้ **ไม่ถูกนับเป็นรายจ่ายของเดือน** และ **ไม่เข้าไปในความมั่งคั่ง** โดยตั้งใจ
 * เหตุผลอยู่ในหัวไฟล์ utils/lifeCost.ts — ห้ามเอาไปบวกที่ไหนโดยไม่อ่านก่อน
 */
export default function LifeCostScreen() {
  const navigation = useNavigation<any>();
  const { isDesktop } = useResponsive();
  const [items, setItems] = useState<LifeCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);

  // ── ฟอร์มเพิ่ม/แก้ไข ──
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<LifeCost | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [kindInput, setKindInput] = useState<LifeCostKind>('equipment');
  const [costInput, setCostInput] = useState('');
  const [salvageInput, setSalvageInput] = useState('');
  const [cycleInput, setCycleInput] = useState('12');
  const [startInput, setStartInput] = useState('');
  const [noteInput, setNoteInput] = useState('');

  // ── กล่องจดยอดที่เก็บไว้ ──
  const [reserveTarget, setReserveTarget] = useState<LifeCost | null>(null);
  const [reserveInput, setReserveInput] = useState('');

  // ── เป้าลงทุนต่อเดือน: ข้อสมมติเก็บในหน้า ไม่บันทึกลง DB (เป็นการลองเล่นตัวเลข ไม่ใช่แผนผูกมัด) ──
  const [ratePercent, setRatePercent] = useState(7);
  const [years, setYears] = useState(10);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [bills, setBills] = useState<RecurringBill[]>([]);
  // บัญชีให้พอร์ตจ่ายชีวิต — หน้านี้แค่โชว์ยอดค้างเป็นทางเข้า ไม่คิดซ้ำ (คิดที่ utils/lifeLedger)
  const [lifeLedger, setLifeLedger] = useState<LifeLedger | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const todayDate = useMemo(() => new Date(`${today}T00:00:00`), [today]);

  const loadData = useCallback(async () => {
    try {
      setItems(await getLifeCosts());
      setTableMissing(false);
    } catch (e) {
      if (isLifeCostTableMissing(e)) setTableMissing(true);
      setItems([]);
    }
    // มูลค่าพอร์ตล้มแยกจากรายการค่าเสื่อม — ไม่มีก็แค่การ์ด "ให้พอร์ตจ่ายแทน" คิดจาก 0
    try {
      setPortfolioValue((await getPortfolioSummary()).totalValue);
    } catch {
      setPortfolioValue(0);
    }
    // บิลประจำเป็นของที่ต้องจ่ายทุกเดือนเหมือนกัน จึงอยู่บันไดเดียวกับค่าเสื่อม
    try {
      setBills(await getRecurringBills());
    } catch {
      setBills([]);
    }
    // ยังไม่ได้รัน sql/life_ledger.sql = ได้บัญชีเปล่า แถวยังโชว์ได้เป็นทางเข้าไปเริ่ม
    setLifeLedger(await loadLifeLedger());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const summary = useMemo(() => summarizeLifeCosts(items, todayDate), [items, todayDate]);
  const mood = moodFor(summary.count, summary.overdueCount, summary.gap);

  // ── บันได "ให้พอร์ตจ่ายชีวิตแทน" ──
  // ค่าเสื่อม + บิลประจำ = ของที่ต้องจ่ายทุกเดือนเหมือนกัน อยู่บันไดเดียวกัน
  // เรียงจากทุนน้อยไปมาก เพื่อให้ปลดอันแรกได้เร็วที่สุด แล้วเงินที่ว่างมาเร่งขั้นถัดไป
  const outflows: OutflowItem[] = useMemo(() => {
    const fromCosts: OutflowItem[] = summary.rows.map((r) => ({
      id: r.item.id,
      name: r.item.name,
      monthlyTHB: r.perMonth,
      kind: 'life_cost' as const,
    }));
    const fromBills: OutflowItem[] = bills
      .map((b) => ({
        id: b.id,
        name: b.name,
        // ใช้ยอดที่กรอกจริงเฉลี่ย ไม่ใช่ช่อง amount ที่เป็นแค่ค่าอ้างอิง (ดู utils/expenseLadder)
        monthlyTHB: avgMonthlyBill(b.monthlyAmounts),
        kind: 'bill' as const,
      }))
      .filter((b) => b.monthlyTHB > 0);
    return [...fromCosts, ...fromBills];
  }, [summary.rows, bills]);

  const ladder = useMemo(
    () => buildExpenseLadder(outflows, portfolioValue, ratePercent, INFLATION_RATE),
    [outflows, portfolioValue, ratePercent]
  );
  // ลงเพิ่มเดือนละเท่าไหร่ถึงจะปลดครบทุกขั้นในกี่ปีที่เลือก
  // (requiredMonthlyContribution มีอยู่แล้วใน utils/investmentGoals — เดิมไม่มีใครเรียก)
  const monthlyNeeded =
    ladder.totalCapitalTHB > 0
      ? requiredMonthlyContribution(portfolioValue, ladder.totalCapitalTHB, ratePercent, years)
      : null;

  // ── เพิ่ม / แก้ไข ──
  const openAdd = () => {
    setEditing(null);
    setNameInput('');
    setKindInput('equipment');
    setCostInput('');
    setSalvageInput('');
    setCycleInput('12');
    setStartInput(today);
    setNoteInput('');
    setModalVisible(true);
  };

  const openEdit = (item: LifeCost) => {
    setEditing(item);
    setNameInput(item.name);
    setKindInput(item.kind);
    setCostInput(String(item.cost));
    setSalvageInput(item.salvage ? String(item.salvage) : '');
    setCycleInput(String(item.cycleMonths));
    setStartInput(toChristianYear(item.startedAt).slice(0, 10));
    setNoteInput(item.note ?? '');
    setModalVisible(true);
  };

  const applyPreset = (p: (typeof LIFE_COST_PRESETS)[number]) => {
    setNameInput(p.name);
    setKindInput(p.kind);
    setCostInput(String(p.cost));
    setCycleInput(String(p.cycleMonths));
    setSalvageInput(p.salvage ? String(p.salvage) : '');
  };

  const handleSave = async () => {
    const name = nameInput.trim();
    if (!name) return notify('ใส่ชื่อรายการก่อน');
    const cost = num(costInput);
    if (cost <= 0) return notify('ยอดที่ต้องจ่ายต้องมากกว่า 0');
    const cycleMonths = Math.round(num(cycleInput));
    if (cycleMonths < 1) return notify('รอบต้องอย่างน้อย 1 เดือน');
    const salvage = num(salvageInput);
    if (salvage >= cost) return notify('ยอดขายต่อต้องน้อยกว่ายอดที่ต้องจ่าย');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startInput.trim())) {
      return notify('วันที่เริ่มรอบต้องเป็นรูปแบบ ปี-เดือน-วัน เช่น 2026-08-20');
    }

    const next: LifeCost = {
      id: editing?.id ?? Date.now().toString(),
      name,
      kind: kindInput,
      cost,
      salvage: salvage > 0 ? salvage : undefined,
      cycleMonths,
      startedAt: startInput.trim(),
      reserved: editing?.reserved,
      note: noteInput.trim() || undefined,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    };
    try {
      if (editing) await updateLifeCost(next);
      else await saveLifeCost(next);
      setModalVisible(false);
      loadData();
    } catch (e) {
      notify(
        isLifeCostTableMissing(e)
          ? 'ยังใช้ไม่ได้ — เอา sql/life_costs.sql ไปรันที่ Supabase ก่อน 1 ครั้ง'
          : 'บันทึกไม่สำเร็จ'
      );
    }
  };

  const handleDelete = async (item: LifeCost) => {
    const ok = await confirmAsk('ลบรายการ', `ลบ "${item.name}" ออกจากค่าเสื่อม?`, 'ลบ');
    if (!ok) return;
    try {
      await deleteLifeCost(item.id);
      setModalVisible(false);
      loadData();
    } catch {
      notify('ลบไม่สำเร็จ');
    }
  };

  // ── จดยอดที่เก็บไว้ ──
  const openReserve = (item: LifeCost) => {
    setReserveTarget(item);
    setReserveInput(item.reserved ? String(item.reserved) : '');
  };

  const handleSaveReserve = async () => {
    if (!reserveTarget) return;
    const v = Math.max(0, num(reserveInput));
    try {
      await setLifeCostReserved(reserveTarget.id, v);
      setReserveTarget(null);
      loadData();
    } catch {
      notify('บันทึกยอดไม่สำเร็จ');
    }
  };

  // ── เริ่มรอบใหม่ ──
  const handleRestart = async (row: LifeCostStatus) => {
    const ok = await confirmAsk(
      'เริ่มรอบใหม่',
      `จ่าย/ทำ "${row.item.name}" ไปแล้ววันนี้ใช่ไหม\n\n` +
        // วันครบรอบใหม่นับจาก "วันนี้" ไม่ใช่ row.dueAt ซึ่งเป็นวันครบของรอบที่เพิ่งจบ
        `รอบใหม่จะครบอีกที ${fmtDateTH(addMonths(today, row.item.cycleMonths))}\n` +
        `และยอดที่เก็บไว้ ฿${formatCurrency(row.reserved)} จะถูกล้างเป็น 0 ` +
        `เพราะถือว่าใช้ไปกับรอบที่เพิ่งจบแล้ว`,
      'เริ่มรอบใหม่'
    );
    if (!ok) return;
    try {
      await restartLifeCostCycle(row.item, today);
      loadData();
    } catch {
      notify('เริ่มรอบใหม่ไม่สำเร็จ');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const renderRow = (row: LifeCostStatus) => {
    const { item } = row;
    return (
      <View key={item.id} style={[styles.card, isDesktop && styles.cardGridItem]}>
        <View style={styles.cardTop}>
          <View style={[styles.iconWrap, { backgroundColor: `${COLORS.primary}14` }]}>
            <Ionicons name={kindIcon(item.kind)} size={18} color={COLORS.primary} />
          </View>
          <View style={styles.cardMain}>
            <Text style={styles.cardName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.cardSub}>
              {lifeCostKindLabel(item.kind)} · ฿{formatCurrency(item.cost)} ทุก {item.cycleMonths}{' '}
              เดือน
              {item.salvage ? ` · ขายต่อได้ ฿${formatCurrency(item.salvage)}` : ''}
            </Text>
          </View>
          <View style={styles.perMonthBox}>
            <Text style={styles.perMonthValue}>฿{formatCurrency(row.perMonth)}</Text>
            <Text style={styles.perMonthUnit}>ต่อเดือน</Text>
          </View>
        </View>

        {/* ครบกำหนดเมื่อไหร่ — เลยกำหนดต้องเด่นกว่าทุกอย่างในการ์ด */}
        <Text
          style={[
            styles.dueLine,
            row.overdue ? { color: COLORS.error } : row.dueSoon ? { color: COLORS.warning } : null,
          ]}
        >
          {row.overdue
            ? `เลยกำหนดมาแล้ว ${Math.abs(row.daysLeft)} วัน (ครบเมื่อ ${fmtDateTH(row.dueAt)})`
            : `ครบกำหนด ${fmtDateTH(row.dueAt)} · อีก ${row.monthsLeft} เดือน`}
        </Text>

        {/* เก็บได้เท่าไหร่แล้ว เทียบกับที่ควรเก็บได้ ณ วันนี้ */}
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${Math.min(100, row.fundedPercent)}%` },
              row.gap > 0 ? { backgroundColor: COLORS.warning } : null,
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          เก็บไว้ ฿{formatCurrency(row.reserved)} / ยอดเต็ม ฿{formatCurrency(row.target)}
          {row.gap > 0
            ? ` · ตามหลังอยู่ ฿${formatCurrency(row.gap)}`
            : row.reserved > 0
              ? ' · ทันจังหวะแล้ว'
              : ''}
        </Text>

        {item.note ? <Text style={styles.note}>“{item.note}”</Text> : null}

        <View style={styles.cardActions}>
          <ActionButton label="จดยอดที่เก็บได้" icon="cash-outline" size="sm" onPress={() => openReserve(item)} />
          <ActionButton
            label="จ่าย/ทำแล้ว"
            icon="refresh-outline"
            size="sm"
            variant="primary"
            onPress={() => handleRestart(row)}
          />
          <ActionButton label="แก้ไข" icon="create-outline" size="sm" onPress={() => openEdit(item)} />
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {tableMissing && (
          <Text style={styles.warnBox}>
            ยังใช้ไม่ได้ — เอาไฟล์ `sql/life_costs.sql` ไปรันที่ Supabase SQL editor ก่อน 1 ครั้ง
          </Text>
        )}

        {/* ── การ์ดสรุป: เลขเดียวที่หน้านี้มีไว้ตอบ ── */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryMain}>
              <Text style={styles.summaryLabel}>ต้องกันเดือนละ</Text>
              <Text style={styles.summaryValue}>฿{formatCurrency(summary.perMonth)}</Text>
              <Text style={styles.summarySub}>
                ≈ ฿{formatCurrency(summary.perDay)}/วัน · ปีละ ฿{formatCurrency(summary.perYear)}
                {summary.count > 0 ? ` · จาก ${summary.count} รายการ` : ''}
              </Text>
            </View>
            <Mascot state={mood} size={78} />
          </View>

          {summary.count > 0 && (
            <View style={styles.kpiRow}>
              <View style={styles.kpiCell}>
                <Text style={styles.kpiLabel}>เก็บไว้แล้ว</Text>
                <Text style={styles.kpiValue}>฿{formatCurrency(summary.reserved)}</Text>
              </View>
              <View style={styles.kpiCell}>
                <Text style={styles.kpiLabel}>ตามหลังอยู่</Text>
                <Text style={[styles.kpiValue, summary.gap > 0 && { color: COLORS.warning }]}>
                  ฿{formatCurrency(summary.gap)}
                </Text>
              </View>
              <View style={styles.kpiCell}>
                <Text style={styles.kpiLabel}>ใกล้ครบรอบ</Text>
                <Text style={[styles.kpiValue, summary.overdueCount > 0 && { color: COLORS.error }]}>
                  {summary.overdueCount > 0
                    ? `เลย ${summary.overdueCount}`
                    : `${summary.dueSoonCount} รายการ`}
                </Text>
              </View>
            </View>
          )}

          {summary.nextUp && (
            <Text style={styles.nextUpText}>
              ตัวถัดไป: {summary.nextUp.item.name} — {fmtDateTH(summary.nextUp.dueAt)} ต้องมี ฿
              {formatCurrency(summary.nextUp.target)}
            </Text>
          )}
        </View>

        {/* ── ทางเข้าบัญชีให้พอร์ตจ่ายชีวิต ──
            อยู่เหนือการ์ดบันไดเพราะเป็นคำถามที่ใกล้กว่า: บันไดตอบ "ต้องมีทุนเท่าไหร่ถึงปลดถาวร"
            (หลักแสน–หลักล้าน) บัญชีตอบ "เดือนที่ผ่านมาพอร์ตจ่ายทันหรือยัง" ซึ่งขยับได้ทุกรอบที่ปิด */}
        {lifeLedger && (
          <MenuCard style={isDesktop && styles.menuCardDesktop}>
            <MenuRow
              icon="wallet-outline"
              title="บัญชีให้พอร์ตจ่ายชีวิต"
              tone={
                lifeLedger.monthCount === 0
                  ? COLORS.primary
                  : lifeLedger.owedTHB > 0
                    ? COLORS.warning
                    : COLORS.success
              }
              value={
                lifeLedger.monthCount === 0
                  ? 'ยังไม่เริ่ม'
                  : `฿${formatCurrency(
                      lifeLedger.owedTHB > 0 ? lifeLedger.owedTHB : lifeLedger.surplusTHB
                    )}`
              }
              valueSub={
                lifeLedger.monthCount === 0
                  ? undefined
                  : lifeLedger.owedTHB > 0
                    ? 'ค้างอยู่'
                    : 'กำไรจริง'
              }
              valueNegative={lifeLedger.monthCount > 0 && lifeLedger.owedTHB > 0}
              sub={
                lifeLedger.monthCount === 0
                  ? 'จดยอดรายเดือน แล้วให้กำไรที่ขายได้จริงไปจ่ายให้ทีละเดือน'
                  : `จ่ายครบแล้ว ${lifeLedger.monthsCovered} เดือน จาก ${lifeLedger.monthCount} เดือนที่จด`
              }
              onPress={() => navigation.navigate('LifeLedger')}
              first
            />
          </MenuCard>
        )}

        {/* ── บันได "ให้พอร์ตจ่ายชีวิตแทน" — ปลดค่าใช้จ่ายถาวรด้วยขนาดทุน ──
            การ์ดนี้เป็นเป้า **ลงเงิน** และยังต้องเป็นแบบนั้น: มันตอบว่า "ต้องมีทุนเท่าไหร่
            ถึงไม่ต้องควักเงินเดือนอีกเลย" ซึ่งเป็นเรื่องของขนาดพอร์ต ไม่ใช่ผลงานรายเดือน
            ⚠️ ที่ยังห้ามอยู่คือ **โควตากำไรรายเดือน** (ต้องทำให้ได้ ฿X ทุกเดือน) เพราะมันมีเส้นตาย
            แล้วจะสั่งให้ขายวันที่ 30 ให้ครบเป้า — ส่วน "บัญชีให้พอร์ตจ่ายชีวิต" ข้างบนไม่ใช่โควตา
            มันเป็นบัญชีเดินสะพัดที่ยอดค้างไม่มีวันครบกำหนด (ดู utils/lifeLedger.ts) */}
        {ladder.rungs.length > 0 && (
          <View style={styles.investCard}>
            <Text style={styles.investTitle}>
              <Ionicons name="trending-up-outline" size={16} color={COLORS.primary} />{' '}
              ให้พอร์ตจ่ายชีวิตแทน
            </Text>
            <Text style={styles.investLead}>
              ต้องจ่ายเองเดือนละ ฿{formatCurrency(ladder.totalMonthlyTHB)} — ปลดทีละอย่าง
              เงินที่เคยจ่ายอันนั้นจะว่างมาลงทุนต่อ ทำให้อันถัดไปมาเร็วขึ้นเรื่อย ๆ
            </Text>

            {ladder.rungs.map((r) => (
              <View key={`${r.kind}:${r.id}`} style={styles.rungRow}>
                <Ionicons
                  name={r.cleared ? 'checkmark-circle' : 'ellipse-outline'}
                  size={15}
                  color={r.cleared ? COLORS.success : COLORS.textSecondary}
                />
                <Text style={styles.rungName} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={styles.rungMonthly}>฿{formatCurrency(r.monthlyTHB)}/ด</Text>
                <Text style={[styles.rungState, r.cleared && styles.rungStateDone]}>
                  {r.cleared ? 'ปลดแล้ว' : `${r.percent.toFixed(0)}%`}
                </Text>
              </View>
            ))}

            {ladder.current && (
              <Text style={styles.rungNext}>
                ขั้นถัดไป: {ladder.current.name} — ต้องมีพอร์ตรวม ฿
                {formatCurrency(ladder.current.cumulativeTHB)} (ตอนนี้ ฿
                {formatCurrency(portfolioValue)}) · ปลดแล้วได้เงินคืนเดือนละ ฿
                {formatCurrency(ladder.current.monthlyTHB)}
              </Text>
            )}
            {ladder.freedMonthlyTHB > 0 && (
              <Text style={styles.rungFreed}>
                ปลดไปแล้ว {ladder.clearedCount} อย่าง — ได้เงินคืนเดือนละ ฿
                {formatCurrency(ladder.freedMonthlyTHB)} เอาไปลงทุนต่อได้
              </Text>
            )}

            <View style={styles.investRow}>
              <Text style={styles.investLabel}>ปลดครบต้องมีพอร์ต</Text>
              <Text style={styles.investValue}>฿{formatCurrency(ladder.totalCapitalTHB)}</Text>
            </View>

            <Text style={styles.investChipLabel}>สมมติผลตอบแทนต่อปี</Text>
            <View style={styles.chipWrap}>
              {RETURN_STEPS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.chip, ratePercent === r && styles.chipOn]}
                  onPress={() => setRatePercent(r)}
                >
                  <Text style={[styles.chipText, ratePercent === r && styles.chipTextOn]}>{r}%</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.investChipLabel}>อยากปลดครบภายในกี่ปี</Text>
            <View style={styles.chipWrap}>
              {HORIZON_STEPS.map((y) => (
                <TouchableOpacity
                  key={y}
                  style={[styles.chip, years === y && styles.chipOn]}
                  onPress={() => setYears(y)}
                >
                  <Text style={[styles.chipText, years === y && styles.chipTextOn]}>{y} ปี</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.investResult}>
              <Text style={styles.investResultLabel}>ลงทุนเพิ่มเดือนละ</Text>
              <Text style={styles.investResultValue}>
                {monthlyNeeded == null
                  ? '—'
                  : monthlyNeeded <= 0
                    ? 'ไม่ต้องเติมแล้ว'
                    : `฿${formatCurrency(monthlyNeeded)}`}
              </Text>
            </View>
            <Text style={styles.investNote}>
              ทุนที่ต้องมีคิดจากผลตอบแทนหลังหักเงินเฟ้อ {ladder.realReturnPercent.toFixed(1)}%
              ({ratePercent}% − เงินเฟ้อ {INFLATION_RATE}%) เพราะค่าใช้จ่ายโตตามเงินเฟ้อไปด้วย
              {'\n'}ผลตอบแทนเป็นข้อสมมติที่คุณเลือกเอง ไม่ใช่สิ่งที่รับประกันได้ ·
              เลขนี้เป็นเป้า "ลงเงินเพิ่ม" คือปลดค่าใช้จ่ายถาวรด้วยขนาดทุน ส่วนการดูว่าเดือนที่ผ่านมา
              กำไรจ่ายค่าชีวิตทันหรือยัง อยู่ที่ "บัญชีให้พอร์ตจ่ายชีวิต" ข้างบน
            </Text>
          </View>
        )}

        {ladder.reason && (
          <Text style={styles.warnBox}>{ladder.reason}</Text>
        )}

        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add-circle-outline" size={18} color="#ffffff" />
          <Text style={styles.addBtnText}> เพิ่มรายการ</Text>
        </TouchableOpacity>

        {summary.rows.length === 0 ? (
          <MascotEmpty>
            ยังไม่มีรายการค่าเสื่อม{'\n'}
            ใส่ของที่รู้อยู่แล้วว่าจะต้องจ่ายอีก เช่น โน้ตบุ๊ก ตรวจสุขภาพประจำปี ประกันรถ
            แล้วระบบจะบอกว่าต้องกันเดือนละเท่าไหร่
          </MascotEmpty>
        ) : (
          <View style={isDesktop ? styles.cardGrid : undefined}>
            {summary.rows.map(renderRow)}
          </View>
        )}

        <Text style={styles.ruleNote}>
          ยอด "ต้องกันเดือนละ" ไม่ถูกนับเป็นรายจ่ายของเดือนในหน้าหลัก และไม่เข้าไปในความมั่งคั่ง —
          มันคือเงินที่ควรกันไว้ ไม่ใช่เงินที่จ่ายไปแล้ว
          {'\n'}ตอนซื้อ/จ่ายจริงค่อยบันทึกเป็นรายจ่ายตามปกติ แล้วกด "จ่าย/ทำแล้ว" ที่การ์ดเพื่อเริ่มรอบใหม่
        </Text>
      </ScrollView>

      {/* ── Modal เพิ่ม/แก้ไข ── */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={styles.modalCardContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>{editing ? 'แก้ไขรายการ' : 'เพิ่มรายการ'}</Text>

            {!editing && (
              <>
                <Text style={styles.modalLabel}>เลือกจากที่คนส่วนใหญ่มี (ปรับตัวเลขได้)</Text>
                <View style={styles.presetWrap}>
                  {LIFE_COST_PRESETS.map((p) => (
                    <TouchableOpacity key={p.name} style={styles.chip} onPress={() => applyPreset(p)}>
                      <Text style={styles.chipText}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.modalLabel}>ชื่อรายการ</Text>
            <TextInput
              style={styles.modalInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="เช่น โน้ตบุ๊ก, ตรวจสุขภาพประจำปี"
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.modalLabel}>หมวด</Text>
            <View style={styles.presetWrap}>
              {LIFE_COST_KINDS.map((k) => (
                <TouchableOpacity
                  key={k.value}
                  style={[styles.chip, kindInput === k.value && styles.chipOn]}
                  onPress={() => setKindInput(k.value)}
                >
                  <Text style={[styles.chipText, kindInput === k.value && styles.chipTextOn]}>
                    {k.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>ยอดที่ต้องจ่ายเมื่อถึงรอบ (บาท)</Text>
            <TextInput
              style={styles.modalInput}
              value={costInput}
              onChangeText={setCostInput}
              keyboardType="numeric"
              placeholder="45000"
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.modalLabel}>ขายต่อได้เท่าไหร่ (ไม่มีก็เว้นว่าง)</Text>
            <TextInput
              style={styles.modalInput}
              value={salvageInput}
              onChangeText={setSalvageInput}
              keyboardType="numeric"
              placeholder="8000"
              placeholderTextColor={COLORS.textSecondary}
            />
            <Text style={styles.modalHint}>
              หักออกก่อนเฉลี่ย เพราะเงินก้อนนี้ได้คืนตอนขายของเก่า ไม่ต้องเก็บใหม่
            </Text>

            <Text style={styles.modalLabel}>รอบละกี่เดือน</Text>
            <TextInput
              style={styles.modalInput}
              value={cycleInput}
              onChangeText={setCycleInput}
              keyboardType="numeric"
              placeholder="48"
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.modalLabel}>เริ่มรอบนี้เมื่อไหร่ (ปี-เดือน-วัน)</Text>
            <TextInput
              style={styles.modalInput}
              value={startInput}
              onChangeText={setStartInput}
              placeholder="2026-08-20"
              placeholderTextColor={COLORS.textSecondary}
            />
            <Text style={styles.modalHint}>วันที่ซื้อของชิ้นนี้ หรือวันที่ทำครั้งล่าสุด</Text>

            <Text style={styles.modalLabel}>โน้ต (ไม่ใส่ก็ได้)</Text>
            <TextInput
              style={styles.modalInput}
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="เช่น รุ่นที่อยากได้ / โรงพยาบาลที่ไปประจำ"
              placeholderTextColor={COLORS.textSecondary}
            />

            {/* ตัวอย่างเลขก่อนกดบันทึก — เห็นผลทันทีว่าที่กรอกไปแปลว่าเดือนละเท่าไหร่ */}
            {num(costInput) > 0 && Math.round(num(cycleInput)) >= 1 && (
              <Text style={styles.previewBox}>
                ต้องกันเดือนละ ฿
                {formatCurrency(
                  Math.max(0, num(costInput) - num(salvageInput)) / Math.round(num(cycleInput))
                )}{' '}
                (≈ ฿
                {formatCurrency(
                  Math.max(0, num(costInput) - num(salvageInput)) /
                    Math.round(num(cycleInput)) /
                    30.44
                )}
                /วัน)
              </Text>
            )}

            <View style={styles.modalActions}>
              {editing && (
                <ActionButton label="ลบ" icon="trash-outline" variant="danger" onPress={() => handleDelete(editing)} />
              )}
              <View style={styles.modalActionsRight}>
                <ActionButton label="ยกเลิก" variant="quiet" onPress={() => setModalVisible(false)} />
                <ActionButton label="บันทึก" variant="primary" onPress={handleSave} />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Modal จดยอดที่เก็บไว้ ── */}
      <Modal
        visible={reserveTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReserveTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={styles.modalCardContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>จดยอดที่เก็บได้</Text>
            <Text style={styles.modalHint}>
              {reserveTarget?.name} — ใส่ยอดที่กันไว้แล้วจริง ๆ ตอนนี้
              {'\n'}ระบบไม่หักเงินให้เอง เพราะไม่รู้ว่าเงินอยู่บัญชีไหน คุณเป็นเจ้าของตัวเลขนี้
            </Text>
            <TextInput
              style={styles.modalInput}
              value={reserveInput}
              onChangeText={setReserveInput}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={COLORS.textSecondary}
            />
            <View style={styles.modalActions}>
              <View style={styles.modalActionsRight}>
                <ActionButton label="ยกเลิก" variant="quiet" onPress={() => setReserveTarget(null)} />
                <ActionButton label="บันทึก" variant="primary" onPress={handleSaveReserve} />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  menuCardDesktop: { borderRadius: RADIUS.lg },
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },

  warnBox: {
    ...TEXT.caption,
    color: COLORS.warning,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: RADIUS.md,
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
  // minWidth: 0 ที่คอลัมน์ซ้ายจำเป็นบนเว็บ ไม่งั้นข้อความยาวดันมาสคอตหลุดขอบ
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryMain: { flex: 1, minWidth: 0 },
  summaryLabel: { ...TEXT.caption, color: COLORS.textSecondary },
  summaryValue: { ...TEXT.amount, color: COLORS.text, marginTop: 2 },
  summarySub: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 4 },
  kpiRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  kpiCell: { flex: 1, backgroundColor: `${COLORS.primary}0D`, paddingVertical: 10, paddingHorizontal: 8 },
  kpiLabel: { fontSize: 10, fontFamily: FONTS.regular, color: COLORS.textSecondary, marginBottom: 2 },
  kpiValue: { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.text },
  nextUpText: { ...TEXT.caption, color: COLORS.text, marginTop: 12 },

  // ── การ์ดเป้าลงทุน ──
  investCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
    gap: 6,
  },
  investTitle: { ...TEXT.title, color: COLORS.text },
  investLead: { ...TEXT.hint, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 4 },
  investRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  investLabel: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.textSecondary },
  investValue: { fontSize: 18, fontFamily: FONTS.semibold, color: COLORS.primary },
  investSub: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.text },
  investChipLabel: { fontSize: 11, fontFamily: FONTS.regular, color: COLORS.textSecondary, marginTop: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  investResult: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  // ── แถวบันได: ไอคอน | ชื่อ | ยอดต่อเดือน | สถานะ ──
  rungRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  rungName: { flex: 1, minWidth: 0, fontSize: 12.5, fontFamily: FONTS.regular, color: COLORS.text },
  rungMonthly: { fontSize: 11.5, fontFamily: FONTS.medium, color: COLORS.textSecondary },
  rungState: { width: 62, textAlign: 'right', fontSize: 11, fontFamily: FONTS.regular, color: COLORS.textSecondary },
  rungStateDone: { color: COLORS.success, fontFamily: FONTS.semibold },
  rungNext: { fontSize: 11, fontFamily: FONTS.light, color: COLORS.text, lineHeight: 17, marginTop: 6 },
  rungFreed: { fontSize: 11, fontFamily: FONTS.light, color: COLORS.success, lineHeight: 17 },
  investResultLabel: { fontSize: 13, fontFamily: FONTS.semibold, color: COLORS.text },
  investResultValue: { fontSize: 22, fontFamily: FONTS.semibold, color: COLORS.success },
  investNote: { fontSize: 10.5, fontFamily: FONTS.light, color: COLORS.textSecondary, lineHeight: 16 },

  addBtn: {
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    marginBottom: 16,
  },
  addBtnText: { color: '#ffffff', fontSize: 14, fontFamily: FONTS.semibold },

  // ── การ์ดรายชิ้น ──
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  cardGridItem: { flexBasis: CARD_BASIS, flexGrow: 1, minWidth: 0, marginBottom: 0 },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: 12,
    gap: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMain: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.text },
  cardSub: { fontSize: 11, fontFamily: FONTS.light, color: COLORS.textSecondary, marginTop: 2 },
  perMonthBox: { alignItems: 'flex-end' },
  perMonthValue: { fontSize: 16, fontFamily: FONTS.semibold, color: COLORS.primary },
  perMonthUnit: { fontSize: 10, fontFamily: FONTS.light, color: COLORS.textSecondary },

  dueLine: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.textSecondary },
  track: { height: 8, borderRadius: RADIUS.pill, backgroundColor: COLORS.divider, overflow: 'hidden' },
  fill: { height: 8, borderRadius: RADIUS.pill, backgroundColor: COLORS.success },
  progressText: { fontSize: 11, fontFamily: FONTS.light, color: COLORS.textSecondary },
  note: { fontSize: 11, fontFamily: FONTS.light, color: COLORS.textSecondary, fontStyle: 'italic' },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },

  ruleNote: {
    fontSize: 11,
    fontFamily: FONTS.light,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: 16,
  },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // การ์ดต้องเลื่อนเองได้ — body ของเว็บตั้ง overflow:hidden ถ้าฟอร์มสูงเกินจอ ปุ่มบันทึกจะกดไม่ได้
  modalCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '100%',
    flexGrow: 0,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
  },
  modalCardContent: { padding: 20 },
  modalTitle: { ...TEXT.title, color: COLORS.text, marginBottom: 12 },
  modalLabel: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.text, marginTop: 12, marginBottom: 6 },
  modalHint: { fontSize: 11, fontFamily: FONTS.light, color: COLORS.textSecondary, lineHeight: 17, marginTop: 4 },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.text,
    minWidth: 0,
  },
  presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.text },
  chipTextOn: { color: '#ffffff' },
  previewBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: RADIUS.md,
    backgroundColor: `${COLORS.primary}0D`,
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.primary,
  },
  modalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, gap: 8 },
  modalActionsRight: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
});
