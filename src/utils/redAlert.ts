// ── "ซื้อเพิ่มแล้วรอบนี้" — ตัดสินว่าการปิดแจ้งเตือนที่กดไว้ยังมีผลอยู่ไหม ──
// อยู่ที่เดียวเพราะทั้งการ์ดสรุป, การ์ดรายตัวในลิสต์ และหน้าแก้ไขการลงทุน ต้องตอบตรงกัน
// ถ้าแต่ละหน้าตัดสินเอง จะมีสภาพ "การ์ดสรุปไม่เตือนแล้ว แต่การ์ดรายตัวยังเตือนอยู่"

export interface RedAckState {
  redAckCount?: number;
  redAckStreakAt?: string;
}

export interface RedStreakLike {
  count: number;
  streakStartAt: number | null;
}

// ปิดแจ้งเตือนไว้อยู่หรือเปล่า
//
// เงื่อนไขต้องครบทั้งคู่:
//   1) แท่งยังไม่เพิ่มเกินตอนที่กดปิด (count <= redAckCount) — แดงต่อจนครบรอบถัดไป = รอบใหม่ ต้องเตือนอีก
//   2) ยังเป็น "สตรีคเดิม" อยู่จริง (แท่งแรกเป็นแท่งเดียวกัน)
//
// ข้อ 2 ขาดไม่ได้: สตรีคขาดแล้วก่อตัวใหม่จนยาวเท่ากันพอดี (แดง 2 วันอีกรอบ)
// จะมี count เท่าเดิมเป๊ะ ถ้าดูแค่ตัวเลขก็จะเงียบหายไปทั้งที่เป็นสัญญาณคนละครั้ง
//
// API ไม่ได้ให้เวลาแท่งมา (streakStartAt = null) → ยอมให้ปิดตามจำนวนแท่งไปก่อน
// ดีกว่าเตือนซ้ำทุกครั้งที่เปิดหน้าจอ ทั้งที่ผู้ใช้กดปิดไปแล้ว
export const isRedAckActive = (inv: RedAckState, alert: RedStreakLike): boolean => {
  if (!inv.redAckCount || inv.redAckCount < 1) return false;
  if (alert.count <= 0) return false;
  if (alert.count > inv.redAckCount) return false;
  if (alert.streakStartAt == null || !inv.redAckStreakAt) return true;
  const acked = new Date(inv.redAckStreakAt).getTime();
  if (!Number.isFinite(acked)) return true;
  // เทียบเป็นวินาที — timestamptz ที่วิ่งผ่าน Postgres แล้วกลับมาอาจคลาดกันระดับ ms
  return Math.abs(acked - alert.streakStartAt) < 1000;
};

// การปิดแจ้งเตือนที่ค้างอยู่ "หมดอายุ" แล้วไหม (สตรีคขาด/ครบรอบใหม่)
// ใช้เคลียร์ค่าเก่าใน DB ทิ้ง ไม่งั้นแถวจะค้างคำว่า "ซื้อเพิ่มแล้ว" ของรอบที่จบไปนานแล้ว
export const isRedAckStale = (inv: RedAckState, alert: RedStreakLike): boolean =>
  !!inv.redAckCount && inv.redAckCount >= 1 && !isRedAckActive(inv, alert);
