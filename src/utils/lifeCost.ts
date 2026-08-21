// ── คณิตของ "ค่าเสื่อมของชีวิต" ──
// pure ทั้งไฟล์ ไม่มี React ไม่มี network — "วันนี้" ต้องส่งเข้ามา ไม่อ่าน new Date() เอง
// (ทั้งจอจึงคิดจากวันเดียวกันเสมอ ไม่ใช่คนละมิลลิวินาที)
//
// ⚠️ สองข้อที่ห้ามทำ เพราะมันจะทำให้ตัวเลขทั้งแอปโกหก:
//
// 1) **ห้ามเอา `perMonth` ไปรวมกับรายจ่ายจริงของเดือน** — เงินก้อนนี้เป็น "ควรกันไว้"
//    ไม่ใช่ "จ่ายไปแล้ว" ถ้าเอาไปบวกในงบเดือน พอถึงวันซื้อโน้ตบุ๊กจริงแล้วบันทึกรายจ่าย
//    ยอดจะถูกนับสองรอบ (กันไว้ทุกเดือน + จ่ายจริงอีกก้อน) รายจ่ายทั้งปีจะพองเกินความจริง
//
// 2) **ห้ามเอามูลค่าคงเหลือของของไปบวกในความมั่งคั่ง** — โน้ตบุ๊กอายุ 3 ปีไม่ใช่เงินที่ใช้ได้
//    netWorth ของแอปนี้คือ พอร์ต + เงินสด − หนี้ (ดู utils/netWorth.ts) และต้องอยู่แบบนั้น
//    ของพวกนี้เป็น "ภาระที่กำลังจะมาถึง" ไม่ใช่ทรัพย์สิน

import { LifeCost } from '../types/lifeCost';
import { toChristianYear } from './constants';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** วันเฉลี่ยต่อเดือน — ใช้แปลง "ต่อเดือน" เป็น "ต่อวัน" เท่านั้น ไม่ใช้คิดวันครบรอบ */
const DAYS_PER_MONTH = 365.25 / 12;
/** ใกล้ครบรอบแค่ไหนถึงเรียกว่า "ใกล้แล้ว" — 3 เดือนพอให้หาเงินทัน */
export const DUE_SOON_MONTHS = 3;

