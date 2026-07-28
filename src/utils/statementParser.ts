// Parser สำหรับ statement ธนาคาร (รองรับ KBank K PLUS แบบ copy ข้อความมาวาง)
//
// หลักการ: ทุกบรรทัดรายการมี "ยอดคงเหลือ" เสมอ เราเลยไม่ต้องแกะว่าจำนวนเงินอยู่ตรงไหน
// (ซึ่งมันย้ายที่/ขึ้นบรรทัดใหม่แบบ EDC/ATM) — แค่ดูยอดคงเหลือเทียบรายการก่อนหน้า
// ก็ได้ทั้ง "จำนวนเงิน" และ "ทิศทาง" (เข้า/ออก)

export type TxnDirection = 'in' | 'out';

export interface ParsedTxn {
  date: string;        // YYYY-MM-DD
  time: string;        // HH:MM
  amount: number;
  balance: number;
  direction: TxnDirection;
  description: string;
  needsReview: boolean; // true = ทิศทางไม่ชัด/กระทบยอดไม่ลง ควรตรวจเอง
}

// บรรทัดเริ่มรายการ: DD-MM-YY หรือ DD/MM/YY แล้วตามด้วย HH:MM ...
// (K PLUS statement เต็มใช้ขีด "-", ส่วน quick view ใช้สแลช "/")
const DATE_TIME_RE = /^(\d{2})[-/](\d{2})[-/](\d{2})\s+(\d{2}:\d{2})\b/;
// บรรทัดยอดยกมา: DD-MM-YY ยอดยกมา 10,914.50
const OPENING_RE = /^(\d{2})[-/](\d{2})[-/](\d{2})\s+ยอดยกมา\s+([\d,]+\.\d{2})/;
// เลขที่เป็นจำนวนเงิน = มีทศนิยม 2 ตำแหน่งเสมอ (กัน Ref/X6999/(813)/65 ไม่ให้ถูกจับ)
const MONEY_RE = /\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2}/g;

// คำที่บอกทิศทาง (เช็ค "เข้า" ก่อน เพราะ "รับโอนเงิน" มี "โอน" อยู่ด้วย)
const IN_KW = ['รับโอนเงิน', 'รับโอน', 'รับเงิน', 'เงินเข้า', 'ดอกเบี้ย', 'เงินปันผล', 'คืนเงิน'];
const OUT_KW = ['โอนเงิน', 'โอนไป', 'ชําระเงิน', 'ชำระเงิน', 'ถอนเงินสด', 'ถอนเงิน', 'เพื่อชําระ', 'เพื่อชำระ'];

const parseNum = (s: string): number => parseFloat(s.replace(/,/g, ''));

const keywordDir = (text: string): TxnDirection | null => {
  if (IN_KW.some((k) => text.includes(k))) return 'in';
  if (OUT_KW.some((k) => text.includes(k))) return 'out';
  return null;
};

// รหัสช่องทางแบบ K PLUS quick view: X1 = เงินเข้า, X2 = เงินออก (เชื่อได้กว่าคำ)
// ใช้ X พิมพ์ใหญ่ + ขอบคำ กันชนกับเลขบัญชี "x2037" (ตัวเล็ก) ในคำอธิบาย
const channelDir = (text: string): TxnDirection | null => {
  const m = text.match(/\bX([12])\b/);
  if (!m) return null;
  return m[1] === '1' ? 'in' : 'out';
};

const cleanDesc = (blob: string, prefix: string): string => {
  let d = blob.startsWith(prefix) ? blob.slice(prefix.length) : blob;
  d = d.replace(/\s+/g, ' ').trim();
  return d.length > 120 ? d.slice(0, 120) + '…' : d;
};

