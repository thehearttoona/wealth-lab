// ── จังหวะการลงเงิน: ลงไปสัปดาห์ละเท่าไหร่ และตอนนี้เร็ว/ช้ากว่าแผนแค่ไหน ──
//
// แยกจาก utils/dryPowder.ts โดยตั้งใจ: ที่นั่นคือ "สูตรขนาดไม้" ที่สามจอต้องได้เลขตรงกัน
// (เงินรอลงทุน / รอบลงทุน / การ์ดถึงคิวลงไม้) แตะทีเดียวกระทบทั้งสาม
// ไฟล์นี้เป็นของ "อ่านอย่างเดียว" ล้วน ๆ — ไม่มีตัวไหนย้อนกลับไปเปลี่ยนขนาดไม้
//
// ทำไมต้องมี: กระสุนของผู้ใช้เป็น "กระแส" ไม่ใช่ "ก้อน" — เติมเข้ามาทุกสัปดาห์
// คำถามจริงจึงไม่ใช่ "ก้อนนี้เหลือกี่ไม้" อย่างเดียว แต่เป็น "ปกติลงสัปดาห์ละเท่าไหร่"
// ซึ่งเป็นฐานของการวางแผนว่าจะต้องเก็บเพิ่มอีกเท่าไหร่ถึงจะถึงเป้า
//
// pure ทั้งไฟล์ ไม่มี React ไม่มี network — วันที่ต้องส่งเข้ามา ไม่อ่าน new Date() เอง
// (จอเดียวกันจึงคิดจาก "วันนี้" ก้อนเดียวเสมอ ไม่ใช่คนละมิลลิวินาที)

import { toChristianYear } from './constants';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** หนึ่งครั้งที่เงินออกไปจริง — วันที่ซื้อ + เงินที่ลง (บาท) */
export interface DeployRow {
  date: string;
  thb: number;
}

export interface WeekBucket {
  /** จันทร์ของสัปดาห์นั้น (YYYY-MM-DD) */
  startISO: string;
  /** อาทิตย์ของสัปดาห์นั้น */
  endISO: string;
  legs: number;
  thb: number;
  /** สัปดาห์ที่ยังไม่จบ — ห้ามเอาไปเฉลี่ย ไม่งั้นวันจันทร์ค่าเฉลี่ยจะดิ่งทุกครั้ง */
  current: boolean;
}

export interface PowderFlow {
  /** ใหม่ → เก่า */
  weeks: WeekBucket[];
  current: WeekBucket | null;
  /** เฉลี่ยจาก "สัปดาห์ที่จบแล้ว" เท่านั้น — null = ยังไม่มีสัปดาห์ที่จบให้เฉลี่ย */
  avgThbPerWeek: number | null;
  avgLegsPerWeek: number | null;
  /** เฉลี่ยจากกี่สัปดาห์ — UI ต้องพิมพ์เลขนี้ ไม่งั้น "เฉลี่ย ฿5,000" อ่านไม่ออกว่ามาจาก 1 หรือ 8 สัปดาห์ */
  weeksCounted: number;
}

/** วันจันทร์ของสัปดาห์ที่วันนั้นอยู่ (เที่ยงคืนตามเวลาเครื่อง) */
export const startOfWeek = (d: Date): Date => {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay(): อาทิตย์ = 0 → เลื่อนให้จันทร์ = 0
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
};

