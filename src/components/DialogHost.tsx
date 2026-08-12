import React, { useEffect, useReducer, useRef } from 'react';
import {
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../utils/constants';
import {
  answerCard,
  dismissToast,
  getCard,
  getToasts,
  setDialogHostMounted,
  subscribeDialogs,
  DialogKind,
  ToastItem,
} from '../utils/dialog';

// ── หน้าตาของการแจ้งเตือนทั้งแอป ──
// mount ครั้งเดียวใน App.tsx *นอก* NavigationContainer: หลายจุดเรียก notify() แล้วเปลี่ยนหน้าทันที
// ถ้าอยู่ในตัว navigator toast จะโดน pop ไปพร้อมหน้าจอเดิมก่อนที่ผู้ใช้จะทันเห็น
//
// สีของแต่ละชนิดไม่ได้พึ่งสีอย่างเดียว — มีไอคอนกำกับด้วยเสมอ (เขียว/แดงคู่กันแยกไม่ออกในสายตาตาบอดสี)

const KIND_STYLE: Record<DialogKind, { color: string; icon: 'checkmark-circle' | 'alert-circle' | 'information-circle' }> = {
  success: { color: COLORS.success, icon: 'checkmark-circle' },
  error: { color: COLORS.error, icon: 'alert-circle' },
  info: { color: COLORS.primary, icon: 'information-circle' },
};

// react-native-web ไม่มี native driver — เปิดแล้วได้แต่ warning ในคอนโซล
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * หนึ่งใบของ toast
 * ⚠️ ต้องประกาศนอก DialogHost เท่านั้น — ประกาศในตัว component = type ใหม่ทุกเฟรม
 * React จะ remount ทั้งก้อน อนิเมชันเข้าจะเล่นซ้ำไม่จบ (กฎเดียวกับที่เคยทำฟอร์มภาษีพัง)
 */
const ToastRow: React.FC<{ item: ToastItem; onClose: () => void }> = ({ item, onClose }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const { color, icon } = KIND_STYLE[item.kind];

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [anim]);

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          ],
        },
      ]}
    >
      {/* แถบสีซ้ายมือ = ชนิดของข้อความ อ่านได้จากหางตาโดยไม่ต้องอ่านตัวหนังสือ */}
      <View style={[styles.toastStripe, { backgroundColor: color }]} />
      <Ionicons name={icon} size={18} color={color} style={styles.toastIcon} />
      <View style={styles.toastBody}>
        {/* title ว่างได้ — ส่วนใหญ่ข้อความบอกตัวเองอยู่แล้ว ไม่ต้องมีหัวเรื่องซ้ำ */}
        {!!item.title && <Text style={styles.toastTitle}>{item.title}</Text>}
        <Text style={styles.toastMsg} numberOfLines={3}>
          {item.msg}
        </Text>
      </View>
      <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={16} color={COLORS.textSecondary} />
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function DialogHost() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const unsubscribe = subscribeDialogs(force);
    setDialogHostMounted(true);
    return () => {
      setDialogHostMounted(false);
      unsubscribe();
    };
  }, []);

  const toasts = getToasts();
  const card = getCard();
  const cardStyle = card ? KIND_STYLE[card.kind] : null;

  return (
    <>
      {/* box-none = กล่องนี้ไม่กินคลิก มีแต่ตัว toast เองที่กดได้ ไม่งั้นจะบังพอร์ตด้านหลัง */}
      <View
        pointerEvents="box-none"
        style={[styles.toastWrap, { bottom: insets.bottom + 16, right: insets.right + 16 }]}
      >
        {toasts.map((t) => (
          <ToastRow key={t.id} item={t} onClose={() => dismissToast(t.id)} />
        ))}
      </View>

      {/* การ์ดยืนยัน / ข้อความยาว — onRequestClose รับปุ่ม back ของ Android = ยกเลิก */}
      <Modal
        visible={!!card}
        transparent
        animationType="fade"
        onRequestClose={() => card && answerCard(card.id, false)}
      >
        <View style={styles.overlay}>
          {card && cardStyle && (
            // การ์ดเป็น ScrollView: body ของเว็บตั้ง overflow:hidden ไว้ ถ้าการ์ดสูงเกินจอ
            // ปุ่มยืนยันจะหลุดขอบจนกดไม่ได้ (flexGrow:0 = สูงตามเนื้อหาจริง ไม่ยืดเต็มจอ)
            <ScrollView style={styles.card} contentContainerStyle={styles.cardContent}>
              <View style={styles.cardHeader}>
                <Ionicons name={cardStyle.icon} size={22} color={cardStyle.color} />
                <Text style={styles.cardTitle}>{card.title}</Text>
              </View>
              <Text style={styles.cardMsg}>{card.msg}</Text>
              <View style={styles.cardActions}>
                {card.cancelLabel && (
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => answerCard(card.id, false)}
                  >
                    <Text style={styles.cancelButtonText}>{card.cancelLabel}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[
                    styles.confirmButton,
                    // ปุ่มที่ทำของหาย/ย้อนกลับยากต้องเป็นสีแดง ไม่ใช่สีน้ำเงินเหมือนปุ่มตกลงทั่วไป
                    { backgroundColor: card.kind === 'error' ? COLORS.error : COLORS.primary },
                  ]}
                  onPress={() => answerCard(card.id, true)}
                >
                  <Text style={styles.confirmButtonText}>{card.yesLabel}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  toastWrap: {
    position: 'absolute',
    // left ด้วย เพื่อให้จอแคบ toast ยังหดตามได้ (ไม่ล้นขอบขวา)
    left: 16,
    alignItems: 'flex-end',
    gap: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 240,
    maxWidth: 420,
    paddingVertical: 10,
    paddingRight: 12,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    // เงาต้องมีจริง — toast ลอยอยู่เหนือการ์ดพื้นขาวของพอร์ต ถ้าไม่มีเงาจะกลืนไปกับพื้นหลัง
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastStripe: {
    width: 4,
    alignSelf: 'stretch',
  },
  toastIcon: {
    marginLeft: 6,
  },
  toastBody: {
    flex: 1,
    // TextInput/ข้อความในแถว flex บนเว็บต้องมี minWidth:0 ไม่งั้นความกว้างในตัวมันกลายเป็นความกว้างขั้นต่ำ
    minWidth: 0,
  },
  toastTitle: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
  },
  toastMsg: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.text,
    lineHeight: 19,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    // overlay เป็นข้อยกเว้นเดียวที่จำกัดความกว้างได้ (หน้าจอห้ามมี max-width)
    maxWidth: 420,
    maxHeight: '100%',
    flexGrow: 0,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
  },
  cardContent: {
    padding: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
  },
  cardMsg: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.text,
    lineHeight: 21,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 20,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
  },
  confirmButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  confirmButtonText: {
    fontSize: 14,
    fontFamily: FONTS.medium,
    color: '#ffffff',
  },
});
