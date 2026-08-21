import { RedSignal, RedSignalOutcome } from '../types/redSignal';
import { RedInterval } from '../types/investment';

// ── สรุป/จัดกลุ่มประวัติสัญญาณ "ถึงคิวลงไม้" ──
// pure ทั้งไฟล์ (ไม่มี React ไม่มี services) — ทั้งการ์ดสรุปในพอร์ตและหน้าประวัติ
// ต้องอ่านเลขจากที่นี่ที่เดียว ไม่งั้น "เตือน 12 ครั้ง" บนสองจอจะไม่เท่ากัน

/**
 * สัญญาณครั้งที่เท่าไหร่ของสตรีคเดียวกัน
 * กฎ "ทุก 2 แท่ง" จะเตือนที่ 2/4/6 → แดง 2 = ครั้งที่ 1, แดง 4 = ครั้งที่ 2
 * ต้องแยกครั้ง ไม่ใช่ยุบเป็น "สตรีคเดียว 1 แถว" เพราะแต่ละครั้งคือ "โอกาสลงไม้" คนละไม้กัน
 */
export const roundNoOf = (count: number, every: number): number => {
  const step = Number.isFinite(every) && every >= 1 ? Math.floor(every) : 1;
  return Math.max(1, Math.floor(count / step));
};

/**
 * คีย์กันบันทึกซ้ำ — หน้าพอร์ตเช็คแท่งเทียนใหม่ทุกครั้งที่โฟกัส/ทุก 5 นาที
 * ถ้าไม่มีคีย์นี้ เปิดหน้าพอร์ต 20 ครั้งในวันเดียวจะได้ประวัติ 20 แถวของสัญญาณเดียว
 *
 * ส่วนที่แยก "สัญญาณคนละครั้ง" ออกจากกันคือ streakStartAt + ครั้งที่ (ไม่ใช่จำนวนแท่ง)
 * — สตรีคขาดแล้วก่อตัวใหม่จนยาวเท่ากันพอดีคือสัญญาณใหม่จริง ๆ (เหตุผลเดียวกับ utils/redAlert)
 *
 * API ไม่ให้เวลาแท่งมา (streakStartAt = null) → ใช้ "วันที่เห็นสัญญาณ" แทน
 * ยังกันซ้ำภายในวันเดียวได้ แลกกับการที่สัญญาณข้ามวันของสตรีคเดิมจะถูกนับใหม่ 1 แถว
 * (ยอมได้ — ดีกว่าปล่อยให้เขียนซ้ำทุกครั้งที่เปิดจอ)
 */
export const buildRedSignalKey = (s: {
  type: string;
  symbol: string;
  name: string;
  interval: RedInterval;
  every: number;
  count: number;
  streakStartAt: number | null;
  /** ISO ของเวลาที่เห็นสัญญาณ — ใช้เฉพาะกรณี streakStartAt เป็น null */
  seenAtISO: string;
}): string => {
  const who = `${s.type}:${s.symbol || s.name}`;
  const rule = `${s.interval}:${s.every}`;
  const streak =
    s.streakStartAt != null
      // ปัดเป็นวินาที — ค่าที่วิ่งผ่าน Postgres แล้วกลับมาอาจคลาดกันระดับ ms (เหมือน redAlert)
      ? `s${Math.round(s.streakStartAt / 1000)}`
      : `d${s.seenAtISO.slice(0, 10)}`;
  return `${who}:${rule}:${streak}:r${roundNoOf(s.count, s.every)}`;
};

export interface RedSignalSummary {
  total: number;
  taken: number;
  skipped: number;
  pending: number;
  /** สัญญาณที่ตอนนั้น "เข้าไม่ได้" (ชนเพดานไม้/หมดงบ) — หลักฐานว่าแผนแคบเกินไปหรือพอดี */
  blocked: number;
  /** ทำตามสัญญาณกี่ % — คิดจาก "ที่บันทึกผลแล้ว" เท่านั้น, ยังไม่มีก็เป็น null ไม่ใช่ 0 */
  followRatePercent: number | null;
  /** ร่วงลึกสุดที่เคยเจอ (ค่าติดลบ) */
  deepestDropPercent: number | null;
  firstFiredAt: string | null;
  lastFiredAt: string | null;
}