const iso = (d: Date): string => {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

/** แปลงวันที่ที่เก็บไว้ (อาจเป็น พ.ศ.) เป็น Date — คืน null ถ้าอ่านไม่ออก ไม่คืนวันนี้ */
const parseDay = (s: string): Date | null => {
  const t = toChristianYear(s || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, m, d] = t.split('-').map(Number);
  const out = new Date(y, m - 1, d);
  return Number.isNaN(out.getTime()) ? null : out;
};

/**
 * แบ่งการซื้อออกเป็นรายสัปดาห์ (จันทร์–อาทิตย์) ย้อนหลัง `weeks` สัปดาห์
 *
 * ค่าเฉลี่ยนับเฉพาะสัปดาห์ที่ **จบแล้ว** และ **ไม่เก่ากว่าการซื้อครั้งแรก** —
 * ถ้านับสัปดาห์เปล่าก่อนหน้าที่จะเริ่มใช้แอปด้วย ค่าเฉลี่ยของคนเพิ่งเริ่มจะถูกถ่วงให้เกือบศูนย์
 * แต่สัปดาห์เปล่า "หลัง" เริ่มลงทุนแล้วต้องนับ — สัปดาห์ที่ไม่ได้ลงคือข้อมูลจริง ไม่ใช่ข้อมูลหาย
 */
export const buildPowderFlow = (
  rows: DeployRow[],
  today: Date,
  weeks = 8
): PowderFlow => {
  const curStart = startOfWeek(today);
  const buckets: WeekBucket[] = [];
  for (let i = 0; i < Math.max(1, weeks); i++) {
    const start = new Date(curStart.getTime() - i * 7 * MS_PER_DAY);
    const end = new Date(start.getTime() + 6 * MS_PER_DAY);
    buckets.push({ startISO: iso(start), endISO: iso(end), legs: 0, thb: 0, current: i === 0 });
  }
  const byStart = new Map(buckets.map((b) => [b.startISO, b]));

  // สัปดาห์แรกสุดที่มีการซื้อ — เทียบเป็น string ได้ตรง ๆ เพราะ YYYY-MM-DD เรียงตามเวลาอยู่แล้ว
  let firstWeek: string | null = null;
  rows.forEach((r) => {
    const d = parseDay(r.date);
    if (!d) return;
    const ws = iso(startOfWeek(d));
    if (firstWeek == null || ws < firstWeek) firstWeek = ws;
    const b = byStart.get(ws);
    // เก่ากว่าช่วงที่แสดง = ไม่เข้าถังไหน แต่ยังนับเป็น "เริ่มลงตั้งแต่เมื่อไหร่" ได้
    if (!b) return;
    b.legs += 1;
    b.thb += r.thb;
  });

  const done = buckets.filter((b) => !b.current && (firstWeek == null || b.startISO >= firstWeek));
  const weeksCounted = done.length;
  const sumThb = done.reduce((s, b) => s + b.thb, 0);
  const sumLegs = done.reduce((s, b) => s + b.legs, 0);

  return {
    weeks: buckets,
    current: buckets[0] ?? null,
    avgThbPerWeek: weeksCounted > 0 ? sumThb / weeksCounted : null,
    avgLegsPerWeek: weeksCounted > 0 ? sumLegs / weeksCounted : null,
    weeksCounted,
  };
};

export interface PowderPace {
  elapsedDays: number;
  spanDays: number;
  /** ถ้าเดินตามจังหวะเป๊ะ ป่านนี้ควรลงไปแล้วกี่ไม้ (ปัดลง — เป็น "อย่างน้อย") */
  legsExpected: number;
  legsUsed: number;
  /** เลยช่วงที่ตั้งไว้มาแล้ว — ไม่ใช่ความผิด แค่แปลว่าก้อนนี้ยืดกว่าที่วางไว้ */
  over: boolean;
  state: 'ahead' | 'on' | 'behind';
  /** วันสุดท้ายของช่วงตามแผน (YYYY-MM-DD) */
  endISO: string;
}

/**
 * เทียบ "เวลาที่ผ่านไป" กับ "ไม้ที่ลงไปแล้ว" — อ่านอย่างเดียว ไม่มีผลกับขนาดไม้
 *
 * ⚠️ ห้ามเอาผลลัพธ์นี้ไปคูณ/หารกับเงิน: ทริกเกอร์ซื้อของกลยุทธ์นี้คือราคา (กฎแท่งแดง)
 * ไม่ใช่ปฏิทิน ถ้าปล่อยให้ปฏิทินไปกำหนดเงิน มันจะกลายเป็น "ต้องลงให้ทันสิ้นสัปดาห์"
 * ซึ่งเป็นพฤติกรรมที่ทั้งระบบออกแบบมาเพื่อไม่ให้เกิด
 */
export const powderPace = (
  startedAt: string | undefined,
  spanDays: number,
  legsPlanned: number,
  legsUsed: number,
  today: Date
): PowderPace | null => {
  const start = startedAt ? parseDay(startedAt) : null;
  if (!start || !(spanDays > 0) || !(legsPlanned > 0)) return null;
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const elapsedDays = Math.max(0, Math.round((t0.getTime() - start.getTime()) / MS_PER_DAY));
  const ratio = Math.min(1, elapsedDays / spanDays);
  const legsExpected = Math.min(legsPlanned, Math.floor(legsPlanned * ratio));
  return {
    elapsedDays,
    spanDays,
    legsExpected,
    legsUsed,
    over: elapsedDays > spanDays,
    state: legsUsed > legsExpected ? 'ahead' : legsUsed < legsExpected ? 'behind' : 'on',
    endISO: iso(new Date(start.getTime() + spanDays * MS_PER_DAY)),
  };
};

/** ช่วงของ "ก้อนนี้" ตามปฏิทิน — ป้ายบอกจังหวะเฉย ๆ ไม่ใช่กำแพงงบ */
export const powderWindow = (
  startedAt: string | undefined,
  spanDays: number
): { startISO: string; endISO: string } | null => {
  const start = startedAt ? parseDay(startedAt) : null;
  if (!start || !(spanDays > 0)) return null;
  return { startISO: iso(start), endISO: iso(new Date(start.getTime() + spanDays * MS_PER_DAY)) };
};
