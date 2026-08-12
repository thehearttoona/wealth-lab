import { Alert, Platform } from 'react-native';

// ── ศูนย์กลางการแจ้งเตือนของทั้งแอป ──
//
// react-native-web ไม่ได้ implement Alert.alert แบบมีปุ่ม — บนเว็บมันเงียบไปเฉย ๆ
// เดิมจึงต้องตกไปใช้ window.alert/window.confirm ซึ่งเป็นกล่องของเบราว์เซอร์:
// ขึ้นหัวว่า "<domain> says" ปุ่มเป็น OK/Cancel ภาษาอังกฤษ ฟอนต์ระบบ ไม่มีสีของแอป
// และเด้งเป็น modal ค้างจอแม้แต่ตอน "บันทึกสำเร็จ" ซึ่งไม่คุ้มกับการขัดจังหวะ
//
// ตอนนี้ไฟล์นี้ไม่วาดอะไรเอง แต่ "ส่งงาน" ให้ <DialogHost /> ที่ mount ไว้ครั้งเดียวใน App.tsx
// (นอก NavigationContainer — จำเป็น เพราะหลายจุด await notify() แล้ว goBack() ทันที
//  ถ้า host อยู่ในตัว navigator toast จะหายไปพร้อมหน้าจอที่ถูก pop)
//
// signature ของ notify / confirmAsk เหมือนเดิมเป๊ะ — 133 จุดที่เรียกอยู่ไม่ต้องแก้สักจุด

export type DialogKind = 'success' | 'error' | 'info';

export type ToastItem = {
  id: number;
  kind: DialogKind;
  title: string;
  msg: string;
};

export type CardItem = {
  id: number;
  kind: DialogKind;
  title: string;
  msg: string;
  yesLabel: string;
  /** null = กล่องแจ้งข้อความ (ปุ่มเดียว) ไม่ใช่คำถามยืนยัน */
  cancelLabel: string | null;
  resolve: (ok: boolean) => void;
};

/** toast ค้างจออยู่ได้พร้อมกันกี่ใบ — เกินนี้ใบเก่าสุดหลุดออก ไม่งั้น loop ที่ notify รัว ๆ จะท่วมจอ */
const MAX_TOASTS = 3;
/** ข้อความยาวกว่านี้ (หรือมีขึ้นบรรทัดใหม่) อ่านใน toast ไม่ทัน → เด้งเป็นการ์ดที่ต้องกดปิดแทน */
const CARD_LENGTH = 120;

export const TOAST_MS: Record<DialogKind, number> = {
  success: 3500,
  info: 4500,
  // ข้อผิดพลาดต้องอยู่นานกว่า — ผู้ใช้ต้องได้อ่านว่าทำไมงานที่เพิ่งกดถึงไม่สำเร็จ
  error: 6000,
};

let seq = 0;
let toasts: ToastItem[] = [];
// การ์ดเข้าคิวทีละใบ: ถ้าเปิดซ้อนกัน ปุ่ม "ยกเลิก" จะไปตอบคำถามผิดใบ
let cardQueue: CardItem[] = [];
let hostMounted = false;

const listeners = new Set<() => void>();
const emit = () => {
  listeners.forEach((fn) => fn());
};

export const subscribeDialogs = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const getToasts = (): ToastItem[] => toasts;
export const getCard = (): CardItem | null => cardQueue[0] ?? null;

/**
 * DialogHost บอกว่าตัวเองพร้อมรับงานแล้วหรือยัง
 * ยังไม่พร้อม (เช่นช่วงฟอนต์ยังไม่โหลด App คืน null) ให้ตกกลับไปใช้กล่องของระบบ
 * ดีกว่าเงียบหายไปทั้งข้อความ
 */
export const setDialogHostMounted = (v: boolean) => {
  hostMounted = v;
};

export const dismissToast = (id: number) => {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
};

export const answerCard = (id: number, ok: boolean) => {
  const current = cardQueue[0];
  if (!current || current.id !== id) return;
  cardQueue = cardQueue.slice(1);
  emit();
  current.resolve(ok);
};

const pushToast = (kind: DialogKind, title: string, msg: string) => {
  const id = ++seq;
  toasts = [...toasts, { id, kind, title, msg }].slice(-MAX_TOASTS);
  emit();
  // ใบที่ถูกเบียดออกไปแล้ว dismissToast จะไม่เจอ id — เป็น no-op ปลอดภัย
  setTimeout(() => dismissToast(id), TOAST_MS[kind]);
};

const pushCard = (item: Omit<CardItem, 'id'>) => {
  cardQueue = [...cardQueue, { ...item, id: ++seq }];
  emit();
};

