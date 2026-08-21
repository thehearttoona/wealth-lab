// ── "ค่าเสื่อมของชีวิต" — ของที่จะต้องจ่ายอีกแน่ ๆ แค่ยังไม่ถึงวัน ──
//
// สิ่งที่ระบบนี้จับคือค่าใช้จ่ายที่ **รู้ล่วงหน้าว่าจะกลับมา** แต่ไม่ได้มาทุกเดือน
// จนคนไม่กันเงินไว้: โน้ตบุ๊กพัง 4 ปีครั้ง · ตรวจสุขภาพปีละครั้ง · ประกันรถปีละครั้ง
// พอถึงวันก็กลายเป็น "เดือนนี้จ่ายหนักผิดปกติ" ทั้งที่มันบอกล่วงหน้าได้ตั้งนานแล้ว
//
// ตัวเลขเดียวที่ระบบนี้มีไว้ตอบคือ **"ต้องกันเดือนละเท่าไหร่"** — ไม่ใช่บันทึกรายจ่าย
// (ตอนซื้อจริงค่อยไปบันทึกที่หน้าหลักตามปกติ ดู utils/lifeCost.ts ว่าทำไมห้ามนับซ้ำ)

export type LifeCostKind =
  | 'equipment' // อุปกรณ์ทำงาน: โน้ตบุ๊ก จอ มือถือ
  | 'health' // สุขภาพ: ตรวจประจำปี ทำฟัน แว่น
  | 'insurance' // เบี้ยประกันรายปี
  | 'vehicle' // รถ: ต่อภาษี ยาง แบต
  | 'home' // บ้าน: เครื่องใช้ไฟฟ้า ซ่อมบำรุง
  | 'other';

export const LIFE_COST_KINDS: { value: LifeCostKind; label: string; icon: string }[] = [
  { value: 'equipment', label: 'อุปกรณ์ทำงาน', icon: 'laptop-outline' },
  { value: 'health', label: 'สุขภาพ', icon: 'medkit-outline' },
  { value: 'insurance', label: 'ประกัน', icon: 'shield-checkmark-outline' },
  { value: 'vehicle', label: 'รถ', icon: 'car-outline' },
  { value: 'home', label: 'บ้าน', icon: 'home-outline' },
  { value: 'other', label: 'อื่น ๆ', icon: 'ellipsis-horizontal-outline' },
];

export const lifeCostKindLabel = (k: LifeCostKind): string =>
  LIFE_COST_KINDS.find((x) => x.value === k)?.label ?? 'อื่น ๆ';

export interface LifeCost {
  id: string;
  name: string;
  kind: LifeCostKind;
  /** ยอดที่ต้องจ่ายเมื่อถึงรอบ (บาท) */
  cost: number;
  /**
   * ขายต่อได้เท่าไหร่ — หักออกก่อนเฉลี่ย เพราะเงินก้อนนี้ไม่ต้องเก็บใหม่
   * มือถือขายต่อได้จริง ส่วนค่าตรวจสุขภาพขายต่อไม่ได้ (ปล่อยว่าง = 0)
   */
  salvage?: number;
  /** รอบละกี่เดือน — โน้ตบุ๊ก 48 · ตรวจสุขภาพ 12 · ทำฟัน 6 */
  cycleMonths: number;
  /** เริ่มรอบนี้เมื่อไหร่ = วันที่ซื้อ / วันที่ทำครั้งล่าสุด (YYYY-MM-DD) */
  startedAt: string;
  /**
   * เก็บเงินไว้แล้วเท่าไหร่ — **จดเอง ระบบไม่หักให้อัตโนมัติ**
   * (หลักการเดียวกับเงินรอลงทุน: แอปไม่รู้ว่าเงินอยู่บัญชีไหน คนเป็นเจ้าของตัวเลข)
   */
  reserved?: number;
  note?: string;
  createdAt: string;
}

/** ตัวช่วยกรอกเร็ว — ค่ากลางที่คนไทยส่วนใหญ่เจอ ปรับเองได้ทุกช่อง */
export const LIFE_COST_PRESETS: {
  name: string;
  kind: LifeCostKind;
  cost: number;
  cycleMonths: number;
  salvage?: number;
}[] = [
  { name: 'โน้ตบุ๊ก', kind: 'equipment', cost: 45000, cycleMonths: 48, salvage: 8000 },
  { name: 'มือถือ', kind: 'equipment', cost: 30000, cycleMonths: 36, salvage: 6000 },
  { name: 'ตรวจสุขภาพประจำปี', kind: 'health', cost: 5000, cycleMonths: 12 },
  { name: 'ทำฟัน / ขูดหินปูน', kind: 'health', cost: 1500, cycleMonths: 6 },
  { name: 'แว่นตา', kind: 'health', cost: 6000, cycleMonths: 24 },
  { name: 'ประกันสุขภาพรายปี', kind: 'insurance', cost: 20000, cycleMonths: 12 },
  { name: 'ประกันรถ + พ.ร.บ.', kind: 'vehicle', cost: 15000, cycleMonths: 12 },
  { name: 'เปลี่ยนยางรถ', kind: 'vehicle', cost: 16000, cycleMonths: 36 },
  { name: 'เครื่องปรับอากาศ (ล้าง)', kind: 'home', cost: 1200, cycleMonths: 6 },
];
