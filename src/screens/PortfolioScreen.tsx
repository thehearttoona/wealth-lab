import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
  AppState,
  StyleProp,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import {
  Investment,
  InvestmentType,
  PortfolioSummary,
  INVESTMENT_TYPES,
  RealizedTrade,
  RedInterval,
  RED_INTERVALS,
  DEFAULT_RED_INTERVAL,
  DEFAULT_RED_EVERY,
} from '../types/investment';
import { getRealizedTrades, saveRealizedTrade } from '../services/realizedStorage';
import { summarizeRealized } from '../utils/realizedAnalysis';
import {
  getInvestments,
  deleteInvestment,
  getPortfolioSummary,
  summarizeInvestments,
  updateInvestment,
  updateInvestmentPrices,
  setRedAck,
} from '../services/investmentStorage';
import { isRedAckActive, isRedAckStale } from '../utils/redAlert';
import {
  formatCurrency,
  formatCurrencyWithType,
  convertToTHB,
  toChristianYear,
  COLORS,
} from '../utils/constants';
import { notify, confirmAsk } from '../utils/dialog';
import { fetchPricesForItems, isPriceRefreshable, getTwoRedDays } from '../services/priceApi';
import { analyzePortfolioGoal, PortfolioGoal, PortfolioGoalAnalysis } from '../utils/investmentGoals';
import { getPortfolioGoal, savePortfolioGoal, deletePortfolioGoal } from '../services/portfolioGoalStorage';
import {
  getInvestmentPlan,
  saveInvestmentPlan,
  InvestmentPlan,
  DryPowderItem,
  sumDryPowderItems,
} from '../services/investmentPlanStorage';
import { getHoldingAnnualGrowth } from '../utils/holdingAnalysis';
import { useResponsive } from '../utils/responsive';
import { TaxProfile, GAIN_RULE_LABELS, emptyTaxProfile } from '../types/tax';
import { getTaxProfile } from '../services/taxStorage';
import { PurchaseGoal } from '../types/purchaseGoal';
import { getPurchaseGoals } from '../services/purchaseGoalStorage';
import { planPurchaseGoals } from '../utils/purchaseGoals';
import { calculateTax, estimateGainTax, taxYearOf } from '../utils/taxCalc';
import { UserProfile, incomeExemptionFor } from '../types/userProfile';
import { getUserProfile } from '../services/userProfileStorage';
import { InvestmentCycle, basketLabel } from '../types/cycle';
import { getOpenCycles } from '../services/cycleStorage';
import { legsOfCycle, summarizeCycle, canAddLeg } from '../utils/cycles';

type PortfolioScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Portfolio'
>;

// รอบ auto refresh ราคา — 5 นาที เท่ากันทุกประเภท
// ข้อควรรู้: หุ้นต่างประเทศวิ่งผ่าน Twelve Data แผนฟรี (800 request/วัน) รอบ 5 นาที
// = 12 รอบ/ชม. ต่อ 1 ตัว ถ้ามีหุ้นนอกหลายตัวและเปิดหน้านี้ทิ้งไว้นาน ๆ โควตาจะหมดได้ใน 1 วัน
// (หมดแล้วจะ fallback ไป Yahoo proxy ให้เอง ราคายังมาแต่ช้าลง) — ตัวกันหลักคือ
// interval หยุดเมื่อแท็บซ่อน/แอปลงพื้นหลัง/สลับไปหน้าอื่น ดูใน useEffect ด้านล่าง
const PRICE_REFRESH_MS = 5 * 60 * 1000;

// จังหวะ "เช็คว่าถึงรอบหรือยัง" — ไม่ใช่รอบรีเฟรช รอบจริงมาจาก nextRefreshAt ตัวเดียว
// (เดิม interval ยิงทุก 5 นาทีตรง ๆ ซึ่งไม่ผูกกับเวลาที่ดึงสำเร็จจริง กดปุ่มรีเฟรชเองแล้ว
//  นาฬิกาตัวนั้นไม่ขยับ ตัวนับถอยหลังกับเวลายิงจริงจะไม่ตรงกัน)
const PRICE_TICK_MS = 5 * 1000;

// mm:ss — ปัดขึ้นเพื่อไม่ให้โชว์ 0:00 ค้างทั้งวินาทีสุดท้าย
const formatCountdown = (ms: number): string => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

