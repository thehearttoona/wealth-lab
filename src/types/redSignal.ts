import { InvestmentType, RedInterval, RED_INTERVALS } from './investment';

// ── ประวัติสัญญาณ "ถึงคิวลงไม้" (ตาราง red_signals) ──
//
// ทำไมต้องเก็บ: การ์ด "ถึงคิวลงไม้" ในพอร์ตเป็นภาพของ "วันนี้" เท่านั้น — สตรีคขาดแล้ว
// สัญญาณก็หายไปพร้อมกัน เหลือแต่ความรู้สึกว่า "เหมือนเคยเตือนนะ" ซึ่งตอบไม่ได้ว่า
//   · ปีนี้กฎแท่งแดงเตือนไปกี่ครั้ง
//   · ครั้งที่เตือนเรา "ลงจริง" กี่ครั้ง (วินัยเป็นตัวเลข ไม่ใช่ความรู้สึก)
//   · ครั้งที่ "เข้าไม่ได้" เพราะชนเพดานไม้/หมดงบ มีกี่ครั้ง — ตัวนี้คือหลักฐานว่าแผน
//     (เงินต่อไม้/เพดานต่อสินทรัพย์) ตั้งไว้แคบเกินไปหรือพอดี
//
// สถานะเป็นสามค่า ไม่ใช่สองค่า — "ยังไม่บันทึกผล" ต้องไม่ถูกอ่านว่า "ปล่อยผ่าน"
// (เหตุผลเดียวกับ deductionAdvice: unknown ต้องไม่กลายเป็น not_eligible)
export type RedSignalOutcome = 'pending' | 'taken' | 'skipped';

export const OUTCOME_LABELS: Record<RedSignalOutcome, string> = {
  pending: 'ยังไม่บันทึกผล',
  taken: 'ลงไม้แล้ว',
  skipped: 'ปล่อยผ่าน',
};

export interface RedSignal {
  id: string;
  /** กันบันทึกซ้ำ: ชนิด:ตัวย่อ:กรอบเวลา:ทุกกี่แท่ง:สตรีค:ครั้งที่ (ดู utils/redSignalLog) */
  signalKey: string;
  /** ไม้ที่ทำให้สัญญาณนี้ถูกบันทึก — ลบไม้ทิ้งภายหลังประวัติต้องไม่หาย จึงไม่มี FK */
  investmentId?: string;
  type: InvestmentType;
  symbol: string;
  name: string;
  // ── กฎที่ใช้ตอนนั้น: ต้องเก็บ ไม่ใช่อ่านจากไม้ตอนดูย้อนหลัง ──
  // ไปแก้กฎเป็น "ทุก 3 สัปดาห์" ทีหลัง ประวัติเก่าต้องยังอ่านว่า "แดง 2 วัน" อยู่
  interval: RedInterval;
  every: number;
  count: number;
  /** สัญญาณครั้งที่เท่าไหร่ของสตรีคนี้ (แดง 2 = ครั้งที่ 1, แดง 4 = ครั้งที่ 2) */
  roundNo: number;
  dropPercent: number;
  lowPrice?: number;
  lowCurrency?: string;
  currency: string;
  /** เวลาเปิดแท่งแรกของสตรีค — ตัวที่แยก "สตรีคใหม่ที่ยาวเท่ากันพอดี" ออกจากสตรีคเดิม */
  streakStartAt?: string;
  /** เวลาที่แอปเห็นสัญญาณนี้ครั้งแรก (ไม่ใช่เวลาของแท่งเทียน) */
  firedAt: string;
  // ── "เข้าได้/เข้าไม่ได้" ณ ตอนที่สัญญาณเกิด (จาก canAddLeg) ──
  // undefined = ไม้นี้ไม่ได้อยู่ในรอบ จึงไม่มีกฎของรอบมากั้น (ไม่ใช่ "เข้าได้" และไม่ใช่ "เข้าไม่ได้")
  enterable?: boolean;
  blockedReason?: string;
  cycleId?: string;
  cycleNo?: number;
  /** เงินต่อไม้ตามแผน ณ ตอนนั้น — แผนเปลี่ยนทีหลังประวัติต้องไม่เปลี่ยนตาม */
  planLegTHB?: number;
  outcome: RedSignalOutcome;
  actedAt?: string;
  /** เพราะอะไรจึงลง/ไม่ลง — ตัวที่ทำให้ประวัติเป็นสมุดทบทวน ไม่ใช่แค่ตารางเลข */
  note?: string;
}

/** หน่วยของแท่งเทียนตามกรอบเวลา — "แดง 2 วัน" กับ "แดง 2 เดือน" คนละเรื่องกัน */
export const redUnitLabel = (interval: RedInterval): string =>
  RED_INTERVALS.find((r) => r.value === interval)?.unit ?? 'วัน';
