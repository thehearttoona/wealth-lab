import React, { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { COLORS, FONTS, TEXT, RADIUS } from '../utils/constants';

/**
 * ชิ้นส่วนที่หน้าภาษีทั้งสามหน้าใช้ร่วมกัน (สรุปภาษี / เงินได้รายเดือน / ค่าลดหย่อน)
 *
 * แยกมาไว้ที่เดียวเพราะตอนแตกหน้าภาษีออกเป็นสามหน้า ช่องกรอกกับสไตล์ชุดนี้ถูกใช้ซ้ำทุกหน้า
 * ถ้าก๊อปไปหน้าละชุด แก้ระยะห่าง/ขนาดตัวอักษรทีเดียวจะหลุดไปหน้าใดหน้าหนึ่งเสมอ
 */

/** แปลง input เป็นตัวเลข — ผู้ใช้พิมพ์ comma มาได้ และช่องว่างต้องเป็น 0 ไม่ใช่ NaN */
export const num = (s: string): number => {
  const n = parseFloat((s || '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * ช่องกรอกตัวเลขที่เก็บ "ข้อความดิบ" ไว้ระหว่างพิมพ์ แล้วส่งค่าที่แปลงแล้วออกไปให้ฟอร์ม
 * ถ้าผูก value กับตัวเลขตรง ๆ (String(number)) ทุกคีย์จะถูก normalize ทับ:
 * พิมพ์ "1234." จุดจะหายทันที ทศนิยมจึงพิมพ์ไม่ได้ และลบจนว่างก็เด้งเป็น 0
 * พอ blur ค่อย sync กลับเป็นเลขมาตรฐาน (null = ไม่ได้กำลังพิมพ์ ให้ยึดค่าจาก props)
 */
export const NumberInput: React.FC<{
  /** ค่าที่จะโชว์ตอนไม่ได้พิมพ์ — ให้ผู้เรียกจัดรูปเอง (แต่ละช่องมีกฎ "ว่าง" ของตัวเอง) */
  display: string;
  onChangeNumber: (raw: string) => void;
  style?: any;
  placeholder?: string;
}> = ({ display, onChangeNumber, style, placeholder }) => {
  const [typing, setTyping] = useState<string | null>(null);
  return (
    <TextInput
      style={style}
      value={typing ?? display}
      onChangeText={(v) => {
        setTyping(v);
        onChangeNumber(v);
      }}
      onBlur={() => setTyping(null)}
      keyboardType="numeric"
      // ทุกช่องมีเลขเดิมอยู่แล้ว (ระบบเติมให้/ก๊อปลงมา) การแก้จึงเป็นการ "พิมพ์ทับ" เกือบทุกครั้ง
      selectTextOnFocus
      placeholder={placeholder ?? '0'}
      placeholderTextColor={COLORS.textSecondary}
    />
  );
};

const card = {
  backgroundColor: COLORS.surface,
  borderWidth: 1,
  borderColor: COLORS.border,
  borderRadius: 12,
};

/** สไตล์ที่หน้าเงินได้รายเดือน/ค่าลดหย่อนใช้ร่วมกัน (ชุดเดียวกับที่หน้าภาษีเดิมใช้) */
export const taxStyles = StyleSheet.create({
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
    backgroundColor: `${COLORS.warning}12`,
    borderWidth: 1,
    borderColor: `${COLORS.warning}40`,
    borderRadius: 10,
    padding: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  card: { ...card, padding: 16 },
  // แถบบอกว่ากำลังแก้ปีไหนอยู่ — หน้าลูกไม่มีตัวเลือกปี (ปีเป็นของหน้าสรุป) จึงต้องเขียนไว้ให้ชัด
  yearBar: { ...TEXT.caption, color: COLORS.textSecondary, marginBottom: 12, lineHeight: 18 },

  fillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    marginTop: 16,
    marginBottom: 4,
  },
  fillBtnText: { ...TEXT.caption, color: COLORS.primary, fontFamily: FONTS.medium },

  // ── การ์ด "สูตรลดหย่อนให้ภาษีเป็น 0" (หน้าค่าลดหย่อน) ──
  // เป็นการ์ดจำลองอย่างเดียว ไม่ได้เขียนยอดลงช่องกรอก จึงต้องดูต่างจากการ์ดที่กรอกได้ชัดเจน
  // (พื้นเทาอ่อน + เส้นขอบสีหลัก) ไม่งั้นผู้ใช้จะนึกว่ายอดในแผนถูกบันทึกไปแล้ว
  planCard: {
    borderWidth: 1,
    borderColor: `${COLORS.primary}40`,
    backgroundColor: `${COLORS.primary}08`,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  planHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  planHeadInfo: { flex: 1, minWidth: 0 },
  planTitle: { ...TEXT.subtitle, color: COLORS.primary },
  planBig: { ...TEXT.title, color: COLORS.text, marginTop: 4 },
  planSub: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 3, lineHeight: 17 },
  planBody: { marginTop: 12, borderTopWidth: 1, borderTopColor: `${COLORS.primary}25`, paddingTop: 10 },
  planKindTitle: { ...TEXT.label, color: COLORS.text, marginTop: 12 },
  planKindNote: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 1 },
  planStepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8 },
  planStepIdx: {
    ...TEXT.hint,
    color: '#ffffff',
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    width: 18,
    height: 18,
    lineHeight: 18,
    textAlign: 'center',
    overflow: 'hidden',
  },
  // flex + minWidth:0 คู่กันบังคับ — เหตุผลยาว ๆ จะดันคอลัมน์ยอดล้นการ์ดบนเว็บ
  planStepMain: { flex: 1, minWidth: 0 },
  planStepLabel: { ...TEXT.body, color: COLORS.text },
  planStepReason: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },
  planStepRight: { alignItems: 'flex-end', width: 116 },
  planStepAmount: { ...TEXT.label, color: COLORS.text },
  planStepSaved: { ...TEXT.hint, color: COLORS.success, marginTop: 2, textAlign: 'right', lineHeight: 15 },
  planMilestone: {
    ...TEXT.hint,
    color: COLORS.primary,
    backgroundColor: `${COLORS.primary}12`,
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
    lineHeight: 17,
  },
  // ── กล่อง "จุดคุ้มสุด" แบบสองแถวเทียบกัน ──
  // เดิมเป็นประโยคเดียวยาว ๆ ที่มีตัวเลข 5 ตัวปนกัน จนอ่านไม่ออกว่ากำลังเทียบอะไรกับอะไร
  // สองแถวหน้าตาเหมือนกัน + % ชิดขวาตรงกัน ทำให้ "คุ้ม 20% vs คุ้ม 5%" อ่านออกในแวบเดียว
  planMilestoneBox: {
    backgroundColor: `${COLORS.primary}12`,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  planMilestoneTitle: { ...TEXT.label, color: COLORS.primary },
  planMilestoneRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 6,
  },
  // flex + minWidth:0 คู่กันบังคับ — ข้อความยาวจะดัน % หลุดขอบกล่องบนเว็บ
  planMilestoneLabel: { ...TEXT.hint, color: COLORS.text, flex: 1, minWidth: 0, lineHeight: 17 },
  planMilestoneRate: { ...TEXT.hint, fontFamily: FONTS.semibold, color: COLORS.success },
  // ขั้นท้ายที่ลากลงมาถึง 0 คุ้มน้อยสุด — ต้องเห็นด้วยสีว่ามันไม่เหมือนแถวบน
  planMilestoneRateWeak: { ...TEXT.hint, fontFamily: FONTS.semibold, color: COLORS.warning },
  planNote: { ...TEXT.hint, color: COLORS.warning, marginTop: 8, lineHeight: 17 },
  planFoot: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 12, lineHeight: 17 },
  planChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  planChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  planChipOff: { backgroundColor: COLORS.divider, borderColor: COLORS.border },
  planChipText: { ...TEXT.hint, color: COLORS.text },
  planChipTextOff: { ...TEXT.hint, color: COLORS.textSecondary },

  // ── ตารางรายเดือน ──
  tableTitle: { ...TEXT.subtitle, color: COLORS.text, marginTop: 16 },
  tableHint: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 4, lineHeight: 16 },
  mRowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  mHeadCell: { ...TEXT.hint, color: COLORS.textSecondary },
  mRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  // มือถือ: เดือนอยู่บรรทัดบน ช่องกรอกลงมาเป็น 2×2 — 4 ช่องเรียงแถวเดียวบนจอ 350px แคบเกินกรอกไม่ได้
  mRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    paddingBottom: 10,
  },
  mMonthLabel: { ...TEXT.label, color: COLORS.text },
  mMonthCell: { width: 44 },
  mFields: { flexDirection: 'row', gap: 8, flex: 1, minWidth: 0 },
  mFieldsMobile: { flexWrap: 'wrap', marginTop: 6 },
  // flex + minWidth:0 คู่กันบังคับ — <input> บนเว็บมี intrinsic width ~20 ตัวอักษร ถ้าไม่ใส่จะล้นแถว
  mInputCell: { flex: 1, minWidth: 0 },
  mInputCellMobile: { flexBasis: '46%', flexGrow: 1 },
  mMiniLabel: { ...TEXT.hint, color: COLORS.textSecondary, marginBottom: 3 },
  mInput: {
    ...TEXT.caption,
    minWidth: 0,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  mCopyCell: { width: 30 },
  // ปุ่มคัดลอกค่าลงเดือนถัดไป — ไอคอนเปล่า ๆ ในตารางไม่มีอะไรบอกว่ากดได้ จึงตีกรอบให้
  mCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
  },
  mCopyText: { ...TEXT.hint, color: COLORS.primary },
  // คอลัมน์ "รับจริง" ท้ายแถว — ความกว้างตายตัวเพื่อให้ตัวเลขทุกแถวชิดขวาตรงกัน
  mNetCol: { width: 104 },
  mNetPlaceholder: { color: COLORS.textSecondary, textAlign: 'center' },
  mTotalRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  mTotalLabel: { ...TEXT.label, color: COLORS.text },
  mTotalValue: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 3, lineHeight: 17 },

  // ── รายการค่าลดหย่อน ──
  deductGroupTitle: { ...TEXT.label, color: COLORS.text, marginTop: 16 },
  deductGroupCap: { ...TEXT.hint, color: COLORS.warning, marginTop: 2 },
  deductRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  // flex + minWidth:0 คู่กันบังคับ — ไม่งั้นข้อความยาว ๆ ดันช่องกรอกล้นออกนอกการ์ด
  deductInfo: { flex: 1, minWidth: 0 },
  deductLabel: { ...TEXT.body, color: COLORS.text },
  deductNote: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },
  deductCap: { ...TEXT.hint, color: COLORS.primary, marginTop: 2 },
  deductInput: { width: 120, marginTop: 0 },
  eligBadge: { ...TEXT.hint, marginTop: 3, lineHeight: 16 },
  eligOk: { color: COLORS.success },
  eligNo: { color: COLORS.textSecondary },
  // ปุ่ม "เงื่อนไขการใช้สิทธิ์" — เดิมเป็นตัวหนังสือสีหลักเปล่า ๆ กลืนไปกับคำอธิบายรอบตัว
  condToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
  },
  condToggleText: { ...TEXT.hint, color: COLORS.primary, fontFamily: FONTS.medium },
  condText: { ...TEXT.hint, color: COLORS.textSecondary, lineHeight: 17, marginTop: 4 },
  capWarnBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
  },
  capWarnTitle: { ...TEXT.label, color: COLORS.warning },
  capWarnText: { ...TEXT.hint, color: COLORS.text, marginTop: 4, lineHeight: 16 },

  // ── ประตูเมื่อยังไม่มีข้อมูลส่วนตัว ──
  lockBox: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    marginTop: 4,
  },
  lockTitle: { ...TEXT.subtitle, color: COLORS.text, marginTop: 8 },
  lockText: {
    ...TEXT.hint,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 6,
  },
  lockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 18,
    marginTop: 14,
  },
  lockBtnText: { ...TEXT.caption, color: '#ffffff', fontFamily: FONTS.medium },
  lockKeepNote: { ...TEXT.hint, color: COLORS.warning, lineHeight: 17, marginTop: 12 },

  // ── ข้อเท็จจริงของปีภาษี (คำถามใช่/ไม่ใช่) ──
  factTitle: { ...TEXT.label, color: COLORS.text, marginTop: 16 },
  factCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
  },
  factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  factRowBorder: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.divider },
  // flex + minWidth:0 คู่กันบังคับ — ไม่งั้นคำอธิบายยาวดันปุ่มใช่/ไม่ ล้นการ์ดบนเว็บ
  factInfo: { flex: 1, minWidth: 0 },
  factLabel: { ...TEXT.body, color: COLORS.text },
  factHint: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },
  factFoot: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 10, lineHeight: 16 },
  yesNo: { flexDirection: 'row', gap: 6 },
  factChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  factChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  factChipText: { ...TEXT.caption, color: COLORS.textSecondary },
  factChipTextActive: { color: '#ffffff', fontFamily: FONTS.medium },

  field: { marginTop: 14 },
  fieldLabel: { ...TEXT.label, color: COLORS.textSecondary, marginBottom: 6 },
  fieldHint: { ...TEXT.hint, color: COLORS.textSecondary, marginTop: 4, lineHeight: 16 },
  input: {
    ...TEXT.body,
    minWidth: 0,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  // ช่อง "จำนวนคน" — แคบและจัดกลาง เพราะรับเลขหลักเดียวเป็นส่วนใหญ่
  countInput: { width: 76, textAlign: 'center' },

  calcBox: {
    marginTop: 18,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
  },
  calcLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
  calcLineLabel: { ...TEXT.caption, color: COLORS.textSecondary, flex: 1 },
  calcLineValue: { ...TEXT.caption, fontFamily: FONTS.medium, color: COLORS.text },
  calcTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  calcTotalLabel: { ...TEXT.subtitle, color: COLORS.text },
  calcTotalValue: { ...TEXT.subtitle, fontFamily: FONTS.semibold, color: COLORS.primary },

  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 18,
  },
  saveBtnText: { ...TEXT.subtitle, fontFamily: FONTS.semibold, color: '#ffffff' },
});
