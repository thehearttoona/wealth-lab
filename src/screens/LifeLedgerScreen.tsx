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
import { LedgerMonth, monthLabelTH } from '../types/lifeLedger';
import {
  getLedgerMonths,
  saveLedgerMonth,
  deleteLedgerMonth,
  isLifeLedgerTableMissing,
} from '../services/lifeLedgerStorage';
import { loadLedgerProfit } from '../services/ledgerProfit';
import {
  buildLifeLedger,
  ledgerFirstMonth,
  LifeLedger,
  LifeLedgerRow,
  LedgerProfit,
} from '../utils/lifeLedger';
import { getLifeCosts } from '../services/lifeCostStorage';
import { summarizeLifeCosts } from '../utils/lifeCost';
import { getRecurringBills } from '../services/storage';
import { avgMonthlyBill } from '../utils/expenseLadder';
import { RecurringBill } from '../types';
import { LifeCost } from '../types/lifeCost';
import { COLORS, RADIUS, TEXT, FONTS, formatCurrency } from '../utils/constants';
import { ActionButton } from '../components/ActionButton';
import { Mascot, MascotEmpty, MascotState } from '../components/Mascot';
import { MenuRow, MenuCard } from '../components/MenuRow';
import { notify, confirmAsk } from '../utils/dialog';
import { useResponsive } from '../utils/responsive';

/** ย้อนหลังกี่เดือนให้เลือกจดได้ — ไกลกว่านี้ยอดบิลก็จำไม่ได้แล้ว */
const PICKABLE_MONTHS = 12;
/** โชว์กี่เดือนก่อนต้องกด "ดูทั้งหมด" */
const PREVIEW_MONTHS = 6;