// ── สถานะราคา + นับถอยหลังรอบถัดไป (มุมขวาบนของหัวพอร์ต) ──
// แยกเป็นคอมโพเนนต์ต่างหากเพราะต้องวาดใหม่ทุกวินาที — ถ้าเก็บ tick ไว้ใน PortfolioScreen
// ทั้งหน้า (FlatList ทุกแถว + การ์ดสรุปทุกใบ) จะถูก re-render วินาทีละครั้ง
const PriceRefreshStatus: React.FC<{
  isUpdating: boolean;
  lastRefresh: Date | null;
  nextRefreshAt: Date | null;
  style?: StyleProp<TextStyle>;
  /** ปุ่มรีเฟรชอยู่ติดกับเวลานับถอยหลัง — เดิมเป็นไอคอนลอยอยู่แถวปุ่มด้านล่าง
   *  ซึ่งไกลจากข้อความที่บอกว่าราคาสดแค่ไหน คนละที่กับที่เกิดคำถาม */
  onRefresh?: () => void;
}> = ({ isUpdating, lastRefresh, nextRefreshAt, style, onRefresh }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (isUpdating || !nextRefreshAt) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [isUpdating, nextRefreshAt]);

  const at = lastRefresh
    ? lastRefresh.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    : null;
  const leftMs = nextRefreshAt ? nextRefreshAt.getTime() - Date.now() : null;
  // ครบรอบแล้วแต่ยังไม่ได้ยิง (แท็บซ่อนอยู่ / รอ tick ถัดไป) — บอกว่ากำลังจะยิง ไม่ใช่นับเป็นเลขติดลบ
  const countdown = leftMs == null ? null : leftMs <= 0 ? 'กำลังจะอัปเดต' : `อีก ${formatCountdown(leftMs)}`;

  const label = isUpdating
    ? 'กำลังดึงราคา...'
    : !at
      ? 'ยังไม่ได้ดึงราคารอบนี้'
      : `ราคาอัปเดต ${at}${countdown ? ` · ${countdown}` : ''}`;

  return (
    <View style={styles.priceStatusRow}>
      <Text style={style}>{label}</Text>
      {onRefresh && (
        <TouchableOpacity
          style={styles.priceStatusRefresh}
          onPress={onRefresh}
          disabled={isUpdating}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {isUpdating ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="refresh-outline" size={16} color="#ffffff" />
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

// ปีภาษีปัจจุบันเป็น พ.ศ. — ใช้ทั้งดึง TaxProfile และกรองไม้ที่ขายปีนี้
const currentTaxYear = new Date().getFullYear() + 543;

// ── ค่ากริดเดสก์ท็อป (ต้องตรงกับ styles.flatListRow / styles.cardGrid) ──
// COL_TARGET = ความกว้างการ์ดที่อ่านสบาย: เนื้อในเป็นชื่อ + ราคา + กำไร ซึ่งกว้างเกิน ~420
// ก็แค่เพิ่มที่ว่างกลางการ์ด ไม่ได้อ่านง่ายขึ้น จำนวนคอลัมน์จึงโตแทนความกว้างการ์ด
const GRID_COL_TARGET = 380;
const GRID_GAP = 12;
const GRID_PADDING = 16;
// เพดานคอลัมน์ — จอ 5K ที่ 12 คอลัมน์อ่านไม่ทันอยู่ดี และ FlatList แถวละ 12 ใบเริ่มหนัก
const GRID_MAX_COLS = 6;
// การ์ดสรุปด้านหัว (เป้าหมาย/ภาษี/ผลงานจริง/เงินรอลงทุน) — กว้างกว่าการ์ดรายการเพราะมี KPI 3 ช่อง
const CARD_GRID_BASIS = 520;

// ── เครื่องหมายแพลตฟอร์มมุมขวาบนของการ์ด ──
// ไม่ได้ดึงโลโก้จริงจากเน็ต: ชื่อแพลตฟอร์มเป็นข้อความที่ผู้ใช้พิมพ์เองได้อิสระ (user_platforms)
// จับคู่กับโดเมนไม่ได้ทุกตัว และการยิงขอ favicon ก็คือส่งชื่อแพลตฟอร์มที่เราถือออกไปนอกแอป
// จึงทำเป็นตัวย่อ + สีประจำแบรนด์ในเครื่อง ทำงานออฟไลน์ ไม่มีรูปแตก
const PLATFORM_BRANDS: { keys: string[]; short: string; color: string }[] = [
  { keys: ['binance'], short: 'BN', color: '#F0B90B' },
  { keys: ['bitkub'], short: 'BK', color: '#16A34A' },
  { keys: ['bybit'], short: 'BY', color: '#F7A600' },
  { keys: ['okx', 'okex'], short: 'OK', color: '#2B2B2B' },
  { keys: ['gate'], short: 'GT', color: '#2354E6' },
  { keys: ['dime'], short: 'DM', color: '#00C48C' },
  { keys: ['innovestx', 'innovest', 'scbs'], short: 'IX', color: '#4B2E83' },
  { keys: ['liberator'], short: 'LB', color: '#111827' },
  { keys: ['settrade'], short: 'ST', color: '#0F5AA8' },
  { keys: ['webull'], short: 'WB', color: '#1F6FEB' },
  { keys: ['interactive', 'ibkr'], short: 'IB', color: '#D4212A' },
  { keys: ['kbank', 'กสิกร', 'k-my', 'kmy'], short: 'KB', color: '#0B8E36' },
  { keys: ['scb', 'ไทยพาณิชย์'], short: 'SC', color: '#4B2E83' },
  { keys: ['krungsri', 'กรุงศรี'], short: 'KS', color: '#A28C57' },
  { keys: ['ktb', 'krungthai', 'กรุงไทย'], short: 'KT', color: '#00A0E9' },
  { keys: ['bualuang', 'bbl', 'บัวหลวง'], short: 'BL', color: '#1A4C8B' },
  { keys: ['finnomena'], short: 'FN', color: '#1F7A5C' },
  { keys: ['ทอง', 'gold', 'ห้างทอง', 'ausiris', 'ylg'], short: 'AU', color: '#B8860B' },
];

// สีสำรองสำหรับแพลตฟอร์มที่ไม่รู้จัก — เลือกจากชื่อแบบคงที่ ชื่อเดิมได้สีเดิมทุกครั้ง
const PLATFORM_FALLBACK_COLORS = ['#5B6B8C', '#7A5C8E', '#3F7C6A', '#8C6239', '#4A6F8A', '#7C5A5A'];

const platformMark = (name: string): { short: string; color: string } => {
  const lower = name.trim().toLowerCase();
  const hit = PLATFORM_BRANDS.find((b) => b.keys.some((k) => lower.includes(k)));
  if (hit) return { short: hit.short, color: hit.color };
  // ตัวย่อ: อักษรแรกของสองคำแรก (ชื่อไทยคำเดียวก็เอา 2 ตัวแรก) — ต้องได้อะไรออกมาเสมอ
  const words = name.trim().split(/[\s\-_/·•]+/).filter(Boolean);
  const short = (
    words.length >= 2 ? words[0][0] + words[1][0] : name.trim().slice(0, 2)
  ).toUpperCase();
  let hash = 0;
  for (let i = 0; i < lower.length; i++) hash = (hash * 31 + lower.charCodeAt(i)) % 100000;
  return { short, color: PLATFORM_FALLBACK_COLORS[hash % PLATFORM_FALLBACK_COLORS.length] };
};

/**
 * บรรทัดเมนูของพอร์ต: ชื่อเรื่อง + ตัวเลขล่าสุด + บรรทัดขยายความ แล้วกดเข้าไปหน้าเต็ม
 *
 * ⚠️ ต้องอยู่นอก PortfolioScreen — คอมโพเนนต์ที่ประกาศในตัว render จะเป็น "ชนิดใหม่"
 * ทุกครั้งที่ state ขยับ React จึง unmount/mount ทั้งซับทรี (ดู CLAUDE.md §1.13)
 */
const MenuRow: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  sub: string;
  valueNegative?: boolean;
  /** แถวบนสุดของการ์ด — เส้นคั่นเป็น "ขอบบน" ของทุกแถวยกเว้นแถวแรก
   *  (ใช้ขอบล่างไม่ได้ เพราะแถวสุดท้ายเป็นแถวที่ซ่อนได้ตามเงื่อนไข แล้วจะเหลือเส้นซ้อนขอบการ์ด) */
  first?: boolean;
  onPress: () => void;
}> = ({ icon, title, value, sub, valueNegative, first, onPress }) => (
  <TouchableOpacity style={[styles.menuRow, first && styles.menuRowFirst]} onPress={onPress}>
    <Ionicons name={icon} size={18} color={COLORS.primary} style={styles.menuRowIcon} />
    <View style={styles.menuRowMain}>
      <Text style={styles.menuRowTitle}>{title}</Text>
      <Text style={styles.menuRowSub} numberOfLines={2}>{sub}</Text>
    </View>
    <Text style={[styles.menuRowValue, valueNegative && styles.menuRowValueNeg]}>{value}</Text>
    <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
  </TouchableOpacity>
);

export default function PortfolioScreen() {
  const navigation = useNavigation<PortfolioScreenNavigationProp>();
  const { isDesktop, width: windowWidth, sidebarWidth } = useResponsive();
  // ── กริดเต็มจอ: ไม่จำกัด max-width แล้ว จอยิ่งกว้างยิ่งได้จำนวนคอลัมน์มากขึ้น ──
  // ถ้าปล่อยเต็มจอโดยคง numColumns={2} ไว้ การ์ดจะอ้วน ~1140px บนจอ 2560 (แย่กว่าเดิม)
  // จึงต้องคิดคอลัมน์จากความกว้างจริงของ pane โดยล็อกความกว้างการ์ดไว้ราว ๆ COL_TARGET
  // ค่าเริ่มต้นเดาจาก window - sidebar เพื่อให้ paint แรกได้จำนวนคอลัมน์ถูกเลย
  // (ไม่ใช้ 0 ไม่งั้น FlatList เปลี่ยน key → กระพริบ 1 เฟรม) แล้ว onLayout ค่อยแก้ให้ตรง
  const [gridWidth, setGridWidth] = useState(() =>
    isDesktop ? Math.max(0, windowWidth - sidebarWidth) : 0
  );
  const { gridCols, gridCardWidth } = useMemo(() => {
    const usable = gridWidth - GRID_PADDING * 2;
    if (!isDesktop) return { gridCols: 1, gridCardWidth: null as number | null };
    // ยังไม่รู้ความกว้าง → 2 คอลัมน์แบบยืดเอง (ห้ามคืน 1 เพราะ columnWrapperStyle
    // ใช้กับ numColumns=1 ไม่ได้ RN จะ warn)
    if (usable <= 0) return { gridCols: 2, gridCardWidth: null as number | null };
    const cols = Math.max(
      2,
      Math.min(GRID_MAX_COLS, Math.floor((usable + GRID_GAP) / (GRID_COL_TARGET + GRID_GAP)))
    );
    // ล็อกความกว้างเป็นตัวเลข ไม่ใช้ flex:1 — ไม่งั้นแถวสุดท้ายที่มีการ์ดไม่ครบคอลัมน์
    // จะยืดเต็มแถว (เช่น 1 ใบใน 4 คอลัมน์ = อ้วนกว่าใบอื่น 4 เท่า)
    const cardWidth = Math.floor((usable - GRID_GAP * (cols - 1)) / cols);
    return { gridCols: cols, gridCardWidth: cardWidth };
  }, [isDesktop, gridWidth]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary>({
    totalValue: 0,
    totalCost: 0,
    totalProfit: 0,
    totalProfitPercent: 0,
    byType: {},
  });
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  // เวลาที่ดึงราคาสำเร็จครั้งล่าสุด — โชว์ข้างปุ่มรีเฟรช และใช้ตัดสินว่าราคาเก่าพอจะยิงใหม่หรือยัง
  const [lastPriceRefresh, setLastPriceRefresh] = useState<Date | null>(null);
  // กำหนดยิงรอบถัดไป = เวลาที่เริ่มยิงรอบล่าสุด + 5 นาที — เป็นทั้งเงื่อนไขที่ interval ใช้ตัดสิน
  // และเลขที่ตัวนับถอยหลังโชว์ ทั้งสองอย่างจึงตรงกันเสมอ (แหล่งความจริงเดียว)
  // ตั้งตอน "เริ่มยิง" ไม่ใช่ตอนสำเร็จ ไม่งั้นรอบที่ fail จะวนยิงใหม่ทุก tick จนเปลืองโควตา
  const [nextRefreshAt, setNextRefreshAt] = useState<Date | null>(null);
  // หน้านี้กำลังถูกดูอยู่ไหม — auto refresh ต้องหยุดเมื่อสลับไปหน้าอื่น
  const [screenFocused, setScreenFocused] = useState(false);
  // refs: ตัว interval อ่านค่าล่าสุดได้โดยไม่ต้องผูก dependency แล้ว re-create interval ทุกครั้งที่ state ขยับ
  const investmentsRef = useRef<Investment[]>([]);
  const nextRefreshAtRef = useRef<Date | null>(null);
  const refreshInFlight = useRef(false);
  const [goal, setGoal] = useState<PortfolioGoal | null>(null);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [goalTargetInput, setGoalTargetInput] = useState('');
  const [goalExpectedInput, setGoalExpectedInput] = useState('');
  // แผนลงทุน: หน้านี้อ่านอย่างเดียว (ใช้หาร "ลงได้ครั้งละเท่าไหร่" ให้การ์ดถึงคิวลงไม้)
  // + เขียนตอนติ๊ก "เพิ่มเข้าเงินรอลงทุน" ในฟอร์มขาย — การตั้งค่าอยู่ที่หน้า "เงินรอลงทุน"
  const [plan, setPlan] = useState<InvestmentPlan | null>(null);
  // แท่งแดงติดกันเป็นเลขคู่ (2/4/6…) = สัญญาณลงไม้ตามกฎ "ลงทุก  2 แท่งแดง"
  const [redAlerts, setRedAlerts] = useState<
    {
      id: string;            // id ของรายการลงทุน — ต้องมีเพื่อกด "ซื้อเพิ่มแล้ว" เขียนกลับได้
      type: InvestmentType;
      symbol: string;
      name: string;
      dropPercent: number;
      count: number;
      interval: RedInterval; // กรอบเวลาที่ใช้นับ — ต้องโชว์ด้วย ไม่งั้น "แดง 2 แท่ง" ของแต่ละตัวคนละความหมาย
      every: number;
      met: boolean;          // ครบรอบแล้วหรือยัง — ยังไม่ครบก็เก็บไว้ เพื่อโชว์ความคืบหน้าที่การ์ดรายตัว
      custom: boolean;       // ตั้งกฎเองไว้ไหม (ไม่ได้ใช้ค่าเริ่มต้น) — ใช้ตัดสินว่าจะโชว์บรรทัดกฎไหม
      // low ของแท่งแดงในสตรีค (เก่า→ใหม่) + ต่ำสุด — ราคาที่ลงไปแตะจริง ใช้ตั้งไม้/ตั้ง limit
      lows: number[];
      lowest: number | null;
      lowCurrency: string | null; // สกุลที่แปลงมาแล้ว (null = API ไม่บอกสกุล) — ใช้ตอน format
      currency: string;           // สกุลของรายการ — ใช้เป็น fallback ตอน API ไม่บอกสกุลของแท่ง
      // กด "ซื้อเพิ่มแล้ว" ปิดแจ้งเตือนรอบนี้ไว้หรือยัง (ดู utils/redAlert)
      acked: boolean;
      streakStartAt: number | null; // เวลาเปิดแท่งแรกของสตรีค — ใช้ตอนบันทึกการปิดแจ้งเตือน
    }[]
  >([]);
  // เช็คเสร็จหรือยัง — ต้องบอกให้รู้ว่า "เช็คแล้วไม่มี" ต่างจาก "ยังไม่ได้เช็ค/เช็คไม่ได้"
  const [redChecking, setRedChecking] = useState(false);
  const [redCheckedCount, setRedCheckedCount] = useState(0);
  // ── การขายจริง: ตัวชี้วัดฝีมือที่วัดได้ (ต่างจากกำไรลอยตัว) ──
  const [realizedTrades, setRealizedTrades] = useState<RealizedTrade[]>([]);
  const [purchaseGoals, setPurchaseGoals] = useState<PurchaseGoal[]>([]);
  // ข้อมูลภาษีปีนี้ — null = ยังไม่ได้ตั้งค่าที่หน้า "ภาษี" (หรือยังไม่ได้รัน SQL)
  const [taxProfile, setTaxProfile] = useState<TaxProfile | null>(null);
  // ข้อมูลส่วนตัว — ใช้แค่ยกเว้นเงินได้ 190,000 (อายุ 65+/ผู้พิการ) ให้เลขภาษีตรงกับหน้าภาษี
  const [person, setPerson] = useState<UserProfile | null>(null);
  const [sellTarget, setSellTarget] = useState<Investment | null>(null);
  const [sellQtyInput, setSellQtyInput] = useState('');
  const [sellPriceInput, setSellPriceInput] = useState('');
  const [sellDateInput, setSellDateInput] = useState('');
  const [sellFeesInput, setSellFeesInput] = useState('');
  const [sellNotesInput, setSellNotesInput] = useState('');   // ขายเพราะอะไร — ไว้ทบทวนฝีมือย้อนหลัง
  const [sellToPowder, setSellToPowder] = useState(true);     // เงินที่ขายได้ → เข้าเงินรอลงทุนเลย
  const [showRedAcked, setShowRedAcked] = useState(false);         // กาง/ยุบตัวที่กด "ซื้อเพิ่มแล้ว"
  // ── รอบลงทุน (ดู types/cycle.ts) ──
  // หน้านี้อ่านรอบที่เปิดอยู่อย่างเดียว เพื่อบอกบริบท "ลงเพิ่มได้อีกไหม" ตรงการ์ดถึงคิวลงไม้
  // การเปิด/ปิด/ตั้งค่ารอบทั้งหมดย้ายไปหน้า "รอบลงทุน" แล้ว
  const [cycles, setCycles] = useState<InvestmentCycle[]>([]);           // รอบที่เปิดอยู่ (ตะกร้าละ 1)
  // ── ตัวกรองรายการลงทุน — ยุบไว้เป็นค่าเริ่มต้น กดกางเมื่อพอร์ตเริ่มเยอะ ──
  const [showFilter, setShowFilter] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState<InvestmentType | 'all'>('all');
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterPnl, setFilterPnl] = useState<'all' | 'profit' | 'loss'>('all');
  const [sortBy, setSortBy] = useState<'default' | 'value' | 'profit' | 'name' | 'date'>('default');

  const loadData = async () => {
    const allInvestments = await getInvestments();
    setInvestments(allInvestments);
    const portfolioSummary = await getPortfolioSummary();
    setSummary(portfolioSummary);
    try {
      setGoal(await getPortfolioGoal());
    } catch {
      // ยังไม่มีตาราง/ยังไม่ตั้งเป้า — ปล่อยเป็น null
    }
    try {
      setPlan(await getInvestmentPlan());
    } catch {
      // ยังไม่มีตาราง/ยังไม่ตั้งแผน — ปล่อยเป็น null
    }
    try {
      setRealizedTrades(await getRealizedTrades());
    } catch {
      // ยังไม่ได้รัน sql/realized_trades.sql — การ์ด "ผลงานจริง" จะไม่โชว์เอง
      // (ถ้ากดขายจริงแล้วตารางยังไม่มี handleConfirmSell จะบอกให้ไปรัน SQL อยู่แล้ว)
      setRealizedTrades([]);
    }
    try {
      // ของที่อยากได้ — โชว์เป็นบรรทัดสรุปในเมนู ไม่มีตาราง/ไม่มีของก็ซ่อนบรรทัดนั้น
      setPurchaseGoals(await getPurchaseGoals());
    } catch {
      // ยังไม่ได้รัน sql/purchase_goals.sql
      setPurchaseGoals([]);
    }
    try {
      // ข้อมูลภาษีปีนี้ — ใช้ประมาณภาษีตอนขาย ไม่มีก็แค่ไม่โชว์บรรทัดภาษี
      setTaxProfile(await getTaxProfile(currentTaxYear));
    } catch {
      // ยังไม่ได้รัน sql/tax_profiles.sql — การ์ดภาษีจะบอกให้ไปตั้งค่าเอง
      setTaxProfile(null);
    }
    try {
      // ข้อมูลส่วนตัว — ของเสริม ไม่มีก็คิดภาษีต่อได้ (แค่ไม่มียกเว้นเงินได้ 190,000)
      setPerson(await getUserProfile());
    } catch {
      setPerson(null);
    }
    try {
      // รอบที่เปิดอยู่ — ยังไม่ได้รัน sql/investment_cycles.sql ก็คืน [] เอง แค่ไม่มีบริบทรอบให้อ่าน
      setCycles(await getOpenCycles());
    } catch {
      setCycles([]);
    }
    // (เลิกดึงรายรับ/รายจ่ายมาที่หน้านี้แล้ว — งบรายเดือนดูที่หน้าหลัก)

    // เช็คแดงติดกันเป็นเลขคู่ (2/4/6…) เฉพาะ crypto/หุ้น — ทำแบบ background ไม่บล็อกการโหลด
    const candleTargets = allInvestments.filter((i) =>
      ['crypto', 'stock_th', 'stock_foreign'].includes(i.type)
    );
    setRedCheckedCount(candleTargets.length);
    setRedChecking(candleTargets.length > 0);
    Promise.all(
      candleTargets.map(async (i) => ({
        inv: i,
        // กฎรายตัว: ไม่ตั้งไว้ = รายวัน/ทุก 2 แท่ง (พฤติกรรมเดิม)
        alert: await getTwoRedDays(i.type, i.symbol, {
          interval: i.redInterval || DEFAULT_RED_INTERVAL,
          every: i.redEvery || DEFAULT_RED_EVERY,
          // ขอ low เป็นสกุลเดียวกับที่การ์ดโชว์ราคา ไม่งั้นเทียบกับ "ราคาปัจจุบัน" ไม่ได้
          currency: i.currency,
        }),
      }))
    )
      .then((results) => {
        const usable = results.filter((r) => r.alert !== null);
        // ล้าง "ซื้อเพิ่มแล้ว" ที่หมดอายุแล้ว (สตรีคขาด หรือแดงต่อจนครบรอบใหม่) ออกจาก DB
        // ไม่ล้างทิ้ง แถวจะค้างสถานะของรอบที่จบไปนานแล้ว แล้วรอบถัดไปจะอ่านผิด
        // best-effort: เขียนไม่ได้ (ยังไม่รัน SQL) ก็ไม่ขวางการโชว์ผล
        const staleIds = usable.filter((r) => isRedAckStale(r.inv, r.alert!)).map((r) => r.inv.id);
        staleIds.forEach((id) => {
          setRedAck(id, null, null).catch(() => {});
        });
        if (staleIds.length > 0) {
          // ล้างในหน่วยความจำด้วย — หน้าแก้ไขการลงทุนรับ Investment จากลิสต์นี้ไปตรง ๆ
          // ไม่ล้าง จะไปโชว์ว่า "ซื้อเพิ่มแล้ว" ของรอบที่จบไปแล้ว
          setInvestments((list) =>
            list.map((inv) =>
              staleIds.includes(inv.id)
                ? { ...inv, redAckCount: undefined, redAckStreakAt: undefined }
                : inv
            )
          );
        }
        setRedAlerts(
          usable
            .map((r) => ({
              id: r.inv.id,
              // เก็บ type ไว้ด้วย — ใช้จับคู่กับรายการลงทุนตอนติดป้ายในลิสต์ (symbol เดียวกันข้ามประเภทได้)
              type: r.inv.type,
              symbol: r.inv.symbol,
              name: r.inv.name,
              dropPercent: r.alert!.dropPercent,
              count: r.alert!.count,
              interval: (r.inv.redInterval || DEFAULT_RED_INTERVAL) as RedInterval,
              every: r.alert!.every,
              met: r.alert!.met,
              custom: !!r.inv.redInterval || !!r.inv.redEvery,
              lows: r.alert!.lows,
              lowest: r.alert!.lowest,
              // แปลงแล้วก็เป็นสกุลของรายการ, แปลงไม่ได้ก็เป็นสกุลต้นทางที่ API บอก
              lowCurrency: r.alert!.lowCurrency,
              currency: r.inv.currency || 'THB',
              acked: isRedAckActive(r.inv, r.alert!),
              streakStartAt: r.alert!.streakStartAt,
            }))
            // เรียงจากลบเยอะสุด → น้อยสุด (dropPercent เป็นค่าลบ)
            .sort((a, b) => a.dropPercent - b.dropPercent)
        );
      })
      .catch(() => setRedAlerts([]))
      .finally(() => setRedChecking(false));
  };

  // ── "ซื้อเพิ่มแล้ว" / "เปิดแจ้งเตือนอีกครั้ง" ──
  // จงใจไม่ไปเพิ่มจำนวน/ปรับต้นทุนของไม้ให้เอง — ลงไปกี่หน่วย ราคาเท่าไหร่ มีแต่ผู้ใช้ที่รู้
  // ปุ่มนี้ตอบคำถามเดียวคือ "รอบนี้ทำแล้ว" เพื่อให้การ์ดเหลือแต่ตัวที่ยังไม่ได้ลง
  // ids เป็น array เพราะหนึ่งบรรทัดในการ์ดอาจมาจากหลายไม้ (ตัวเดียวกันคนละโบรก) —
  // แท่งเทียนเป็นชุดเดียวกัน กด "ซื้อเพิ่มแล้ว" ทีเดียวต้องปิดให้ครบทุกไม้ของตัวนั้น
  const toggleRedAck = async (
    a: { ids: string[]; count: number; streakStartAt: number | null },
    next: boolean
  ) => {
    const before = redAlerts;
    const inGroup = (id: string) => a.ids.includes(id);
    // อัปเดตจอก่อน แล้วค่อยเขียน DB — กดแล้วต้องเห็นผลทันที ไม่ใช่รอ round-trip
    setRedAlerts((list) => list.map((x) => (inGroup(x.id) ? { ...x, acked: next } : x)));
    try {
      await Promise.all(
        a.ids.map((id) => setRedAck(id, next ? a.count : null, next ? a.streakStartAt : null))
      );
      // ให้ข้อมูลในมือ (ใช้ตอน refresh ราคา/คำนวณต่อ) ตรงกับที่เพิ่งเขียนลง DB
      setInvestments((list) =>
        list.map((inv) =>
          inGroup(inv.id)
            ? {
                ...inv,
                redAckCount: next ? a.count : undefined,
                redAckStreakAt:
                  next && a.streakStartAt != null
                    ? new Date(a.streakStartAt).toISOString()
                    : undefined,
              }
            : inv
        )
      );
    } catch (e: any) {
      setRedAlerts(before); // เขียนไม่ติด → จอต้องกลับไปตรงกับ DB ไม่ใช่โชว์ว่าปิดแล้วทั้งที่ไม่ได้ปิด
      await notify(e?.message || 'บันทึกไม่สำเร็จ', 'ข้อผิดพลาด');
    }
  };

  // ── บันทึกการขาย: ปลดล็อก "ผลตอบแทนจริง" แทนการเดาเลขคาดหวัง ──
  const openSellModal = (inv: Investment) => {
    setSellTarget(inv);
    setSellQtyInput(inv.quantity.toString());
    setSellPriceInput((inv.currentPrice ?? inv.buyPrice).toString());
    setSellDateInput(new Date().toISOString().slice(0, 10));
    setSellFeesInput('');
    setSellNotesInput('');
    setSellToPowder(true);
  };

  const handleConfirmSell = async () => {
    if (!sellTarget) return;
    const qty = parseFloat(sellQtyInput.replace(/,/g, ''));
    const price = parseFloat(sellPriceInput.replace(/,/g, ''));
    // แปลง พ.ศ.→ค.ศ. ก่อนตรวจ/บันทึก — เผลอพิมพ์ 2569 แล้วเก็บดิบ ๆ
    // อายุถือจะกลายเป็น ~543 ปี แล้ว CAGR/ผลตอบแทนจริงเพี้ยนทั้งการ์ดแบบเงียบ ๆ
    const date = toChristianYear(sellDateInput.trim()).slice(0, 10);
    const sellFee = parseFloat(sellFeesInput.replace(/,/g, '')) || 0;
    if (!qty || qty <= 0 || qty > sellTarget.quantity) {
      notify(`จำนวนที่ขายต้องมากกว่า 0 และไม่เกิน ${sellTarget.quantity}`);
      return;
    }
    if (!price || price <= 0) { notify('กรุณากรอกราคาขาย'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { notify('วันที่ขายต้องเป็นรูปแบบ YYYY-MM-DD'); return; }

    // ค่าธรรมเนียมซื้อ ปันตามสัดส่วนที่ขาย แล้วบวกค่าธรรมเนียมขายที่กรอก
    const buyFeeShare = (sellTarget.fees || 0) * (qty / sellTarget.quantity);
    const sellCurrency = sellTarget.currency ?? 'THB';
    // เงินสดที่ได้รับจริง "ในสกุลที่ขาย" — ค่าธรรมเนียมขายกรอกเป็นบาท ต้องหารเรตกลับก่อนหัก
    // (ค่าธรรมเนียมซื้อจ่ายไปตอนซื้อแล้ว ไม่หักออกจากเงินที่ได้รับรอบนี้)
    const rateToTHB = convertToTHB(1, sellCurrency) || 1;
    const netProceedsNative = qty * price - sellFee / rateToTHB;
    try {
      await saveRealizedTrade({
        id: Date.now().toString(),
        symbol: sellTarget.symbol,
        name: sellTarget.name,
        assetType: sellTarget.type,
        currency: sellCurrency,
        quantity: qty,
        buyPrice: sellTarget.buyPrice,
        sellPrice: price,
        buyDate: toChristianYear(sellTarget.buyDate || '').slice(0, 10),
        sellDate: date,
        fees: buyFeeShare + sellFee,
        notes: sellNotesInput.trim() || undefined,
        // แพลตฟอร์มเป็นตัวระบุไม้ ต้องเก็บแยกคอลัมน์ ไม่ฝากไว้ใน snapshot เพียงที่เดียว
        platform: sellTarget.platform,
        // เก็บสภาพรายการก่อนขายไว้ เผื่อกดผิดแล้วต้องย้อนคืน
        sourceInvestment: sellTarget,
      });
      // ขายหมด → ลบรายการทิ้ง ; ขายบางส่วน → ลดจำนวนและค่าธรรมเนียมที่เหลือตามสัดส่วน
      if (qty >= sellTarget.quantity) {
        await deleteInvestment(sellTarget.id);
      } else {
        await updateInvestment({
          ...sellTarget,
          quantity: sellTarget.quantity - qty,
          fees: Math.max(0, (sellTarget.fees || 0) - buyFeeShare),
        });
      }

      // ── เงินที่ขายได้ = เงินรอลงทุนก้อนใหม่ → เพิ่มให้เลยถ้าติ๊กไว้ ──
      // ปิดวงจร ขาย → มีเงิน → ลงไม้ต่อ ไม่ต้องไปกด "จดยอด" ซ้ำเอง
      // ล้มที่ขั้นนี้ห้ามทำให้การขายพัง (การขายบันทึกไปแล้ว) — แจ้งให้ไปจดเองแทน
      let powderWarn = '';
      if (sellToPowder && netProceedsNative > 0) {
        try {
          const base: InvestmentPlan = plan ?? { setAsidePercent: 0, dcaRounds: 0 };
          const existing = base.dryPowderItems ?? [];
          // เคยจดเป็นยอดรวมก้อนเดียว → ยกมาเป็นรายการก่อน ไม่ให้ของเดิมหายตอนคิดยอดรวมใหม่
          const seeded =
            existing.length === 0 && base.dryPowder && base.dryPowder > 0
              ? [{ id: `p${Date.now()}-legacy`, label: 'ยอดที่จดไว้เดิม', amount: base.dryPowder, currency: 'THB', asOf: base.dryPowderAsOf }]
              : existing;
          const items: DryPowderItem[] = [
            ...seeded,
            {
              id: `p${Date.now()}`,
              label: `ขาย ${sellTarget.symbol || sellTarget.name}`,
              amount: netProceedsNative,
              currency: sellCurrency,
              asOf: date,
            },
          ];
          const total = sumDryPowderItems(items);
          const nextPlan: InvestmentPlan = {
            ...base,
            dryPowderItems: items,
            dryPowder: total,
            dryPowderAsOf: date,
          };
          await saveInvestmentPlan(nextPlan);
          setPlan(nextPlan);
        } catch {
          powderWarn = '\n(เพิ่มเข้าเงินรอลงทุนไม่สำเร็จ — ไปกด "จดยอด" เพิ่มเองได้)';
        }
      }

      setSellTarget(null);
      notify(
        (sellToPowder && netProceedsNative > 0
          ? `บันทึกการขายแล้ว · เพิ่มเข้าเงินรอลงทุน ${formatCurrencyWithType(netProceedsNative, sellCurrency)}`
          : 'บันทึกการขายแล้ว') + powderWarn
      );
      loadData();
    } catch (e: any) {
      const msg = String(e?.message || e);
      notify(
        /realized_trades|does not exist|schema cache/i.test(msg)
          ? 'ยังไม่ได้สร้างตาราง — เอา sql/realized_trades.sql ไปรันที่ Supabase ก่อน'
          : `บันทึกการขายไม่สำเร็จ: ${msg}`
      );
    }
  };

  const openGoalModal = () => {
    setGoalTargetInput(goal?.targetAmount?.toString() || '');
    setGoalExpectedInput(goal?.expectedAnnualReturnPercent?.toString() || '');
    setGoalModalVisible(true);
  };

  const handleSaveGoal = async () => {
    const amount = parseFloat(goalTargetInput.replace(/,/g, ''));
    if (!amount || amount <= 0) { notify('กรุณากรอกยอดเป้าหมายที่ถูกต้อง'); return; }
    const expected = parseFloat(goalExpectedInput.replace(/,/g, ''));
    try {
      const newGoal: PortfolioGoal = {
        targetAmount: amount,
        expectedAnnualReturnPercent: !isNaN(expected) && expected > 0 ? expected : undefined,
      };
      await savePortfolioGoal(newGoal);
      setGoal(newGoal);
      setGoalModalVisible(false);
    } catch {
      notify('บันทึกเป้าหมายไม่สำเร็จ');
    }
  };

  const handleDeleteGoal = async () => {
    try {
      await deletePortfolioGoal();
      setGoal(null);
      setGoalModalVisible(false);
    } catch {
      notify('ลบเป้าหมายไม่สำเร็จ');
    }
  };

  // ให้ interval อ่านค่าล่าสุดผ่าน ref ได้ ไม่ต้องใส่ investments เป็น dependency
  // (ไม่งั้นราคาขยับทีเดียว interval ถูกสร้างใหม่ทั้งตัว นาฬิกาเลื่อนไปเรื่อย ๆ ไม่ครบ 5 นาทีจริง)
  useEffect(() => { investmentsRef.current = investments; }, [investments]);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, [])
  );

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmAsk('ลบการลงทุน', `คุณต้องการลบ ${name} ใช่หรือไม่?`, 'ลบ'))) return;
    await deleteInvestment(id);
    loadData();
  };

  const handleEdit = (item: Investment) => {
    navigation.navigate('AddInvestment', { investment: item });
  };

  // แกนกลางของการรีเฟรชราคา ใช้ร่วมกันทั้งปุ่มกดเองและ auto ทุก 5 นาที
  // - ดึงราคาทุกตัวในรอบเดียว (crypto batch / ทองครั้งเดียว / หุ้นขนานจำกัดคิว)
  // - อัปเดต state ก่อนเขียน DB เพื่อให้ตัวเลขบนจอขยับทันที ไม่ต้องรอ round-trip
  // - เขียน DB แค่คอลัมน์ราคา แล้วคำนวณยอดรวมใหม่จากค่าในมือ ไม่ loadData ซ้ำ
  //   (loadData ยิง query 5-6 ชุด ถ้าเรียกทุก 5 นาทีจะเปลืองเปล่า ๆ)
  const refreshPrices = useCallback(
    async (opts: { silent: boolean }) => {
      // กันรอบ auto ซ้อนกัน (รอบก่อนยังไม่จบ) — แต่ไม่บล็อกการกดปุ่มเอง
      // ไม่งั้นถ้าเผอิญกดตอน auto กำลังวิ่ง ปุ่มจะเงียบเหมือนเสีย
      if (opts.silent && refreshInFlight.current) return;
      const items = investmentsRef.current.filter((i) => isPriceRefreshable(i.type));
      if (items.length === 0) {
        if (!opts.silent) notify('ไม่มีรายการที่ดึงราคาอัตโนมัติได้ (กองทุนต้องกรอก NAV เอง)');
        return;
      }

      // นับรอบถัดไปจากตรงนี้ — วางหลังเช็ค items แล้ว เพราะพอร์ตที่ยังไม่มีตัวดึงราคาได้
      // ต้องไม่ถูกเลื่อนไปอีก 5 นาที (ไม่งั้นรอบแรกหลังเพิ่มหุ้นตัวแรกจะช้าไปทั้งรอบ)
      const due = new Date(Date.now() + PRICE_REFRESH_MS);
      nextRefreshAtRef.current = due;
      setNextRefreshAt(due);

      refreshInFlight.current = true;
      if (!opts.silent) setIsUpdatingPrices(true);
      try {
        const prices = await fetchPricesForItems(
          items.map((i) => ({ id: i.id, type: i.type, symbol: i.symbol, currency: i.currency || 'THB' }))
        );
        const updates = Object.entries(prices).map(([id, currentPrice]) => ({ id, currentPrice }));

        if (updates.length > 0) {
          const next = investmentsRef.current.map((inv) =>
            prices[inv.id] !== undefined ? { ...inv, currentPrice: prices[inv.id] } : inv
          );
          setInvestments(next);
          setSummary(summarizeInvestments(next));
          await updateInvestmentPrices(updates);
        }

        setLastPriceRefresh(new Date());
        if (!opts.silent) {
          notify(
            updates.length === items.length
              ? `อัปเดตราคาสำเร็จ ${updates.length} รายการ`
              : `อัปเดตราคาสำเร็จ ${updates.length} จาก ${items.length} รายการ — ที่เหลือดึงไม่ได้ตอนนี้`,
            'สำเร็จ'
          );
        }
      } catch (error) {
        console.error('refreshPrices error:', error);
        // auto ห้ามเด้ง dialog — ผู้ใช้ไม่ได้สั่ง จะกลายเป็น popup โผล่เองระหว่างอ่านหน้าจอ
        if (!opts.silent) {
          const detail = (error as any)?.message || String(error);
          notify(`เกิดข้อผิดพลาดในการอัปเดตราคา\n${detail}`, 'ข้อผิดพลาด');
        }
      } finally {
        refreshInFlight.current = false;
        if (!opts.silent) setIsUpdatingPrices(false);
      }
    },
    []
  );

  const handleUpdatePrices = () => refreshPrices({ silent: false });

  // ── Auto refresh ทุก 5 นาที ──
  // หยุดเมื่อหน้าไม่ได้ถูกดู (แท็บซ่อน / แอปลงพื้นหลัง / เปลี่ยนไปหน้าอื่น) แล้วยิงทันทีตอนกลับมา
  // ถ้าครบกำหนดแล้ว — แท็บที่เปิดค้างข้ามคืนคือตัวกินโควตา Twelve Data ตัวจริง (800 req/วัน)
  useEffect(() => {
    if (!screenFocused) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const isVisible = () =>
      Platform.OS === 'web'
        ? typeof document === 'undefined' || document.visibilityState === 'visible'
        : AppState.currentState === 'active';

    // ถึงกำหนดหรือยัง — ยังไม่เคยยิงเลย (null) ก็ถือว่าถึง
    const isDue = () => {
      const due = nextRefreshAtRef.current;
      return !due || Date.now() >= due.getTime();
    };

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (isVisible() && isDue()) refreshPrices({ silent: true });
      }, PRICE_TICK_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    // กลับมาดูหน้านี้อีกครั้ง: ยิงเลยถ้าเลยกำหนดไปแล้ว ไม่ต้องรอ tick ถัดไป
    const refreshIfStale = () => {
      if (isDue()) refreshPrices({ silent: true });
    };

    const onVisibilityChange = () => {
      if (isVisible()) {
        refreshIfStale();
        start();
      } else {
        stop();
      }
    };

    // ตอน mount ไม่เรียก refreshIfStale ตรงนี้ — useFocusEffect เพิ่งสั่ง loadData() ไป
    // investmentsRef ยังเป็น [] อยู่ ยิงตอนนี้จะ return ทิ้งเปล่า ๆ
    // รอบแรกไปยิงใน effect ถัดไปที่รอ investments โหลดเสร็จก่อน
    if (isVisible()) start();

    if (Platform.OS === 'web') {
      document.addEventListener('visibilitychange', onVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        stop();
      };
    }

    const sub = AppState.addEventListener('change', onVisibilityChange);
    return () => {
      sub.remove();
      stop();
    };
  }, [screenFocused, refreshPrices]);

  // รอบแรกหลังข้อมูลโหลดเสร็จ (และตอนเพิ่ม/ลบรายการ) — ยิงถ้าเลยกำหนดรอบถัดไปแล้ว
  // ผูกกับ investments.length ไม่ใช่ตัว array เพราะ refreshPrices เองก็ setInvestments
  // ถ้าผูกทั้ง array จะวนไม่จบ
  useEffect(() => {
    if (!screenFocused || investments.length === 0) return;
    const due = nextRefreshAtRef.current;
    if (!due || Date.now() >= due.getTime()) refreshPrices({ silent: true });
  }, [screenFocused, investments.length, refreshPrices]);

  const getTypeIcon = (type: string) => {
    const found = INVESTMENT_TYPES.find((t) => t.value === type);
    return found ? found.icon : 'cube-outline';
  };

  // ราคาปัจจุบัน (currentPrice) เก็บเป็นสกุลเงินเดียวกับ item.currency (สกุลที่เลือกตอนเพิ่มการลงทุน)
  // ต้องแปลงเป็น THB ก่อนคำนวณ cost/value/profit เพื่อรวมพอร์ตข้ามสกุลเงินได้
  // แยกออกมาเป็นฟังก์ชันเพราะทั้งการ์ดรายการ ตัวกรอง และการเรียงลำดับ ต้องใช้เลขชุดเดียวกัน
  const calcItemStats = (item: Investment) => {
    const buyPriceInTHB = convertToTHB(item.buyPrice, item.currency);
    const currentPriceNative = item.currentPrice ?? item.buyPrice;
    const currentPriceInTHB = convertToTHB(currentPriceNative, item.currency);
    const cost = buyPriceInTHB * item.quantity + (item.fees || 0);
    const value = currentPriceInTHB * item.quantity;
    const profit = value - cost;
    return {
      currentPriceNative,
      cost,
      value,
      profit,
      profitPercent: cost > 0 ? (profit / cost) * 100 : 0,
    };
  };

  // ตารางค้นสถานะแท่งแดง ต่อ 1 รายการลงทุน — สร้างครั้งเดียว ไม่ต้องวนหาในทุกแถว
  // (เก็บทุกตัวรวมที่ยังไม่ครบรอบ การ์ดรายตัวเอาไปโชว์ความคืบหน้าได้)
  const redAlertByKey = new Map(redAlerts.map((a) => [`${a.type}:${a.symbol}`, a]));
  // ยุบแถวของ "ตัวเดียวกัน" ให้เหลือบรรทัดเดียว — ถือ INTC ไว้ 2 โบรกก็เป็นแท่งเทียนชุดเดียวกัน
  // สองบรรทัดที่เลขเหมือนกันเป๊ะคือเสียงรบกวน ไม่ใช่ข้อมูลเพิ่ม (และ key ซ้ำจนแถวเพี้ยนได้)
  // เก็บ id ของทุกไม้ไว้ในกลุ่ม เพราะการกด "ซื้อเพิ่มแล้ว" ต้องปิดให้ครบทุกไม้ของตัวนั้น
  const groupRedAlerts = (list: typeof redAlerts) => {
    const groups = new Map<string, (typeof list)[number] & { ids: string[]; key: string }>();
    list.forEach((a) => {
      // กฎอยู่ในคีย์ด้วย — ตัวเดียวกันแต่ตั้งคนละกรอบเวลา/คนละจำนวนแท่ง คือคนละสัญญาณจริง ๆ
      // (แดง 2 วัน กับ แดง 2 สัปดาห์ นับคนละชุดแท่ง ยุบรวมกันแล้วเลขจะไม่ตรงกับที่ตั้งไว้)
      const key = `${a.type}:${a.symbol || a.name}:${a.interval}:${a.every}`;
      const found = groups.get(key);
      if (found) found.ids.push(a.id);
      else groups.set(key, { ...a, ids: [a.id], key });
    });
    return Array.from(groups.values());
  };

  // เฉพาะตัวที่ครบรอบจริง "และยังไม่ได้ลง" — ใช้ในการ์ดสรุป "ถึงคิวลงไม้"
  // การ์ดนี้คือรายการที่ต้องลงมือ ตัวที่กด "ซื้อเพิ่มแล้ว" ไปแล้วจึงต้องออกจากลิสต์
  // ไม่งั้นเปิดหน้าทีไรก็เห็นชื่อเดิม แยกไม่ออกว่าอันไหนทำแล้ว/ยังไม่ทำ
  const redAlertsMet = groupRedAlerts(redAlerts.filter((a) => a.met && !a.acked));
  // ตัวที่ปิดแจ้งเตือนไว้ — ไม่ทิ้งหายไปเฉย ๆ ต้องกดกางดู/กดยกเลิกได้ ไม่งั้นกดผิดแล้วกู้ไม่ได้
  const redAlertsAcked = groupRedAlerts(redAlerts.filter((a) => a.acked));

  // หน่วยที่ใช้พูดถึงแท่งเทียนตามกรอบเวลา — "แดง 2 วัน" กับ "แดง 2 เดือน" คนละเรื่องกันมาก
  const redUnit = (interval: RedInterval): string =>
    RED_INTERVALS.find((r) => r.value === interval)?.unit ?? 'วัน';

  // ── ยอด LOW ของแท่งแดงในสตรีค ──
  // ราคาปิดบอกแค่ว่าแท่งแดง แต่ราคาที่ "ลงไปแตะจริง" คือ low — ใช้ตั้งไม้/ตั้ง limit ได้
  // โชว์ค่าเดียว = ต่ำสุดของทั้งสตรีค เพราะนั่นคือเลขที่เอาไปตั้ง limit จริง
  // (เคยลิสต์ low ของทุกแท่ง เก่า→ใหม่ แล้วอ่านแล้วงงว่าเลขไหนคือเลขไหน)
  //
  // เลข LOW ล้วน ๆ ไม่มีคำอธิบายนำ — ต่อท้ายป้ายแดง/การ์ดสรุปได้เลย เพราะบริบทชัดอยู่แล้ว
  // (เคยมีบรรทัด "ราคาต่ำสุดที่ลงไปแตะ: …" แยกใต้ป้าย แต่คำอธิบายยาวกว่าตัวเลขและกินอีกบรรทัดเปล่า ๆ)
  const redLowValue = (a: {
    lows: number[];
    lowest: number | null;
    lowCurrency: string | null;
    currency: string;
  }): string | null => {
    if (a.lowest == null || a.lows.length === 0) return null;
    return formatCurrencyWithType(a.lowest, a.lowCurrency || a.currency);
  };

  const renderInvestmentItem = ({ item }: { item: Investment }) => {
    const { currentPriceNative, value, profit, profitPercent } = calcItemStats(item);
    const isProfit = profit >= 0;
    // วิเคราะห์รายตัว: โตเฉลี่ย/ปี (จากวันซื้อ) — ข้อมูลจริง ไม่ใช่คำแนะนำให้ขาย
    const growth = getHoldingAnnualGrowth(item.buyDate, item.buyPrice, currentPriceNative);
    // แดงติดกันครบคู่ = ถึงคิวลงไม้ตามกฎ "ลงทุก 2 แท่งแดง" — ต้องเห็นที่ตัวหุ้น ไม่ใช่แค่การ์ดสรุป
    const redAlert = redAlertByKey.get(`${item.type}:${item.symbol}`);
    // บรรทัดรอง = ชื่อเต็มเท่านั้น (แพลตฟอร์มย้ายไปมุมขวาบนแล้ว)
    // ไม่มีตัวย่อ → ชื่อเต็มขึ้นไปเป็นบรรทัดหลัก บรรทัดรองก็ไม่ต้องซ้ำ
    const subtitle = item.symbol ? item.name : '';
    const mark = item.platform ? platformMark(item.platform) : null;

    return (
      <View style={[
        styles.investmentItem,
        isDesktop && styles.investmentItemDesktop,
        // ความกว้างมาจากกริด (ดู gridCardWidth) — ยังไม่วัดได้ก็ปล่อย flex ของ
        // investmentItemDesktop ยืดไปก่อน 1 เฟรม
        // ต้องทับ flexBasis ด้วย: investmentItemDesktop มี flex:1 ซึ่ง rn-web แปลเป็น
        // flex: 1 1 0% — flex-basis:0% ชนะ width ทำให้การ์ดยุบเป็น 0 ถ้าเซ็ตแต่ width
        isDesktop && gridCardWidth != null && {
          flexBasis: gridCardWidth,
          flexGrow: 0,
          flexShrink: 0,
          width: gridCardWidth,
          maxWidth: gridCardWidth,
        },
      ]}>
        <TouchableOpacity
          style={styles.investmentContent}
          onPress={() => handleEdit(item)}
        >
          <View style={styles.investmentLeft}>
            <View style={styles.investmentHeader}>
              <Ionicons name={getTypeIcon(item.type) as any} size={24} color={COLORS.primary} />
              {/* ชื่อย่อเป็นตัวหลัก ชื่อเต็มเป็นตัวรอง — เวลาไล่ดูพอร์ตคนจำ/หาด้วยตัวย่อ
                  (BTC, PTT) ไม่ใช่ชื่อเต็ม และชื่อเต็มยาวกว่าจนกินพื้นที่การ์ด
                  ไม่มีตัวย่อ (ทอง/อื่น ๆ) → ชื่อเต็มขึ้นเป็นตัวหลักแทน ไม่ปล่อยหัวการ์ดว่าง */}
              <View style={styles.investmentInfo}>
                <Text style={styles.investmentName}>{item.symbol || item.name}</Text>
                {!!subtitle && (
                  <Text style={styles.investmentSymbol} numberOfLines={1}>
                    {subtitle}
                  </Text>
                )}
              </View>
            </View>
            {/* ป้ายแดง = ครบรอบแล้ว ถึงคิวลงไม้จริง
                LOW ต่อท้ายในป้ายเดียวกัน (เลขเปล่า ๆ หลัง ·) เหมือนการ์ดสรุปด้านบน —
                ในป้ายที่บอกว่า "ร่วงมาแล้ว x%" ราคาที่ตามมาย่อมหมายถึงจุดต่ำสุดที่ลงไปแตะ */}
            {redAlert?.met && !redAlert.acked && (
              <View style={styles.redBadge}>
                <Ionicons name="trending-down" size={12} color={COLORS.error} />
                <Text style={styles.redBadgeText}>
                  {' '}แดง {redAlert.count} {redUnit(redAlert.interval)} {redAlert.dropPercent.toFixed(1)}% · ถึงคิวลงไม้
                  {redLowValue(redAlert) ? ` · ${redLowValue(redAlert)}` : ''}
                </Text>
              </View>
            )}
            {/* ลงไม้รอบนี้ไปแล้ว — ต้องเห็นที่ตัวไม้ ไม่ใช่แค่ในการ์ดสรุป
                ไม่งั้นเปิดมาเจอตัวที่ราคาร่วงแต่ไม่มีป้ายอะไรเลย จะแยกไม่ออกว่า
                "ยังไม่ครบรอบ" หรือ "ครบแล้วแต่เราลงไปแล้ว" */}
            {redAlert?.acked && (
              <View style={[styles.redBadge, styles.redBadgeAcked]}>
                <Ionicons name="checkmark-circle-outline" size={12} color={COLORS.textSecondary} />
                <Text style={[styles.redBadgeText, styles.redBadgeTextAcked]}>
                  {' '}ซื้อเพิ่มแล้วตอนแดง {redAlert.count} {redUnit(redAlert.interval)}
                  {redLowValue(redAlert) ? ` · ${redLowValue(redAlert)}` : ''} · เตือนอีกครั้งที่{' '}
                  {redAlert.count + redAlert.every} {redUnit(redAlert.interval)}
                </Text>
              </View>
            )}
            {/* ไม้นี้อยู่รอบไหน + กินเพดานของสินทรัพย์นี้ไปเท่าไหร่
                ต้องเห็นที่ตัวไม้ ไม่ใช่แค่การ์ดสรุป ไม่งั้นแยกไม่ออกว่าไม้ไหนจะถูกปิดพร้อมรอบ
                และไม้ไหนเป็นของถือยาวที่ถอนออกจากตะกร้าไว้ */}
            {(() => {
              const cv = item.cycleId
                ? cycleViews.find((v) => v.cycle.id === item.cycleId)
                : null;
              if (!cv) return null;
              const key = item.symbol || item.name;
              const used = cv.status.legCountBySymbol.find((s) => s.symbol === key)?.count ?? 0;
              const cap = cv.cycle.maxLegsPerSymbol;
              return (
                <Text style={styles.redRuleText}>
                  รอบ {cv.cycle.cycleNo} · {basketLabel(cv.cycle.basket)}
                  {cap ? ` · ไม้ที่ ${used}/${cap} ของ ${key}` : ` · ${used} ไม้ของ ${key}`}
                </Text>
              );
            })()}
            {/* ยังไม่ครบรอบ แต่ตั้งกฎเองไว้ → บอกสถานะแบบเงียบ ๆ
                ไม่งั้นตั้งกฎแล้วจอไม่ขยับ แยกไม่ออกว่า "ยังไม่ถึงคิว" หรือ "บันทึกไม่ติด"
                ตัวที่ใช้ค่าเริ่มต้นไม่ต้องโชว์ จะได้ไม่รกทั้งพอร์ต */}
            {redAlert && !redAlert.met && redAlert.custom && (
              <Text style={styles.redRuleText}>
                กฎ: ทุก {redAlert.every} {redUnit(redAlert.interval)}แดงติดกัน · ตอนนี้ {redAlert.count}/
                {redAlert.every}
                {redLowValue(redAlert) ? ` · ${redLowValue(redAlert)}` : ''}
              </Text>
            )}
            <View style={styles.investmentDetails}>
              <Text style={styles.investmentQuantity}>
                {item.quantity} หน่วย @ {formatCurrencyWithType(item.buyPrice, item.currency)}
              </Text>
              <Text style={styles.investmentCurrent}>
                ราคาปัจจุบัน: {formatCurrencyWithType(currentPriceNative, item.currency)}
              </Text>
            </View>
          </View>
          <View style={styles.investmentRight}>
            {/* แพลตฟอร์มอยู่มุมขวาบน: เป็นข้อมูล "ของอยู่ที่ไหน" ไม่ใช่ตัวเลขผลตอบแทน
                จับตาแล้วรู้ทันทีว่าแต่ละไม้อยู่เจ้าไหน โดยไม่ไปเบียดชื่อย่อทางซ้าย */}
            {mark && (
              <View style={styles.platformTag}>
                <View style={[styles.platformLogo, { backgroundColor: mark.color }]}>
                  <Text style={styles.platformLogoText}>{mark.short}</Text>
                </View>
                {/* จอแคบการ์ดกว้างไม่ถึง 340 — ปล่อยชื่อยาวเต็มจะไปบีบบรรทัด
                    "จำนวน @ ราคา" ทางซ้ายให้ตก จึงตัดสั้นลงอีก (ตัวย่อในโลโก้ยังบอกได้) */}
                <Text
                  style={[styles.platformTagText, !isDesktop && styles.platformTagTextNarrow]}
                  numberOfLines={1}
                >
                  {item.platform}
                </Text>
              </View>
            )}
            {/* ตัวเลขอยู่กลางพื้นที่ที่เหลือ (flex:1) — ไม่งั้นป้ายแพลตฟอร์มดันชุดตัวเลขลงล่าง */}
            <View style={styles.investmentNums}>
              <Text style={styles.investmentValue}>{formatCurrency(value)}</Text>
              <Text style={[styles.investmentProfit, isProfit ? styles.profitPositive : styles.profitNegative]}>
                {isProfit ? '+' : ''}{formatCurrency(profit)}
              </Text>
              <Text style={[styles.investmentPercent, isProfit ? styles.profitPositive : styles.profitNegative]}>
                {isProfit ? '+' : ''}{profitPercent.toFixed(2)}%
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        {/* ถือยังไม่ถึง 3 เดือน = ไม่โชว์อะไรเลย (เดิมพิมพ์ "ยังประเมินโต/ปีไม่ได้")
            ยังคง annualize เฉพาะตัวที่ถือ >= 3 เดือนเหมือนเดิม — ช่วงสั้นกว่านั้นเลขเพี้ยนสูง */}
        {growth.annualReturnPercent != null && (
          <View style={styles.tpRow}>
            <Text style={styles.tpSubText}>
              AVG โตเฉลี่ย ~{growth.annualReturnPercent >= 0 ? '+' : ''}{growth.annualReturnPercent.toFixed(1)}%/ปี
            </Text>
          </View>
        )}
        <View style={styles.itemActionRow}>
          {/* ขาย = บันทึกผลจริง ต่างจาก ลบ = เอาออกเฉย ๆ ไม่นับเป็นผลงาน */}
          <TouchableOpacity style={styles.sellButton} onPress={() => openSellModal(item)}>
            <Ionicons name="cash-outline" size={14} color={COLORS.primary} />
            <Text style={styles.sellButtonText}> ขาย</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(item.id, item.name)}
          >
            <Ionicons name="trash-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.deleteButtonText}> ลบ</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const isProfit = summary.totalProfit >= 0;

  // วิเคราะห์เป้าหมายพอร์ตรวม — วันเริ่มพอร์ต = วันซื้อแรกสุด
  // ต้องกรองวันที่ที่ใช้ไม่ได้ออกก่อน: การหา "เก่าสุด" เทียบด้วยสตริง ดังนั้น buyDate ที่ว่าง
  // ('' < ทุกวันที่) จะชนะเสมอ แล้วทุกอย่างที่คิดจากวันเริ่มพอร์ตก็กลายเป็น Invalid Date เงียบ ๆ
  const portfolioStartDate = (() => {
    const valid = investments
      .map((i) => i.buyDate)
      .filter((d) => !!d && !Number.isNaN(new Date(toChristianYear(d)).getTime()));
    return valid.length > 0 ? valid.reduce((earliest, d) => (d < earliest ? d : earliest)) : null;
  })();
  // ฐานคำนวณเป้าหมาย = ต้นทุนที่ลงจริง (ไม่รวมกำไรที่ยังไม่ได้ขาย/unrealized)
  // กำไรลอยตัวยังไม่เกิดจริงจนกว่าจะปิดออเดอร์ จึงไม่นับรวมในทุกส่วนของการคำนวณถึงเป้า
  // ผลตอบแทนจริงจากการขาย — ตัวนี้คือ "ฝีมือที่วัดได้" ใช้แทนเลขคาดหวังถ้ามีข้อมูลพอ
  // ไม้ที่ขายในปีภาษีนี้ — ฐานของทั้งการ์ดภาษีและการประมาณภาษีในฟอร์มขาย
  const tradesThisTaxYear = useMemo(
    () => realizedTrades.filter((t) => taxYearOf(t.sellDate) === currentTaxYear),
    [realizedTrades]
  );

  // สรุปภาษีจากกำไรที่ขายปีนี้ — null = ปีนี้ยังไม่มีการขาย (ไม่ต้องโชว์การ์ด)
  // ถ้ายังไม่ได้กรอกเงินเดือน ใช้โปรไฟล์เปล่าไปก่อน: ภาษีจะคิดจากกำไรล้วน ๆ ซึ่งต่ำกว่าจริง
  // แต่ดีกว่าซ่อนตัวเลข — การ์ดเขียนกำกับไว้ว่ายังไม่ใช่ขั้นจริง
  // ต้องส่ง opts ชุดเดียวกับหน้าภาษี ไม่งั้นการ์ดนี้กับหน้าภาษีจะโชว์เลขคนละตัว
  const taxOpts = useMemo(
    () => ({ incomeExemption: incomeExemptionFor(person, currentTaxYear).amount }),
    [person]
  );

  const taxThisYear = useMemo(() => {
    if (tradesThisTaxYear.length === 0) return null;
    const b = calculateTax(taxProfile ?? emptyTaxProfile(currentTaxYear), realizedTrades, taxOpts);
    return {
      grossGain: b.gains.reduce((s, g) => s + g.gain, 0),
      assessable: b.gainIncome,
      tax: b.taxFromGains,
      marginalRate: b.marginalRate,
    };
  }, [tradesThisTaxYear, realizedTrades, taxProfile, taxOpts]);

  const realized = summarizeRealized(realizedTrades);

  // คิวของที่อยากได้ — ใช้กำไร realized ก้อนเดียวกับการ์ด "ผลงานจริง" ด้านบน
  // ไม่ห่อ useMemo เพราะ realized เองก็คิดใหม่ทุก render อยู่แล้ว ห่อไปก็ไม่ได้ประหยัดอะไร
  const purchasePlan = planPurchaseGoals(purchaseGoals, realized.totalPnlTHB);

  const goalAnalysis: PortfolioGoalAnalysis | null = goal
    ? analyzePortfolioGoal(
        goal,
        summary.totalCost,
        summary.totalCost,
        portfolioStartDate,
        new Date(),
        realized.annualReturnPercent
      )
    : null;

  // ── ช่องว่างถึงเป้า วัดด้วย "มูลค่าจริง" (ไม่ใช่ต้นทุนแบบแถบความคืบหน้า) ──
  // ทำไมต้องมีเลขชุดนี้: แถบวัดด้วย "เงินต้นที่ลงไปแล้ว" (79%) ซึ่งไม่ใช่ระยะห่างจากเป้าจริง ๆ
  // — มูลค่าพอร์ตวันนี้ 92.5k ห่างเป้า 100k แค่ 8% ไม่ใช่ 21%
  //   needPercent = เป้า/มูลค่าตอนนี้ − 1 → ต้องโตอีกกี่ % จากของที่ถืออยู่
  //   roundMonths = พอร์ตอายุกี่เดือนแล้ว → เอาไปบอกว่ากำไร % ที่ทำมาใช้เวลาเท่าไหร่
  // ไม่แปลงเป็น "อีกกี่ปีถึงเป้า" — นั่นคือพยากรณ์วันที่ ซึ่งจงใจไม่โชว์บนหน้านี้
  const goalGap = (() => {
    const target = goal?.targetAmount;
    if (!target || target <= 0 || summary.totalValue <= 0) return null;
    // อายุพอร์ต = จากวันซื้อไม้แรกถึงวันนี้ คือเวลาที่ใช้ทำกำไร % ก้อนที่กำลังพูดถึง
    // (ผ่าน toChristianYear เพราะวันที่ที่เก็บมาอาจเป็น พ.ศ. — new Date('2568-..') จะเพี้ยน)
    const startMs = portfolioStartDate ? new Date(toChristianYear(portfolioStartDate)).getTime() : NaN;
    const months = Number.isFinite(startMs)
      ? (Date.now() - startMs) / (365.25 * 24 * 60 * 60 * 1000 / 12)
      : null;
    // < 1 เดือน หรือวันที่เพี้ยน (ติดลบ) → ไม่ต้องบอกเวลา ดีกว่าบอกเลขที่ไม่มีความหมาย
    const roundMonths = months != null && months >= 1 ? months : null;
    if (target - summary.totalValue <= 0) {
      return { reached: true, gap: 0, needPercent: 0, roundMonths };
    }
    return {
      reached: false,
      gap: target - summary.totalValue,
      needPercent: ((target - summary.totalValue) / summary.totalValue) * 100,
      roundMonths,
    };
  })();

  // (เอาการ์ด "วางแผนถึงเป้า" ออกทั้งก้อน — ตัวจำลอง / กรอบเวลา 1/3/5/10 ปี / สัดส่วนแบ่งไม้
  //  ทั้งหมดเป็นเลขคาดการณ์ที่ไม่ได้ใช้ตัดสินใจตอนกดซื้อ จึงลบทั้งการคำนวณและ UI ทิ้ง)

  // ── เงินต่อไม้: อ่านอย่างเดียวจากแผน (ตั้งค่าที่หน้า "เงินรอลงทุน") ──
  // ที่ยังต้องคิดในหน้านี้ เพราะการ์ด "ถึงคิวลงไม้" ต้องตอบตรงจุดว่ารอบนี้ลงเพิ่มได้อีกกี่ไม้
  // ใช้กรอบ 1 เดือนเป็นฐาน — ตัวเดียวกับที่หน้าเงินรอลงทุน/รอบลงทุนใช้
  const dryPowder = plan?.dryPowder && plan.dryPowder > 0 ? plan.dryPowder : 0;
  const dcaRoundsCount = plan?.dcaRounds && plan.dcaRounds > 0 ? plan.dcaRounds : null;
  const powderPerRound = dcaRoundsCount && dryPowder > 0 ? dryPowder / dcaRoundsCount : null;

  // สถานะของรอบที่เปิดอยู่ — ใช้เฉพาะเป็นบริบทของการ์ด "ถึงคิวลงไม้" และบรรทัดสรุปในเมนู
  const cycleViews = cycles.map((cycle) => ({
    cycle,
    status: summarizeCycle(cycle, legsOfCycle(cycle, investments), {
      perRoundTHB: powderPerRound,
    }),
  }));

  // ── ตัวเลือกของตัวกรอง: สร้างจากของที่ถืออยู่จริง ไม่โชว์ตัวเลือกที่กดแล้วว่างเปล่า ──
  const typeOptions = INVESTMENT_TYPES.filter((t) => investments.some((i) => i.type === t.value));
  const platformOptions = Array.from(
    new Set(investments.map((i) => i.platform).filter((p): p is string => !!p))
  ).sort((a, b) => a.localeCompare(b, 'th'));

  const activeFilterCount =
    (searchText.trim() ? 1 : 0) +
    (filterType !== 'all' ? 1 : 0) +
    (filterPlatform !== 'all' ? 1 : 0) +
    (filterPnl !== 'all' ? 1 : 0) +
    (sortBy !== 'default' ? 1 : 0);

  const clearFilters = () => {
    setSearchText('');
    setFilterType('all');
    setFilterPlatform('all');
    setFilterPnl('all');
    setSortBy('default');
  };

  const visibleInvestments = (() => {
    const q = searchText.trim().toLowerCase();
    const list = investments.filter((item) => {
      if (filterType !== 'all' && item.type !== filterType) return false;
      if (filterPlatform !== 'all' && (item.platform || '') !== filterPlatform) return false;
      if (q && !`${item.name} ${item.symbol} ${item.platform || ''}`.toLowerCase().includes(q)) return false;
      if (filterPnl !== 'all') {
        const { profit } = calcItemStats(item);
        if (filterPnl === 'profit' ? profit < 0 : profit >= 0) return false;
      }
      return true;
    });
    if (sortBy === 'default') return list;
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'value':
          return calcItemStats(b).value - calcItemStats(a).value;
        case 'profit':
          return calcItemStats(b).profitPercent - calcItemStats(a).profitPercent;
        case 'name':
          return (a.name || a.symbol).localeCompare(b.name || b.symbol, 'th');
        case 'date':
          // ใหม่สุดก่อน — เทียบเป็น ค.ศ. เพราะบางรายการเก็บเป็น พ.ศ.
          return toChristianYear(b.buyDate || '').localeCompare(toChristianYear(a.buyDate || ''));
        default:
          return 0;
      }
    });
  })();

  // ยอดรวมของ "เฉพาะที่กรองอยู่" — ประโยชน์ตอนดูรายแพลตฟอร์ม/รายประเภท
  const visibleTotals = visibleInvestments.reduce(
    (acc, item) => {
      const s = calcItemStats(item);
      return { value: acc.value + s.value, profit: acc.profit + s.profit };
    },
    { value: 0, profit: 0 }
  );

  const sortOptions: { value: typeof sortBy; label: string }[] = [
    { value: 'default', label: 'ค่าเริ่มต้น' },
    { value: 'value', label: 'มูลค่ามาก→น้อย' },
    { value: 'profit', label: 'กำไร %' },
    { value: 'name', label: 'ชื่อ ก-ฮ' },
    { value: 'date', label: 'ซื้อล่าสุด' },
  ];

  const listHeaderElement = (
      <View>
        <View style={[
          styles.header,
          isDesktop && styles.headerDesktop,
        ]}>
          <View style={styles.headerTitleContainer}>
            <View style={styles.headerTitleLeft}>
              <Ionicons name="briefcase-outline" size={24} color="#ffffff" />
              <Text style={styles.headerTitle}> พอร์ตการลงทุน</Text>
            </View>
            {/* สถานะราคาอยู่มุมขวาบน — ต้องบอกให้รู้ว่าเลขที่เห็นสดแค่ไหน ไม่งั้น auto refresh
                จะกลายเป็นกล่องดำว่าอัปเดตแล้วหรือยัง และกองทุนที่กรอก NAV เองก็จะดูเหมือนค้าง
                เดิมแทรกอยู่กลางกองตัวเลข (ใต้ % กำไร) ทำให้ยอดกับเป้าหมายถูกดันห่างกัน */}
            <PriceRefreshStatus
              isUpdating={isUpdatingPrices}
              lastRefresh={lastPriceRefresh}
              nextRefreshAt={nextRefreshAt}
              style={styles.summaryRefreshedAt}
              onRefresh={handleUpdatePrices}
            />
          </View>
          <View style={styles.summaryContainer}>
            <Text style={styles.summaryLabel}>มูลค่ารวม</Text>
            <Text style={styles.summaryValue}>{formatCurrency(summary.totalValue)}</Text>
            <View style={styles.profitContainer}>
              <Text style={[styles.summaryProfit, isProfit ? styles.profitPositive : styles.profitNegative]}>
                {isProfit ? '+' : ''}{formatCurrency(summary.totalProfit)}
              </Text>
              <Text style={[styles.summaryPercent, isProfit ? styles.profitPositive : styles.profitNegative]}>
                ({isProfit ? '+' : ''}{summary.totalProfitPercent.toFixed(2)}%)
              </Text>
            </View>
            {/* ต้นทุนโชว์บรรทัดนี้เฉพาะตอนยังไม่ตั้งเป้า — ตั้งเป้าแล้วส่วนเป้าหมายด้านล่าง
                มี "ต้นทุนที่ลงไปแล้ว" ยอดเดียวกัน (summary.totalCost ตัวเดียวกัน) อยู่แล้ว */}
            {!goalAnalysis && (
              <Text style={styles.summaryCost}>ลงทุนไปแล้ว {formatCurrency(summary.totalCost)}</Text>
            )}

            {/* ── เป้าหมายพอร์ตรวม: ย้ายขึ้นมาอยู่ในหัวพอร์ต (ไม่มีการ์ดแยกอีกแล้ว) ──
                "ตอนนี้เท่าไหร่" กับ "เทียบเป้าแล้วอยู่ไหน" อ่านต่อกันในกล่องเดียว
                สีทุกตัวต้องเป็นชุดพื้นน้ำเงิน (ขาว/ขาวโปร่ง) — COLORS.text/primary จะจมพื้น */}
            <View style={styles.headerGoalDivider} />
            <View style={styles.headerGoalTitleRow}>
              <Text style={styles.headerGoalTitle}>
                <Ionicons name="disc-outline" size={16} color="#ffffff" /> เป้าหมายพอร์ตรวม
              </Text>
              <TouchableOpacity onPress={openGoalModal}>
                <Text style={styles.headerGoalEdit}>{goal ? 'แก้ไข' : 'ตั้งเป้า'}</Text>
              </TouchableOpacity>
            </View>

            {!goalAnalysis ? (
              <Text style={styles.headerGoalEmpty}>
                ปักยอดพอร์ตที่อยากได้ แล้วระบบจะสรุปให้ว่าไปได้กี่ % และต้องลงเดือนละเท่าไหร่ถึงจะทันกรอบเวลา
              </Text>
            ) : (
              <>
                {/* ป้ายต้องบอกให้ชัดว่าแถบนี้วัด "เงินต้นที่ลงไป" ไม่ใช่ระยะห่างจากเป้า
                    เดิมเขียนว่า "ไปได้ 79%" ซึ่งชนกับบรรทัดล่างที่บอกว่าเหลืออีกแค่ 8% */}
                {/* ฝั่งขวาเป็น "ตัวเลขเป้า" ไม่ใช่ "% ของเป้า" — % ซ้ำกับแถบด้านล่างที่วาดสัดส่วนเดียวกันอยู่แล้ว
                    ส่วนยอดเป้าเป็นตัวเลขที่ไม่มีที่อื่นบอก (แถวรายละเอียดที่เคยบอกถูกถอดออกไปแล้ว) */}
                <View style={styles.goalCardTopRow}>
                  <Text style={styles.headerGoalSub}>
                    ลงเงินไปแล้ว {formatCurrency(goalAnalysis.currentValue)}
                  </Text>
                  <Text style={styles.headerGoalSub}>
                    {goalAnalysis.reached
                      ? `ลงครบเป้า ${formatCurrency(goalAnalysis.targetAmount)} แล้ว`
                      : `เป้า ${formatCurrency(goalAnalysis.targetAmount)}`}
                  </Text>
                </View>
                <View style={styles.headerGoalTrack}>
                  <View
                    style={[
                      styles.goalFill,
                      {
                        width: `${Math.max(0, Math.min(100, goalAnalysis.progressRatio * 100))}%`,
                        // บนพื้นน้ำเงินต้องเติมด้วยสีขาว — COLORS.primary คือสีพื้นเอง มองไม่เห็นแถบ
                        backgroundColor: goalAnalysis.reached ? COLORS.success : '#ffffff',
                      },
                    ]}
                  />
                </View>
                {/* บรรทัดวิเคราะห์ — เขียนเป็นภาษาคน ไม่อธิบายวิธีคิดของ UI ตัวเอง
                    ให้ทางเลือกสองทางที่ลงมือได้จริง: รอให้พอร์ตโตอีกกี่ % หรือเติมเงินอีกเท่าไหร่
                    บรรทัดนี้คือบรรทัดสุดท้ายที่โชว์ตลอด — ที่เหลือย้ายไปใต้ปุ่ม "ดูรายละเอียด" */}
                {goalGap && (
                  <Text style={styles.headerGoalHint}>
                    {goalGap.reached
                      ? 'มูลค่าพอร์ตตอนนี้เลยเป้าไปแล้ว (แถบด้านบนนับแต่เงินต้นที่ลง จึงยังไม่เต็ม)'
                      : `เหลืออีก ${formatCurrency(goalGap.gap)} ถึงเป้า — พอร์ตต้องโตอีก ${goalGap.needPercent.toFixed(1)}% หรือเติมเงินใหม่เท่านี้`}
                  </Text>
                )}

                {/* ตั้งใจไม่โชว์ "คาดถึงเป้าในอีกกี่ปี" และแถว KPI คาดการณ์ — เป็นเลขพยากรณ์
                    ที่ยังไม่เกิดจริง อ่านแล้วเข้าใจผิดว่าถึงเป้าแล้ว */}
              </>
            )}

            {/* ── รายละเอียดที่พับไว้ถูกถอดออกแล้ว (ข้อ 2.2.1) ──
                ปุ่ม "ดูรายละเอียด" กางแล้วได้ย่อหน้าภาษาไทยบนพื้นน้ำเงินสามบรรทัด
                (เทียบฝีมือที่ทำมาได้ / กำไรสะสม) ซึ่งเป็นบริบท ไม่ใช่สิ่งที่ต้องลงมือวันนี้
                ตัวเลขกำไรที่ขายแล้วยังอ่านได้ครบที่แถวเมนู "ผลงานที่ขายแล้ว" ด้านล่าง
                หัวพอร์ตจึงเหลือเฉพาะ: มูลค่ารวม · กำไร · ลงไปแล้วเท่าไหร่จากเป้าเท่าไหร่ */}
          </View>
        </View>

        <View style={[
          styles.actionButtons,
          isDesktop && styles.actionButtonsDesktop,
        ]}>
          {/* ถอดออกแล้ว 3 ปุ่ม (ข้อ 2.4.1): รีเฟรชราคา → ย้ายไปอยู่ติดกับเวลานับถอยหลังบนหัวพอร์ต
              · บัญชี → เข้าได้จาก โปรไฟล์ → บัญชี  · ของที่อยากได้ → มีแถวเมนูของตัวเองอยู่แล้ว
              แถวนี้เหลือเฉพาะสิ่งที่ทำกับ "รายการลงทุน" ตรง ๆ: เพิ่ม / จัดกลุ่มตามแพลตฟอร์ม / แก้รายการตัวเลือก */}
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('AddInvestment', {})}
          >
            <Ionicons name="add-circle-outline" size={18} color="#ffffff" />
            <Text style={styles.addButtonText}></Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButton, styles.updateButton]}
            onPress={() => navigation.navigate('ManageByPlatform')}
          >
            <Ionicons name="layers-outline" size={18} color={COLORS.primary} />
            <Text style={styles.updateButtonText}></Text>
          </TouchableOpacity>
          {/* จัดการรายการสกุลเงิน/แพลตฟอร์มที่เลือกได้ตอนบันทึกการลงทุน */}
          <TouchableOpacity
            style={[styles.addButton, styles.updateButton]}
            onPress={() => navigation.navigate('ManageCatalog')}
          >
            <Ionicons name="options-outline" size={18} color={COLORS.primary} />
            <Text style={styles.updateButtonText}></Text>
          </TouchableOpacity>
        </View>

        {/* ── เมนูของพอร์ต ──
            เดิมทุกเรื่อง (ผลงานที่ขายแล้ว / รอบลงทุน / เงินรอลงทุน / ภาษี / ของที่อยากได้)
            เป็นการ์ดเต็มใบเรียงต่อกันอยู่หน้านี้ ต้องเลื่อนผ่านทั้งหมดกว่าจะถึงรายการลงทุน
            ตอนนี้แต่ละเรื่องเป็นหน้าของตัวเอง เหลือไว้ที่นี่บรรทัดเดียว = "ตัวเลขล่าสุด + ทางเข้า"
            ไม่มีฟีเจอร์ไหนถูกตัด ทุกอันกดเข้าไปได้ครบเหมือนเดิม */}
        <View style={[styles.menuCard, isDesktop && styles.menuCardDesktop]}>
          <MenuRow
            icon="ribbon-outline"
            title="ผลงานที่ขายแล้ว"
            value={
              realized.tradeCount > 0
                ? `${realized.totalPnlTHB >= 0 ? '+' : ''}${formatCurrency(realized.totalPnlTHB)}`
                : '—'
            }
            valueNegative={realized.totalPnlTHB < 0}
            sub={
              realized.tradeCount > 0
                ? `ชนะ ${realized.winCount}/${realized.tradeCount} ดีล · ย้อนคืนการขายได้ที่นี่`
                : 'ยังไม่มีการขายที่บันทึกไว้'
            }
            onPress={() => navigation.navigate('Realized')}
            first
          />
          <MenuRow
            icon="repeat-outline"
            title="รอบลงทุน"
            value={cycleViews.length > 0 ? `${cycleViews.length} รอบ` : '—'}
            sub={
              cycleViews.length > 0
                ? cycleViews
                    .map(({ cycle, status }) => {
                      // ยังไม่มีต้นทุนในรอบ = คิด % ไม่ได้ ต้องเป็นขีด ไม่ใช่ 0.0%
                      const pct =
                        status.profitPercent != null
                          ? `${status.profitPercent >= 0 ? '+' : ''}${status.profitPercent.toFixed(1)}%`
                          : 'ยังไม่มีไม้';
                      return (
                        `รอบ ${cycle.cycleNo} ${pct}` +
                        (status.roundsLeft != null ? ` · เหลือ ${status.roundsLeft} ไม้` : '')
                      );
                    })
                    .join('  ·  ')
                : 'ยังไม่ได้เปิดรอบ — กดเข้าไปเปิดได้'
            }
            onPress={() => navigation.navigate('Cycles')}
          />
          <MenuRow
            icon="cash-outline"
            title="เงินรอลงทุน"
            value={dryPowder > 0 ? `฿${formatCurrency(dryPowder)}` : '—'}
            sub={
              powderPerRound != null
                ? `ลงได้ครั้งละ ฿${formatCurrency(powderPerRound)} · ${dcaRoundsCount} ครั้ง/เดือน`
                : 'ยังไม่ได้จดยอด/ตั้งจำนวนครั้ง'
            }
            onPress={() => navigation.navigate('DryPowder')}
          />
          {/* ภาษี/ของที่อยากได้ โผล่เมื่อมีของจริงเท่านั้น — ไม่งั้นเป็นบรรทัดว่างกวนสายตา */}
          {taxThisYear && (
            <MenuRow
              icon="receipt-outline"
              title={`ภาษีจากกำไรที่ขาย ปี ${currentTaxYear}`}
              value={formatCurrency(taxThisYear.tax)}
              sub={
                !taxProfile
                  ? 'ยังไม่ได้กรอกเงินเดือนที่หน้าภาษี — ยังไม่ใช่ขั้นจริง'
                  : `เข้าฐานภาษี ${formatCurrency(taxThisYear.assessable)} · ตกขั้น ${(taxThisYear.marginalRate * 100).toFixed(0)}%`
              }
              onPress={() => navigation.navigate('Tax')}
            />
          )}
          {purchasePlan.pending.length > 0 && (
            <MenuRow
              icon="gift-outline"
              title="ของที่อยากได้"
              value={`${purchasePlan.unlockedCount}/${purchasePlan.pending.length}`}
              sub={
                purchasePlan.nextUp
                  ? `คิวถัดไป ${purchasePlan.nextUp.goal.name} · ขาดอีก ${formatCurrency(purchasePlan.nextUp.remainingTHB)}`
                  : 'ปลดล็อกครบทุกชิ้นในคิวแล้ว'
              }
              onPress={() => navigation.navigate('PurchaseGoals')}
            />
          )}
        </View>

        {/* การ์ดที่ยังอยู่หน้านี้เหลือใบเดียว: "ถึงคิวลงไม้" — เป็นรายการที่ต้องลงมือวันนี้
            ย้ายไปหน้าอื่นแล้วจะกลายเป็นแจ้งเตือนที่ไม่มีใครเห็น */}
        <View style={isDesktop ? styles.cardGrid : undefined}>
        {/* การ์ดนี้โชว์ตลอดถ้ามีของที่เช็คแท่งเทียนได้ (คริปโต/หุ้น) —
            เมื่อก่อนซ่อนทั้งการ์ดตอนไม่มีสัญญาณ ทำให้แยกไม่ออกว่า "เช็คแล้วไม่มี" หรือ "พัง/ไม่ได้เช็ค" */}
        {redCheckedCount > 0 && (
          <View style={[styles.losersCard, isDesktop && styles.cardGridItem]}>
            {/* หัวการ์ดใช้ชุดเดียวกับการ์ดอื่นในหน้านี้ (ไอคอน outline 18 สีหลัก นำหน้าชื่อในบรรทัดเดียวกัน)
                เดิมเป็นไอคอนเตือนสีแดงขนาด 16 อยู่การ์ดเดียว เลยดูเป็นคนละระบบกับที่เหลือทั้งหน้า */}
            <Text style={styles.goalCardTitle}>
              <Ionicons name="trending-down-outline" size={18} color={COLORS.primary} /> ถึงคิวลงไม้
              — แดงติดกันครบรอบ
            </Text>
            {redChecking ? (
              <Text style={styles.tpSubText}>กำลังเช็คแท่งเทียนของ {redCheckedCount} ตัว…</Text>
            ) : redAlertsMet.length === 0 ? (
              <Text style={styles.tpSubText}>
                เช็ค {redCheckedCount} ตัวแล้ว — ยังไม่มีตัวไหนที่ต้องลงไม้ตอนนี้ (นับเฉพาะแท่งที่ปิดแล้ว){'\n'}
                สถานะรายตัวดูได้ที่การ์ดของแต่ละรายการด้านล่าง · ตั้งกรอบเวลา (วัน/สัปดาห์/เดือน)
                และจำนวนแท่งแยกรายตัวได้ที่หน้าแก้ไขการลงทุน
              </Text>
            ) : null}
            {redAlertsMet.map((a) => (
              <View key={a.key} style={styles.redAlertRow}>
                {/* หนึ่งแถว = ชื่อย่อ · % ที่ร่วง · ราคาที่ลงไปแตะ · ปุ่มซื้อเพิ่ม (ข้อ 2.3.1)
                    ราคาคือ LOW ของสตรีค เพราะเป็นเลขที่เอาไปตั้ง limit ได้จริง */}
                <View style={styles.redAlertMain}>
                  <Text style={styles.redAlertSymbol} numberOfLines={1}>
                    {a.symbol || a.name}
                  </Text>
                  <Text style={styles.redAlertPct}>{a.dropPercent.toFixed(2)}%</Text>
                  <Text style={styles.redAlertPrice} numberOfLines={1}>
                    {redLowValue(a) ?? '—'}
                  </Text>
                  <TouchableOpacity
                    style={styles.redBuyButton}
                    onPress={() => {
                      const inv = investments.find((i) => a.ids.includes(i.id));
                      // ไปที่ไม้เดิมเพื่อแก้จำนวน/ต้นทุนเฉลี่ย ไม่ใช่สร้างรายการใหม่ซ้ำชื่อเดิม
                      navigation.navigate('AddInvestment', inv ? { investment: inv } : {});
                    }}
                  >
                    <Ionicons name="add" size={14} color="#ffffff" />
                    <Text style={styles.redBuyButtonText}>ซื้อเพิ่ม</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.tpSubText}>
                  แดง {a.count} {redUnit(a.interval)}ติดกัน
                </Text>
                {/* บริบทของรอบ: ลงเพิ่มได้อีกไหม/เหลือกี่ไม้ — ต้องอยู่ตรงจุดที่ตัดสินใจลงมือ
                    ชนเพดานหรือหมดงบ = บอกเหตุผลตรงนี้ ไม่ใช่ปล่อยให้ไปเจอตอนกรอกฟอร์มแล้วงง */}
                {(() => {
                  const inv = investments.find((i) => a.ids.includes(i.id));
                  const cv = inv?.cycleId
                    ? cycleViews.find((v) => v.cycle.id === inv.cycleId)
                    : null;
                  if (!cv) return null;
                  const chk = canAddLeg(cv.cycle, cv.status, a.symbol || a.name, powderPerRound);
                  return (
                    <Text style={styles.tpSubText}>
                      {chk.ok
                        ? `รอบ ${cv.cycle.cycleNo} · ${
                            cv.status.roundsLeft != null
                              ? `เหลือลงได้อีก ${cv.status.roundsLeft} ไม้`
                              : 'ยังไม่ได้ตั้งงบของรอบ'
                          }`
                        : `รอบ ${cv.cycle.cycleNo} · ลงเพิ่มไม่ได้ — ${chk.reason}`}
                    </Text>
                  );
                })()}
                {/* ปิดแจ้งเตือนรอบนี้ — ไม่ได้ไปแก้จำนวน/ต้นทุนให้ ต้องเข้าไปแก้ที่การ์ดของไม้เอง
                    (ลงไปกี่หน่วย ราคาเท่าไหร่ มีแต่ผู้ใช้ที่รู้ เดาให้แล้วต้นทุนเฉลี่ยจะเพี้ยนเงียบ ๆ) */}
                <TouchableOpacity style={styles.redAckButton} onPress={() => toggleRedAck(a, true)}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.redAckButtonText}> ลงไม้แล้ว · ปิดเตือนจนกว่าจะครบรอบใหม่</Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* ตัวที่กดปิดไว้ — ยุบเป็นบรรทัดเดียว กางดูได้ ไม่ปล่อยให้หายไปเฉย ๆ
                ต้องมีทางกดกลับ ไม่งั้นกดผิดทีเดียวก็เงียบยาวจนกว่าจะครบรอบถัดไป */}
            {!redChecking && redAlertsAcked.length > 0 && (
              <>
                <TouchableOpacity
                  style={styles.detailToggleInline}
                  onPress={() => setShowRedAcked((v) => !v)}
                >
                  <Ionicons
                    name={showRedAcked ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={COLORS.primary}
                  />
                  <Text style={styles.detailToggleText}>
                    {' '}ซื้อเพิ่มแล้วรอบนี้ ({redAlertsAcked.length}) — รอแดงครบรอบใหม่ถึงจะเตือนอีก
                  </Text>
                </TouchableOpacity>
                {showRedAcked &&
                  redAlertsAcked.map((a) => (
                    <View key={`acked:${a.key}`} style={styles.redAlertRow}>
                      <View style={styles.loserRow}>
                        <Text style={[styles.loserName, styles.redAckedName]} numberOfLines={1}>
                          {a.symbol || a.name}{' '}
                          <Text style={styles.tpSubText}>
                            · ปิดไว้ตอนแดง {a.count} {redUnit(a.interval)} · เตือนอีกครั้งที่{' '}
                            {a.count + a.every} {redUnit(a.interval)}
                          </Text>
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.redAckButton}
                        onPress={() => toggleRedAck(a, false)}
                      >
                        <Ionicons name="notifications-outline" size={14} color={COLORS.primary} />
                        <Text style={styles.redAckButtonText}> เปิดแจ้งเตือนอีกครั้ง</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
              </>
            )}
          </View>
        )}
        </View>
        {/* ── จบกริดการ์ดสรุป ── */}

        <View style={styles.listHeader}>
          <View style={styles.listHeaderRow}>
            <Text style={styles.listTitle}>รายการลงทุน</Text>
            {investments.length > 0 && (
              <TouchableOpacity
                style={[styles.filterToggle, activeFilterCount > 0 && styles.filterToggleOn]}
                onPress={() => setShowFilter((v) => !v)}
              >
                <Ionicons
                  name="funnel-outline"
                  size={14}
                  color={activeFilterCount > 0 ? '#ffffff' : COLORS.primary}
                />
                <Text style={[styles.filterToggleText, activeFilterCount > 0 && styles.filterToggleTextOn]}>
                  {activeFilterCount > 0 ? ` ตัวกรอง (${activeFilterCount})` : ' ตัวกรอง'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {showFilter && investments.length > 0 && (
            <View style={styles.filterPanel}>
              {/* ค้นหาจากชื่อ / ตัวย่อ / แพลตฟอร์ม */}
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={16} color={COLORS.textSecondary} />
                <TextInput
                  style={styles.searchInput}
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="ค้นหาชื่อ / ตัวย่อ / แพลตฟอร์ม"
                  placeholderTextColor={COLORS.textSecondary}
                />
                {searchText.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchText('')}>
                    <Ionicons name="close-circle" size={16} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              {typeOptions.length > 1 && (
                <>
                  <Text style={styles.filterGroupLabel}>ประเภท</Text>
                  <View style={styles.chipWrap}>
                    <TouchableOpacity
                      style={[styles.filterChip, filterType === 'all' && styles.filterChipOn]}
                      onPress={() => setFilterType('all')}
                    >
                      <Text style={[styles.filterChipText, filterType === 'all' && styles.filterChipTextOn]}>
                        ทั้งหมด
                      </Text>
                    </TouchableOpacity>
                    {typeOptions.map((t) => (
                      <TouchableOpacity
                        key={t.value}
                        style={[styles.filterChip, filterType === t.value && styles.filterChipOn]}
                        onPress={() => setFilterType(t.value)}
                      >
                        <Text style={[styles.filterChipText, filterType === t.value && styles.filterChipTextOn]}>
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {platformOptions.length > 1 && (
                <>
                  <Text style={styles.filterGroupLabel}>แพลตฟอร์ม</Text>
                  <View style={styles.chipWrap}>
                    <TouchableOpacity
                      style={[styles.filterChip, filterPlatform === 'all' && styles.filterChipOn]}
                      onPress={() => setFilterPlatform('all')}
                    >
                      <Text style={[styles.filterChipText, filterPlatform === 'all' && styles.filterChipTextOn]}>
                        ทั้งหมด
                      </Text>
                    </TouchableOpacity>
                    {platformOptions.map((p) => (
                      <TouchableOpacity
                        key={p}
                        style={[styles.filterChip, filterPlatform === p && styles.filterChipOn]}
                        onPress={() => setFilterPlatform(p)}
                      >
                        <Text style={[styles.filterChipText, filterPlatform === p && styles.filterChipTextOn]}>
                          {p}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Text style={styles.filterGroupLabel}>สถานะ</Text>
              <View style={styles.chipWrap}>
                {([
                  { value: 'all', label: 'ทั้งหมด' },
                  { value: 'profit', label: 'กำไร' },
                  { value: 'loss', label: 'ขาดทุน' },
                ] as const).map((o) => (
                  <TouchableOpacity
                    key={o.value}
                    style={[styles.filterChip, filterPnl === o.value && styles.filterChipOn]}
                    onPress={() => setFilterPnl(o.value)}
                  >
                    <Text style={[styles.filterChipText, filterPnl === o.value && styles.filterChipTextOn]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.filterGroupLabel}>เรียงตาม</Text>
              <View style={styles.chipWrap}>
                {sortOptions.map((o) => (
                  <TouchableOpacity
                    key={o.value}
                    style={[styles.filterChip, sortBy === o.value && styles.filterChipOn]}
                    onPress={() => setSortBy(o.value)}
                  >
                    <Text style={[styles.filterChipText, sortBy === o.value && styles.filterChipTextOn]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {activeFilterCount > 0 && (
                <TouchableOpacity style={styles.clearFilterButton} onPress={clearFilters}>
                  <Ionicons name="close-outline" size={14} color={COLORS.textSecondary} />
                  <Text style={styles.clearFilterText}> ล้างตัวกรอง</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {activeFilterCount > 0 && (
            <Text style={styles.filterSummary}>
              แสดง {visibleInvestments.length} จาก {investments.length} รายการ • มูลค่า{' '}
              {formatCurrency(visibleTotals.value)} • {visibleTotals.profit >= 0 ? 'กำไร +' : 'ขาดทุน '}
              {formatCurrency(visibleTotals.profit)}
            </Text>
          )}
        </View>
      </View>
  );

  const emptyListElement = (
    <View>
      {investments.length > 0 ? (
        <>
          <Text style={styles.emptyText}>ไม่พบรายการที่ตรงกับตัวกรอง</Text>
          <TouchableOpacity style={styles.clearFilterButton} onPress={clearFilters}>
            <Ionicons name="close-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.clearFilterText}> ล้างตัวกรอง</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.emptyText}>ยังไม่มีการลงทุน{'\n'}เริ่มเพิ่มการลงทุนของคุณเลย!</Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View
        style={styles.innerContainer}
        // วัดความกว้างจริงของ pane (หลังหัก sidebar) — ค่าที่เดาไว้ตอน mount อาจคลาดถ้า
        // sidebar เปลี่ยนความกว้างที่ breakpoint 1440 หรือหน้าต่างย่อ/ขยาย
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (Math.abs(w - gridWidth) > 1) setGridWidth(w);
        }}
      >
        {isDesktop ? (
          <FlatList
            data={visibleInvestments}
            renderItem={renderInvestmentItem}
            keyExtractor={(item) => item.id}
            numColumns={gridCols}
            // FlatList ไม่รับการเปลี่ยน numColumns กลางทาง ต้องบังคับ remount ด้วย key
            key={`desktop-${gridCols}col`}
            columnWrapperStyle={styles.flatListRow}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={listHeaderElement}
            ListEmptyComponent={emptyListElement}
          />
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {listHeaderElement}
            <View style={styles.listcontainer}>
            {visibleInvestments.length === 0 ? (
              emptyListElement
            ) : (
              visibleInvestments.map((item) => (
                <View key={item.id}>{renderInvestmentItem({ item })}</View>
              ))
            )}
            </View>
          </ScrollView>
        )}
      </View>

      {/* ── Modal บันทึกการขาย ── */}
      <Modal
        visible={sellTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSellTarget(null)}
      >
        <View style={styles.modalOverlay}>
          {/* ฟอร์มนี้สูงเกินจอมือถือ (5 ช่อง + พรีวิว + checkbox) และ body ของเว็บตั้ง overflow:hidden ไว้
              ถ้าไม่ให้การ์ดเลื่อนเอง ปุ่ม "บันทึกการขาย" จะหลุดออกนอกจอแล้วกดไม่ได้เลย */}
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={styles.modalCardContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>
              <Ionicons name="cash-outline" size={18} color={COLORS.primary} /> บันทึกการขาย
              {sellTarget ? ` — ${sellTarget.symbol || sellTarget.name}` : ''}
            </Text>
            {sellTarget && (() => {
              // พรีวิวกำไร/ขาดทุนสด ๆ ตามที่พิมพ์ ก่อนกดบันทึก
              const qty = parseFloat(sellQtyInput.replace(/,/g, '')) || 0;
              const price = parseFloat(sellPriceInput.replace(/,/g, '')) || 0;
              const sellFee = parseFloat(sellFeesInput.replace(/,/g, '')) || 0;
              const buyFeeShare =
                sellTarget.quantity > 0 ? (sellTarget.fees || 0) * (qty / sellTarget.quantity) : 0;
              const cost = convertToTHB(sellTarget.buyPrice, sellTarget.currency) * qty;
              const proceeds =
                convertToTHB(price, sellTarget.currency) * qty - (buyFeeShare + sellFee);
              const pnl = proceeds - cost;
              const pct = cost > 0 ? (pnl / cost) * 100 : 0;
              // เงินสดที่ได้รับจริงในสกุลที่ขาย (ค่าธรรมเนียมขายกรอกเป็นบาท → หารเรตกลับก่อนหัก)
              const rate = convertToTHB(1, sellTarget.currency ?? 'THB') || 1;
              const netNative = qty * price - sellFee / rate;
              return (
                <>
                  <Text style={styles.goalCardSub}>
                    ถืออยู่ {sellTarget.quantity} หน่วย • ต้นทุน{' '}
                    {formatCurrencyWithType(sellTarget.buyPrice, sellTarget.currency)}/หน่วย
                  </Text>
                  <Text style={styles.modalLabel}>ขายกี่หน่วย</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={sellQtyInput}
                    onChangeText={setSellQtyInput}
                    keyboardType="numeric"
                    placeholder={`สูงสุด ${sellTarget.quantity}`}
                    placeholderTextColor={COLORS.textSecondary}
                  />
                  <Text style={styles.modalLabel}>
                    ราคาขายต่อหน่วย ({sellTarget.currency ?? 'THB'})
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={sellPriceInput}
                    onChangeText={setSellPriceInput}
                    keyboardType="numeric"
                    placeholder="ราคาที่ขายได้จริง"
                    placeholderTextColor={COLORS.textSecondary}
                  />
                  <Text style={styles.modalLabel}>วันที่ขาย (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={sellDateInput}
                    onChangeText={setSellDateInput}
                    placeholder="2026-08-01"
                    placeholderTextColor={COLORS.textSecondary}
                  />
                  <Text style={styles.modalLabel}>ค่าธรรมเนียมขาย (บาท, ไม่บังคับ)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={sellFeesInput}
                    onChangeText={setSellFeesInput}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={COLORS.textSecondary}
                  />
                  <Text style={styles.modalLabel}>ขายเพราะอะไร (ไม่บังคับ)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={sellNotesInput}
                    onChangeText={setSellNotesInput}
                    placeholder="เช่น ถึงเป้ากำไรที่ตั้งไว้ / ตัดขาดทุน / ต้องใช้เงิน"
                    placeholderTextColor={COLORS.textSecondary}
                  />
                  {qty > 0 && price > 0 && (() => {
                    // ภาษีที่จะเพิ่มขึ้นจากการขายก้อนนี้ คิดบนฐานเงินได้ของปีนี้จริง ๆ
                    // (ไม่ใช่กำไร × อัตราขั้น เพราะกำไรก้อนใหญ่ดันข้ามขั้นได้)
                    const taxEst = estimateGainTax(
                      pnl,
                      sellTarget.type,
                      taxProfile ?? emptyTaxProfile(currentTaxYear),
                      tradesThisTaxYear,
                      taxOpts
                    );
                    return (
                      <>
                        <View style={styles.answerBox}>
                          <Text style={styles.answerLabel}>กำไร/ขาดทุนจริงที่จะบันทึก</Text>
                          <Text style={[styles.answerBig, pnl < 0 && { color: COLORS.error }]}>
                            {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)} ({pnl >= 0 ? '+' : ''}
                            {pct.toFixed(1)}%)
                          </Text>
                          {pnl > 0 && (
                            <Text style={styles.answerTaxLine}>
                              {taxEst.rule === 'exempt'
                                ? `ภาษี: ${GAIN_RULE_LABELS.exempt} (${sellTarget.type === 'stock_th' ? 'หุ้นไทย' : 'ตามกฎที่ตั้งไว้'}) — เหลือเข้ากระเป๋าเต็ม ${formatCurrency(pnl)}`
                                : `ภาษีประมาณ ${formatCurrency(taxEst.tax)} (${(taxEst.rate * 100).toFixed(1)}% ของกำไร) — เหลือสุทธิ ${formatCurrency(pnl - taxEst.tax)}`}
                            </Text>
                          )}
                        </View>
                        {pnl > 0 && taxEst.rule !== 'exempt' && !taxProfile && (
                          <Text style={styles.tpSubText}>
                            * ยังไม่ได้กรอกเงินเดือนที่หน้า "ภาษี" — ภาษีข้างบนคิดจากกำไรล้วน ๆ
                            ของจริงจะสูงกว่านี้เพราะต้องรวมกับเงินได้ทั้งปี
                          </Text>
                        )}
                      </>
                    );
                  })()}
                  {/* เงินที่ขายได้ = เงินรอลงทุนก้อนใหม่ — ติ๊กไว้ให้ ไม่ต้องไปกด "จดยอด" ซ้ำ */}
                  {netNative > 0 && (
                    <TouchableOpacity
                      style={styles.sellToPowderRow}
                      onPress={() => setSellToPowder((v) => !v)}
                    >
                      <Ionicons
                        name={sellToPowder ? 'checkbox' : 'square-outline'}
                        size={18}
                        color={sellToPowder ? COLORS.primary : COLORS.textSecondary}
                      />
                      <Text style={styles.sellToPowderText}>
                        {' '}เพิ่มเข้าเงินรอลงทุน {formatCurrencyWithType(netNative, sellTarget.currency ?? 'THB')}
                        {sellTarget.platform ? ` · ${sellTarget.platform}` : ''}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {qty >= sellTarget.quantity && (
                    <Text style={styles.tpSubText}>
                      * ขายหมด — รายการนี้จะถูกเอาออกจากพอร์ต แต่ผลกำไรจะถูกเก็บไว้ในประวัติผลงานจริง
                    </Text>
                  )}
                </>
              );
            })()}
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleConfirmSell}>
              <Text style={styles.modalSaveBtnText}>บันทึกการขาย</Text>
            </TouchableOpacity>
            <View style={styles.modalBottomRow}>
              <TouchableOpacity onPress={() => setSellTarget(null)}>
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Modal ตั้ง/แก้เป้าหมายพอร์ตรวม ── */}
      <Modal
        visible={goalModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGoalModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={styles.modalCardContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>
              <Ionicons name="disc-outline" size={18} color={COLORS.primary} /> เป้าหมายพอร์ตรวม
            </Text>
            <Text style={styles.modalLabel}>ยอดพอร์ตที่อยากได้ (บาท)</Text>
            <TextInput
              style={styles.modalInput}
              value={goalTargetInput}
              onChangeText={setGoalTargetInput}
              keyboardType="numeric"
              placeholder="เช่น 1000000"
              placeholderTextColor={COLORS.textSecondary}
            />
            <Text style={styles.modalLabel}>คาดว่าจะโตปีละกี่ % (ไม่บังคับ)</Text>
            <TextInput
              style={styles.modalInput}
              value={goalExpectedInput}
              onChangeText={setGoalExpectedInput}
              keyboardType="numeric"
              placeholder="เช่น 10 — เว้นว่างได้ ระบบจะใช้พาซจริงของพอร์ต"
              placeholderTextColor={COLORS.textSecondary}
            />
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveGoal}>
              <Text style={styles.modalSaveBtnText}>บันทึกเป้าหมาย</Text>
            </TouchableOpacity>
            <View style={styles.modalBottomRow}>
              {goal && (
                <TouchableOpacity onPress={handleDeleteGoal}>
                  <Text style={styles.modalDeleteText}>ลบเป้าหมาย</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setGoalModalVisible(false)}>
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  innerContainer: {
    flex: 1,
  },
  // เดสก์ท็อปใช้ความกว้างเต็ม pane — ไม่มี maxWidth/alignSelf:'center' แล้ว
  // ที่ว่างที่ได้เพิ่มไปโตเป็น "จำนวนคอลัมน์" ไม่ใช่ "การ์ดอ้วนขึ้น" (ดู gridCols)
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 16,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  // ── เมนูของพอร์ต (แทนการ์ดเต็มใบที่ย้ายไปเป็นหน้าของตัวเอง) ──
  menuCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  // เดสก์ท็อป: เมนูเป็นคอลัมน์เดียวจะยาวเป็นแถบขวางจอ — คุมด้วย flexBasis เท่าการ์ดสรุปเดิม
  // (ไม่ใช่ maxWidth ของหน้า ซึ่งห้ามใช้ — ดู CLAUDE.md §1.3)
  menuCardDesktop: {
    flexBasis: CARD_GRID_BASIS,
    flexGrow: 0,
    alignSelf: 'flex-start',
    minWidth: 0,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  menuRowFirst: {
    borderTopWidth: 0,
  },
  menuRowIcon: {
    width: 20,
  },
  // minWidth: 0 เพื่อให้บรรทัดขยายความยาว ๆ ตัดคำแทนที่จะดันตัวเลขทางขวาหลุดขอบ
  menuRowMain: {
    flex: 1,
    minWidth: 0,
  },
  menuRowTitle: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  menuRowSub: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  menuRowValue: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
    textAlign: 'right',
  },
  menuRowValueNeg: {
    color: COLORS.error,
  },
  cardGridItem: {
    // flexBasis เป็นตัวคุมว่าแถวหนึ่งจะวางได้กี่ใบ, flexGrow ให้ใบที่เหลือกินที่ว่างจนหมดแถว
    flexBasis: CARD_GRID_BASIS,
    flexGrow: 1,
    // การ์ดมี TextInput/ข้อความยาว — ขาด minWidth:0 แล้ว flexShrink จะทำงานไม่ได้บนเว็บ
    minWidth: 0,
    // margin เดิมของการ์ดมาจาก goalCard/losersCard ทับด้วย gap ของกริดแทน
    marginHorizontal: 0,
    marginBottom: 0,
  },
  header: {
    backgroundColor: COLORS.primary,
    padding: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  headerDesktop: {
    paddingTop: 20,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  // ต้องมีกล่องซ้ายครอบไอคอน+ชื่อ ไม่งั้น space-between จะดันไอคอนกับชื่อแยกออกจากกัน
  headerTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 2,
    color: '#ffffff',
  },
  // ── กล่องสรุปในหัวพอร์ต (พื้นน้ำเงิน COLORS.primary) ──
  // ทุกสีในกล่องนี้ต้องเป็นขาว/ขาวโปร่ง — COLORS.text/textSecondary/primary จมพื้นมองไม่เห็น
  summaryContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 0,
    padding: 16,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_400Regular',
    color: '#ffffff',
  },
  summaryValue: {
    fontSize: 32,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: '#ffffff',
  },
  profitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryProfit: {
    fontSize: 18,
    fontFamily: 'NotoSansThai_600SemiBold',
  },
  summaryPercent: {
    fontSize: 16,
    fontFamily: 'NotoSansThai_600SemiBold',
  },
  summaryCost: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    color: '#ffffff',
    opacity: 0.9,
    marginTop: 8,
  },
  // อยู่มุมขวาบนคู่กับชื่อหน้า — flexShrink ให้ตัดบรรทัดในคอลัมน์ขวาแทนที่จะดันชื่อหน้าจนล้น
  summaryRefreshedAt: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: '#ffffff',
    opacity: 0.7,
    flexShrink: 1,
    textAlign: 'right',
  },
  // เวลานับถอยหลัง + ปุ่มรีเฟรช อยู่ในแถวเดียวกันบนหัวพอร์ต (พื้นน้ำเงิน → ไอคอนต้องขาว)
  priceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  priceStatusRefresh: {
    padding: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  // ── ส่วน "เป้าหมายพอร์ตรวม" ที่ย้ายขึ้นมาอยู่ในกล่องสรุปนี้ (ไม่มีการ์ดแยกแล้ว) ──
  headerGoalDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginTop: 14,
    marginBottom: 10,
  },
  headerGoalTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerGoalTitle: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: '#ffffff',
  },
  headerGoalEdit: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: '#ffffff',
    opacity: 0.85,
  },
  headerGoalSub: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: '#ffffff',
    opacity: 0.9,
  },
  headerGoalNote: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: '#ffffff',
    opacity: 0.75,
    marginTop: 4,
  },
  // บรรทัดวิเคราะห์ "อีกกี่รอบถึงเป้า" — เน้นกว่า note ทั่วไป (ทึบกว่า + น้ำหนักตัวอักษรมากกว่า)
  // แต่ยังเบากว่าหัวข้อ เพื่อไม่ไปแย่งสายตาจากยอดมูลค่ารวมด้านบน
  headerGoalHint: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_500Medium',
    color: '#ffffff',
    opacity: 0.95,
    marginTop: 6,
    lineHeight: 18,
  },
  headerGoalEmpty: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: '#ffffff',
    opacity: 0.85,
    lineHeight: 18,
  },
  headerGoalTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: 6,
  },
  profitPositive: {
    color: COLORS.success,
  },
  profitNegative: {
    color: COLORS.error,
  },
  goalCardTitle: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  goalCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalCardSub: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  goalFill: {
    height: 8,
    borderRadius: 4,
  },
  // ปุ่มกาง/ยุบ (เหลือใช้ที่ลิสต์ "ที่ขายแล้ว")
  detailToggleText: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
  },
  // ตัวเลขเด่นในกล่องสรุป (ใช้ในกล่องยืนยันการขาย)
  answerBox: {
    marginTop: 10,
    backgroundColor: `${COLORS.primary}0D`,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  answerLabel: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  answerBig: {
    fontSize: 24,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
  },
  answerTaxLine: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    marginTop: 6,
    lineHeight: 16,
  },
  tpRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    marginTop: -4,
  },
  tpSubText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.accent,
    marginTop: 3,
  },
  losersCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  // แถวหนึ่งตัวในการ์ด "ถึงคิวลงไม้" = บรรทัดข้อมูล + ปุ่มปิดแจ้งเตือน
  // มีเส้นคั่นเพราะแต่ละตัวกินสองบรรทัด ถ้าไม่คั่นจะอ่านไม่ออกว่าปุ่มเป็นของตัวไหน
  redAlertRow: {
    paddingTop: 6,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  // ── แถวหลักของ "ถึงคิวลงไม้": ชื่อย่อ · % · ราคา · ปุ่ม ──
  redAlertMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // flex + minWidth:0 คู่กันบังคับ — ชื่อยาวจะดันปุ่มหลุดขอบการ์ดบนเว็บ (CLAUDE.md §1.4)
  redAlertSymbol: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  redAlertPct: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.error,
  },
  redAlertPrice: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  redBuyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  redBuyButtonText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: '#ffffff',
  },
  // ปุ่มรอง — จงใจให้จืดกว่าตัวเลข % ที่เป็นพระเอกของแถว
  redAckButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  redAckButtonText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.primary,
  },
  // ตัวที่ปิดแจ้งเตือนไว้แล้ว — จางลงเพื่อบอกว่า "ไม่ต้องทำอะไรกับอันนี้แล้ว"
  redAckedName: {
    color: COLORS.textSecondary,
  },
  loserRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  loserName: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.text,
    marginRight: 12,
  },
  loserPct: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.error,
  },
  // ราคาต่ำสุดที่ต่อท้าย % — สีเทาเพื่อไม่ให้แข่งกับตัวเลข % ที่เป็นพระเอกของแถว
  loserLow: {
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  // การ์ดเป็น ScrollView: style = กล่องนอก (สูงได้ไม่เกินจอ), contentContainerStyle = padding ข้างใน
  // flexGrow:0 เพื่อให้สูงตามเนื้อหาจริง ไม่ใช่ยืดเต็มจอทุกครั้งแบบ default ของ ScrollView
  modalCard: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '100%',
    flexGrow: 0,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCardContent: {
    padding: 24,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 10,
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
    marginBottom: 8,
    marginTop: 12,
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    fontSize: 16,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.text,
  },
  modalSaveBtn: {
    backgroundColor: COLORS.primary,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  modalSaveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  modalBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  modalDeleteText: {
    color: COLORS.error,
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
  },
  modalCancelText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    marginLeft: 'auto',
  },
  actionButtons: {
    flexDirection: 'row',
    marginVertical: 16,
    paddingHorizontal:16,
    gap: 12,
  },
  actionButtonsDesktop: {
    maxWidth: 500,
  },
  addButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 0,
    padding: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  updateButton: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.primary,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  updateButtonText: {
    color: COLORS.primary,
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  listHeader: {
    padding:16
  },
  listTitle: {
    fontSize: 18,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  filterToggleOn: {
    backgroundColor: COLORS.primary,
  },
  filterToggleText: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.primary,
  },
  filterToggleTextOn: {
    color: '#ffffff',
  },
  filterPanel: {
    marginTop: 12,
    padding: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'web' ? 8 : 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  searchInput: {
    flex: 1,
    minWidth: 0, // <input> บนเว็บย่อไม่ลงถ้าไม่ใส่ (ดูหมายเหตุที่ powderRowLabel)
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
  },
  filterGroupLabel: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    marginTop: 12,
    marginBottom: 6,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  filterChipOn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
  },
  filterChipTextOn: {
    color: '#ffffff',
  },
  clearFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  clearFilterText: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  filterSummary: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.accent,
    marginTop: 8,
  },
  // ── รายดีลที่ขายแล้ว + ปุ่มย้อนคืน ──
  detailToggleInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: 0,
  },
  listcontainer:{
    paddingHorizontal:16
  },
  flatListRow: {
    gap: 12,
    marginHorizontal:16,
    // การ์ดในแถวเดียวกันสูงเท่ากันเสมอ (ค่า default ของ flexbox อยู่แล้ว แต่เขียนไว้ให้ชัด
    // เพราะ investmentContent พึ่ง stretch นี้ในการดูดพื้นที่ส่วนเกิน)
    alignItems: 'stretch',
  },
  investmentItem: {
    backgroundColor: COLORS.surface,
    marginBottom: 12,
    elevation: 2,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    }),
  },
  investmentItemDesktop: {
    flex: 1,
    maxWidth: '49%' as any,
  },
  // flex:1 = ตัวดูดความสูงส่วนเกินของการ์ด
  // การ์ดในแถวเดียวกันถูกยืดสูงเท่ากัน (flatListRow) แต่เนื้อในสูงไม่เท่ากัน — บางใบมี
  // บรรทัดกฎแท่งแดง (redRuleText) หรือ tpRow บางใบไม่มี ถ้าไม่มีตัวไหนยืด ที่ว่างจะไปกอง
  // ใต้แถวปุ่ม ขาย/ลบ กลายเป็นการ์ดเนื้อในไม่เต็มกล่อง
  investmentContent: {
    flex: 1,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  // กระจายหัวการ์ด (ชื่อ/สัญลักษณ์) ไว้บน รายละเอียด (จำนวน/ราคา) ไว้ล่าง
  // ที่ว่างจึงไปอยู่กลางการ์ดแทนที่จะกองท้าย อ่านแล้วเต็มกล่องกว่า
  investmentLeft: {
    flex: 1,
    justifyContent: 'space-between',
  },
  investmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },

  investmentInfo: {
    flex: 1,
  },
  investmentName: {
    fontSize: 16,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  investmentSymbol: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  // ── ติ๊ก "เพิ่มเข้าเงินรอลงทุน" ในฟอร์มขาย ──
  sellToPowderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 6,
  },
  sellToPowderText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
  },
  // ── ป้าย "แดงติดกันครบคู่ = ถึงคิวลงไม้" บนการ์ดหุ้น ──
  redBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  redBadgeText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.error,
  },
  // ── ป้าย "ลงไม้รอบนี้ไปแล้ว" — กรอบ/ตัวอักษรจืดลง ──
  // ต้องเห็นว่ามีสถานะอยู่ แต่ห้ามเด่นเท่าตัวที่ยังต้องลงมือ ไม่งั้นสายตากวาดแล้วแยกไม่ออกว่าอันไหนต้องทำ
  redBadgeAcked: {
    borderColor: COLORS.border,
  },
  redBadgeTextAcked: {
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  // สถานะกฎที่ยังไม่ครบรอบ — ตั้งใจให้จืดกว่าป้ายแดง จะได้ไม่แย่งความสนใจจากตัวที่ถึงคิวจริง
  redRuleText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    marginTop: 4,
    marginLeft: 32,
  },
  investmentDetails: {
    marginLeft: 32,
  },
  investmentQuantity: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  investmentCurrent: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  investmentRight: {
    alignItems: 'flex-end',
    marginLeft: 16,
    // ไม่ตั้ง maxWidth เป็น % — ชื่อแพลตฟอร์มยาว ๆ ถูกคุมด้วย platformTagText.maxWidth แทน
  },
  // ตัวเลข (มูลค่า/กำไร/%) ยังอยู่กลางแนวตั้งเหมือนเดิม โดยกินพื้นที่ที่เหลือจากป้ายแพลตฟอร์ม
  investmentNums: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  // ── ป้ายแพลตฟอร์มมุมขวาบน ──
  platformTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  platformLogo: {
    width: 18,
    height: 18,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformLogoText: {
    fontSize: 9,
    // สีขาวบนพื้นแบรนด์ — ตัวย่อสั้น 2 ตัว ขนาดเล็ก จึงใช้ SemiBold ให้ยังอ่านออก
    fontFamily: 'NotoSansThai_600SemiBold',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  platformTagText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    // ชื่อยาว (เช่น "Interactive Brokers") ต้องตัดคำ ไม่ใช่ดันการ์ดหรือบีบตัวเลขทางขวา
    maxWidth: 108,
  },
  platformTagTextNarrow: {
    maxWidth: 76,
  },
  investmentValue: {
    fontSize: 18,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
    marginBottom: 4,
  },
  investmentProfit: {
    fontSize: 15,
    fontFamily: 'NotoSansThai_600SemiBold',
    marginBottom: 2,
  },
  investmentPercent: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
  },
  // แถวปุ่มท้ายการ์ดหุ้น: ขาย (บันทึกผลจริง) | ลบ (เอาออกเฉย ๆ)
  itemActionRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sellButton: {
    flex: 1,
    padding: 12,
    backgroundColor: `${COLORS.primary}0D`,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  sellButtonText: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
  },
  deleteButton: {
    flex: 1,
    padding: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 16,
    fontFamily: 'NotoSansThai_300Light',
    marginTop: 32,
    lineHeight: 24,
  },
});
