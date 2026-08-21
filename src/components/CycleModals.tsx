import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TEXT, formatCurrency, formatCurrencyWithType } from '../utils/constants';
import { ActionButton } from './ActionButton';
import { InvestmentCycle, basketLabel } from '../types/cycle';

// ── Modal ของระบบรอบ ──
// การ์ดทุกใบเป็น ScrollView + maxHeight 100% + flexGrow 0 (กฎ §1.6):
// body ของเว็บตั้ง overflow:hidden ไว้ ถ้าการ์ดสูงเกินจอ ปุ่มยืนยันจะหลุดออกไปกดไม่ได้เลย
// TextInput ทุกตัววางเป็นบล็อกเต็มความกว้าง ไม่อยู่ใน flex row — เลี่ยงกฎ minWidth:0 (§1.4) ไปเลย

export interface CloseCycleRow {
  id: string;
  symbol: string;
  name: string;
  currency: string;
  quantity: number;
  /** ราคาที่จะใช้ขาย (สกุลของไม้) — null = ไม่มีราคาปัจจุบัน ห้ามขายด้วยราคาที่เดาเอง */
  priceNative: number | null;
  costTHB: number;
  proceedsTHB: number;
  pnlTHB: number;
}

export const CycleSettingsModal: React.FC<{
  visible: boolean;
  cycle: InvestmentCycle | null;
  targetInput: string;
  budgetInput: string;
  maxLegsInput: string;
  onChangeTarget: (v: string) => void;
  onChangeBudget: (v: string) => void;
  onChangeMaxLegs: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}> = ({
  visible,
  cycle,
  targetInput,
  budgetInput,
  maxLegsInput,
  onChangeTarget,
  onChangeBudget,
  onChangeMaxLegs,
  onSave,
  onCancel,
  onDelete,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.overlay}>
      <ScrollView
        style={styles.card}
        contentContainerStyle={styles.cardContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.modalTitle}>
          <Ionicons name="options-outline" size={18} color={COLORS.primary} /> ตั้งค่ารอบ
          {cycle ? ` ${cycle.cycleNo} · ${basketLabel(cycle.basket)}` : ''}
        </Text>

        <Text style={styles.label}>เป้ากำไรรวมของรอบ (%)</Text>
        <TextInput
          style={styles.input}
          value={targetInput}
          onChangeText={onChangeTarget}
          keyboardType="numeric"
          placeholder="เช่น 15"
          placeholderTextColor={COLORS.textSecondary}
        />
        <Text style={styles.hint}>
          คิดบน "ต้นทุนที่ลงในรอบนี้" ไม่ใช่มูลค่าพอร์ต — เติมไม้แล้วเป้าจึงไม่ขยับเอง
        </Text>

        <Text style={styles.label}>งบสูงสุดของรอบ (บาท)</Text>
        <TextInput
          style={styles.input}
          value={budgetInput}
          onChangeText={onChangeBudget}
          keyboardType="numeric"
          placeholder="เช่น 150000"
          placeholderTextColor={COLORS.textSecondary}
        />
        <Text style={styles.hint}>
          ตัวเลขที่สำคัญที่สุดของกลยุทธ์นี้ — กริดไม่ตายเพราะต้นทุนเฉลี่ยไม่ลง
          มันตายเพราะกระสุนหมดตอนติดลบมากสุด เว้นว่าง = ไม่จำกัด (ไม่แนะนำ)
        </Text>

        <Text style={styles.label}>เพดานจำนวนไม้ต่อสินทรัพย์</Text>
        <TextInput
          style={styles.input}
          value={maxLegsInput}
          onChangeText={onChangeMaxLegs}
          keyboardType="numeric"
          placeholder="เช่น 8"
          placeholderTextColor={COLORS.textSecondary}
        />
        <Text style={styles.hint}>
          ลง 6 ไม้บนของที่ร่วงจาก 100 → 50 ต้องเด้ง 56% เพื่อให้ตะกร้า +10% · เว้นว่าง = ไม่จำกัด
        </Text>

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.btnGhost} onPress={onCancel}>
            <Text style={styles.btnGhostText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={onSave}>
            <Text style={styles.btnPrimaryText}>บันทึก</Text>
          </TouchableOpacity>
        </View>

        {/* ลบรอบ = เปิดผิดตะกร้า/ผิดค่า ไม่ใช่ "ปิดรอบ" — ไม้ที่ผูกไว้จะถูกถอนออกให้ ไม่ถูกขาย */}
        <ActionButton
          label="ลบรอบนี้ (ไม้ทุกตัวถูกถอนออกจากตะกร้า ไม่มีการขาย)"
          icon="trash-outline"
          variant="danger"
          size="sm"
          onPress={onDelete}
          style={styles.deleteRow}
        />
      </ScrollView>
    </View>
  </Modal>
);

