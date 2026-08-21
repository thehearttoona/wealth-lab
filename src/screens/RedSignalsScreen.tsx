import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { RedSignal, RedSignalOutcome, OUTCOME_LABELS, redUnitLabel } from '../types/redSignal';
import {
  getRedSignals,
  setRedSignalOutcome,
  setRedSignalNote,
  deleteRedSignal,
} from '../services/redSignalStorage';
import { summarizeRedSignals, summarizeBySymbol, groupByMonth } from '../utils/redSignalLog';
import { COLORS, RADIUS, formatCurrency, formatCurrencyWithType, assetColor } from '../utils/constants';
import { notify, confirmAsk } from '../utils/dialog';
import { useResponsive } from '../utils/responsive';
import { MascotEmpty } from '../components/Mascot';

/**
 * หน้า "บันทึกสัญญาณ" — ของสะสมของกฎแท่งแดง (ดู types/redSignal + sql/red_signals.sql)
 *
 * ทำไมต้องแยกจากการ์ด "ถึงคิวลงไม้" ในพอร์ต: การ์ดนั้นตอบคำถาม "วันนี้ต้องลงมืออะไร"
 * สตรีคขาดเมื่อไหร่สัญญาณก็หายไปพร้อมกัน หน้านี้ตอบคำถามคนละข้อที่ตอบไม่ได้เลยถ้าไม่เก็บ:
 *   · กฎที่ตั้งไว้เตือนไปกี่ครั้งแล้ว และเรา "ลงจริง" กี่ครั้ง (วินัยเป็นตัวเลข ไม่ใช่ความรู้สึก)
 *   · ครั้งที่ "เข้าไม่ได้" (ชนเพดานไม้/หมดงบ) มีกี่ครั้ง — หลักฐานว่าแผนแคบเกินไปหรือพอดี
 *   · ตัวไหนเตือนบ่อยสุด = ตัวที่กินกระสุนเราที่สุด
 *
 * ทั้งหน้าอ่าน/เขียนแค่ตาราง red_signals — ไม่แตะพอร์ต ไม่แตะจำนวน/ต้นทุนของไม้
 */

const MONTHS_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

// 'YYYY-MM' (ค.ศ.) → 'ส.ค. 2568' — ทุกอย่างที่ผู้ใช้เห็นเป็น พ.ศ.
const monthLabel = (key: string): string => {
  if (key === 'unknown') return 'ไม่ทราบวันที่';
  const [y, m] = key.split('-').map((n) => parseInt(n, 10));
  if (!y || !m) return key;
  return `${MONTHS_TH[m - 1] ?? ''} ${y + 543}`;
};

