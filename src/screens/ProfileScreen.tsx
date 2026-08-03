import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useAuth } from '../hooks/useAuth';
import { COLORS, FONTS, TEXT } from '../utils/constants';
import { confirmAsk } from '../utils/dialog';
import { useResponsive } from '../utils/responsive';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type MenuItem = { route: keyof RootStackParamList; label: string; hint: string; icon: any };

// เมนูที่เคยกระจายอยู่ตามหน้าอื่น (หรือเข้าไม่ถึงเลย) รวมมาไว้ที่เดียวให้หาเจอ
const MENU_GROUPS: { title: string; items: MenuItem[] }[] = [
  {
    title: 'สรุป & วิเคราะห์',
    items: [
      { route: 'Overview', label: 'ภาพรวมการเงิน', hint: 'รายจ่าย + พอร์ต รวมในหน้าเดียว', icon: 'analytics-outline' },
      { route: 'Statistics', label: 'สถิติ & ข้อสังเกต', hint: 'แนวโน้มรายจ่าย และคำเตือนอัตโนมัติ', icon: 'stats-chart-outline' },
    ],
  },
  {
    title: 'ข้อมูล',
    items: [
      { route: 'Accounts', label: 'บัญชีของฉัน', hint: 'เงินสด ธนาคาร พอร์ตลงทุน', icon: 'wallet-outline' },
      { route: 'ManageCatalog', label: 'สกุลเงิน & แพลตฟอร์ม', hint: 'แก้เรตเงิน เพิ่มโบรกเกอร์', icon: 'options-outline' },
      { route: 'Installments', label: 'ค่าใช้จ่ายผ่อนชำระ', hint: 'รายการผ่อนที่ยังจ่ายอยู่', icon: 'card-outline' },
      { route: 'ImportStatement', label: 'นำเข้า statement', hint: 'อัปโหลดรายการเดินบัญชี', icon: 'cloud-upload-outline' },
    ],
  },
];

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { user, signOut } = useAuth();
  const { isDesktop } = useResponsive();

  const email = user?.email || '-';
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    email.split('@')[0];
  const initial = (displayName || 'U').charAt(0).toUpperCase();
  const provider = (user?.app_metadata?.provider as string | undefined) || 'email';
  const joined = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '-';

  const handleSignOut = async () => {
    if (await confirmAsk('ออกจากระบบ', 'ต้องการออกจากระบบใช่ไหม?', 'ออกจากระบบ')) signOut();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
    >
      <Text style={styles.screenTitle}>โปรไฟล์</Text>

      {/* ── การ์ดผู้ใช้ ── */}
      <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.userEmail} numberOfLines={1}>{email}</Text>
          <Text style={styles.userMeta}>เข้าสู่ระบบด้วย {provider} · สมัครเมื่อ {joined}</Text>
        </View>
      </View>

      {/* ── เมนูตั้งค่า ── */}
      {MENU_GROUPS.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          <View style={styles.menuCard}>
            {group.items.map((item, index) => (
              <TouchableOpacity
                key={item.route}
                style={[styles.menuItem, index > 0 && styles.menuItemBorder]}
                onPress={() => navigation.navigate(item.route as any)}
              >
                <View style={styles.menuIcon}>
                  <Ionicons name={item.icon} size={18} color={COLORS.primary} />
                </View>
                <View style={styles.menuTextGroup}>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Text style={styles.menuHint}>{item.hint}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={18} color={COLORS.error} />
        <Text style={styles.logoutText}>ออกจากระบบ</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Pakmut Wealth</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  contentDesktop: {
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
    paddingTop: 32,
  },
  screenTitle: {
    ...TEXT.screenTitle,
    color: COLORS.text,
    marginBottom: 16,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 16,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...TEXT.amount,
    color: '#ffffff',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    ...TEXT.title,
    color: COLORS.text,
  },
  userEmail: {
    ...TEXT.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  userMeta: {
    ...TEXT.hint,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  group: {
    marginBottom: 16,
  },
  groupTitle: {
    ...TEXT.hint,
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginLeft: 2,
  },
  menuCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  menuItemBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: `${COLORS.primary}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextGroup: {
    flex: 1,
  },
  menuLabel: {
    ...TEXT.subtitle,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
  },
  menuHint: {
    ...TEXT.hint,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${COLORS.error}40`,
    backgroundColor: `${COLORS.error}0D`,
  },
  logoutText: {
    ...TEXT.subtitle,
    fontFamily: FONTS.semibold,
    color: COLORS.error,
  },
  version: {
    ...TEXT.hint,
    textAlign: 'center',
    marginTop: 24,
    color: COLORS.textSecondary,
  },
});
