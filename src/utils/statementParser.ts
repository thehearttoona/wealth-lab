// Parser statement ธนาคาร (generic) — รองรับหลายแบงก์ที่โชว์ "ยอดคงเหลือ" ทุกบรรทัด
//
// หลักการ: ทุกบรรทัดรายการมี "ยอดคงเหลือ" เสมอ เราเลยใช้ยอดคงเหลือ + ผลต่างจากรายการก่อนหน้า
// หาได้ทั้ง "จำนวนเงิน" และ "ทิศทาง" (เข้า/ออก) โดยไม่ต้องรู้คำเฉพาะของแต่ละแบงก์
// รองรับ 3 รูปแบบที่เจอ:
//   A) KBank เต็ม   : 01-01-26 12:47 ... (ปี 2 หลัก, มีเวลา, คำไทย, จำนวนเงินอาจอยู่คนละบรรทัด)
//   B) K PLUS quick : 01/01/26 13:09 X1/X2 ... (สแลช, รหัสช่องทาง X1=เข้า X2=ออก, คอลัมน์คงที่)
//   C) Passbook SAV : 17/01/2569 Transfer SAV Deposit 750.00 754.36 ... (ปี พ.ศ. 4 หลัก, ไม่มีเวลา, คอลัมน์คงที่)
// แบงก์ใหม่ที่มียอดคงเหลือต่อบรรทัดส่วนใหญ่จะเข้าได้เลยโดยไม่ต้องแก้โค้ด

export type TxnDirection = 'in' | 'out';

export interface ParsedTxn {
  date: string;        // YYYY-MM-DD
  time: string;        // HH:MM (ว่างได้ ถ้า statement ไม่มีเวลา)
  amount: number;
  balance: number;
  direction: TxnDirection;
  description: string;
  needsReview: boolean; // true = ทิศทาง/ยอดไม่ชัด ควรตรวจเอง
}

// บรรทัดเริ่มรายการ: DD[-/]MM[-/]YY หรือ YYYY + เวลา HH:MM (ไม่บังคับ)
const DATE_RE = /^(\d{2})[-/](\d{2})[-/](\d{2,4})(?:\s+(\d{2}:\d{2}))?/;
// เลขจำนวนเงิน = มีทศนิยม 2 ตำแหน่งเสมอ (กัน Ref/เลขบัญชี/รหัสไม่ให้ถูกจับ)
const MONEY_RE = /\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2}/g;

// คำที่บ่งบอก "ยอดยกมา" — ตั้งต้นยอดคงเหลือ ไม่ใช่ธุรกรรม
const OPENING_KW = ['ยอดยกมา', 'ยอดเงินคงเหลือยกมา', 'BALANCE BROUGHT FORWARD'];
const isOpening = (t: string) => OPENING_KW.some((k) => t.includes(k));

// คำบอกทิศทาง (เช็ค "เข้า" ก่อน เพราะ "รับโอนเงิน" มี "โอน" อยู่ด้วย)
const IN_KW = ['รับโอนเงิน', 'รับโอน', 'รับเงิน', 'เงินเข้า', 'ดอกเบี้ย', 'เงินปันผล', 'คืนเงิน', 'Deposit'];
const OUT_KW = ['โอนเงิน', 'โอนไป', 'ชําระเงิน', 'ชำระเงิน', 'ถอนเงินสด', 'ถอนเงิน', 'จ่ายบิล', 'Withdraw'];

const parseNum = (s: string): number => parseFloat(s.replace(/,/g, ''));

// ปี → ค.ศ.: 2 หลัก 26→2026 ; 4 หลัก พ.ศ. 2569→2026 ; 4 หลัก ค.ศ. คงเดิม
const toCEYear = (y: string): number => {
  const n = parseInt(y, 10);
  if (y.length <= 2) return 2000 + n;
  return n > 2400 ? n - 543 : n;
};

// ทิศทางจากสัญญาณ: รหัส X1/X2 (บางแบงก์) ก่อน แล้วค่อยคำในข้อความ
const hintDir = (text: string): TxnDirection | null => {
  const m = text.match(/\bX([12])\b/);
  if (m) return m[1] === '1' ? 'in' : 'out';
  if (IN_KW.some((k) => text.includes(k))) return 'in';
  if (OUT_KW.some((k) => text.includes(k))) return 'out';
  return null;
};

