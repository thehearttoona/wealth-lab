import { Alert, Platform } from 'react-native';

// react-native-web ไม่ได้ implement Alert.alert แบบมีปุ่ม — บนเว็บมันเงียบไปเฉย ๆ
// เลยต้องแยกทางเป็น window.alert/confirm ทุกที่ ก่อนหน้านี้ก๊อปแพตเทิร์นนี้ไว้ 14 ไฟล์ในชื่อที่ต่างกัน
// (notify / showMsg / alertMsg) รวมมาไว้ที่เดียวแล้ว

/**
 * แจ้งข้อความเฉย ๆ — คืน promise ที่ resolve เมื่อผู้ใช้ปิดกล่อง
 * ปกติเรียกแบบไม่ await ก็ได้ จะ await ต่อเมื่อต้องรอให้อ่านจบก่อนค่อยเปลี่ยนหน้า
 * (window.alert บนเว็บบล็อกอยู่แล้ว แต่ Alert.alert บน native ไม่บล็อก — ถ้าไม่รอ หน้าจะเด้งกลับทับกล่อง)
 */
export const notify = (msg: string, title = ''): Promise<void> =>
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

/**
 * ถามยืนยัน — คืน true เมื่อผู้ใช้กดตกลง
 * บน Android การกดปุ่ม back ปิด dialog ถือเป็น "ยกเลิก" (ถ้าไม่ดัก onDismiss promise จะค้างตลอดไป)
 */
export const confirmAsk = (
  title: string,
  msg: string,
  yesLabel = 'ตกลง'
): Promise<boolean> =>
  new Promise((resolve) => {
    if (Platform.OS === 'web') {
      resolve(window.confirm(title ? `${title}\n\n${msg}` : msg));
      return;
    }
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