const num = (s: string): number => {
  const n = parseFloat((s || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`;

/** เดือนย้อนหลัง N เดือนจากเดือนนี้ ใหม่สุดอยู่หน้า */
const recentMonths = (today: Date, count: number): string[] =>
  Array.from({ length: count }, (_, i) =>
    monthKey(new Date(today.getFullYear(), today.getMonth() - i, 1))
  );

/**
 * อารมณ์ของน้องหมุด = สถานะบัญชี ไม่ใช่ของประดับ
 * ยังไม่เริ่มจด = หลับ · จ่ายครบมีเหลือ = ดีใจ · ค้างตั้งแต่ 3 เดือน = ตื่นตัว · ค้างอยู่ = เศร้า
 * ไม่ใช้ alert กับการค้างน้อย ๆ เพราะการค้างเป็นเรื่องปกติของบัญชีนี้ ไม่ใช่เหตุฉุกเฉิน
 */
const moodFor = (l: LifeLedger): MascotState => {
  if (l.monthCount === 0) return 'sleep';
  if (l.owedTHB <= 0) return 'cheer';
  return l.monthsOwed >= 3 ? 'alert' : 'sad';
};

/**
 * หน้า "บัญชีให้พอร์ตจ่ายชีวิต" — ค่าใช้จ่ายสะสมรายเดือน เทียบกับกำไรที่ขายได้จริง
 *
 * ⚠️ นี่คือ **บัญชีเดินสะพัด ไม่ใช่โควตารายเดือน** — ยอดค้างไม่มีวันครบกำหนด
 * ทุกข้อความในหน้านี้ต้องอ่านเป็น "ตอนนี้ค้างอยู่เท่าไหร่" ไม่ใช่ "เดือนนี้ต้องทำให้ได้เท่าไหร่"
 * เหตุผลเต็ม ๆ อยู่หัวไฟล์ utils/lifeLedger.ts — ห้ามแก้ถ้อยคำโดยไม่อ่านก่อน
 */
export default function LifeLedgerScreen() {
  const navigation = useNavigation<any>();
  const { isDesktop } = useResponsive();
  const [months, setMonths] = useState<LedgerMonth[]>([]);
  const [profit, setProfit] = useState<LedgerProfit>({ grossTHB: 0, taxTHB: 0, taxKnown: true });
  const [costs, setCosts] = useState<LifeCost[]>([]);
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // ── โมดัลจดเดือน ──
  const [modalVisible, setModalVisible] = useState(false);
  const [monthInput, setMonthInput] = useState('');
  const [depInput, setDepInput] = useState('');
  const [billInput, setBillInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [editingExisting, setEditingExisting] = useState(false);

  const todayDate = useMemo(() => new Date(), []);
  const thisMonth = monthKey(todayDate);

  const loadData = useCallback(async () => {
    let rows: LedgerMonth[] = [];
    try {
      rows = await getLedgerMonths();
      setMonths(rows);
      setTableMissing(false);
    } catch (e) {
      if (isLifeLedgerTableMissing(e)) setTableMissing(true);
      setMonths([]);
    }
    // กำไรคิดจาก "เดือนแรกที่จด" เป็นต้นไป จึงต้องรู้แถวก่อนถึงจะโหลดกำไรได้
    try {
      setProfit(await loadLedgerProfit(ledgerFirstMonth(rows)));
    } catch {
      setProfit({ grossTHB: 0, taxTHB: 0, taxKnown: false });
    }
    // ค่าเสื่อม + บิล ใช้เติมยอดให้ตอนกดจด — ล้มแยกกันได้ ไม่มีก็แค่ต้องพิมพ์เอง
    try {
      setCosts(await getLifeCosts());
    } catch {
      setCosts([]);
    }
    try {
      setBills(await getRecurringBills());
    } catch {
      setBills([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const ledger = useMemo(() => buildLifeLedger(months, profit), [months, profit]);
  const mood = moodFor(ledger);
  const recorded = useMemo(() => new Set(months.map((m) => m.month)), [months]);

  // ── ยอดที่เติมให้ตอนกดจด ──
  // ค่าเสื่อม = ยอดที่ต้องกันต่อเดือนของทุกรายการ (ยอดวันนี้ — เดือนย้อนหลังปรับเองได้)
  // บิล = ยอดที่กรอกจริงของเดือนนั้น ถ้าเดือนนั้นยังไม่กรอกค่อยถอยไปใช้ค่าเฉลี่ยย้อนหลัง
  const suggestDep = useMemo(
    () => summarizeLifeCosts(costs, todayDate).perMonth,
    [costs, todayDate]
  );
  const suggestBillsFor = useCallback(
    (month: string): number =>
      bills.reduce((s, b) => {
        const exact = b.monthlyAmounts?.[month];
        return s + (Number.isFinite(exact) && exact > 0 ? exact : avgMonthlyBill(b.monthlyAmounts));
      }, 0),
    [bills]
  );

  const openRecord = (month: string) => {
    const existing = months.find((m) => m.month === month);
    setMonthInput(month);
    setEditingExisting(!!existing);
    setDepInput(String(Math.round(existing ? existing.depreciationTHB : suggestDep)));
    setBillInput(String(Math.round(existing ? existing.billsTHB : suggestBillsFor(month))));
    setNoteInput(existing?.note ?? '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!/^\d{4}-\d{2}$/.test(monthInput)) return notify('เลือกเดือนก่อน');
    const depreciationTHB = Math.max(0, num(depInput));
    const billsTHB = Math.max(0, num(billInput));
    if (depreciationTHB + billsTHB <= 0) {
      return notify('ยอดรวมของเดือนต้องมากกว่า 0 — ถ้าเดือนนั้นไม่มีค่าใช้จ่ายเลย ไม่ต้องจด');
    }
    try {
      await saveLedgerMonth({
        month: monthInput,
        depreciationTHB,
        billsTHB,
        note: noteInput.trim() || undefined,
        recordedAt: new Date().toISOString(),
      });
      setModalVisible(false);
      loadData();
    } catch (e) {
      notify(
        isLifeLedgerTableMissing(e)
          ? 'ยังใช้ไม่ได้ — เอา sql/life_ledger.sql ไปรันที่ Supabase ก่อน 1 ครั้ง'
          : 'บันทึกไม่สำเร็จ'
      );
    }
  };

  const handleDelete = async () => {
    if (!editingExisting) return;
    const ok = await confirmAsk(
      'ลบเดือนนี้',
      `เอาเดือน ${monthLabelTH(monthInput)} ออกจากบัญชี?\n\n` +
        'ยอดสะสมจะลดลงตามยอดของเดือนนั้น และกำไรที่เคยจ่ายเดือนนี้จะไหลไปจ่ายเดือนถัดไปแทน',
      'ลบ'
    );
    if (!ok) return;
    try {
      await deleteLedgerMonth(monthInput);
      setModalVisible(false);
      loadData();
    } catch {
      notify('ลบไม่สำเร็จ');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (tableMissing) {
    return (
      <View style={styles.center}>
        <MascotEmpty state="sleep" size={130}>
          {'ยังใช้ไม่ได้ — เอา sql/life_ledger.sql ไปรันที่ Supabase SQL editor ก่อน 1 ครั้ง\nแล้วกลับมาหน้านี้อีกที'}
        </MascotEmpty>
      </View>
    );
  }

  // ใหม่สุดอยู่บน — เดือนที่เพิ่งจดคือเดือนที่คนเพิ่งคิดถึง
  const newestFirst = [...ledger.rows].reverse();
  const visibleRows = showAll ? newestFirst : newestFirst.slice(0, PREVIEW_MONTHS);
  // เดือนที่จ่ายครบแล้วแต่ตกอยู่นอกพรีวิว — FIFO ทำให้เดือนที่ครบอยู่ท้ายลิสต์เสมอ
  const hiddenCovered = showAll
    ? 0
    : newestFirst.slice(PREVIEW_MONTHS).filter((r) => r.covered && r.costTHB > 0).length;
  const covered = ledger.monthCount > 0 && ledger.owedTHB <= 0;
  const thisMonthDone = recorded.has(thisMonth);

  const renderRow = (row: LifeLedgerRow) => {
    const pct = row.costTHB > 0 ? Math.min(100, (row.coveredTHB / row.costTHB) * 100) : 100;
    return (
      <TouchableOpacity
        key={row.month}
        style={styles.monthRow}
        onPress={() => openRecord(row.month)}
        accessibilityRole="button"
        accessibilityLabel={`แก้ยอดเดือน ${monthLabelTH(row.month)}`}
      >
        <View style={styles.monthLabelBox}>
          <Text style={styles.monthLabel}>{monthLabelTH(row.month)}</Text>
          {/* ห่อได้ 2 บรรทัด: ที่ 340px บรรทัดเดียวจะตัดจนเหลือ "ประจำ ..." แล้วสองก้อนที่จด
              (ซึ่งเป็นประเด็นของบรรทัดนี้) หายไปครึ่งหนึ่ง */}
          <Text style={styles.monthSplit} numberOfLines={2}>
            ค่าเสื่อม ฿{formatCurrency(row.depreciationTHB)} · ประจำ ฿{formatCurrency(row.billsTHB)}
          </Text>
        </View>
        <View style={styles.monthRight}>
          <Text style={styles.monthCost}>฿{formatCurrency(row.costTHB)}</Text>
          <Text style={[styles.monthState, row.covered && styles.monthStateDone]}>
            {row.covered ? 'พอร์ตจ่ายแล้ว' : `ค้าง ฿${formatCurrency(row.shortTHB)}`}
          </Text>
          <View style={styles.rowBarTrack}>
            <View
              style={[
                styles.rowBarFill,
                { width: `${pct}%`, backgroundColor: row.covered ? COLORS.success : COLORS.accent },
              ]}
            />
          </View>
        </View>
        <Ionicons name="chevron-forward" size={15} color={COLORS.textSecondary} />
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* ── การ์ดคำตอบ ──
          ตัวเลขใหญ่สลับความหมายตามสถานะโดยตั้งใจ: ยังค้าง = "ค้างอยู่" (สิ่งที่ต้องรู้)
          จ่ายครบ = "กำไรจริง" (สิ่งที่เพิ่งได้มา) — สองสถานะนี้เป็นคนละคำถามกัน */}
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <Mascot size={64} state={mood} />
          <View style={styles.heroMain}>
            <Text style={styles.heroLabel}>
              {covered ? 'กำไรจริงที่ยังไม่มีใครจอง' : 'ค้างอยู่'}
            </Text>
            <Text style={[styles.heroValue, covered && styles.heroValueGood]}>
              ฿{formatCurrency(covered ? ledger.surplusTHB : ledger.owedTHB)}
            </Text>
            <Text style={styles.heroSub}>
              {ledger.monthCount === 0
                ? 'ยังไม่เคยจด — กดจดเดือนนี้เพื่อเริ่มบัญชี'
                : covered
                  ? `พอร์ตจ่ายค่าชีวิตครบ ${ledger.monthsCovered} เดือนแล้ว ส่วนที่เกินคือกำไรของตัวเองจริง ๆ`
                  : `${ledger.monthsOwed} เดือนที่กำไรยังไปไม่ถึง · จ่ายครบแล้ว ${ledger.monthsCovered} เดือน`}
            </Text>
          </View>
        </View>

        {ledger.monthCount > 0 && (
          <>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${ledger.coveredPercent}%`,
                    backgroundColor: covered ? COLORS.success : COLORS.primary,
                  },
                ]}
              />
            </View>
            <Text style={styles.barCaption}>
              พอร์ตจ่ายไปได้ {ledger.coveredPercent.toFixed(0)}% ของที่ชีวิตเรียกเก็บมา{' '}
              {ledger.monthCount} เดือน
            </Text>

            {/* สองก้อนที่จด แยกให้เห็น — คนละเรื่องกัน: ค่าเสื่อมคือของที่ยังไม่ถึงวัน
                ค่าใช้จ่ายประจำคือของที่จ่ายออกไปแล้วทุกเดือน */}
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>ค่าเสื่อมสะสม</Text>
              <Text style={styles.sumValue}>฿{formatCurrency(ledger.depreciationTHB)}</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>ค่าใช้จ่ายประจำสะสม</Text>
              <Text style={styles.sumValue}>฿{formatCurrency(ledger.billsTHB)}</Text>
            </View>
            <View style={[styles.sumRow, styles.sumRowStrong]}>
              <Text style={styles.sumLabelStrong}>ชีวิตเรียกเก็บรวม</Text>
              <Text style={styles.sumValueStrong}>฿{formatCurrency(ledger.accruedTHB)}</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>
                กำไรที่ขายแล้ว{ledger.gainTaxTHB > 0 ? ' (หลังภาษี)' : ''}
              </Text>
              <Text style={[styles.sumValue, styles.sumValueGood]}>
                ฿{formatCurrency(ledger.profitTHB)}
              </Text>
            </View>
            {ledger.gainTaxTHB > 0 && (
              <Text style={styles.sumNote}>
                กำไรก่อนภาษี ฿{formatCurrency(ledger.profitGrossTHB)} − ภาษีกำไร ฿
                {formatCurrency(ledger.gainTaxTHB)} · คิดรายปีภาษีบนกำไรรวมของปีนั้น
                สูตรเดียวกับตอนกดปิดรอบ
              </Text>
            )}
            {!ledger.taxKnown && (
              <Text style={styles.warnLine}>
                ยอดนี้ยังเป็นกำไรก่อนภาษี — ยังไม่ได้กรอกเงินเดือนของปีที่ขาย จึงยังคิดขั้นภาษีไม่ได้
                กรอกที่หน้าภาษีแล้วเลขนี้จะลดลงตามจริง
              </Text>
            )}
            {ledger.profitGrossTHB < 0 && (
              <Text style={styles.warnLine}>
                ช่วงนี้ขายแล้วขาดทุนรวม ฿{formatCurrency(Math.abs(ledger.profitGrossTHB))} —
                ยอดค้างไม่ถูกบวกเพิ่มจากการขาดทุน บัญชีนี้เก็บแค่สิ่งที่ชีวิตเรียกเก็บ
              </Text>
            )}
          </>
        )}
      </View>

      {/* ── จดเดือน ──
          "จด" เป็นการกดของคน ไม่ใช่ระบบเติมให้เอง (หลักการเดียวกับยอดกระสุนและด่านชีวิต):
          แอปไม่รู้ว่าเดือนนั้นชีวิตเรียกเก็บจริงเท่าไหร่ มันรู้แค่ยอดที่ตั้งไว้ */}
      <View style={styles.recordCard}>
        <Text style={styles.cardTitle}>
          <Ionicons name="create-outline" size={16} color={COLORS.primary} /> จดเดือน
        </Text>
        <Text style={styles.cardLead}>
          เดือนละครั้ง จดว่าชีวิตเรียกเก็บไปเท่าไหร่ — ยอดที่เติมให้มาจากค่าเสื่อมที่ตั้งไว้
          และบิลที่กรอกจริงของเดือนนั้น แก้ได้ทุกช่อง
        </Text>
        <View style={styles.chipWrap}>
          {recentMonths(todayDate, PICKABLE_MONTHS).map((m) => {
            const done = recorded.has(m);
            return (
              <TouchableOpacity
                key={m}
                style={[styles.monthChip, done && styles.monthChipDone]}
                onPress={() => openRecord(m)}
                accessibilityRole="button"
                accessibilityLabel={`${done ? 'แก้ยอด' : 'จด'}เดือน ${monthLabelTH(m)}`}
              >
                {done && <Ionicons name="checkmark" size={12} color={COLORS.success} />}
                <Text style={[styles.monthChipText, done && styles.monthChipTextDone]}>
                  {monthLabelTH(m)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <ActionButton
          label={
            thisMonthDone
              ? `แก้ยอดเดือน ${monthLabelTH(thisMonth)}`
              : `จดเดือน ${monthLabelTH(thisMonth)}`
          }
          icon={thisMonthDone ? 'pencil-outline' : 'add-circle-outline'}
          variant="primary"
          size="md"
          onPress={() => openRecord(thisMonth)}
        />
      </View>

      {/* ── รายเดือน ── */}
      {ledger.monthCount === 0 ? (
        <MascotEmpty state="sleep" size={120}>
          {'บัญชียังไม่เริ่ม — จดเดือนแรกแล้วบัญชีจะเริ่มนับจากเดือนนั้น\nกำไรที่ขายได้หลังจากนั้นจะไหลมาจ่ายให้ทีละเดือน'}
        </MascotEmpty>
      ) : (
        <View style={styles.listCard}>
          <View style={styles.listHead}>
            <Text style={styles.cardTitle}>
              <Ionicons name="calendar-outline" size={16} color={COLORS.primary} /> รายเดือน
            </Text>
            {ledger.rows.length > PREVIEW_MONTHS && (
              <ActionButton
                label={showAll ? 'ย่อ' : `ดูทั้งหมด ${ledger.rows.length}`}
                variant="secondary"
                size="sm"
                onPress={() => setShowAll((v) => !v)}
              />
            )}
          </View>
          {visibleRows.map(renderRow)}
          {/* เดือนที่จ่ายครบเป็นข่าวดี แต่พรีวิวโชว์เดือนใหม่สุดซึ่งมักยังค้างอยู่ทั้งหมด
              ถ้าไม่บอก คนจะเห็นแต่แถวสีเหลืองเรียงกันแล้วนึกว่าไม่เคยจ่ายได้เลย */}
          {!showAll && hiddenCovered > 0 && (
            <Text style={styles.hiddenCoveredLine}>
              + {hiddenCovered} เดือนก่อนหน้าที่พอร์ตจ่ายครบแล้ว
            </Text>
          )}
          {ledger.oldestOwed && (
            <Text style={styles.nextLine}>
              กำไรก้อนถัดไปจะไปจ่าย {monthLabelTH(ledger.oldestOwed.month)} ก่อน — ขาดอีก ฿
              {formatCurrency(ledger.oldestOwed.shortTHB)}
            </Text>
          )}
          <Text style={styles.avgLine}>
            เฉลี่ยเดือนละ ฿{formatCurrency(ledger.avgMonthlyCostTHB)} จาก {ledger.monthCount}{' '}
            เดือนที่จด
          </Text>
        </View>
      )}

      {/* ── ลำดับการใช้กำไร ──
          ปลดล็อกรางวัลใช้กำไร realized ก้อนเดียวกัน ต้องบอกให้เห็นว่าใครกินก่อน
          ไม่งั้นกำไรก้อนเดียวจะดูเหมือนจ่ายได้ทั้งสองอย่าง */}
      {ledger.monthCount > 0 && (
        <MenuCard style={isDesktop && styles.menuCardDesktop}>
          <MenuRow
            icon="gift-outline"
            title="ปลดล็อกรางวัล"
            tone={COLORS.accentText}
            value={`฿${formatCurrency(ledger.surplusTHB)}`}
            valueSub="เหลือให้รางวัล"
            sub="ใช้กำไรก้อนเดียวกับบัญชีนี้ — บัญชีชีวิตหักก่อน ที่เหลือไหลไปคิวรางวัล"
            onPress={() => navigation.navigate('PurchaseGoals')}
            first
          />
          <MenuRow
            icon="pricetags-outline"
            title="ค่าเสื่อมของชีวิต"
            tone={COLORS.primary}
            value={`฿${formatCurrency(suggestDep)}`}
            valueSub="ต่อเดือน"
            sub="ตั้งรายการ · เริ่มรอบใหม่ · บันไดให้พอร์ตจ่ายแทน"
            onPress={() => navigation.navigate('LifeCost')}
          />
        </MenuCard>
      )}

      <Text style={styles.footNote}>
        ยอดค้างไม่มีวันครบกำหนดโดยตั้งใจ — มันรอกำไรก้อนถัดไป ซึ่งจะมาตอนที่รอบลงทุนถึงเป้าของมันเอง
        ไม่ใช่ตอนสิ้นเดือน ตัวเลขนี้เป็นกระดานคะแนน ไม่ใช่ใบแจ้งหนี้ที่มีกำหนดชำระ
        {'\n'}นับเฉพาะกำไรที่ขายจริงตั้งแต่เดือนแรกที่จด (
        {ledger.firstMonth ? monthLabelTH(ledger.firstMonth) : '—'}) กำไรลอยตัวยังไม่นับ
        เพราะยังเอาไปจ่ายอะไรไม่ได้
      </Text>

      {/* ── โมดัลจดเดือน ── */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <ScrollView style={styles.modalCard} contentContainerStyle={styles.modalInner}>
            <Text style={styles.modalTitle}>
              {editingExisting ? 'แก้ยอดเดือน' : 'จดเดือน'} {monthLabelTH(monthInput)}
            </Text>

            <Text style={styles.inputLabel}>ค่าเสื่อมของเดือนนี้ (บาท)</Text>
            <TextInput
              style={styles.input}
              value={depInput}
              onChangeText={setDepInput}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={COLORS.textSecondary}
            />
            <Text style={styles.inputHint}>
              ยอดที่ต้องกันต่อเดือนของทุกรายการค่าเสื่อม — เติมให้จากที่ตั้งไว้ ฿
              {formatCurrency(suggestDep)}
            </Text>

            <Text style={styles.inputLabel}>ค่าใช้จ่ายประจำของเดือนนี้ (บาท)</Text>
            <TextInput
              style={styles.input}
              value={billInput}
              onChangeText={setBillInput}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={COLORS.textSecondary}
            />
            <Text style={styles.inputHint}>
              บิลประจำที่กรอกไว้ของเดือนนั้น ถ้าเดือนนั้นยังไม่กรอก จะใช้ค่าเฉลี่ยย้อนหลังมาเติมให้
            </Text>

            <Text style={styles.inputLabel}>โน้ต (ไม่ใส่ก็ได้)</Text>
            <TextInput
              style={styles.input}
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="เช่น เดือนนี้จ่ายประกันรถ"
              placeholderTextColor={COLORS.textSecondary}
            />

            <View style={styles.modalTotal}>
              <Text style={styles.modalTotalLabel}>รวมเดือนนี้</Text>
              <Text style={styles.modalTotalValue}>
                ฿{formatCurrency(Math.max(0, num(depInput)) + Math.max(0, num(billInput)))}
              </Text>
            </View>

            <View style={styles.modalActions}>
              <ActionButton
                label="ยกเลิก"
                variant="quiet"
                size="md"
                onPress={() => setModalVisible(false)}
              />
              {editingExisting && (
                <ActionButton
                  label="ลบเดือนนี้"
                  variant="danger"
                  size="md"
                  onPress={handleDelete}
                />
              )}
              <ActionButton label="บันทึก" variant="primary" size="md" onPress={handleSave} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingBottom: 40 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 24,
  },

  heroCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    margin: 16,
    padding: 16,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroMain: { flex: 1, minWidth: 0 },
  heroLabel: { ...TEXT.label, color: COLORS.textSecondary },
  heroValue: { fontSize: 30, fontFamily: FONTS.semibold, color: COLORS.error, marginTop: 2 },
  heroValueGood: { color: COLORS.success },
  heroSub: { ...TEXT.caption, color: COLORS.textSecondary, marginTop: 4, lineHeight: 18 },

  barTrack: {
    height: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.divider,
    marginTop: 14,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: RADIUS.pill },
  barCaption: { ...TEXT.caption, color: COLORS.textSecondary, marginTop: 6 },

  sumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 8,
  },
  sumRowStrong: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8 },
  sumLabel: { ...TEXT.body, color: COLORS.textSecondary, flexShrink: 1 },
  sumLabelStrong: { ...TEXT.subtitle, color: COLORS.text, flexShrink: 1 },
  sumValue: { ...TEXT.subtitle, color: COLORS.text },
  sumValueGood: { color: COLORS.success },
  sumValueStrong: { ...TEXT.title, color: COLORS.text },
  sumNote: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 6, lineHeight: 16 },
  warnLine: { ...TEXT.caption, color: COLORS.warning, marginTop: 8, lineHeight: 18 },

  recordCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
  },
  cardTitle: { ...TEXT.title, color: COLORS.text },
  cardLead: { ...TEXT.caption, color: COLORS.textSecondary, marginTop: 4, lineHeight: 18 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 12 },
  monthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  monthChipDone: { borderColor: COLORS.success, backgroundColor: `${COLORS.success}12` },
  monthChipText: { ...TEXT.caption, color: COLORS.text },
  monthChipTextDone: { color: COLORS.success },

  listCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
  },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  monthLabelBox: { flex: 1, minWidth: 0 },
  monthLabel: { ...TEXT.subtitle, color: COLORS.text },
  monthSplit: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 2 },
  monthRight: { alignItems: 'flex-end', minWidth: 108 },
  monthCost: { ...TEXT.subtitle, color: COLORS.text },
  monthState: { ...TEXT.hint, color: COLORS.warning, marginTop: 1 },
  monthStateDone: { color: COLORS.success },
  rowBarTrack: {
    height: 4,
    width: 96,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.divider,
    marginTop: 5,
    overflow: 'hidden',
  },
  rowBarFill: { height: '100%', borderRadius: RADIUS.pill },
  nextLine: {
    ...TEXT.caption,
    color: COLORS.text,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    lineHeight: 18,
  },
  avgLine: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 6 },
  hiddenCoveredLine: {
    ...TEXT.caption,
    color: COLORS.success,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    paddingTop: 10,
  },

  menuCardDesktop: { borderRadius: RADIUS.lg },
  footNote: { ...TEXT.hint, color: COLORS.textSecondary, marginHorizontal: 16, lineHeight: 17 },

  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(11,27,51,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '100%',
    flexGrow: 0,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
  },
  modalInner: { padding: 20 },
  modalTitle: { ...TEXT.screenTitle, color: COLORS.text, marginBottom: 12 },
  inputLabel: { ...TEXT.label, color: COLORS.text, marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...TEXT.body,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    minWidth: 0,
  },
  inputHint: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 4, lineHeight: 16 },
  modalTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modalTotalLabel: { ...TEXT.subtitle, color: COLORS.textSecondary },
  modalTotalValue: { ...TEXT.amount, color: COLORS.text },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 18,
  },
});
