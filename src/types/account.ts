import { Currency } from './investment';

// บทบาทของบัญชี — ใช้จัดว่าเงินก้อนนี้ทำหน้าที่อะไร
export type AccountRole = 'spending' | 'reserve' | 'income' | 'other';

export interface Account {
  id: string;
  name: string;          // ชื่อบัญชี เช่น "บริษัท", "USD รอลงทุน"
  currency: Currency;    // สกุลเงินของบัญชี ('THB' | 'USD' | ...)
  role: AccountRole;     // ใช้จ่าย / รอลงทุน(สำรอง) / พักรายได้ / อื่นๆ
  manualBalance?: number; // ยอดคงเหลือกรอกเอง — สำหรับบัญชี reserve = "ยอดที่เติมเข้าทั้งหมด" (ระบบหักที่ซื้อไปแล้วให้)
  platform?: string;     // แพลตฟอร์มของบัญชี reserve เช่น Bitkub — ผูกกับ investment.platform เพื่อหักต้นทุนที่ซื้อไปแล้ว
  createdAt: string;
}

export const ACCOUNT_ROLES: { value: AccountRole; label: string; icon: string }[] = [
  { value: 'spending', label: 'ใช้จ่าย', icon: 'card-outline' },
  { value: 'reserve', label: 'รอลงทุน (สำรอง)', icon: 'wallet-outline' },
  { value: 'income', label: 'พักรายได้', icon: 'download-outline' },
  { value: 'other', label: 'อื่นๆ', icon: 'ellipsis-horizontal-outline' },
];

export const ACCOUNT_CURRENCIES: Currency[] = ['THB', 'USD', 'EUR', 'JPY', 'CNY'];
