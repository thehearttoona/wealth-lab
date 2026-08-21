import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../utils/constants';

/**
 * บรรทัดเมนู "ตัวเลขล่าสุด + ทางเข้า" — ใช้ร่วมกันระหว่างหน้าพอร์ตกับหน้ารอบลงทุน
 *
 * เดิมอยู่ในตัว PortfolioScreen ใบเดียว พอหน้ารอบลงทุนต้องมีทางเข้า "ผลงานที่ขายแล้ว"
 * ก็ต้องใช้หน้าตาเดียวกัน ไม่งั้นแถวเดียวกันสองหน้าจะดูคนละระบบ
 *
 * ⚠️ ต้องอยู่นอก render ของจอเสมอ — คอมโพเนนต์ที่ประกาศในตัว render เป็น "ชนิดใหม่"
 * ทุกครั้งที่ state ขยับ React จึง unmount/mount ทั้งซับทรี (ดู CLAUDE.md §1.13)
 */
export const MenuRow: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  /** บรรทัดอธิบายใต้ชื่อ — ไม่ส่งมา = ไม่ขึ้นบรรทัดนี้เลย (บางแถวชื่อ + ตัวเลขก็ครบแล้ว) */
  sub?: string;
  /** บรรทัดเล็กใต้ตัวเลข — ต้องแยกจาก value เพราะขึ้นบรรทัดใน string เดียวกัน
   *  จะได้ขนาดตัวอักษรเท่ากันทั้งคู่ ทั้งที่บรรทัดล่างเป็นแค่ของขยาย */
  valueSub?: string;
  valueNegative?: boolean;
  /** สีประจำเรื่องของแถวนี้ — วงไอคอนใช้สีนี้ ไล่ดูเมนูแล้วแยกออกก่อนอ่านตัวหนังสือ */
  tone?: string;
  /** แถวบนสุดของการ์ด — เส้นคั่นเป็น "ขอบบน" ของทุกแถวยกเว้นแถวแรก
   *  (ใช้ขอบล่างไม่ได้ เพราะแถวสุดท้ายเป็นแถวที่ซ่อนได้ตามเงื่อนไข แล้วจะเหลือเส้นซ้อนขอบการ์ด) */
  first?: boolean;
  onPress: () => void;
}> = ({ icon, title, value, sub, valueSub, valueNegative, tone, first, onPress }) => {
  const color = tone || COLORS.primary;
  return (
    <TouchableOpacity
      style={[menuStyles.menuRow, first && menuStyles.menuRowFirst]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title} ${value}`}
    >
      <View style={[menuStyles.menuRowIcon, { backgroundColor: `${color}16` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={menuStyles.menuRowMain}>
        <Text style={menuStyles.menuRowTitle}>{title}</Text>
        {!!sub && <Text style={menuStyles.menuRowSub} numberOfLines={2}>{sub}</Text>}
      </View>
      <View style={menuStyles.menuRowValueBox}>
        <Text style={[menuStyles.menuRowValue, valueNegative && menuStyles.menuRowValueNeg]}>
          {value}
        </Text>
        {!!valueSub && <Text style={menuStyles.menuRowValueSub}>{valueSub}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
    </TouchableOpacity>
  );
};

/** กรอบการ์ดของกลุ่มเมนู — หน้าที่เอาไปใช้ต่อทับ margin/flex เองได้ */
export const MenuCard: React.FC<{ style?: StyleProp<ViewStyle>; children: React.ReactNode }> = ({
  style,
  children,
}) => <View style={[menuStyles.menuCard, style]}>{children}</View>;

const menuStyles = StyleSheet.create({
  menuCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  menuRowFirst: {
    borderTopWidth: 0,
  },
  // วงไอคอนสีประจำเรื่อง — สีพื้นถูกส่งมาจาก tone จึงไม่ตั้งไว้ตรงนี้
  menuRowIcon: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // minWidth: 0 เพื่อให้บรรทัดขยายความยาว ๆ ตัดคำแทนที่จะดันตัวเลขทางขวาหลุดขอบ
  menuRowMain: {
    flex: 1,
    minWidth: 0,
  },
  menuRowTitle: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  menuRowSub: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  // ตัวเลขหลัก + บรรทัดขยายเล็ก ๆ ใต้มัน — ชิดขวาทั้งคู่ให้หลักตัวเลขตรงกันทุกแถว
  menuRowValueBox: {
    alignItems: 'flex-end',
  },
  menuRowValue: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
    textAlign: 'right',
  },
  menuRowValueSub: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    textAlign: 'right',
    marginTop: 1,
  },
  menuRowValueNeg: {
    color: COLORS.error,
  },
});