export function parseKBankStatement(text: string): ParsedTxn[] {
  const lines = text.split(/\r?\n/);

  // หาบรรทัดเริ่มรายการทั้งหมด
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (DATE_TIME_RE.test(lines[i]) || OPENING_RE.test(lines[i])) starts.push(i);
  }

  const txns: ParsedTxn[] = [];
  let prevBalance: number | null = null;

  for (let s = 0; s < starts.length; s++) {
    const start = starts[s];
    const end = s + 1 < starts.length ? starts[s + 1] : lines.length;
    const blob = lines.slice(start, end).join(' ').replace(/\s+/g, ' ').trim();

    // ยอดยกมา — ตั้งต้นยอดคงเหลือ ไม่ใช่ธุรกรรม
    const opening = blob.match(OPENING_RE);
    if (opening) {
      prevBalance = parseNum(opening[4]);
      continue;
    }

    const dt = lines[start].match(DATE_TIME_RE);
    if (!dt) continue;
    const date = `20${dt[3]}-${dt[2]}-${dt[1]}`;
    const time = dt[4];

    const nums = (blob.match(MONEY_RE) || []).map(parseNum);
    if (nums.length === 0) continue;

    // ทิศทางจากสัญญาณที่เชื่อได้: รหัสช่องทาง X1/X2 ก่อน แล้วค่อยคำในข้อความ
    const chDir = channelDir(blob);
    const kwDir = keywordDir(blob);
    const explicitDir = chDir ?? kwDir;

    let balance: number;
    let amount: number;
    let direction: TxnDirection;
    let needsReview = false;

    if (chDir != null && nums.length >= 2) {
      // K PLUS quick view: ลำดับคอลัมน์คงที่ = "... จำนวนเงิน ยอดคงเหลือ"
      // ใช้ตำแหน่งตรงๆ (สองตัวท้าย) — กันเคสโอนออกหมดบัญชีที่จำนวนเงิน = ยอดเดิมพอดี
      balance = nums[nums.length - 1];
      amount = nums[nums.length - 2];
    } else {
      // statement เต็ม: ยอดคงเหลือ = เลขที่ใกล้ยอดก่อนหน้าที่สุด (ตัว running)
      if (prevBalance == null) {
        balance = Math.max(...nums);
        // ไม่มียอดตั้งต้น: เดาทิศทางไม่ได้ก็ต่อเมื่อไม่มีสัญญาณชัด (X1/X2 หรือคำ)
        if (!explicitDir) needsReview = true;
      } else {
        balance = nums.reduce(
          (best, n) => (Math.abs(n - prevBalance!) < Math.abs(best - prevBalance!) ? n : best),
          nums[0]
        );
      }
      // จำนวนเงิน = ดึงจากตัวเลขจริงของรายการนั้น (ไม่พึ่งผลต่างยอด → กันรายการหลุดทำให้เพี้ยน)
      const others = nums.filter((n) => n !== balance);
      const gapForAmt = prevBalance != null ? Math.abs(prevBalance - balance) : null;
      if (others.length === 1) {
        amount = others[0];
      } else if (others.length === 0) {
        amount = gapForAmt ?? 0;
      } else {
        // หลายตัว: เลือกตัวที่เท่ากับผลต่างยอด ถ้าไม่มีก็เอาตัวมากสุด
        amount = (gapForAmt != null && others.find((n) => Math.abs(n - gapForAmt) < 0.01)) || Math.max(...others);
      }
    }

    const gap = prevBalance != null ? Math.abs(prevBalance - balance) : null;

    // ทิศทาง: X1/X2 > คำ > ดูยอดขึ้น/ลง
    const signDir: TxnDirection = prevBalance != null && balance < prevBalance ? 'out' : 'in';
    direction = explicitDir ?? signDir;

    // ตรวจสอบ: ผลต่างยอดควรเท่าจำนวนเงิน ถ้าไม่ = อาจมีรายการหลุด/แกะพลาด
    if (gap != null && Math.abs(gap - amount) > 0.01) needsReview = true;
    if (explicitDir && prevBalance != null && explicitDir !== signDir) needsReview = true;
    if (amount === 0) needsReview = true;

    // คำอธิบาย: ข้อความหลังจำนวนเงินตัวสุดท้าย (K PLUS quick view: ... amount balance<desc>)
    // ถ้าไม่มีข้อความหลังตัวเลข (statement เต็มที่คำอธิบายอยู่หน้าเลข) ใช้ cleanDesc เดิม
    let description = '';
    const moneyToks = blob.match(MONEY_RE);
    if (moneyToks && moneyToks.length) {
      const lastTok = moneyToks[moneyToks.length - 1];
      const idx = blob.lastIndexOf(lastTok);
      if (idx >= 0) description = blob.slice(idx + lastTok.length).replace(/\s+/g, ' ').trim();
    }
    if (!description) description = cleanDesc(blob, dt[0]);
    if (description.length > 120) description = description.slice(0, 120) + '…';

    txns.push({ date, time, amount, balance, direction, description, needsReview });
    prevBalance = balance;
  }

  return txns;
}
