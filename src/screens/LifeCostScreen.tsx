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
import { useFocusEffect } from '@react-navigation/native';
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
import { summarizeLifeCosts, LifeCostStatus } from '../utils/lifeCost';
import { COLORS, RADIUS, TEXT, FONTS, formatCurrency, toChristianYear } from '../utils/constants';
import { ActionButton } from '../components/ActionButton';
import { Mascot, MascotEmpty, MascotState } from '../components/Mascot';
import { notify, confirmAsk } from '../utils/dialog';
import { useResponsive } from '../utils/responsive';

const CARD_BASIS = 420;

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
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const summary = useMemo(() => summarizeLifeCosts(items, todayDate), [items, todayDate]);
  const mood = moodFor(summary.count, summary.overdueCount, summary.gap);

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
        `รอบใหม่จะครบอีกที ${fmtDateTH(row.dueAt.slice(0, 4) + row.dueAt.slice(4))}\n` +
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
