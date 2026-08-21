// ── ปุ่มมาตรฐานของแอป ──
// มีไว้แก้ปัญหาเดียว: เดิมหลายจอเขียน "สิ่งที่กดได้" เป็น Text เปล่า ๆ ห่อ TouchableOpacity
// (เช่น "ยกเลิก" · "แก้ยอด" · "เลือกทั้งหมด" · "ดูรายรอบ") วางอยู่การ์ดเดียวกับปุ่มพื้นทึบ
// ผู้ใช้จึงแยกไม่ออกว่าอันไหนกดได้ — ตัวหนังสือสีน้ำเงินบนเว็บที่ไม่มี hover/underline อ่านเป็นป้ายเฉย ๆ
//
// กฎการใช้:
//   primary   = การกระทำหลักของการ์ด/โมดัล (พื้นทึบสีหลัก) มีได้ใบเดียวต่อกลุ่ม
//   secondary = การกระทำรองที่ปลอดภัย (ขอบเทา พื้นขาว) — แก้ไข ดูเพิ่ม เติมค่า
//   danger    = ลบ/ถอนออก (ขอบแดง พื้นขาว) ไม่ใช้พื้นแดงทึบเพราะไม่ใช่ปุ่มหลัก
//   quiet     = ยกเลิก/ปิด (พื้นเทาอ่อน) ให้เห็นว่าเป็นปุ่มแต่ไม่ดึงสายตาไปจาก primary
//   onDark    = ปุ่มที่วางบนแถบสีเข้ม (หัวพอร์ต) — ขอบขาวโปร่ง
//
// ⚠️ ห้ามใส่ fontWeight (ดู FONTS ใน utils/constants.ts) น้ำหนักมาจากชื่อไฟล์ฟอนต์เท่านั้น
import React from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '../utils/constants';

export type ActionVariant = 'primary' | 'secondary' | 'danger' | 'quiet' | 'onDark';
export type ActionSize = 'sm' | 'md';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface ActionButtonProps {
  /** ข้อความบนปุ่ม — ไม่ใส่ = ปุ่มไอคอนล้วน (จะกลายเป็นสี่เหลี่ยมจัตุรัสให้เอง) */
  label?: string;
  icon?: IconName;
  /** ไอคอนท้ายปุ่ม เช่น chevron-forward สำหรับปุ่มที่พาไปหน้าอื่น */
  iconRight?: IconName;
  onPress: () => void;
  variant?: ActionVariant;
  size?: ActionSize;
  disabled?: boolean;
  /** เต็มความกว้างของพ่อ — ใช้กับปุ่มบันทึกท้ายฟอร์ม */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const PALETTE: Record<
  ActionVariant,
  { bg: string; border: string; fg: string }
> = {
  primary: { bg: COLORS.primary, border: COLORS.primary, fg: '#ffffff' },
  secondary: { bg: COLORS.surface, border: COLORS.border, fg: COLORS.primary },
  danger: { bg: COLORS.surface, border: `${COLORS.error}66`, fg: COLORS.error },
  quiet: { bg: COLORS.divider, border: COLORS.border, fg: COLORS.textSecondary },
  onDark: { bg: 'rgba(255,255,255,0.16)', border: 'rgba(255,255,255,0.4)', fg: '#ffffff' },
};

const METRIC: Record<
  ActionSize,
  { padV: number; padH: number; gap: number; radius: number; font: number; icon: number }
> = {
  sm: { padV: 6, padH: 10, gap: 5, radius: RADIUS.sm, font: 12, icon: 13 },
  md: { padV: 10, padH: 14, gap: 6, radius: RADIUS.md, font: 13, icon: 15 },
};

export const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  icon,
  iconRight,
  onPress,
  variant = 'secondary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  style,
  textStyle,
}) => {
  const c = PALETTE[variant];
  const m = METRIC[size];
  const iconOnly = !label;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.base,
        {
          backgroundColor: c.bg,
          borderColor: c.border,
          borderRadius: m.radius,
          paddingVertical: m.padV,
          paddingHorizontal: iconOnly ? m.padV : m.padH,
          gap: m.gap,
        },
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={m.icon} color={c.fg} /> : null}
      {label ? (
        <Text style={[styles.label, { color: c.fg, fontSize: m.font }, textStyle]}>{label}</Text>
      ) : null}
      {iconRight ? <Ionicons name={iconRight} size={m.icon} color={c.fg} /> : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  fullWidth: { alignSelf: 'stretch' },
  // จางลงแต่ยังเห็นว่าเป็นปุ่ม — ปุ่มที่หายไปเลยอ่านเป็นแอปเสีย (เหตุผลเดียวกับ canAddLeg ใน utils/cycles.ts)
  disabled: { opacity: 0.45 },
  // flexShrink สำคัญบนเว็บ: ปุ่มที่ยืดเต็มแถวแล้วข้อความยาว ถ้าไม่ยอมหด ตัวหนังสือจะล้นออกนอกกรอบ
  label: { fontFamily: FONTS.medium, textAlign: 'center', flexShrink: 1 },
});

export default ActionButton;
