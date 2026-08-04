// "เป้าหมายของที่อยากได้" — กฎคือต้องทำกำไรที่ขายจริงให้ได้ N เท่าของราคาของก่อน ถึงจะซื้อได้
// (ค่าเริ่มต้น 10 เท่า) นับจากกำไร realized เท่านั้น — กำไรลอยตัวไม่ปลดล็อกให้

export const DEFAULT_PURCHASE_MULTIPLIER = 10;

// ตัวคูณที่กดเลือกได้เร็วในฟอร์ม — พิมพ์เลขอื่นเองก็ได้
export const PURCHASE_MULTIPLIER_PRESETS = [3, 5, 10, 20];

export interface PurchaseGoal {
  id: string;
  name: string;
  /** ราคาของ ในสกุลเงินตาม currency (แปลงเป็น THB ด้วย convertToTHB ตอนคำนวณ) */
  price: number;
  currency: string;
  /** ต้องทำกำไรกี่เท่าของราคาของ */
  multiplier: number;
  /** ลำดับคิว — เลขน้อยมาก่อน และกินกำไรก่อนชิ้นที่อยู่ล่างกว่า */
  sortOrder: number;
  note?: string;
  /** undefined = ยังไม่ซื้อ */
  purchasedAt?: string;
  createdAt: string;
}
