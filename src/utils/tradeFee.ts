// ── ค่าธรรมเนียมของคำสั่งซื้อขาย: ตั้งที่ไหน ใช้ตัวไหนก่อน ──
//
// ตั้งได้สองที่ และมีลำดับชัดเจน:
//   1. **แพลตฟอร์ม** (`user_platforms`) — ตัวจริงของโบรกนั้น ชนะเสมอถ้าตั้งไว้
//   2. **สกุลเงิน** (`user_currencies`) — ค่ามาตรฐานของตลาดที่ซื้อขายด้วยสกุลนั้น
//      ตั้งครั้งเดียวแล้วทุกโบรกที่ยังไม่ได้ตั้งของตัวเองใช้ตัวนี้
//   3. ไม่มีทั้งคู่ = **ไม่รู้ ไม่ใช่ฟรี** → คืน source: null ให้จอพิมพ์บอก
//
// ทำไมต้องมีชั้นสกุลเงิน: โบรกหุ้นไทย 4-5 เจ้าคิดเรตใกล้เคียงกันหมด การบังคับให้พิมพ์
// เลขเดิมซ้ำทุกเจ้าคือความ manual ที่ไม่ได้อะไรกลับมา — และพอลืมตั้งสักเจ้า
// ราคาคุ้มทุนของไม้ที่ซื้อผ่านเจ้านั้นจะขาดค่าธรรมเนียมไปเงียบ ๆ
//
// ⚠️ ขั้นต่ำมีสกุลของมันเอง: IBKR คิด $1 ต่อคำสั่ง ไม่ใช่ 1 บาท
// ทุกอย่างในไฟล์นี้จึงแปลงเป็นบาทให้เรียบร้อยก่อนคืนออกไป (คนใช้ต่อไม่ต้องแปลงเอง)

import { UserCurrency, UserPlatform } from '../types/investment';
import { convertToTHB } from './constants';

/** ค่าธรรมเนียมที่แปลงเป็นบาทแล้ว พร้อมเอาไปคิดต่อ */
export interface ResolvedFee {
  percent?: number;
  minTHB?: number;
  /** มาจากไหน — null = ยังไม่ได้ตั้งที่ไหนเลย (จอต้องบอก ห้ามเงียบ) */
  source: 'platform' | 'currency' | null;
  /** ชื่อที่เอาไปโชว์ว่า "ใช้ค่าธรรมเนียมของอะไรอยู่" */
  sourceLabel?: string;
}

const isSet = (percent?: number, min?: number): boolean => percent != null || min != null;

const byName = <T extends { name?: string; code?: string }>(
  list: T[],
  key: string | undefined,
  field: 'name' | 'code'
): T | undefined => {
  const k = (key || '').trim().toLowerCase();
  if (!k) return undefined;
  return list.find((x) => String(x[field] || '').trim().toLowerCase() === k);
};

/**
 * หาค่าธรรมเนียมที่ใช้จริงของ "ซื้อขายผ่านแพลตฟอร์มนี้ ด้วยสกุลนี้"
 *
 * ชื่อแพลตฟอร์ม/สกุลในไม้เป็น string ล้วน (ไม่ใช่ FK) จึงจับคู่ด้วยชื่อแบบไม่สนตัวพิมพ์
 */
export const resolveTradeFee = (
  platformName: string | undefined,
  currencyCode: string | undefined,
  platforms: UserPlatform[],
  currencies: UserCurrency[]
): ResolvedFee => {
  const p = byName(platforms, platformName, 'name');
  if (p && isSet(p.feePercent, p.feeMinTHB)) {
    return {
      percent: p.feePercent,
      // ขั้นต่ำของแพลตฟอร์มมีสกุลของมันเอง — แปลงเป็นบาทก่อนส่งออก
      minTHB:
        p.feeMinTHB != null ? convertToTHB(p.feeMinTHB, p.feeMinCurrency || 'THB') : undefined,
      source: 'platform',
      sourceLabel: p.name,
    };
  }

  const c = byName(currencies, currencyCode, 'code');
  if (c && isSet(c.feePercent, c.feeMin)) {
    return {
      percent: c.feePercent,
      // ขั้นต่ำของสกุลเงินอยู่ในหน่วยของสกุลนั้นเสมอ (USD 1 = 1 ดอลลาร์)
      minTHB: c.feeMin != null ? convertToTHB(c.feeMin, c.code) : undefined,
      source: 'currency',
      sourceLabel: c.code,
    };
  }

  return { source: null };
};

/** ค่าธรรมเนียมเป็นบาทของคำสั่งมูลค่า `amountTHB` — null = ยังไม่ได้ตั้ง (ไม่ใช่ฟรี) */
export const tradeFeeTHB = (fee: ResolvedFee, amountTHB: number): number | null => {
  if (fee.source == null) return null;
  return Math.max(((fee.percent ?? 0) * amountTHB) / 100, fee.minTHB ?? 0);
};
