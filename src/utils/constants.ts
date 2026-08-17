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

// ── สีหลัก ──
// ทุกค่าที่ใช้เป็น "ตัวอักษร" ผ่านเกณฑ์ WCAG AA (4.5:1) บนพื้นขาวและพื้น background แล้ว
// ตัวเลขในวงเล็บคืออัตราส่วนคอนทราสต์บน #F6F8FB ซึ่งเป็นพื้นที่ข้อความส่วนใหญ่วางอยู่
// (ชุดเดิม success #22A06B = 3.33 · error #D64545 = 4.38 · textSecondary #64748B = 4.47 ตกทั้งสามตัว)
export const COLORS = {
  primary: '#294E80',        // 8.4 — ผ่าน AAA
  accent: '#D6B35A',         // 2.0 — ⚠️ พื้น/แถบเท่านั้น ห้ามใช้เป็นสีตัวอักษร ใช้ accentText แทน
  accentText: '#8A6D1F',     // 4.9 — ทองเวอร์ชันที่อ่านออก สำหรับตัวอักษร/เส้นขอบสถานะ
  background: '#F6F8FB',
  surface: '#FFFFFF',

  success: '#15805A',        // 4.9
  error: '#C13333',          // 5.5
  warning: '#9A5B00',        // 5.1

  text: '#172033',
  textSecondary: '#5A6675',  // 5.5

  border: '#E2E8F0',
  divider: '#F1F5F9',
};

// ── ความโค้งของมุม ──
// เดิมทั้งแอปเป็น 0 (เหลี่ยมล้วน) ซึ่งอ่านเป็น "ตารางระบบหลังบ้าน" มากกว่าแอปที่เปิดดูทุกวัน
// ไล่ระดับตามขนาดของกล่อง: ยิ่งกล่องใหญ่ มุมยิ่งโค้งได้มากโดยไม่ดูบวม
export const RADIUS = {
  sm: 8,     // ชิป ป้ายเล็ก
  md: 12,    // ปุ่ม ช่องกรอก
  lg: 16,    // การ์ด
  xl: 20,    // การ์ดใหญ่/โมดัล
  pill: 999, // ปุ่มกลม แถบความคืบหน้า
} as const;