export const summarizeRedSignals = (list: RedSignal[]): RedSignalSummary => {
  const taken = list.filter((s) => s.outcome === 'taken').length;
  const skipped = list.filter((s) => s.outcome === 'skipped').length;
  const pending = list.filter((s) => s.outcome === 'pending').length;
  const decided = taken + skipped;
  const drops = list.map((s) => s.dropPercent).filter((d) => Number.isFinite(d));
  const fired = list.map((s) => s.firedAt).filter(Boolean).sort();
  return {
    total: list.length,
    taken,
    skipped,
    pending,
    blocked: list.filter((s) => s.enterable === false).length,
    followRatePercent: decided > 0 ? (taken / decided) * 100 : null,
    deepestDropPercent: drops.length > 0 ? Math.min(...drops) : null,
    firstFiredAt: fired[0] ?? null,
    lastFiredAt: fired.length > 0 ? fired[fired.length - 1] : null,
  };
};

export interface RedSignalBySymbol {
  key: string;      // type:symbol — ตัวเดียวกันข้ามชนิดต้องไม่ยุบรวมกัน
  symbol: string;
  type: string;
  total: number;
  taken: number;
  blocked: number;
  deepestDropPercent: number | null;
  lastFiredAt: string | null;
}

/** รายตัว เรียงจากเตือนบ่อยสุด — ตอบว่า "ตัวไหนกินกระสุนเราบ่อยที่สุด" */
export const summarizeBySymbol = (list: RedSignal[]): RedSignalBySymbol[] => {
  const map = new Map<string, RedSignalBySymbol>();
  list.forEach((s) => {
    const symbol = s.symbol || s.name;
    const key = `${s.type}:${symbol}`;
    const cur =
      map.get(key) ??
      {
        key,
        symbol,
        type: s.type,
        total: 0,
        taken: 0,
        blocked: 0,
        deepestDropPercent: null as number | null,
        lastFiredAt: null as string | null,
      };
    cur.total += 1;
    if (s.outcome === 'taken') cur.taken += 1;
    if (s.enterable === false) cur.blocked += 1;
    if (Number.isFinite(s.dropPercent)) {
      cur.deepestDropPercent =
        cur.deepestDropPercent == null ? s.dropPercent : Math.min(cur.deepestDropPercent, s.dropPercent);
    }
    if (s.firedAt && (!cur.lastFiredAt || s.firedAt > cur.lastFiredAt)) cur.lastFiredAt = s.firedAt;
    map.set(key, cur);
  });
  return Array.from(map.values()).sort((a, b) => b.total - a.total || a.symbol.localeCompare(b.symbol));
};

export interface RedSignalMonth {
  month: string;      // 'YYYY-MM' (ค.ศ. — firedAt เป็น ISO จาก DB เสมอ)
  items: RedSignal[];
  taken: number;
}

/**
 * จัดกลุ่มตามเดือน ใหม่ก่อน — ประวัติสะสมยาว ๆ ต้องอ่านเป็นช่วงเวลา ไม่ใช่ลิสต์ 300 แถวติดกัน
 * แถวที่ไม่มี firedAt (ข้อมูลเพี้ยน) ไปอยู่กลุ่ม 'ไม่ทราบวันที่' ไม่ถูกทิ้งเงียบ ๆ (เหมือน activityLog)
 */
export const groupByMonth = (list: RedSignal[]): RedSignalMonth[] => {
  const map = new Map<string, RedSignal[]>();
  list.forEach((s) => {
    const month = s.firedAt && s.firedAt.length >= 7 ? s.firedAt.slice(0, 7) : 'unknown';
    map.set(month, [...(map.get(month) ?? []), s]);
  });
  return Array.from(map.entries())
    .sort((a, b) => (a[0] === 'unknown' ? 1 : b[0] === 'unknown' ? -1 : b[0].localeCompare(a[0])))
    .map(([month, items]) => ({
      month,
      items: [...items].sort((a, b) => (b.firedAt || '').localeCompare(a.firedAt || '')),
      taken: items.filter((s) => s.outcome === 'taken').length,
    }));
};

/** ป้ายสถานะ + สีที่ใช้ทั้งในหน้าประวัติและแถวสรุป — เก็บที่เดียวกันเพื่อไม่ให้สองจอใช้คำต่างกัน */
export const outcomeTone = (outcome: RedSignalOutcome): 'success' | 'muted' | 'warning' =>
  outcome === 'taken' ? 'success' : outcome === 'skipped' ? 'muted' : 'warning';