export interface LifeCostStatus {
  item: LifeCost;
  /** ยอดที่ต้องเก็บให้ได้ในรอบนี้ = ราคา − ขายต่อได้ */
  target: number;
  /** ต้องกันเดือนละเท่าไหร่ */
  perMonth: number;
  /** ต่อวัน — เลขที่ทำให้คนเข้าใจว่ามันไม่เยอะอย่างที่กลัว */
  perDay: number;
  /** วันครบรอบถัดไป (YYYY-MM-DD) */
  dueAt: string;
  /** เหลืออีกกี่เดือน (ปัดขึ้น) — ติดลบ = เลยกำหนดมาแล้ว */
  monthsLeft: number;
  daysLeft: number;
  overdue: boolean;
  dueSoon: boolean;
  /** ถ้าเก็บมาตั้งแต่วันเริ่มรอบ ป่านนี้ควรมีเท่าไหร่ (ไม่เกินยอดเต็ม) */
  shouldHave: number;
  reserved: number;
  /** ขาดอยู่เท่าไหร่ — 0 = เก็บทันแล้ว */
  gap: number;
  /** เก็บได้กี่ % ของยอดเต็ม (0–100) */
  fundedPercent: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** บวกเดือนแบบปฏิทินจริง — 31 ม.ค. + 1 เดือน = 28/29 ก.พ. ไม่ใช่ 3 มี.ค. */
export const addMonths = (iso: string, months: number): string => {
  const t = toChristianYear(iso || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return t;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const target = new Date(y, mo + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  const mm = `${target.getMonth() + 1}`.padStart(2, '0');
  const dd = `${target.getDate()}`.padStart(2, '0');
  return `${target.getFullYear()}-${mm}-${dd}`;
};

const parseDay = (s: string): Date | null => {
  const t = toChristianYear(s || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, m, d] = t.split('-').map(Number);
  const out = new Date(y, m - 1, d);
  return Number.isNaN(out.getTime()) ? null : out;
};

/**
 * สถานะของรายการเดียว
 *
 * เฉลี่ยแบบเส้นตรง (ราคา − ขายต่อได้) ÷ จำนวนเดือนของรอบ — ไม่ใช้วิธีลดตามยอดคงเหลือ
 * เพราะคำถามที่ต้องตอบคือ "เดือนนี้ต้องกันเท่าไหร่" ไม่ใช่ "ตอนนี้ของมีมูลค่าทางบัญชีเท่าไหร่"
 */
export const lifeCostStatus = (item: LifeCost, today: Date): LifeCostStatus => {
  const cycleMonths = Math.max(1, Math.round(num(item.cycleMonths)));
  const target = Math.max(0, num(item.cost) - num(item.salvage));
  const perMonth = target / cycleMonths;
  const start = parseDay(item.startedAt);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueAt = addMonths(item.startedAt, cycleMonths);
  const due = parseDay(dueAt);

  const daysLeft = due ? Math.round((due.getTime() - t0.getTime()) / MS_PER_DAY) : 0;
  const monthsLeft = Math.ceil(daysLeft / DAYS_PER_MONTH);
  const elapsedDays = start ? Math.max(0, (t0.getTime() - start.getTime()) / MS_PER_DAY) : 0;
  // ควรเก็บได้แล้วเท่าไหร่ — คิดตามวันที่ผ่านไปจริง แล้วตัดไม่ให้เกินยอดเต็ม
  // (เลยกำหนดมาแล้วก็ยังเป็นยอดเต็ม ไม่ใช่เกินยอด — เกินแล้วมันคือรอบถัดไป)
  const shouldHave = Math.min(target, (elapsedDays / DAYS_PER_MONTH) * perMonth);
  const reserved = Math.max(0, num(item.reserved));

  return {
    item,
    target,
    perMonth,
    perDay: perMonth / DAYS_PER_MONTH,
    dueAt,
    monthsLeft,
    daysLeft,
    overdue: daysLeft < 0,
    dueSoon: daysLeft >= 0 && monthsLeft <= DUE_SOON_MONTHS,
    shouldHave,
    reserved,
    gap: Math.max(0, shouldHave - reserved),
    fundedPercent: target > 0 ? Math.min(100, (reserved / target) * 100) : 0,
  };
};

export interface LifeCostSummary {
  rows: LifeCostStatus[];
  count: number;
  /** ยอดที่ต้องกันรวมทุกรายการ */
  perMonth: number;
  perDay: number;
  perYear: number;
  /** เก็บไว้แล้วรวม */
  reserved: number;
  /** ตามหลังรวม — 0 = ทันทุกรายการ */
  gap: number;
  overdueCount: number;
  dueSoonCount: number;
  /** รายการที่ครบรอบเร็วที่สุดที่ยังไม่เลยกำหนด — เอาไว้ขึ้นบรรทัด "ตัวถัดไป" */
  nextUp: LifeCostStatus | null;
}

/**
 * รวมทุกรายการ + เรียงตามความด่วน
 * เลยกำหนดขึ้นก่อน แล้วค่อยเรียงตามวันที่เหลือน้อยสุด — ของที่ต้องหาเงินก่อนต้องอยู่บนสุด
 */
export const summarizeLifeCosts = (items: LifeCost[], today: Date): LifeCostSummary => {
  const rows = items
    .map((i) => lifeCostStatus(i, today))
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return a.daysLeft - b.daysLeft;
    });
  const perMonth = rows.reduce((s, r) => s + r.perMonth, 0);
  const upcoming = rows.filter((r) => !r.overdue);
  return {
    rows,
    count: rows.length,
    perMonth,
    perDay: rows.reduce((s, r) => s + r.perDay, 0),
    perYear: perMonth * 12,
    reserved: rows.reduce((s, r) => s + r.reserved, 0),
    gap: rows.reduce((s, r) => s + r.gap, 0),
    overdueCount: rows.filter((r) => r.overdue).length,
    dueSoonCount: rows.filter((r) => r.dueSoon).length,
    nextUp: upcoming.length > 0 ? upcoming[0] : null,
  };
};