// ── เงา ──
// react-native-web แปลง shadow* เป็น box-shadow ให้เอง ส่วน elevation ใช้ฝั่ง Android
// เงาอ่อนมากโดยตั้งใจ — หน้าที่ของมันคือบอกว่า "นี่คือของชิ้นหนึ่ง" ไม่ใช่ทำให้ลอย
export const SHADOW = {
  card: {
    shadowColor: '#0B1B33',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  lift: {
    shadowColor: '#0B1B33',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
} as const;

// ── สีประจำชนิดสินทรัพย์ ──
// ให้แต่ละชนิดจำได้ด้วยสีตั้งแต่ยังไม่อ่านตัวหนังสือ — ไล่ดูพอร์ตยาว ๆ แล้วแยกออกทันที
// ทุกค่าเข้มพอจะเป็นสีไอคอนบนพื้นอ่อน (≥ 4.5:1 บนขาว) ใช้คู่กับ assetTint() เป็นพื้นวงกลม
export const ASSET_COLORS: { [type: string]: string } = {
  stock_th: '#1F7A4D',
  stock_foreign: '#2563A8',
  fund: '#6B4FA8',
  crypto: '#B4621A',
  gold: '#8A6D1F',
  other: '#5A6675',
};

export const assetColor = (type?: string): string =>
  ASSET_COLORS[type || 'other'] || ASSET_COLORS.other;

/** พื้นอ่อนของสีชนิดสินทรัพย์ — ใช้เป็นพื้นหลังวงไอคอน/ชิป (ตัวอักษรยังใช้สีเข้มตัวเต็ม) */
export const assetTint = (type?: string): string => `${assetColor(type)}16`;

// ── สีสำหรับกราฟ ──
// ห้ามใช้คู่ เขียว/แดง เด็ดขาด — ตรวจด้วย simulation ตาบอดสีเขียว-แดง (deuteranopia) แล้ว
// #22A06B ↔ #D64545 ได้ ΔE แค่ 5.4 (เกณฑ์ต้อง ≥ 8) คนตาบอดสีจะเห็นเป็นสีเดียวกัน
// ส่วน COLORS.primary (#294E80) ใช้ในกราฟไม่ผ่านเพราะเข้มเกินย่าน (L 0.422) และสีจางเกิน (C 0.094)
// #3A6DB0 คือ primary ที่สว่างขึ้นหนึ่งขั้น เฉดเดียวกัน ผ่านครบทุกเกณฑ์ (ΔE 19.3 กับเขียว)
export const CHART = {
  income: '#22A06B',
  expense: '#3A6DB0',
  /** แท่งหมวดรายจ่าย — หมวดไม่มีลำดับในตัวเอง จึงใช้สีเดียวทั้งหมด
   *  ไล่เฉดตามยอดคือเอาช่องทางสีไปย้ำสิ่งที่ความยาวแท่งบอกอยู่แล้ว */
  bar: '#3A6DB0',
  grid: '#E2E8F0',
} as const;

// ── ฟอนต์ ──
// ทั้งแอปใช้ Noto Sans Thai ตัวเดียว น้ำหนักมาจาก "ไฟล์" ไม่ใช่ fontWeight
// ⚠️ ห้ามใส่ fontWeight คู่กับ fontFamily เด็ดขาด — เว็บจะ fake-bold ทับไฟล์ที่มีน้ำหนักอยู่แล้ว
// (เคยเป็นบั๊กกระจาย 19 ไฟล์ เพราะแต่ละหน้าจอเขียน style เองหมด)
export const FONTS = {
  light: 'NotoSansThai_300Light',
  regular: 'NotoSansThai_400Regular',
  medium: 'NotoSansThai_500Medium',
  semibold: 'NotoSansThai_600SemiBold',
} as const;

/**
 * ชุดขนาด+น้ำหนักที่ใช้ซ้ำทั้งแอป — กระจายลง StyleSheet ได้เลย
 * เช่น  title: { ...TEXT.title, color: COLORS.text }
 */
export const TEXT = {
  screenTitle: { fontSize: 20, fontFamily: FONTS.semibold },
  title: { fontSize: 16, fontFamily: FONTS.semibold },
  subtitle: { fontSize: 14, fontFamily: FONTS.medium },
  body: { fontSize: 14, fontFamily: FONTS.regular },
  label: { fontSize: 13, fontFamily: FONTS.medium },
  caption: { fontSize: 12, fontFamily: FONTS.regular },
  hint: { fontSize: 11, fontFamily: FONTS.light },
  amount: { fontSize: 22, fontFamily: FONTS.semibold },
} as const;

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

// แปลงบาทกลับเป็นสกุลอื่น (ตรงข้ามกับ convertToTHB) — ใช้เรตชุดเดียวกัน ยอดจึงกลับไปกลับมาได้ตรง
// ใช้กับยอดรวมที่รวมมาเป็นบาทแล้ว แต่อยากโชว์คู่กันว่าเทียบเป็นดอลลาร์ได้เท่าไหร่
export const convertFromTHB = (amountTHB: number, currency?: string): number => {
  const rate = currencyRates[currency || 'THB'] || 1;
  return rate > 0 ? amountTHB / rate : amountTHB;
};

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

// ทั้งสามตัวใช้ th-TH ปีที่ได้จึงเป็น พ.ศ. — ตรงกับที่ toChristianYear แปลงขาเข้าไว้เป็น ค.ศ. แล้ว
export const formatDate = (dateString: string): string => {
  const date = new Date(toChristianYear(dateString));
  return date.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export const formatDateShort = (dateString: string): string => {
  const date = new Date(toChristianYear(dateString));
  return date.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const getCurrentMonthYear = (): string => {
  const date = new Date();
  return date.toLocaleDateString('th-TH', {
    month: 'long',
    year: 'numeric',
  });
};