export const CloseCycleModal: React.FC<{
  visible: boolean;
  cycle: InvestmentCycle | null;
  rows: CloseCycleRow[];
  selectedIds: string[];
  onToggleRow: (id: string) => void;
  feesInput: string;
  onChangeFees: (v: string) => void;
  toPowder: boolean;
  onToggleToPowder: () => void;
  /** ภาษีประมาณการจากกำไรที่จะรับรู้รอบนี้ — null = คิดไม่ได้ (ยังไม่ได้ตั้งค่าหน้าภาษี) */
  taxTHB: number | null;
  taxNote?: string;
  /** เดือนนี้ใกล้สิ้นปีภาษี — เตือนเรื่องกระจุกกำไรปีเดียว */
  showTaxYearHint: boolean;
  busy: boolean;
  progress: { done: number; total: number; failed: { symbol: string; message: string }[] } | null;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  visible,
  cycle,
  rows,
  selectedIds,
  onToggleRow,
  feesInput,
  onChangeFees,
  toPowder,
  onToggleToPowder,
  taxTHB,
  taxNote,
  showTaxYearHint,
  busy,
  progress,
  onConfirm,
  onCancel,
}) => {
  const picked = rows.filter((r) => selectedIds.includes(r.id));
  const cost = picked.reduce((s, r) => s + r.costTHB, 0);
  const proceeds = picked.reduce((s, r) => s + r.proceedsTHB, 0);
  const fees = parseFloat((feesInput || '').replace(/,/g, '')) || 0;
  const pnl = proceeds - cost - fees;
  const pnlPercent = cost > 0 ? (pnl / cost) * 100 : null;
  const closesWholeCycle = picked.length === rows.length && rows.length > 0;
  const unpriced = rows.filter((r) => r.priceNative == null);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <ScrollView
          style={styles.card}
          contentContainerStyle={styles.cardContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.modalTitle}>
            <Ionicons name="albums-outline" size={18} color={COLORS.primary} /> ปิดรอบ
            {cycle ? ` ${cycle.cycleNo} · ${basketLabel(cycle.basket)}` : ''}
          </Text>
          <Text style={styles.hint}>
            ราคาที่ใช้ = ราคาปัจจุบันที่ดึงมาล่าสุด · อยากกำหนดราคาขายเอง ให้กดปุ่ม "ขาย"
            ที่การ์ดของไม้นั้นแทน
          </Text>

          {rows.map((r) => {
            const on = selectedIds.includes(r.id);
            const disabled = r.priceNative == null;
            return (
              <TouchableOpacity
                key={r.id}
                style={styles.legRow}
                onPress={() => !disabled && onToggleRow(r.id)}
                disabled={disabled || busy}
              >
                <Ionicons
                  name={on ? 'checkbox-outline' : 'square-outline'}
                  size={18}
                  color={disabled ? COLORS.textSecondary : COLORS.primary}
                />
                <View style={styles.legInfo}>
                  <Text style={styles.legName} numberOfLines={1}>
                    {r.symbol || r.name}{' '}
                    <Text style={styles.hint}>
                      {r.quantity} หน่วย
                      {r.priceNative != null
                        ? ` @ ${formatCurrencyWithType(r.priceNative, r.currency)}`
                        : ''}
                    </Text>
                  </Text>
                  {disabled && (
                    <Text style={styles.warn}>
                      ไม่มีราคาปัจจุบัน — ขายเองที่การ์ดของไม้นี้ (ปิดรอบนี้จะไม่รวมมัน)
                    </Text>
                  )}
                </View>
                <Text
                  style={[styles.legPnl, { color: r.pnlTHB >= 0 ? COLORS.success : COLORS.error }]}
                >
                  {r.pnlTHB >= 0 ? '+' : '−'}฿{formatCurrency(Math.abs(r.pnlTHB))}
                </Text>
              </TouchableOpacity>
            );
          })}

          <Text style={styles.label}>ค่าธรรมเนียมขายรวม (บาท, ไม่บังคับ)</Text>
          <TextInput
            style={styles.input}
            value={feesInput}
            onChangeText={onChangeFees}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={COLORS.textSecondary}
            editable={!busy}
          />
          <Text style={styles.hint}>ปันให้แต่ละไม้ตามสัดส่วนเงินที่ได้รับ</Text>

          <View style={styles.summaryBox}>
            <Text style={styles.summaryLine}>
              ขาย {picked.length} ไม้ · ได้ ฿{formatCurrency(proceeds)}
            </Text>
            <Text
              style={[styles.summaryStrong, { color: pnl >= 0 ? COLORS.success : COLORS.error }]}
            >
              กำไรรวม {pnl >= 0 ? '+' : '−'}฿{formatCurrency(Math.abs(pnl))}
              {pnlPercent != null ? ` (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)` : ''}
            </Text>
            {taxTHB != null && (
              <Text style={styles.summaryLine}>
                ภาษีประมาณ ฿{formatCurrency(taxTHB)}
                {taxNote ? ` · ${taxNote}` : ''} · เข้ากระเป๋า ฿{formatCurrency(pnl - taxTHB)}
              </Text>
            )}
            {taxTHB == null && (
              <Text style={styles.hint}>
                ยังคิดภาษีให้ไม่ได้ — ตั้งเงินเดือน/กฎกำไรที่หน้า "ภาษี" ก่อน
              </Text>
            )}
          </View>

          {showTaxYearHint && pnl > 0 && (
            <Text style={styles.warn}>
              ใกล้สิ้นปีภาษีแล้ว — ปิดทั้งก้อนปีนี้ทำให้กำไรกระจุกในปีเดียวและพาดขั้นบันไดที่สูงกว่า
              ถ้าอยากแบ่ง ให้ติ๊กเอาบางไม้ออกแล้วปิดที่เหลือเดือนมกราคม
            </Text>
          )}

          <TouchableOpacity style={styles.checkRow} onPress={onToggleToPowder} disabled={busy}>
            <Ionicons
              name={toPowder ? 'checkbox-outline' : 'square-outline'}
              size={18}
              color={COLORS.primary}
            />
            <Text style={styles.checkText}> เงินที่ได้เข้า "เงินรอลงทุน" เพื่อเริ่มรอบถัดไป</Text>
          </TouchableOpacity>

          {!closesWholeCycle && picked.length > 0 && (
            <Text style={styles.hint}>
              เลือกไม่ครบทุกไม้ → ขายเฉพาะที่เลือก รอบยังเปิดอยู่ กดปิดรอบต่อได้ทีหลัง
            </Text>
          )}
          {unpriced.length > 0 && (
            <Text style={styles.hint}>
              มี {unpriced.length} ไม้ที่ไม่มีราคาปัจจุบัน จึงปิดรอบให้ครบไม่ได้ในครั้งนี้
            </Text>
          )}

          {/* ปิดกลางทางไม่พัง: รอบยังเปิดจนไม้หมดตะกร้า กดปิดรอบอีกครั้งก็ขายที่เหลือต่อ */}
          {progress && (
            <View style={styles.progressBox}>
              <Text style={styles.summaryLine}>
                ขายแล้ว {progress.done}/{progress.total} ไม้
              </Text>
              {progress.failed.map((f) => (
                <Text key={f.symbol} style={styles.warn}>
                  {f.symbol}: {f.message}
                </Text>
              ))}
              {progress.failed.length > 0 && (
                <Text style={styles.hint}>
                  ที่ขายไปแล้วถูกบันทึกเรียบร้อย — กด "ปิดรอบ" อีกครั้งเพื่อขายส่วนที่เหลือ
                </Text>
              )}
            </View>
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.btnGhost} onPress={onCancel} disabled={busy}>
              <Text style={styles.btnGhostText}>{busy ? 'กำลังทำงาน…' : 'ยกเลิก'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, (busy || picked.length === 0) && styles.btnDisabled]}
              onPress={onConfirm}
              disabled={busy || picked.length === 0}
            >
              {busy ? (
                <ActivityIndicator size="small" color={COLORS.surface} />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {closesWholeCycle ? `ปิดรอบ (${picked.length} ไม้)` : `ขาย ${picked.length} ไม้`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(23,32,51,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  // การ์ด overlay เป็นที่เดียวที่จำกัดความกว้างได้ (กฎ §1.3 ห้ามจำกัดความกว้างของหน้าจอ)
  card: { width: '100%', maxWidth: 480, maxHeight: '100%', flexGrow: 0, backgroundColor: COLORS.surface, borderRadius: 14 },
  cardContent: { padding: 20 },
  modalTitle: { ...TEXT.title, color: COLORS.text, marginBottom: 8 },
  label: { ...TEXT.label, color: COLORS.text, marginTop: 14 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
    ...TEXT.body,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  hint: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 4 },
  warn: { ...TEXT.caption, color: COLORS.warning, marginTop: 4 },
  legRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  legInfo: { flex: 1, minWidth: 0 },
  legName: { ...TEXT.body, color: COLORS.text },
  legPnl: { ...TEXT.label },
  summaryBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryLine: { ...TEXT.body, color: COLORS.text },
  summaryStrong: { ...TEXT.subtitle, marginTop: 2 },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  checkText: { ...TEXT.body, color: COLORS.text, flex: 1, minWidth: 0 },
  progressBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: COLORS.divider,
  },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btnGhost: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  btnGhostText: { ...TEXT.label, color: COLORS.textSecondary },
  btnPrimary: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  btnPrimaryText: { ...TEXT.label, color: COLORS.surface },
  btnDisabled: { opacity: 0.5 },
  deleteRow: { alignSelf: 'stretch', marginTop: 16 },
});