// ── เดาชนิดจากข้อความ ──
// จงใจไม่ไปแก้ 133 จุดให้ส่งชนิดมาเอง: ข้อความไทยในแอปนี้บอกชนิดตัวเองอยู่แล้ว
// ลำดับสำคัญ — ต้องเช็ค error ก่อน ไม่งั้น "บันทึกไม่สำเร็จ" จะเข้าเงื่อนไข "สำเร็จ" กลายเป็นสีเขียว
const ERROR_RE = /ข้อผิดพลาด|ผิดพลาด|ไม่สำเร็จ|ไม่สามารถ|ไม่ได้|ล้มเหลว|กรุณา|ไม่พบ|ไม่ถูกต้อง|ลบไม่ได้/;
const SUCCESS_RE = /สำเร็จ|เรียบร้อย/;

const kindOf = (title: string, msg: string): DialogKind => {
  const t = `${title} ${msg}`;
  if (ERROR_RE.test(t)) return 'error';
  if (SUCCESS_RE.test(t)) return 'success';
  return 'info';
};

const defaultTitle = (kind: DialogKind): string =>
  kind === 'success' ? 'สำเร็จ' : kind === 'error' ? 'ไม่สำเร็จ' : 'แจ้งเตือน';

// ── ทางสำรองตอน host ยังไม่ mount (กล่องของระบบแบบเดิม) ──
const fallbackNotify = (msg: string, title: string): Promise<void> =>
  new Promise((resolve) => {
    if (Platform.OS === 'web') {
      window.alert(title ? `${title}\n\n${msg}` : msg);
      resolve();
      return;
    }
    Alert.alert(title, msg, [{ text: 'ตกลง', onPress: () => resolve() }], {
      cancelable: true,
      onDismiss: () => resolve(),
    });
  });

const fallbackConfirm = (title: string, msg: string, yesLabel: string): Promise<boolean> =>
  new Promise((resolve) => {
    if (Platform.OS === 'web') {
      resolve(window.confirm(title ? `${title}\n\n${msg}` : msg));
      return;
    }
    // บน Android การกดปุ่ม back ปิด dialog ถือเป็น "ยกเลิก" (ไม่ดัก onDismiss = promise ค้างตลอดไป)
    Alert.alert(
      title,
      msg,
      [
        { text: 'ยกเลิก', style: 'cancel', onPress: () => resolve(false) },
        { text: yesLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });

/**
 * แจ้งข้อความ — ข้อความสั้นขึ้นเป็น toast มุมล่างขวา (หายเอง ไม่ต้องกด)
 * ข้อความยาวหรือมีหลายบรรทัด (เช่น error ดิบจาก Supabase) เด้งเป็นการ์ดที่ต้องกดปิด
 *
 * คืน promise ที่ resolve เมื่ออ่านได้แล้ว — toast resolve ทันที (ตัว toast อยู่เหนือ navigator
 * จึงยังเห็นอยู่แม้จะ goBack() ต่อทันที) ส่วนการ์ดรอจนกดปิด
 */
export const notify = (msg: string, title = '', kind?: DialogKind): Promise<void> => {
  const k = kind ?? kindOf(title, msg);
  if (!hostMounted) return fallbackNotify(msg, title);

  if (msg.includes('\n') || msg.length + title.length > CARD_LENGTH) {
    return new Promise<void>((resolve) => {
      pushCard({
        kind: k,
        title: title || defaultTitle(k),
        msg,
        yesLabel: 'ตกลง',
        cancelLabel: null,
        resolve: () => resolve(),
      });
    });
  }

  pushToast(k, title, msg);
  return Promise.resolve();
};

/** ปุ่มยืนยันที่ทำของหาย/ย้อนกลับยาก ต้องเป็นปุ่มแดง ไม่ใช่ปุ่มน้ำเงินเหมือนปุ่มตกลงทั่วไป */
const DANGER_RE = /ลบ|ล้าง|ออกจากระบบ|ย้อนคืน|ปิดรอบ|ขาย/;

/**
 * ถามยืนยัน — คืน true เมื่อผู้ใช้กดปุ่มยืนยัน
 * เป็นการ์ดเสมอ (คำถามที่หายเองไม่ได้)
 */
export const confirmAsk = (
  title: string,
  msg: string,
  yesLabel = 'ตกลง'
): Promise<boolean> => {
  if (!hostMounted) return fallbackConfirm(title, msg, yesLabel);
  return new Promise<boolean>((resolve) => {
    pushCard({
      kind: DANGER_RE.test(yesLabel) ? 'error' : 'info',
      title: title || 'ยืนยัน',
      msg,
      yesLabel,
      cancelLabel: 'ยกเลิก',
      resolve,
    });
  });
};
