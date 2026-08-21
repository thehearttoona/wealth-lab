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
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { LifeGoal, LIFE_GOAL_PRESETS } from '../types/lifeGoal';
import {
  getLifeGoals,
  saveLifeGoal,
  updateLifeGoal,
  deleteLifeGoal,
  setLifeGoalAchieved,
  isLifeGoalTableMissing,
} from '../services/lifeGoalStorage';
import { planLifeGoals, lifeGoalEta, mascotStageForLevels } from '../utils/lifeGoal';
import { buildExpenseLadder, avgMonthlyBill, OutflowItem } from '../utils/expenseLadder';
import { summarizeLifeCosts } from '../utils/lifeCost';
import { INFLATION_RATE } from '../utils/portfolioCoverage';
import { getLifeCosts } from '../services/lifeCostStorage';
import { getRecurringBills } from '../services/storage';
import { LifeCost } from '../types/lifeCost';
import { RecurringBill } from '../types';
import { MenuRow, MenuCard } from '../components/MenuRow';
import { getInvestments, getPortfolioSummary } from '../services/investmentStorage';
import { getAccounts } from '../services/accountStorage';
import { getInstallmentPlans } from '../services/installmentStorage';
import { getRealizedTrades } from '../services/realizedStorage';
import { computeNetWorth } from '../utils/netWorth';
import { buildPowderFlow, DeployRow } from '../utils/powderFlow';
import { Investment } from '../types/investment';
import { Account } from '../types/account';
import { InstallmentPlan } from '../types';
import { COLORS, RADIUS, TEXT, FONTS, formatCurrency, convertToTHB } from '../utils/constants';
import { ActionButton } from '../components/ActionButton';
import { Mascot, MascotEmpty } from '../components/Mascot';
import { notify, confirmAsk } from '../utils/dialog';
import { useResponsive } from '../utils/responsive';

