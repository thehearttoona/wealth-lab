import { InvestmentType } from '../types/investment';

// แนวทางทั่วไป (rule of thumb) — % กำไรที่ "เริ่มพิจารณาขายทำกำไร" ตามประเภทสินทรัพย์
// ยิ่งผันผวนสูงตั้งเป้าไว้สูงกว่า เพราะแกว่งแรงกว่า
// *** เป็นแค่แนวทาง ไม่ใช่คำแนะนำการลงทุน — ปรับได้ตามสไตล์แต่ละคน ***
export const SUGGESTED_TAKE_PROFIT: Record<InvestmentType, number> = {
  crypto: 40,
  stock_th: 20,
  stock_foreign: 20,
  fund: 15,
  gold: 12,
  other: 20,
};

export interface TakeProfitSuggestion {
  suggestedPercent: number;
  currentPercent: number;
  reached: boolean;
  gapPercent: number; // อีกกี่ % ถึงจุดพิจารณาขาย (<= 0 = ถึง/เกินแล้ว)
}

export function getTakeProfitSuggestion(
  type: InvestmentType,
  currentPercent: number
): TakeProfitSuggestion {
  const suggestedPercent = SUGGESTED_TAKE_PROFIT[type] ?? 20;
  return {
    suggestedPercent,
    currentPercent,
    reached: currentPercent >= suggestedPercent,
    gapPercent: suggestedPercent - currentPercent,
  };
}
