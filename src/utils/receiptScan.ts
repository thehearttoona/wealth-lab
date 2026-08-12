// สแกนใบเสร็จด้วย Supabase edge function (scan-receipt)
//
// แยกออกมาจาก AddExpenseScreen เพราะตอนนี้มีสองที่ที่ต้องใช้: หน้าเพิ่มรายจ่ายเต็มจอ
// กับการ์ดเลื่อนขึ้น (QuickAddSheet) บนหน้าหลัก — ก๊อปโค้ด resize/base64 ไปสองที่แล้ว
// วันหลังแก้ที่เดียวลืมอีกที่แน่นอน
//
// เป็น callback ไม่ใช่ Promise โดยตั้งใจ: ตัวเลือกไฟล์บนเว็บ "ยกเลิก" แล้ว onchange
// ไม่ยิงเลย ถ้าทำเป็น Promise มันจะค้าง pending ตลอดกาล และสถานะ "กำลังสแกน..."
// จะไม่มีวันถูกปิด — onStart จึงถูกเรียกก็ต่อเมื่อเลือกไฟล์จริงแล้วเท่านั้น

import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../services/supabase';
import { EXPENSE_CATEGORIES } from './constants';
import { notify } from './dialog';

/** ผลจาก OCR — ทุกช่องอาจไม่มี ผู้ใช้ต้องแก้ต่อได้เสมอ */
export type ReceiptScan = {
  amount?: string;
  description?: string;
  category?: string;
  /** YYYY-MM-DD (ค.ศ. แล้ว) */
  date?: string;
};

export type ScanHandlers = {
  /** เรียกเมื่อ "เริ่มส่งรูปไปสแกนจริง" — ไม่ใช่ตอนเปิดตัวเลือกไฟล์ */
  onStart: () => void;
  /** เรียกเสมอหลัง onStart ไม่ว่าจะสำเร็จหรือไม่ (null = อ่านไม่ได้) */
  onDone: (result: ReceiptScan | null) => void;
};

// แปลงวันที่จาก OCR ที่อาจอ่านปี พ.ศ. ผิด
// case: "69"   → 2 หลักแบบ พ.ศ. → 2026
// case: "2569" → พ.ศ. เต็ม      → 2026
// case: "2069" → AI เติม 2000 หน้าเลข พ.ศ. 2 หลัก → 2026
export const normalizeScanDate = (dateStr: string): string => {
  if (!dateStr) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  let year = parseInt(parts[0], 10);
  if (isNaN(year)) return dateStr;
  const currentYear = new Date().getFullYear();
  if (year < 100) {
    year = year + 2500 - 543;
  } else if (year > 2400) {
    year = year - 543;
  } else if (year > currentYear + 20 && year < 2200) {
    year = year - 43;
  }
  return `${year}-${parts[1]}-${parts[2]}`;
};

const scanWithSupabase = async (
  image_base64: string,
  media_type: string
): Promise<ReceiptScan | null> => {
  try {
    const { data, error } = await supabase.functions.invoke('scan-receipt', {
      body: { image_base64, media_type },
    });
    if (error) throw error;
    if (!data?.success) {
      notify(data?.error || 'ไม่สามารถอ่านข้อมูลจากรูปได้');
      return null;
    }
    return {
      amount: data.amount != null ? String(data.amount) : undefined,
      description: data.description || undefined,
      category:
        data.category && EXPENSE_CATEGORIES.includes(data.category) ? data.category : undefined,
      date: data.date ? normalizeScanDate(data.date) : undefined,
    };
  } catch (err: any) {
    notify('Error: ' + (err?.message || JSON.stringify(err) || 'unknown'));
    return null;
  }
};

/** ย่อรูปก่อนส่ง — ด้านยาวสุดไม่เกิน 1024px ไม่งั้น payload ใหญ่จน edge function ช้า/ตก */
const resizeDataUrl = (dataUrl: string): Promise<string> =>
  new Promise((resolve) => {
    const img = new (window as any).Image();
    img.onload = () => {
      const MAX = 1024;
      let w = img.width;
      let h = img.height;
      if (w > h ? w > MAX : h > MAX) {
        if (w > h) {
          h = Math.round((h * MAX) / w);
          w = MAX;
        } else {
          w = Math.round((w * MAX) / h);
          h = MAX;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = dataUrl;
  });

export const pickAndScanReceipt = async (
  useCamera: boolean,
  { onStart, onDone }: ScanHandlers
): Promise<void> => {
  if (Platform.OS === 'web') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    if (useCamera) (input as any).capture = 'environment';
    input.onchange = async (e: any) => {
      const file: File = e.target.files?.[0];
      document.body.removeChild(input);
      if (!file) return;
      onStart();
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const resized = await resizeDataUrl(dataUrl);
        onDone(await scanWithSupabase(resized.split(',')[1], 'image/jpeg'));
      } catch (err: any) {
        notify('อ่านไฟล์ไม่ได้: ' + (err?.message || ''));
        onDone(null);
      }
    };
    document.body.appendChild(input);
    input.click();
    return;
  }

  if (useCamera) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      notify('กรุณาอนุญาตใช้กล้อง');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.4,
      exif: false,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    onStart();
    onDone(await scanWithSupabase(result.assets[0].base64!, result.assets[0].mimeType || 'image/jpeg'));
    return;
  }

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    notify('กรุณาอนุญาตเข้าถึงรูปภาพ');
    return;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.4,
    exif: false,
    base64: true,
  });
  if (result.canceled || !result.assets[0]) return;
  onStart();
  onDone(await scanWithSupabase(result.assets[0].base64!, result.assets[0].mimeType || 'image/jpeg'));
};
