export const EXPENSE_CATEGORIES = [
  'อาหาร',
  'เดินทาง',
  'ช้อปปิ้ง',
  'บันเทิง',
  'สุขภาพ',
  'การศึกษา',
  'ค่าเช่า',
  'ค่าน้ำค่าไฟ',
  'อื่นๆ',
];

export const COLORS = {
  primary: '#F68048',
  accent: '#00B4D8',
  background: '#0D1B2A',
  surface: '#1B2838',
  error: '#FF6B6B',
  text: '#E0E7EF',
  textSecondary: '#8899AA',
  border: '#2A3F55',
  divider: '#243548',
  success: '#4ECDC4',
};

export const getCurrencySymbol = (currency?: string): string => {
  switch (currency) {
    case 'USD': return '$';
    case 'EUR': return '€';
    case 'JPY': return '¥';
    case 'CNY': return '¥';
    case 'THB':
    default: return '฿';
  }
};

export const formatCurrency = (amount: number): string => {
  return `฿${amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatCurrencyWithType = (amount: number, currency?: string): string => {
  const symbol = getCurrencySymbol(currency);
  // สำหรับค่าที่น้อยกว่า 1 ให้แสดงทศนิยม 4 ตำแหน่ง
  const decimals = amount < 1 ? 4 : 2;
  return `${symbol}${amount.toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
};

export const convertToTHB = (amount: number, currency?: string): number => {
  const exchangeRates: { [key: string]: number } = {
    'THB': 1,
    'USD': 35,
    'EUR': 38,
    'JPY': 0.24,
    'CNY': 4.8,
  };
  const rate = exchangeRates[currency || 'THB'] || 1;
  return amount * rate;
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const getCurrentMonthYear = (): string => {
  const date = new Date();
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
  });
};