// วัน เดือน ปี พ.ศ. (2 หลัก) + เวลา — สัญญาณหลายครั้งเกิดในวันเดียวกันได้ เวลาจึงต้องมี
const fmtWhen = (iso?: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const yy = String((d.getFullYear() + 543) % 100).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${yy} ${hh}:${mm}`;
};

type FilterKey = 'all' | RedSignalOutcome | 'blocked';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'taken', label: 'ลงไม้แล้ว' },
  { key: 'skipped', label: 'ปล่อยผ่าน' },
  { key: 'pending', label: 'ยังไม่บันทึกผล' },
  { key: 'blocked', label: 'ตอนนั้นเข้าไม่ได้' },
];

export default function RedSignalsScreen() {
  const { isDesktop } = useResponsive();
  const [signals, setSignals] = useState<RedSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [noteTarget, setNoteTarget] = useState<RedSignal | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setSignals(await getRedSignals());
    } catch {
      // อ่านไม่ได้ — โชว์สถานะว่างพร้อมคำอธิบายด้านล่าง ดีกว่าจอเปล่า
      setSignals([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [loadData])
  );

  const stats = useMemo(() => summarizeRedSignals(signals), [signals]);
  const bySymbol = useMemo(() => summarizeBySymbol(signals), [signals]);

  const filtered = useMemo(
    () =>
      signals.filter((s) => {
        if (filter === 'all') return true;
        if (filter === 'blocked') return s.enterable === false;
        return s.outcome === filter;
      }),
    [signals, filter]
  );
  const months = useMemo(() => groupByMonth(filtered), [filtered]);

  // ── เปลี่ยนผล: กดปุ่มเดิมซ้ำ = ล้างกลับเป็น "ยังไม่บันทึกผล" ──
  // ต้องมีทางกลับ ไม่งั้นกดผิดแล้วประวัติผิดถาวร (และ "ทำตามสัญญาณกี่ %" จะเพี้ยนตามไปด้วย)
  const changeOutcome = async (s: RedSignal, outcome: RedSignalOutcome) => {
    const next: RedSignalOutcome = s.outcome === outcome ? 'pending' : outcome;
    const before = signals;
    setSignals((list) =>
      list.map((x) =>
        x.id === s.id
          ? {
              ...x,
              outcome: next,
              actedAt: next === 'pending' ? undefined : new Date().toISOString(),
            }
          : x
      )
    );
    try {
      await setRedSignalOutcome(s.id, next);
    } catch (e: any) {
      setSignals(before); // เขียนไม่ติด → จอต้องกลับไปตรงกับ DB
      await notify(e?.message || 'บันทึกไม่สำเร็จ', 'ข้อผิดพลาด');
    }
  };

  const saveNote = async () => {
    if (!noteTarget) return;
    setSaving(true);
    try {
      await setRedSignalNote(noteTarget.id, noteInput);
      const trimmed = noteInput.trim();
      setSignals((list) =>
        list.map((x) => (x.id === noteTarget.id ? { ...x, note: trimmed || undefined } : x))
      );
      setNoteTarget(null);
    } catch (e: any) {
      await notify(e?.message || 'บันทึกโน้ตไม่สำเร็จ', 'ข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const removeSignal = async (s: RedSignal) => {
    const ok = await confirmAsk(
      `ลบสัญญาณของ ${s.symbol || s.name} วันที่ ${fmtWhen(s.firedAt)} ออกจากประวัติ?\n` +
        'ประวัติที่ลบแล้วกู้กลับไม่ได้ (แต่ถ้าสตรีคยังอยู่ ระบบจะบันทึกใหม่ให้เองรอบหน้า)',
      'ลบบันทึกสัญญาณ'
    );
    if (!ok) return;
    try {
      await deleteRedSignal(s.id);
      setSignals((list) => list.filter((x) => x.id !== s.id));
    } catch (e: any) {
      await notify(e?.message || 'ลบไม่สำเร็จ', 'ข้อผิดพลาด');
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={isDesktop ? styles.cardGrid : undefined}>
        {/* ── สรุปรวม ── */}
        <View style={[styles.card, isDesktop && styles.cardGridItem]}>
          <Text style={styles.cardTitle}>
            <Ionicons name="stats-chart-outline" size={18} color={COLORS.primary} /> กฎแท่งแดงเตือนไปแล้วกี่ครั้ง
          </Text>
          <View style={styles.kpiRow}>
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>สัญญาณทั้งหมด</Text>
              <Text style={styles.kpiValue}>{stats.total}</Text>
            </View>
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>ลงไม้จริง</Text>
              <Text style={styles.kpiValue}>{stats.taken}</Text>
            </View>
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>ทำตามสัญญาณ</Text>
              {/* ยังไม่มีที่บันทึกผล = ขีด ไม่ใช่ 0% (0% อ่านว่า "ไม่เคยทำตามเลย" ซึ่งไม่จริง) */}
              <Text style={styles.kpiValue}>
                {stats.followRatePercent != null ? `${stats.followRatePercent.toFixed(0)}%` : '—'}
              </Text>
            </View>
          </View>
          <View style={styles.line}>
            <Text style={styles.lineLabel}>ปล่อยผ่าน / ยังไม่บันทึกผล</Text>
            <Text style={styles.lineValue}>
              {stats.skipped} / {stats.pending} ครั้ง
            </Text>
          </View>
          {/* ตัวเลขที่บอกว่าแผนตั้งไว้แคบเกินไปหรือเปล่า — สัญญาณมาแต่กฎของรอบไม่ให้ลง */}
          <View style={styles.line}>
            <Text style={styles.lineLabel}>ตอนนั้นเข้าไม่ได้ (ชนเพดานไม้ / หมดงบ)</Text>
            <Text style={[styles.lineValue, stats.blocked > 0 && { color: COLORS.error }]}>
              {stats.blocked} ครั้ง
            </Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.lineLabel}>ร่วงลึกสุดที่เคยเตือน</Text>
            <Text style={styles.lineValue}>
              {stats.deepestDropPercent != null ? `${stats.deepestDropPercent.toFixed(1)}%` : '—'}
            </Text>
          </View>
          {stats.firstFiredAt && (
            <Text style={styles.subText}>
              เก็บมาตั้งแต่ {fmtWhen(stats.firstFiredAt)} · ครั้งล่าสุด{' '}
              {fmtWhen(stats.lastFiredAt || undefined)}
            </Text>
          )}
          <Text style={styles.subText}>
            บันทึกให้เองตอนเปิดหน้าพอร์ตแล้วเจอตัวที่แดงครบรอบ — ช่วงที่ไม่ได้เปิดแอปเลยอาจมีสัญญาณ
            ที่ไม่ถูกบันทึก (แอปไม่มีตัวเช็คเบื้องหลัง)
          </Text>
        </View>

        {/* ── รายตัว: ตัวไหนกินกระสุนบ่อยสุด ── */}
        {bySymbol.length > 0 && (
          <View style={[styles.card, isDesktop && styles.cardGridItem]}>
            <Text style={styles.cardTitle}>
              <Ionicons name="list-outline" size={18} color={COLORS.primary} /> แยกตามตัว ({bySymbol.length})
            </Text>
            {bySymbol.map((r) => (
              <View key={r.key} style={styles.symbolRow}>
                <View style={[styles.symbolDot, { backgroundColor: assetColor(r.type as any) }]} />
                <Text style={styles.symbolName} numberOfLines={1}>
                  {r.symbol}
                </Text>
                <Text style={styles.symbolStat}>
                  เตือน {r.total} · ลง {r.taken}
                  {r.blocked > 0 ? ` · เข้าไม่ได้ ${r.blocked}` : ''}
                </Text>
                <Text style={styles.symbolDrop}>
                  {r.deepestDropPercent != null ? `${r.deepestDropPercent.toFixed(1)}%` : '—'}
                </Text>
              </View>
            ))}
            <Text style={styles.subText}>
              % ท้ายบรรทัด = ครั้งที่ร่วงลึกสุดของตัวนั้น (นับตลอดสตรีค) ไม่ใช่ราคาวันนี้
            </Text>
          </View>
        )}
      </View>

      {/* ── ตัวกรอง + รายการทั้งหมด ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          <Ionicons name="time-outline" size={18} color={COLORS.primary} /> ทุกครั้งที่เตือน
        </Text>
        <View style={styles.chipWrap}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.chip, filter === f.key && styles.chipOn]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {signals.length === 0 ? (
          /* จอว่างคือจอที่คนกลับมาดูซ้ำ ๆ ตอนยังไม่มีอะไรเกิด — น้องหมุดหลับรออยู่
             อ่านออกทันทีว่า "ระบบยังทำงาน แค่ยังไม่มีสัญญาณ" ไม่ใช่ "หน้านี้พัง" */
          <MascotEmpty>
              ยังไม่มีสัญญาณที่บันทึกไว้{'\n'}
              ระบบจะเก็บให้เองเมื่อเปิดหน้าพอร์ตแล้วมีตัวที่แดงติดกันครบรอบตามกฎที่ตั้งไว้{'\n'}
              ถ้าเพิ่งอัปเดตแอป ต้องเอา sql/red_signals.sql ไปรันที่ Supabase ก่อน 1 ครั้ง
          </MascotEmpty>
        ) : filtered.length === 0 ? (
          <Text style={styles.empty}>ไม่มีรายการในตัวกรองนี้</Text>
        ) : (
          months.map((m) => (
            <View key={m.month}>
              <View style={styles.monthHeader}>
                <Text style={styles.monthTitle}>{monthLabel(m.month)}</Text>
                <Text style={styles.monthSub}>
                  {m.items.length} ครั้ง · ลง {m.taken}
                </Text>
              </View>
              {m.items.map((s) => (
                <View key={s.id} style={styles.signalRow}>
                  <View style={styles.signalHead}>
                    <Text style={styles.signalSymbol} numberOfLines={1}>
                      {s.symbol || s.name}
                    </Text>
                    <Text style={styles.signalDrop}>{s.dropPercent.toFixed(2)}%</Text>
                    <Text
                      style={[
                        styles.outcomeTag,
                        s.outcome === 'taken' && styles.outcomeTagTaken,
                        s.outcome === 'skipped' && styles.outcomeTagSkipped,
                      ]}
                    >
                      {OUTCOME_LABELS[s.outcome]}
                    </Text>
                    <TouchableOpacity onPress={() => removeSignal(s)} style={styles.trashButton}>
                      <Ionicons name="trash-outline" size={14} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  {/* ข้อเท็จจริงของสัญญาณ: กฎที่ใช้ตอนนั้น + ราคาที่ลงไปแตะ + เวลา */}
                  <Text style={styles.signalFact}>
                    แดง {s.count} {redUnitLabel(s.interval)}ติดกัน (ครั้งที่ {s.roundNo} ของสตรีค · กฎทุก{' '}
                    {s.every} {redUnitLabel(s.interval)})
                    {s.lowPrice != null
                      ? ` · ต่ำสุด ${formatCurrencyWithType(s.lowPrice, s.lowCurrency || s.currency)}`
                      : ''}
                    {' · '}
                    {fmtWhen(s.firedAt)}
                  </Text>
                  {/* บริบทของแผนตอนนั้น — เก็บเป็น snapshot แผนเปลี่ยนทีหลังบรรทัดนี้ต้องไม่เปลี่ยน */}
                  {(s.cycleNo != null || s.planLegTHB != null) && (
                    <Text style={styles.signalFact}>
                      {s.cycleNo != null ? `รอบ ${s.cycleNo}` : 'ไม่อยู่ในรอบ'}
                      {s.planLegTHB != null
                        ? ` · เงินต่อไม้ตอนนั้น ${formatCurrency(s.planLegTHB)}`
                        : ''}
                    </Text>
                  )}
                  {/* เข้าได้/เข้าไม่ได้ — สามสถานะ ไม่ใช่สอง (ไม่อยู่ในรอบ = ไม่มีกฎมากั้น จึงไม่ขึ้นบรรทัดนี้) */}
                  {s.enterable === false && (
                    <Text style={styles.blockedText}>
                      <Ionicons name="close-circle-outline" size={12} color={COLORS.error} /> ตอนนั้นลงเพิ่มไม่ได้
                      {s.blockedReason ? ` — ${s.blockedReason}` : ''}
                    </Text>
                  )}
                  {s.enterable === true && (
                    <Text style={styles.okText}>
                      <Ionicons name="checkmark-circle-outline" size={12} color={COLORS.success} /> ตอนนั้นลงเพิ่มได้ตามแผน
                    </Text>
                  )}
                  {s.note ? <Text style={styles.noteText}>“{s.note}”</Text> : null}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.actionButton, s.outcome === 'taken' && styles.actionButtonOn]}
                      onPress={() => changeOutcome(s, 'taken')}
                    >
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={14}
                        color={s.outcome === 'taken' ? '#ffffff' : COLORS.primary}
                      />
                      <Text
                        style={[
                          styles.actionButtonText,
                          s.outcome === 'taken' && styles.actionButtonTextOn,
                        ]}
                      >
                        {' '}ลงไม้แล้ว
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, s.outcome === 'skipped' && styles.actionButtonOn]}
                      onPress={() => changeOutcome(s, 'skipped')}
                    >
                      <Ionicons
                        name="remove-circle-outline"
                        size={14}
                        color={s.outcome === 'skipped' ? '#ffffff' : COLORS.primary}
                      />
                      <Text
                        style={[
                          styles.actionButtonText,
                          s.outcome === 'skipped' && styles.actionButtonTextOn,
                        ]}
                      >
                        {' '}ปล่อยผ่าน
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => {
                        setNoteTarget(s);
                        setNoteInput(s.note || '');
                      }}
                    >
                      <Ionicons name="create-outline" size={14} color={COLORS.primary} />
                      <Text style={styles.actionButtonText}>{s.note ? ' แก้โน้ต' : ' โน้ต'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
        <Text style={styles.subText}>
          กดปุ่มเดิมซ้ำ = ล้างกลับเป็น "ยังไม่บันทึกผล" · การกดที่นี่ไม่แก้จำนวน/ต้นทุนของไม้
          ต้องไปแก้ที่การ์ดของไม้ในหน้าพอร์ตเอง
        </Text>
      </View>

      {/* ── โน้ต: เพราะอะไรจึงลง/ไม่ลง ── */}
      <Modal
        visible={!!noteTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setNoteTarget(null)}
      >
        <View style={styles.modalOverlay}>
          {/* การ์ดเป็น ScrollView + maxHeight 100% (CLAUDE.md §1.6) ไม่งั้นปุ่มบันทึกหลุดจอ */}
          <ScrollView style={styles.modalCard} contentContainerStyle={styles.modalCardContent}>
            <Text style={styles.modalTitle}>
              โน้ตของสัญญาณ {noteTarget?.symbol || noteTarget?.name}
            </Text>
            <Text style={styles.modalSub}>
              เพราะอะไรจึงลง/ไม่ลงครั้งนี้ — อ่านย้อนหลังแล้วจะรู้ว่าเป็นเหตุผลจริงหรือแค่กลัว
            </Text>
            <TextInput
              style={styles.modalInput}
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="เช่น กระสุนเหลือน้อย เก็บไว้รอไม้ที่ลึกกว่านี้"
              placeholderTextColor={COLORS.textSecondary}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setNoteTarget(null)}>
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveNote} disabled={saving}>
                <Text style={styles.modalSaveText}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingVertical: 16 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  // เดสก์ท็อปวางการ์ดสรุปเป็นกริด wrap — ไม่มี maxWidth (CLAUDE.md §1.3)
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
  cardTitle: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  kpiRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 4 },
  kpiCell: {
    flex: 1,
    minWidth: 0,
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
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 12,
  },
  lineLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  lineValue: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
    textAlign: 'right',
  },
  subText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.accent,
    marginTop: 6,
    lineHeight: 17,
  },
  empty: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginTop: 10,
  },
  // ── แยกตามตัว ──
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  symbolDot: { width: 8, height: 8, borderRadius: 4 },
  symbolName: {
    flexBasis: 84,
    flexGrow: 0,
    minWidth: 0,
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  symbolStat: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  symbolDrop: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.error,
    textAlign: 'right',
  },
  // ── ตัวกรอง ──
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: {
    borderRadius: RADIUS.sm,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
  },
  chipTextOn: { color: '#ffffff' },
  // ── เดือน ──
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 2,
  },
  monthTitle: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  monthSub: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  // ── หนึ่งสัญญาณ ──
  signalRow: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  signalHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  signalSymbol: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  signalDrop: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.error,
  },
  outcomeTag: {
    fontSize: 10,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.warning,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  outcomeTagTaken: { color: COLORS.success, borderColor: COLORS.success },
  outcomeTagSkipped: { color: COLORS.textSecondary },
  trashButton: { padding: 4 },
  signalFact: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 3,
    lineHeight: 17,
  },
  blockedText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.error,
    marginTop: 3,
  },
  okText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.success,
    marginTop: 3,
  },
  noteText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.primary,
    marginTop: 3,
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  actionButton: {
    borderRadius: RADIUS.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  actionButtonOn: { backgroundColor: COLORS.primary },
  actionButtonText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.primary,
  },
  actionButtonTextOn: { color: '#ffffff' },
  // ── โมดัลโน้ต ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: '100%',
    maxWidth: 460,
    maxHeight: '100%',
    flexGrow: 0,
  },
  modalCardContent: { padding: 16 },
  modalTitle: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  modalSub: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    padding: 10,
    marginTop: 12,
    minHeight: 80,
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
    textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modalCancel: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  modalCancelText: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
  },
  modalSave: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: COLORS.primary,
  },
  modalSaveText: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: '#ffffff',
  },
});
