// หมวด "ลงทุน" ถูกกันออกจากงบใช้จ่ายในการ์ดแผนเติมเงิน (เงินลงทุนไม่ใช่เงินที่ใช้หมดไป)
// ถ้าไม่แยกออก การโอนเข้าลงทุนจะถูกนับเป็นรายจ่าย ทำให้ดูเหมือนใช้เกินงบทั้งที่เป็นการออม
export const INVEST_EXPENSE_CATEGORY = 'ลงทุน';

export const EXPENSE_CATEGORIES = [
  'อาหาร',
  'เดินทาง',
  'ช้อปปิ้ง',
  'บันเทิง',
  'สุขภาพ',
  'การศึกษา',
  'ค่าเช่า',
  'ค่าน้ำค่าไฟ',
  INVEST_EXPENSE_CATEGORY,
  'อื่นๆ',
];

export const COLORS = {
  primary: '#294E80',
  accent: '#D6B35A',
  background: '#F6F8FB',
  surface: '#FFFFFF',

  success: '#22A06B',
  error: '#D64545',
  warning: '#D97706',

  text: '#172033',
  textSecondary: '#64748B',

  border: '#E2E8F0',
  divider: '#F1F5F9',
};

// ── แคชสกุลเงินที่ผู้ใช้ตั้งเอง ──
// convertToTHB/getCurrencySymbol ถูกเรียกแบบ sync จากทุกหน้าจอ เลย await Supabase ตรงนี้ไม่ได้
// วิธีคือให้ services/currencyStorage.ts โหลดรายการมาใส่แคชนี้ตอนเข้าแอป (refreshCurrencyCache)
// ถ้ายังไม่ได้โหลด/ยังไม่ได้รัน SQL จะใช้ค่าเริ่มต้นข้างล่างแทน — ตัวเลขเดิมก่อนมีหน้าจัดการ
const DEFAULT_SYMBOLS: { [code: string]: string } = { THB: '฿', USD: '$', EUR: '€', JPY: '¥', CNY: '¥' };
const DEFAULT_RATES: { [code: string]: number } = { THB: 1, USD: 35, EUR: 38, JPY: 0.24, CNY: 4.8 };

let currencySymbols: { [code: string]: string } = { ...DEFAULT_SYMBOLS };
let currencyRates: { [code: string]: number } = { ...DEFAULT_RATES };

export const setCurrencyCatalog = (
  list: { code: string; symbol?: string; rateToTHB?: number }[]
): void => {
  const symbols: { [code: string]: string } = {};
  const rates: { [code: string]: number } = {};
  list.forEach((c) => {
    if (!c.code) return;
    if (c.symbol) symbols[c.code] = c.symbol;
    if (typeof c.rateToTHB === 'number' && c.rateToTHB > 0) rates[c.code] = c.rateToTHB;
  });
  // บาทต้องเป็น 1 เสมอ ไม่ว่าผู้ใช้จะกรอกอะไรมา ไม่งั้นยอดรวมทั้งแอปเพี้ยนหมด
  rates.THB = 1;
  currencySymbols = { ...DEFAULT_SYMBOLS, ...symbols };
  currencyRates = { ...DEFAULT_RATES, ...rates };
};

export const getCurrencySymbol = (currency?: string): string =>
  currencySymbols[currency || 'THB'] || currency || '฿';

export const formatCurrency = (amount: number): string => {
  return `${amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatCurrencyWithType = (amount: number, currency?: string): string => {
  const symbol = getCurrencySymbol(currency);
  // สำหรับค่าที่น้อยกว่า 1 ให้แสดงทศนิยม 4 ตำแหน่ง
  const decimals = amount < 1 ? 4 : 2;
  return `${symbol}${amount.toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
};

export const convertToTHB = (amount: number, currency?: string): number =>
  amount * (currencyRates[currency || 'THB'] || 1);

// สกุลไหนยังไม่มีเรต = ถูกคิดเป็น 1:1 กับบาท ใช้เตือนในหน้าจัดการสกุลเงิน
export const hasCurrencyRate = (code: string): boolean => currencyRates[code] > 0;

// แปลงปีพุทธศักราช (2568) → คริสต์ศักราช (2025) ถ้าจำเป็น
export const toChristianYear = (dateString: string): string => {
  if (!dateString) return dateString;
  const parts = dateString.split('-');
  if (parts.length < 1) return dateString;
  const year = parseInt(parts[0], 10);
  // ปีไทย (BE) จะมีค่า > 2400 เช่น 2568
  if (year > 2400) {
    parts[0] = String(year - 543);
    return parts.join('-');
  }
  return dateString;
};

export const formatDate = (dateString: string): string => {
  const date = new Date(toChristianYear(dateString));
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const formatDateShort = (dateString: string): string => {
  const date = new Date(toChristianYear(dateString));
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const getCurrentMonthYear = (): string => {
  const date = new Date();
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });
};