export function parseBankStatement(text: string): ParsedTxn[] {
  const lines = text.split(/\r?\n/);

  // บรรทัดเริ่มรายการ = ขึ้นต้นด้วยวันที่
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (DATE_RE.test(lines[i].trim())) starts.push(i);
  }

  const txns: ParsedTxn[] = [];
  let prevBalance: number | null = null;

  // ตั้งยอดตั้งต้นจากบรรทัด "ยอดยกมา" ที่ไม่มีวันที่นำหน้า (เช่น "ยอดยกมา 4.36") ในช่วง [from,to)
  const scanOpening = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      if (isOpening(lines[i])) {
        const m = lines[i].match(MONEY_RE);
        if (m && m.length) prevBalance = parseNum(m[m.length - 1]);
      }
    }
  };
  scanOpening(0, starts.length ? starts[0] : lines.length);

  for (let s = 0; s < starts.length; s++) {
    const start = starts[s];
    const end = s + 1 < starts.length ? starts[s + 1] : lines.length;
    const blob = lines.slice(start, end).join(' ').replace(/\s+/g, ' ').trim();

    const dt = lines[start].trim().match(DATE_RE);
    if (!dt) continue;

    // บรรทัด "ยอดยกมา" (มีวันที่นำหน้า) → ตั้งยอดตั้งต้น ข้ามไป ไม่ใช่ธุรกรรม
    if (isOpening(blob)) {
      const m = blob.match(MONEY_RE);
      if (m && m.length) prevBalance = parseNum(m[m.length - 1]);
      continue;
    }

    const date = `${toCEYear(dt[3])}-${dt[2]}-${dt[1]}`;
    const time = dt[4] || '';
    const isBEYear = dt[3].length === 4; // passbook พ.ศ. → คอลัมน์คงที่ (จำนวน, ยอด อยู่ท้ายสุด)

    const nums = (blob.match(MONEY_RE) || []).map(parseNum);
    if (nums.length === 0) continue;

    const chDir = hintDir(blob);
    let balance: number;
    let amount: number;
    let needsReview = false;

    if ((/\bX[12]\b/.test(blob) || isBEYear) && nums.length >= 2) {
      // คอลัมน์คงที่ (B/C): "... จำนวนเงิน ยอดคงเหลือ" → เอาสองตัวท้าย
      // (กันเคสโอนออกหมดบัญชีที่จำนวนเงิน = ยอดเดิมพอดี — ใช้ตำแหน่งตรงๆ ไม่พึ่งผลต่าง)
      balance = nums[nums.length - 1];
      amount = nums[nums.length - 2];
    } else if (prevBalance != null) {
      // KBank เต็ม (A): ยอดคงเหลือ = เลขที่ใกล้ยอดก่อนหน้าที่สุด (ตัว running)
      balance = nums.reduce(
        (best, n) => (Math.abs(n - prevBalance!) < Math.abs(best - prevBalance!) ? n : best),
        nums[0]
      );
      const others = nums.filter((n) => n !== balance);
      const gap = Math.abs(prevBalance - balance);
      if (others.length === 1) amount = others[0];
      else if (others.length === 0) amount = gap;
      else amount = others.find((n) => Math.abs(n - gap) < 0.01) ?? Math.max(...others);
    } else {
      // ไม่มียอดตั้งต้น + ไม่มีคอลัมน์ชัด → เดา: ยอด = ตัวท้าย
      balance = nums[nums.length - 1];
      amount = nums.length >= 2 ? nums[nums.length - 2] : 0;
      if (!chDir) needsReview = true;
    }

    // ทิศทาง: ผลต่างยอด (แม่นสุด) > สัญญาณ X1/X2 หรือคำ
    const signDir: TxnDirection | null =
      prevBalance != null ? (balance < prevBalance ? 'out' : 'in') : null;
    const direction: TxnDirection = signDir ?? chDir ?? 'out';

    // ตรวจสอบ: ผลต่างยอดควรเท่าจำนวนเงิน / ทิศทางขัดกัน / จำนวน 0
    const gap = prevBalance != null ? Math.abs(prevBalance - balance) : null;
    if (gap != null && Math.abs(gap - amount) > 0.01) needsReview = true;
    if (signDir && chDir && signDir !== chDir) needsReview = true;
    if (amount === 0) needsReview = true;

    // คำอธิบาย: ตัดวันที่หัวบรรทัด + ตัวเลขจำนวนเงินออก เหลือข้อความล้วน
    let description = blob
      .replace(DATE_RE, ' ')
      .replace(/\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (description.length > 120) description = description.slice(0, 120) + '…';

    txns.push({ date, time, amount, balance, direction, description, needsReview });
    prevBalance = balance;
  }

  return txns;
}

// ชื่อเดิม — ให้หน้า import เดิมเรียกใช้ได้ต่อโดยไม่ต้องแก้
export const parseKBankStatement = parseBankStatement;