const num = (s: string): number => {
  const n = parseFloat((s || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

const fmtDateTH = (iso: string): string =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

/**
 * หน้า "เป้าหมายใหญ่สุดของชีวิต" — บันไดเงินก้อน วัดจากความมั่งคั่งสุทธิทั้งก้อน
 *
 * ต่างจากเป้าพอร์ต (เฉพาะเงินลงทุน) และของรางวัล (ใช้กำไรที่ขายจริง) — อันนี้นับทุกอย่าง
 * พอร์ต + เงินสด − หนี้ ตามสูตรเดียวกับหน้าภาพรวม (utils/netWorth.ts)
 *
 * ⚠️ ด่านที่ผ่านแล้วไม่ถอย ต่อให้ยอดตกลงมาทีหลัง (เหตุผลใน utils/lifeGoal.ts)
 * และการประทับว่า "ผ่านแล้ว" ต้องให้คนกดเอง — แอปแค่ชวน ไม่ประทับให้เอง
 */
export default function LifeGoalScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDesktop } = useResponsive();
  const [goals, setGoals] = useState<LifeGoal[]>([]);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  const [deployRows, setDeployRows] = useState<DeployRow[]>([]);
  // ด่านพื้นฐาน (ให้พอร์ตจ่ายชีวิตแทน) ต้องมาก่อนบันไดเป้าหมายที่ตั้งเอง
  const [lifeCosts, setLifeCosts] = useState<LifeCost[]>([]);
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<LifeGoal | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [noteInput, setNoteInput] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const todayDate = useMemo(() => new Date(`${today}T00:00:00`), [today]);

  const loadData = useCallback(async () => {
    try {
      setGoals(await getLifeGoals());
      setTableMissing(false);
    } catch (e) {
      if (isLifeGoalTableMissing(e)) setTableMissing(true);
      setGoals([]);
    }
    // ทุกก้อนล้มแยกกันได้ — ตารางไหนยังไม่มีก็ไม่ควรทำให้ทั้งหน้าว่าง
    try {
      const inv = await getInvestments();
      setInvestments(inv);
      const sum = await getPortfolioSummary();
      setPortfolioValue(sum.totalValue);
      const trades = await getRealizedTrades().catch(() => []);
      setDeployRows([
        ...inv.map((i) => ({
          date: i.buyDate,
          thb: convertToTHB(i.buyPrice, i.currency) * i.quantity + (i.fees || 0),
        })),
        ...trades.map((t) => ({
          date: t.buyDate,
          thb: convertToTHB(t.buyPrice, t.currency) * t.quantity,
        })),
      ]);
    } catch {
      /* ปล่อยเป็นค่าว่าง — จอยังใช้ได้ แค่ตัวเลขความมั่งคั่งจะต่ำกว่าจริง */
    }
    try {
      setAccounts(await getAccounts());
    } catch {
      setAccounts([]);
    }
    try {
      setPlans(await getInstallmentPlans());
    } catch {
      setPlans([]);
    }
    // สองก้อนนี้ล้มแยกกันได้ — ยังไม่ได้รัน sql/life_costs.sql ก็แค่ไม่มีด่านพื้นฐานให้โชว์
    try {
      setLifeCosts(await getLifeCosts());
    } catch {
      setLifeCosts([]);
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

  const worth = useMemo(
    () => computeNetWorth(portfolioValue, accounts, investments, plans),
    [portfolioValue, accounts, investments, plans]
  );
  const plan = useMemo(() => planLifeGoals(goals, worth.netWorth), [goals, worth.netWorth]);
  const flow = useMemo(() => buildPowderFlow(deployRows, todayDate, 8), [deployRows, todayDate]);
  const eta = useMemo(
    () => lifeGoalEta(plan.current?.remainingTHB ?? 0, flow.avgThbPerWeek, todayDate),
    [plan.current, flow.avgThbPerWeek, todayDate]
  );
  const stage = mascotStageForLevels(plan.cleared.length);

  // ── ด่านพื้นฐาน: ให้พอร์ตจ่ายค่าใช้จ่ายประจำ + ค่าเสื่อมแทน ──
  // ตราบใดที่ยังต้องจ่ายจากเงินเดือน เป้าเงินล้านก็ยังไม่มีฐานรองรับ — จึงต้องอยู่เหนือบันไดที่ตั้งเอง
  // วัดด้วยมูลค่าพอร์ต ไม่ใช่ความมั่งคั่งสุทธิ เพราะคนที่ต้องออกดอกผลมาจ่ายคือพอร์ต ไม่ใช่เงินสด/หนี้
  const baseLadder = useMemo(() => {
    const costRows = summarizeLifeCosts(lifeCosts, todayDate).rows.map((r) => ({
      id: r.item.id,
      name: r.item.name,
      monthlyTHB: r.perMonth,
      kind: 'life_cost' as const,
    }));
    const billRows: OutflowItem[] = bills
      .map((b) => ({
        id: b.id,
        name: b.name,
        monthlyTHB: avgMonthlyBill(b.monthlyAmounts),
        kind: 'bill' as const,
      }))
      .filter((b) => b.monthlyTHB > 0);
    return buildExpenseLadder([...costRows, ...billRows], portfolioValue, 7, INFLATION_RATE);
  }, [lifeCosts, bills, portfolioValue, todayDate]);

  const openAdd = () => {
    setEditing(null);
    setNameInput('');
    setTargetInput('');
    setNoteInput('');
    setModalVisible(true);
  };

  const openEdit = (g: LifeGoal) => {
    setEditing(g);
    setNameInput(g.name);
    setTargetInput(String(g.targetTHB));
    setNoteInput(g.note ?? '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    const name = nameInput.trim();
    if (!name) return notify('ใส่ชื่อด่านก่อน');
    const targetTHB = num(targetInput);
    if (targetTHB <= 0) return notify('ยอดเป้าหมายต้องมากกว่า 0');
    const next: LifeGoal = {
      id: editing?.id ?? Date.now().toString(),
      name,
      targetTHB,
      // ด่านใหม่ต่อท้ายเสมอ — ลำดับคิดจากยอดตอนแสดงผลอีกที
      level: editing?.level ?? goals.length,
      achievedAt: editing?.achievedAt,
      note: noteInput.trim() || undefined,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    };
    try {
      if (editing) await updateLifeGoal(next);
      else await saveLifeGoal(next);
      setModalVisible(false);
      loadData();
    } catch (e) {
      notify(
        isLifeGoalTableMissing(e)
          ? 'ยังใช้ไม่ได้ — เอา sql/life_goals.sql ไปรันที่ Supabase ก่อน 1 ครั้ง'
          : 'บันทึกไม่สำเร็จ'
      );
    }
  };

  const handleDelete = async (g: LifeGoal) => {
    const ok = await confirmAsk('ลบด่าน', `ลบ "${g.name}" ออกจากบันได?`, 'ลบ');
    if (!ok) return;
    try {
      await deleteLifeGoal(g.id);
      setModalVisible(false);
      loadData();
    } catch {
      notify('ลบไม่สำเร็จ');
    }
  };

  const handleClaim = async (g: LifeGoal) => {
    const ok = await confirmAsk(
      'ผ่านด่านแล้ว',
      `ยืนยันว่าผ่าน "${g.name}" (฿${formatCurrency(g.targetTHB)}) แล้ว\n\n` +
        'ด่านนี้จะถูกเก็บเข้าประวัติถาวร ยอดตกลงมาทีหลังก็ไม่ถอยด่าน',
      'ผ่านแล้ว'
    );
    if (!ok) return;
    try {
      await setLifeGoalAchieved(g.id, today);
      loadData();
    } catch {
      notify('บันทึกไม่สำเร็จ');
    }
  };

  const handleUnclaim = async (g: LifeGoal) => {
    const ok = await confirmAsk('ยกเลิกการผ่านด่าน', `เอา "${g.name}" กลับไปเป็นด่านที่ยังไม่ผ่าน?`, 'ยกเลิก');
    if (!ok) return;
    try {
      await setLifeGoalAchieved(g.id, null);
      loadData();
    } catch {
      notify('บันทึกไม่สำเร็จ');
    }
  };

  const addPreset = async (p: (typeof LIFE_GOAL_PRESETS)[number]) => {
    try {
      await saveLifeGoal({
        id: Date.now().toString(),
        name: p.name,
        targetTHB: p.targetTHB,
        level: goals.length,
        createdAt: new Date().toISOString(),
      });
      loadData();
    } catch {
      notify('เพิ่มไม่สำเร็จ — ถ้ายังไม่ได้รัน sql/life_goals.sql ให้รันก่อน');
    }
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
        {tableMissing && (
          <Text style={styles.warnBox}>
            ยังใช้ไม่ได้ — เอาไฟล์ `sql/life_goals.sql` ไปรันที่ Supabase SQL editor ก่อน 1 ครั้ง
          </Text>
        )}

        {/* ── ด่านพื้นฐาน: ต้องผ่านก่อนบันไดที่ตั้งเอง ──
            วางไว้เหนือการ์ดเลเวลโดยตั้งใจ — เป้าเงินล้านไม่มีความหมายถ้าค่าเน็ตยังต้องจ่ายเอง
            ตัวเลขคิดที่หน้าค่าเสื่อม (ที่เดียว) ตรงนี้เป็นแค่ทางเข้า ไม่คำนวณซ้ำ */}
        {baseLadder.rungs.length > 0 && (
          <MenuCard style={styles.baseCard}>
            <MenuRow
              icon="shield-checkmark-outline"
              title="ด่านพื้นฐาน · ให้พอร์ตจ่ายชีวิตแทน"
              tone={COLORS.success}
              value={`${baseLadder.clearedCount}/${baseLadder.rungs.length}`}
              valueSub="ปลดแล้ว"
              sub={
                baseLadder.current
                  ? `ขั้นถัดไป ${baseLadder.current.name} · ต้องมีพอร์ต ฿${formatCurrency(
                      baseLadder.current.cumulativeTHB
                    )}`
                  : `ปลดครบแล้ว — ค่าใช้จ่าย ฿${formatCurrency(
                      baseLadder.totalMonthlyTHB
                    )}/เดือน พอร์ตจ่ายเองได้หมด`
              }
              onPress={() => navigation.navigate('LifeCost')}
              first
            />
          </MenuCard>
        )}

        {/* ── การ์ดหลัก: อยู่ด่านไหน เหลืออีกเท่าไหร่ ── */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroMain}>
              <Text style={styles.levelBadge}>เลเวล {plan.level}</Text>
              <Text style={styles.heroLabel}>ความมั่งคั่งสุทธิตอนนี้</Text>
              <Text style={styles.heroValue}>฿{formatCurrency(worth.netWorth)}</Text>
              <Text style={styles.heroSub}>
                พอร์ต ฿{formatCurrency(worth.portfolioValue)} + เงินสด ฿{formatCurrency(worth.cash)} −
                หนี้ ฿{formatCurrency(worth.debt)}
                {worth.hasUnfilledAccount ? '\nมีบัญชีที่ยังไม่ได้กรอกยอด — ตัวเลขนี้ต่ำกว่าจริง' : ''}
              </Text>
            </View>
            {/* ขั้นของน้องหมุด = จำนวนด่านที่ผ่านแล้ว (ขึ้นอย่างเดียว ไม่ถอยเวลาตลาดแดง) */}
            <View style={styles.heroMascot}>
              <Mascot state={plan.current?.reached ? 'cheer' : 'happy'} stage={stage} size={92} />
              <Text style={styles.stageText}>ขั้น {stage}</Text>
            </View>
          </View>

          {plan.current ? (
            <View style={styles.currentBox}>
              <View style={styles.currentTop}>
                <Text style={styles.currentName} numberOfLines={1}>
                  {plan.current.goal.name}
                </Text>
                <Text style={styles.currentTarget}>฿{formatCurrency(plan.current.goal.targetTHB)}</Text>
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    { width: `${plan.current.percent}%` },
                    plan.current.reached && { backgroundColor: COLORS.success },
                  ]}
                />
              </View>
              <Text style={styles.currentSub}>
                {plan.current.reached
                  ? 'ยอดถึงเป้าแล้ว — กดยืนยันเพื่อเก็บด่านนี้เข้าประวัติ'
                  : `${plan.current.percent.toFixed(1)}% · ขาดอีก ฿${formatCurrency(plan.current.remainingTHB)}`}
              </Text>
              {!plan.current.reached && (
                <Text style={styles.etaText}>
                  {eta
                    ? `ถ้าเก็บได้เท่าเดิม (~฿${formatCurrency(flow.avgThbPerWeek ?? 0)}/สัปดาห์) อีกประมาณ ${eta.weeks} สัปดาห์ · ราว ๆ ปี ${eta.year}`
                    : 'ยังคำนวณ "อีกกี่สัปดาห์" ไม่ได้ — ต้องมีสัปดาห์ที่ลงเงินจริงจบไปก่อนอย่างน้อยหนึ่งสัปดาห์'}
                </Text>
              )}
              {plan.readyToClaim && (
                <View style={styles.claimRow}>
                  <ActionButton
                    label="ผ่านด่านแล้ว"
                    icon="trophy-outline"
                    variant="primary"
                    size="sm"
                    onPress={() => handleClaim(plan.readyToClaim!)}
                  />
                </View>
              )}
            </View>
          ) : goals.length > 0 ? (
            <Text style={styles.allDone}>ผ่านครบทุกด่านแล้ว — ตั้งด่านใหม่ได้เลย</Text>
          ) : null}
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add-circle-outline" size={18} color="#ffffff" />
          <Text style={styles.addBtnText}> ตั้งด่านใหม่</Text>
        </TouchableOpacity>

        {goals.length === 0 ? (
          <>
            <MascotEmpty>
              ยังไม่มีด่านในบันได{'\n'}
              ตั้งเป้าเงินก้อนที่อยากไปให้ถึง แล้วระบบจะบอกว่าตอนนี้ไปได้กี่ % และอีกกี่สัปดาห์ถึง
            </MascotEmpty>
            <Text style={styles.sectionTitle}>เริ่มเร็วจากบันไดมาตรฐาน</Text>
            <View style={styles.presetWrap}>
              {LIFE_GOAL_PRESETS.map((p) => (
                <TouchableOpacity key={p.name} style={styles.chip} onPress={() => addPreset(p)}>
                  <Text style={styles.chipText}>
                    {p.name} · ฿{formatCurrency(p.targetTHB)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            {plan.upcoming.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>ด่านถัดไป</Text>
                <View style={isDesktop ? styles.grid : undefined}>
                  {plan.upcoming.map((p) => (
                    <View key={p.goal.id} style={[styles.row, isDesktop && styles.gridItem]}>
                      <View style={styles.rowMain}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {p.goal.name}
                        </Text>
                        <Text style={styles.rowSub}>
                          ฿{formatCurrency(p.goal.targetTHB)} · ตอนนี้ {p.percent.toFixed(0)}%
                        </Text>
                      </View>
                      <ActionButton label="แก้ไข" icon="create-outline" size="sm" onPress={() => openEdit(p.goal)} />
                    </View>
                  ))}
                </View>
              </>
            )}

            {plan.cleared.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>ด่านที่ผ่านแล้ว ({plan.cleared.length})</Text>
                <View style={isDesktop ? styles.grid : undefined}>
                  {plan.cleared.map((g) => (
                    <View key={g.id} style={[styles.row, styles.rowDone, isDesktop && styles.gridItem]}>
                      <Ionicons name="trophy" size={18} color={COLORS.accentText} />
                      <View style={styles.rowMain}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {g.name}
                        </Text>
                        <Text style={styles.rowSub}>
                          ฿{formatCurrency(g.targetTHB)}
                          {g.achievedAt ? ` · ผ่านเมื่อ ${fmtDateTH(g.achievedAt)}` : ''}
                        </Text>
                      </View>
                      <ActionButton label="ยกเลิก" size="sm" onPress={() => handleUnclaim(g)} />
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        <Text style={styles.ruleNote}>
          วัดจากความมั่งคั่งสุทธิ (พอร์ต + เงินสด − หนี้) ไม่ใช่เฉพาะมูลค่าพอร์ต
          {'\n'}ด่านที่ผ่านแล้วไม่ถอย ต่อให้ยอดตกลงมาทีหลัง — และแอปไม่ประทับให้เอง คุณต้องกดยืนยัน
          {'\n'}"อีกกี่สัปดาห์" คิดจากเงินที่ลงจริงต่อสัปดาห์เท่านั้น ไม่ได้คิดผลตอบแทนหรือรายจ่ายที่จะโผล่มา
        </Text>
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={styles.modalCardContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>{editing ? 'แก้ไขด่าน' : 'ตั้งด่านใหม่'}</Text>

            <Text style={styles.modalLabel}>ชื่อด่าน</Text>
            <TextInput
              style={styles.modalInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="เช่น ล้านแรก, เงินก้อนซื้อบ้าน"
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.modalLabel}>ยอดความมั่งคั่งสุทธิที่ถือว่าผ่าน (บาท)</Text>
            <TextInput
              style={styles.modalInput}
              value={targetInput}
              onChangeText={setTargetInput}
              keyboardType="numeric"
              placeholder="1000000"
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.modalLabel}>โน้ต (ไม่ใส่ก็ได้)</Text>
            <TextInput
              style={styles.modalInput}
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="เช่น อยากถึงก่อนอายุ 35"
              placeholderTextColor={COLORS.textSecondary}
            />

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

  baseCard: { marginHorizontal: 0, marginBottom: 12 },
  heroCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
  },
  // minWidth: 0 ที่คอลัมน์ซ้ายจำเป็นบนเว็บ ไม่งั้นตัวเลขยาวดันมาสคอตหลุดขอบ
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroMain: { flex: 1, minWidth: 0 },
  heroMascot: { alignItems: 'center' },
  stageText: { fontSize: 10, fontFamily: FONTS.regular, color: COLORS.textSecondary, marginTop: 2 },
  levelBadge: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontFamily: FONTS.semibold,
    color: '#ffffff',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    marginBottom: 6,
    overflow: 'hidden',
  },
  heroLabel: { ...TEXT.caption, color: COLORS.textSecondary },
  heroValue: { ...TEXT.amount, color: COLORS.text, marginTop: 2 },
  heroSub: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 4, lineHeight: 17 },

  currentBox: { marginTop: 14, gap: 6 },
  currentTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  currentName: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.text },
  currentTarget: { fontSize: 13, fontFamily: FONTS.semibold, color: COLORS.primary },
  track: { height: 10, borderRadius: RADIUS.pill, backgroundColor: COLORS.divider, overflow: 'hidden' },
  fill: { height: 10, borderRadius: RADIUS.pill, backgroundColor: COLORS.primary },
  currentSub: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.text },
  etaText: { fontSize: 11, fontFamily: FONTS.light, color: COLORS.textSecondary, lineHeight: 17 },
  claimRow: { flexDirection: 'row', marginTop: 4 },
  allDone: { ...TEXT.caption, color: COLORS.success, marginTop: 12 },

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

  sectionTitle: { ...TEXT.title, color: COLORS.text, marginTop: 8, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  gridItem: { flexBasis: 380, flexGrow: 1, minWidth: 0, marginBottom: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 10,
  },
  rowDone: { backgroundColor: `${COLORS.accent}14` },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 13.5, fontFamily: FONTS.semibold, color: COLORS.text },
  rowSub: { fontSize: 11, fontFamily: FONTS.light, color: COLORS.textSecondary, marginTop: 2 },

  presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
  },
  chipText: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.text },

  ruleNote: {
    fontSize: 11,
    fontFamily: FONTS.light,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: 16,
  },

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
    maxWidth: 460,
    maxHeight: '100%',
    flexGrow: 0,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
  },
  modalCardContent: { padding: 20 },
  modalTitle: { ...TEXT.title, color: COLORS.text, marginBottom: 12 },
  modalLabel: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.text, marginTop: 12, marginBottom: 6 },
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
  modalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, gap: 8 },
  modalActionsRight: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
});
