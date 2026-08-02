import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
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
  DEFAULT_CURRENCIES,
} from '../types/investment';
import { getCurrencies } from '../services/currencyStorage';
import { getRealizedTrades, saveRealizedTrade, deleteRealizedTrade } from '../services/realizedStorage';
import { summarizeRealized, analyzeRealizedTrade } from '../utils/realizedAnalysis';
import {
  getInvestments,
  deleteInvestment,
  getPortfolioSummary,
  updateInvestment,
  saveInvestment,
} from '../services/investmentStorage';
import { formatCurrency, formatCurrencyWithType, convertToTHB, toChristianYear, COLORS } from '../utils/constants';
import { updateInvestmentPrice, getTwoRedDays } from '../services/priceApi';
import { analyzePortfolioGoal, PortfolioGoal, PortfolioGoalAnalysis } from '../utils/investmentGoals';
import { getPortfolioGoal, savePortfolioGoal, deletePortfolioGoal } from '../services/portfolioGoalStorage';
import {
  getInvestmentPlan,
  saveInvestmentPlan,
  InvestmentPlan,
  DryPowderItem,
  sumDryPowderItems,
} from '../services/investmentPlanStorage';
import { getAccounts } from '../services/accountStorage';
import { Account } from '../types/account';
import { getHoldingAnnualGrowth } from '../utils/holdingAnalysis';
import { useResponsive } from '../utils/responsive';


type PortfolioScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Portfolio'
>;

export default function PortfolioScreen() {
  const navigation = useNavigation<PortfolioScreenNavigationProp>();
  const { isDesktop } = useResponsive();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary>({
    totalValue: 0,
    totalCost: 0,
    totalProfit: 0,
    totalProfitPercent: 0,
    byType: {},
  });
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  const [goal, setGoal] = useState<PortfolioGoal | null>(null);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [goalTargetInput, setGoalTargetInput] = useState('');
  const [goalExpectedInput, setGoalExpectedInput] = useState('');
  const [plan, setPlan] = useState<InvestmentPlan | null>(null);
  const [powderMonths, setPowderMonths] = useState(1);          // จะกระจายเงินก้อนนี้กี่เดือน
  // จดยอดเงินรอลงทุน — จดแยกได้หลายรายการ (แหล่งเงิน/โบรก) ยอดรวมคือผลบวกของทุกแถว
  const [powderModalVisible, setPowderModalVisible] = useState(false);
  const [powderRows, setPowderRows] = useState<
    { id: string; label: string; amount: string; currency: string }[]
  >([]);
  // ตัวเลือกสกุลเงิน = ของที่ตั้งไว้ในหน้า "สกุลเงิน & แพลตฟอร์ม" (ไม่ hardcode)
  const [currencyOptions, setCurrencyOptions] = useState<string[]>(
    DEFAULT_CURRENCIES.map((c) => c.code)
  );
  const [reserveAccounts, setReserveAccounts] = useState<Account[]>([]); // บัญชีบทบาท "รอลงทุน"
  // แท่งแดงติดกันเป็นเลขคู่ (2/4/6…) = สัญญาณลงไม้ตามกฎ "ลงทุก  2 แท่งแดง"
  const [redAlerts, setRedAlerts] = useState<
    { type: InvestmentType; symbol: string; name: string; dropPercent: number; count: number }[]
  >([]);
  // เช็คเสร็จหรือยัง — ต้องบอกให้รู้ว่า "เช็คแล้วไม่มี" ต่างจาก "ยังไม่ได้เช็ค/เช็คไม่ได้"
  const [redChecking, setRedChecking] = useState(false);
  const [redCheckedCount, setRedCheckedCount] = useState(0);
  // ── การขายจริง: ตัวชี้วัดฝีมือที่วัดได้ (ต่างจากกำไรลอยตัว) ──
  const [realizedTrades, setRealizedTrades] = useState<RealizedTrade[]>([]);
  const [sellTarget, setSellTarget] = useState<Investment | null>(null);
  const [sellQtyInput, setSellQtyInput] = useState('');
  const [sellPriceInput, setSellPriceInput] = useState('');
  const [sellDateInput, setSellDateInput] = useState('');
  const [sellFeesInput, setSellFeesInput] = useState('');
  const [sellNotesInput, setSellNotesInput] = useState('');   // ขายเพราะอะไร — ไว้ทบทวนฝีมือย้อนหลัง
  const [sellToPowder, setSellToPowder] = useState(true);     // เงินที่ขายได้ → เข้าเงินรอลงทุนเลย
  const [showRealizedList, setShowRealizedList] = useState(false); // กาง/ยุบรายดีลที่ขายแล้ว
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
      const accs = await getAccounts();
      setReserveAccounts(accs.filter((a) => a.role === 'reserve'));
    } catch {
      setReserveAccounts([]);
    }
    try {
      // สกุลเงินที่ตั้งไว้เอง — ใช้เป็นตัวเลือกตอนจดเงินรอลงทุน
      const curList = await getCurrencies();
      if (curList.length > 0) setCurrencyOptions(curList.map((c) => c.code));
    } catch {
      // ยังไม่ได้รัน SQL แคตตาล็อก → ใช้ค่าเริ่มต้น
    }
    // (เลิกดึงรายรับ/รายจ่ายมาที่หน้านี้แล้ว — งบรายเดือนดูที่หน้าหลัก)

    // เช็คแดงติดกันเป็นเลขคู่ (2/4/6…) เฉพาะ crypto/หุ้น — ทำแบบ background ไม่บล็อกการโหลด
    const candleTargets = allInvestments.filter((i) =>
      ['crypto', 'stock_th', 'stock_foreign'].includes(i.type)
    );
    setRedCheckedCount(candleTargets.length);
    setRedChecking(candleTargets.length > 0);
    Promise.all(
      candleTargets.map(async (i) => ({ inv: i, alert: await getTwoRedDays(i.type, i.symbol) }))
    )
      .then((results) =>
        setRedAlerts(
          results
            .filter((r) => r.alert !== null)
            .map((r) => ({
              // เก็บ type ไว้ด้วย — ใช้จับคู่กับรายการลงทุนตอนติดป้ายในลิสต์ (symbol เดียวกันข้ามประเภทได้)
              type: r.inv.type,
              symbol: r.inv.symbol,
              name: r.inv.name,
              dropPercent: r.alert!.dropPercent,
              count: r.alert!.count,
            }))
            // เรียงจากลบเยอะสุด → น้อยสุด (dropPercent เป็นค่าลบ)
            .sort((a, b) => a.dropPercent - b.dropPercent)
        )
      )
      .catch(() => setRedAlerts([]))
      .finally(() => setRedChecking(false));
  };

  const showMsg = (msg: string) => {
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert('', msg);
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
      showMsg(`จำนวนที่ขายต้องมากกว่า 0 และไม่เกิน ${sellTarget.quantity}`);
      return;
    }
    if (!price || price <= 0) { showMsg('กรุณากรอกราคาขาย'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { showMsg('วันที่ขายต้องเป็นรูปแบบ YYYY-MM-DD'); return; }

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
      showMsg(
        (sellToPowder && netProceedsNative > 0
          ? `บันทึกการขายแล้ว · เพิ่มเข้าเงินรอลงทุน ${formatCurrencyWithType(netProceedsNative, sellCurrency)}`
          : 'บันทึกการขายแล้ว') + powderWarn
      );
      loadData();
    } catch (e: any) {
      const msg = String(e?.message || e);
      showMsg(
        /realized_trades|does not exist|schema cache/i.test(msg)
          ? 'ยังไม่ได้สร้างตาราง — เอา sql/realized_trades.sql ไปรันที่ Supabase ก่อน'
          : `บันทึกการขายไม่สำเร็จ: ${msg}`
      );
    }
  };

  // ── ย้อนคืนการขาย: กดขายผิด/กรอกเลขผิด ต้องกู้กลับได้ ──
  // คืนของเข้าพอร์ตก่อน แล้วค่อยลบบันทึกการขาย — ถ้าลำดับกลับกันแล้วพังกลางทาง ของจะหายทั้งสองที่
  const undoSell = async (trade: RealizedTrade) => {
    try {
      // อ่านพอร์ตสด ๆ จาก DB ก่อน ห้ามเชื่อ state ที่อาจค้าง —
      // update ที่ไม่เจอแถว (เช่นรายการถูกลบไปแล้ว) จะ "ผ่าน" แบบไม่มี error
      // แล้วเราจะเผลอลบบันทึกการขายทิ้ง = ของหายทั้งสองที่
      const fresh = await getInvestments();
      const snap = trade.sourceInvestment;
      // แพลตฟอร์มของไม้ที่ขายไป — อ่านจากคอลัมน์ platform ก่อน ไม่มีก็เอาจาก snapshot
      const platform = trade.platform ?? snap?.platform;
      // ── ห้ามรวมข้ามไม้เด็ดขาด ──
      // ตัวเดียวกันมีได้หลายไม้ (เช่น INTC ซื้อ 3 รอบ / อยู่คนละโบรก = หลายแถว ต้นทุนต่างกัน)
      // ถ้าเอาจำนวนไปบวกกับแถวที่แค่ symbol ตรง ต้นทุน/กำไรของแถวนั้นเพี้ยนทั้งแถว
      // เกณฑ์ "ไม้เดียวกัน": id จาก snapshot ตรง หรือ symbol+ประเภท+แพลตฟอร์ม+ราคาซื้อ ตรงกันหมด
      // (ราคาซื้อต้องตรงเป๊ะ เพราะถ้าต่างกันแล้วรวม ต้นทุนเฉลี่ยจะเพี้ยนแบบเงียบ ๆ)
      const samePrice = (p?: number) => p != null && Math.abs(p - trade.buyPrice) < 1e-6;
      const samePlatform = (p?: string) => (p || '') === (platform || '');
      const target =
        fresh.find((i) => !!snap && i.id === snap.id && samePrice(i.buyPrice)) ??
        fresh.find(
          (i) =>
            i.symbol === trade.symbol &&
            i.type === trade.assetType &&
            samePlatform(i.platform) &&
            samePrice(i.buyPrice)
        );
      // ค่าธรรมเนียมซื้อที่ปันไปกับก้อนที่ขาย — ไม่มี snapshot ก็ใช้ค่าธรรมเนียมในบันทึกการขายเท่าที่มี
      const feeShare = snap
        ? snap.quantity > 0 ? (snap.fees || 0) * (trade.quantity / snap.quantity) : 0
        : trade.fees || 0;

      let restoredId: string;
      if (target) {
        // ขายบางส่วนของไม้นี้ → บวกจำนวนกลับเข้าไม้เดิม (บวกกลับ ไม่ทับค่าเดิม เผื่อขายหลายรอบ)
        restoredId = target.id;
        await updateInvestment({
          ...target,
          quantity: target.quantity + trade.quantity,
          fees: (target.fees || 0) + feeShare,
        });
      } else {
        // ไม้เดิมไม่อยู่แล้ว (ขายหมด) หรือพิสูจน์ไม่ได้ว่าเป็นไม้เดียวกัน → สร้างเป็น "แถวใหม่แยกไม้"
        // ใช้ id เดิมจาก snapshot ได้ถ้ายังไม่มีใครใช้ (คงตัวตนเดิม) ไม่งั้นออก id ใหม่กันชนกัน
        restoredId = snap && !fresh.some((i) => i.id === snap.id) ? snap.id : Date.now().toString();
        await saveInvestment(
          snap
            // มี snapshot → ได้แพลตฟอร์ม/โน้ต/เป้าหมายกำไรกลับมาครบ
            ? { ...snap, id: restoredId, quantity: trade.quantity, fees: feeShare, platform }
            // ไม่มี snapshot (ขายไว้ก่อนมีฟีเจอร์นี้) → ประกอบใหม่เท่าที่ตารางเก็บไว้ + แพลตฟอร์มเดิม
            : {
                id: restoredId,
                type: trade.assetType,
                symbol: trade.symbol,
                name: trade.name || trade.symbol,
                quantity: trade.quantity,
                buyPrice: trade.buyPrice,
                currency: trade.currency,
                buyDate: trade.buyDate,
                fees: feeShare,
                platform,
              }
        );
      }

      // ยืนยันจาก DB ว่าของกลับเข้าพอร์ตจริง แล้วค่อยลบบันทึกการขาย
      const after = await getInvestments();
      const restored = after.find((i) => i.id === restoredId);
      if (!restored) {
        throw new Error('บันทึกกลับเข้าพอร์ตไม่สำเร็จ — ยังเก็บบันทึกการขายไว้ให้ ลองกดย้อนคืนอีกครั้ง');
      }

      await deleteRealizedTrade(trade.id);
      // ล้างตัวกรองทิ้ง เผื่อรายการที่กู้กลับมาโดนตัวกรอง/คำค้นซ่อนอยู่จนดูเหมือนไม่กลับมา
      clearFilters();
      // บอกให้ชัดว่าไปโผล่ที่ไหน — รวมกลับเข้าไม้เดิม หรือกลายเป็นแถวแยก (กันสับสนว่า "ไม่เห็นกลับมา")
      const where = restored.platform ? ` ที่ ${restored.platform}` : '';
      showMsg(
        target
          ? `ย้อนคืนแล้ว — ${restored.symbol || restored.name}${where} ไม้เดิมกลับเป็น ${restored.quantity} หน่วย`
          : `ย้อนคืนแล้ว — ${restored.symbol || restored.name} ${restored.quantity} หน่วย @ ${formatCurrencyWithType(restored.buyPrice, restored.currency)}${where} เพิ่มกลับเป็นรายการแยกไม้`
      );
      await loadData();
    } catch (e: any) {
      showMsg(`ย้อนคืนไม่สำเร็จ: ${String(e?.message || e)}`);
      loadData();
    }
  };

  const handleUndoSell = (trade: RealizedTrade) => {
    const at = trade.platform ? ` (${trade.platform})` : '';
    const label = `${trade.symbol || trade.name}${at} ${trade.quantity} หน่วย`;
    const msg = `ย้อนคืนการขาย ${label}?\nรายการจะกลับเข้าพอร์ต${at ? ` ที่ ${trade.platform}` : ''} และบันทึกการขายนี้จะถูกลบ`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) undoSell(trade);
    } else {
      Alert.alert('ย้อนคืนการขาย', msg, [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ย้อนคืน', onPress: () => undoSell(trade) },
      ]);
    }
  };

  const openGoalModal = () => {
    setGoalTargetInput(goal?.targetAmount?.toString() || '');
    setGoalExpectedInput(goal?.expectedAnnualReturnPercent?.toString() || '');
    setGoalModalVisible(true);
  };

  const handleSaveGoal = async () => {
    const amount = parseFloat(goalTargetInput.replace(/,/g, ''));
    if (!amount || amount <= 0) { showMsg('กรุณากรอกยอดเป้าหมายที่ถูกต้อง'); return; }
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
      showMsg('บันทึกเป้าหมายไม่สำเร็จ');
    }
  };

  const handleDeleteGoal = async () => {
    try {
      await deletePortfolioGoal();
      setGoal(null);
      setGoalModalVisible(false);
    } catch {
      showMsg('ลบเป้าหมายไม่สำเร็จ');
    }
  };

  // ── แบ่งลงกี่ครั้งต่อเดือน: ปรับตรงในการ์ด ไม่มี modal แผนแล้ว ──
  // เลิกใช้ "กันเงินเดือนกี่ % / เงินเดือนคาดหวัง" — ไม่มีอะไรอ่านค่า 2 ตัวนั้นบนหน้าจอแล้ว
  // เหลือแค่จำนวนครั้ง ซึ่งใช้หารเงินรอลงทุนอย่างเดียว จึงปรับด้วยปุ่ม −/+ พอ
  // กดถี่ ๆ ไม่ยิง DB ทุกครั้ง — อัปเดตจอทันที แล้วค่อยเซฟหลังหยุดกด
  const roundsSaveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const changeDcaRounds = (delta: number) => {
    const base: InvestmentPlan = plan ?? { setAsidePercent: 0, dcaRounds: 0 };
    const next = Math.max(0, Math.min(60, base.dcaRounds + delta));
    const nextPlan: InvestmentPlan = { ...base, dcaRounds: next };
    setPlan(nextPlan);
    if (roundsSaveTimer.current) clearTimeout(roundsSaveTimer.current);
    roundsSaveTimer.current = setTimeout(() => {
      saveInvestmentPlan(nextPlan).catch(() => showMsg('บันทึกจำนวนครั้งไม่สำเร็จ'));
    }, 700);
  };

  // ── จดยอดเงินรอลงทุน ──
  // สกุลเริ่มต้นของแถวใหม่ = ตัวแรกในแคตตาล็อก (ปกติคือ THB)
  const newPowderRow = (seed = 0) => ({
    id: `p${Date.now()}-${seed}`,
    label: '',
    amount: '',
    currency: currencyOptions[0] || 'THB',
  });

  const openPowderModal = () => {
    const items = plan?.dryPowderItems;
    if (items && items.length > 0) {
      setPowderRows(
        items.map((i) => ({
          id: i.id,
          label: i.label || '',
          amount: i.amount ? i.amount.toString() : '',
          currency: i.currency || 'THB',
        }))
      );
    } else if (plan?.dryPowder && plan.dryPowder > 0) {
      // เคยจดเป็นยอดรวมก้อนเดียว (เก็บเป็น THB) → ยกมาเป็นรายการแรก ของเดิมไม่หาย
      setPowderRows([
        { id: `p${Date.now()}-0`, label: '', amount: plan.dryPowder.toString(), currency: 'THB' },
      ]);
    } else {
      setPowderRows([newPowderRow()]);
    }
    setPowderModalVisible(true);
  };

  const updatePowderRow = (
    id: string,
    patch: Partial<{ label: string; amount: string; currency: string }>
  ) => setPowderRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removePowderRow = (id: string) =>
    setPowderRows((rows) => (rows.length <= 1 ? [newPowderRow()] : rows.filter((r) => r.id !== id)));

  const parseAmount = (s: string) => parseFloat(s.replace(/,/g, '').trim());

  const handleSavePowder = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const prevById = new Map((plan?.dryPowderItems || []).map((i) => [i.id, i]));
    const items: DryPowderItem[] = [];
    for (const r of powderRows) {
      const raw = r.amount.replace(/,/g, '').trim();
      // แถวที่ไม่ได้กรอกอะไรเลย = ข้ามไป (ลบรายการได้ด้วยการล้างค่าให้ว่าง)
      if (raw === '' && !r.label.trim()) continue;
      const amount = parseAmount(r.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        showMsg(`ยอดของ "${r.label.trim() || 'รายการที่ยังไม่มีชื่อ'}" ต้องเป็นตัวเลขไม่ติดลบ`);
        return;
      }
      const prev = prevById.get(r.id);
      const currency = r.currency || 'THB';
      items.push({
        id: r.id,
        label: r.label.trim(),
        amount,
        currency,
        // ยอด/สกุลเดิมไม่เปลี่ยน = คงวันที่จดเดิม เปลี่ยนแล้วถึงประทับวันใหม่
        asOf:
          prev && prev.amount === amount && (prev.currency ?? 'THB') === currency
            ? prev.asOf ?? today
            : today,
      });
    }
    const total = sumDryPowderItems(items);
    try {
      // ยังไม่มีแถวในตาราง = สร้างขึ้นมาใหม่โดยไม่ต้องให้กรอกแผนก่อน (setAsidePercent เลิกใช้แล้ว)
      const base: InvestmentPlan = plan ?? { setAsidePercent: 0, dcaRounds: 0 };
      const next: InvestmentPlan = {
        ...base,
        dryPowderItems: items.length > 0 ? items : undefined,
        // dryPowder = ยอดรวมเสมอ ส่วนที่คำนวณต่อ (ลงได้ครั้งละ/คำเตือน) จึงใช้ตัวเดิมได้ไม่ต้องแก้
        dryPowder: total > 0 ? total : undefined,
        // แตะยอดรวมเมื่อไหร่ = ประทับวันที่ใหม่ ไว้เตือนว่าซื้อไปกี่รายการหลังจด
        dryPowderAsOf:
          total <= 0 ? undefined : total !== base.dryPowder ? today : base.dryPowderAsOf,
      };
      await saveInvestmentPlan(next);
      setPlan(next);
      setPowderModalVisible(false);
    } catch {
      showMsg('จดยอดไม่สำเร็จ — ถ้ายังไม่ได้รัน sql/investment_plan_dry_powder.sql ให้รันก่อน');
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const handleDelete = (id: string, name: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`คุณต้องการลบ ${name} ใช่หรือไม่?`);
      if (confirmed) {
        deleteInvestment(id).then(() => loadData());
      }
    } else {
      Alert.alert('ลบการลงทุน', `คุณต้องการลบ ${name} ใช่หรือไม่?`, [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: async () => {
            await deleteInvestment(id);
            loadData();
          },
        },
      ]);
    }
  };

  const handleEdit = (item: Investment) => {
    navigation.navigate('AddInvestment', { investment: item });
  };

  const handleUpdatePrices = async () => {
    setIsUpdatingPrices(true);
    let updatedCount = 0;

    try {
      for (const investment of investments) {
        // อัปเดตเฉพาะ crypto, stock, gold
        if (['crypto', 'stock_th', 'stock_foreign', 'gold'].includes(investment.type)) {
          const newPrice = await updateInvestmentPrice(investment.type, investment.symbol, investment.currency || 'THB');

          if (newPrice !== null && newPrice > 0) {
            const updatedInvestment = {
              ...investment,
              currentPrice: newPrice,
            };
            await updateInvestment(updatedInvestment);
            updatedCount++;
          }
        }
      }

      await loadData();

      if (Platform.OS === 'web') {
        window.alert(`อัปเดตราคาสำเร็จ ${updatedCount} รายการ`);
      } else {
        Alert.alert('สำเร็จ', `อัปเดตราคาสำเร็จ ${updatedCount} รายการ`);
      }
    } catch (error) {
      console.error('handleUpdatePrices error:', error);
      const detail = (error as any)?.message || String(error);
      if (Platform.OS === 'web') {
        window.alert(`เกิดข้อผิดพลาดในการอัปเดตราคา\n${detail}`);
      } else {
        Alert.alert('ข้อผิดพลาด', `เกิดข้อผิดพลาดในการอัปเดตราคา\n${detail}`);
      }
    } finally {
      setIsUpdatingPrices(false);
    }
  };

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

  // ตารางค้นสัญญาณแดงคู่ ต่อ 1 รายการลงทุน — สร้างครั้งเดียว ไม่ต้องวนหาในทุกแถว
  const redAlertByKey = new Map(redAlerts.map((a) => [`${a.type}:${a.symbol}`, a]));

  const renderInvestmentItem = ({ item }: { item: Investment }) => {
    const { currentPriceNative, value, profit, profitPercent } = calcItemStats(item);
    const isProfit = profit >= 0;
    // วิเคราะห์รายตัว: โตเฉลี่ย/ปี (จากวันซื้อ) — ข้อมูลจริง ไม่ใช่คำแนะนำให้ขาย
    const growth = getHoldingAnnualGrowth(item.buyDate, item.buyPrice, currentPriceNative);
    // แดงติดกันครบคู่ = ถึงคิวลงไม้ตามกฎ "ลงทุก 2 แท่งแดง" — ต้องเห็นที่ตัวหุ้น ไม่ใช่แค่การ์ดสรุป
    const redAlert = redAlertByKey.get(`${item.type}:${item.symbol}`);

    return (
      <View style={[
        styles.investmentItem,
        isDesktop && styles.investmentItemDesktop,
      ]}>
        <TouchableOpacity
          style={styles.investmentContent}
          onPress={() => handleEdit(item)}
        >
          <View style={styles.investmentLeft}>
            <View style={styles.investmentHeader}>
              <Ionicons name={getTypeIcon(item.type) as any} size={24} color={COLORS.primary} />
              <View style={styles.investmentInfo}>
                <Text style={styles.investmentName}>{item.name}</Text>
                <Text style={styles.investmentSymbol}>
                  {item.symbol}
                  {item.platform ? ` • ${item.platform}` : ''}
                </Text>
              </View>
            </View>
            {/* ป้ายสัญญาณลงไม้: แดงติดกันครบคู่เท่านั้น (2/4/6…) เลขคี่ไม่ขึ้น */}
            {redAlert && (
              <View style={styles.redBadge}>
                <Ionicons name="trending-down" size={12} color={COLORS.error} />
                <Text style={styles.redBadgeText}>
                  {' '}แดง {redAlert.count} แท่ง {redAlert.dropPercent.toFixed(1)}% · ถึงคิวลงไม้
                </Text>
              </View>
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
            <Text style={styles.investmentValue}>{formatCurrency(value)}</Text>
            <Text style={[styles.investmentProfit, isProfit ? styles.profitPositive : styles.profitNegative]}>
              {isProfit ? '+' : ''}{formatCurrency(profit)}
            </Text>
            <Text style={[styles.investmentPercent, isProfit ? styles.profitPositive : styles.profitNegative]}>
              {isProfit ? '+' : ''}{profitPercent.toFixed(2)}%
            </Text>
          </View>
        </TouchableOpacity>
        {(growth.tooNew || growth.annualReturnPercent != null) && (
          <View style={styles.tpRow}>
            {growth.tooNew ? (
              <Text style={styles.tpSubText}>ถือ &lt; 3 เดือน ยังประเมินโต/ปีไม่ได้</Text>
            ) : (
              <Text style={styles.tpSubText}>
                AVG โตเฉลี่ย ~{growth.annualReturnPercent! >= 0 ? '+' : ''}{growth.annualReturnPercent!.toFixed(1)}%/ปี
              </Text>
            )}
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
  const portfolioStartDate = investments.length > 0
    ? investments.reduce((earliest, inv) => (inv.buyDate < earliest ? inv.buyDate : earliest), investments[0].buyDate)
    : null;
  // ฐานคำนวณเป้าหมาย = ต้นทุนที่ลงจริง (ไม่รวมกำไรที่ยังไม่ได้ขาย/unrealized)
  // กำไรลอยตัวยังไม่เกิดจริงจนกว่าจะปิดออเดอร์ จึงไม่นับรวมในทุกส่วนของการคำนวณถึงเป้า
  // ผลตอบแทนจริงจากการขาย — ตัวนี้คือ "ฝีมือที่วัดได้" ใช้แทนเลขคาดหวังถ้ามีข้อมูลพอ
  const realized = summarizeRealized(realizedTrades);
  // รายดีลแยกก้อน — ใช้โชว์ในลิสต์ "ที่ขายแล้ว" พร้อมปุ่มย้อนคืน (เรียงขายล่าสุดก่อนจาก query แล้ว)
  const realizedResults = realizedTrades.map(analyzeRealizedTrade);

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

  // เดือน = รอบบัญชี (ฐานคำนวณ) แต่หน่วยที่ผู้ใช้ลงมือจริงคือ "ครั้ง" — ทุกตัวเลขบนจอจึงหารเป็นต่อครั้ง
  // เหลือใช้ตัวเดียวจากแผน: จำนวนครั้งต่อเดือน (ใช้หารเงินรอลงทุน)
  // งบรายเดือน/วินัยการกันเงิน เอาออกจากหน้านี้แล้ว — ดูที่หน้าหลัก
  const dcaRoundsCount = plan?.dcaRounds && plan.dcaRounds > 0 ? plan.dcaRounds : null;

  // ── "ถ้าขายตอนนี้ ต้องทำกำไรก้อนนี้ซ้ำอีกกี่รอบถึงเป้า" ──
  // สมมติฐานตรงไปตรงมา: ขายได้เงินก้อนนี้แล้วเอาลงทุนซ้ำทั้งก้อน รอบต่อไปได้กำไร % เท่าเดิม
  // → ทุกรอบคูณด้วย (1 + กำไร%) จึงเป็นทบต้น ไม่ใช่บวกกำไรก้อนเดิมซ้ำ ๆ
  //   n = ln(เป้า / มูลค่าปัจจุบัน) / ln(1 + กำไร%)
  const roundsToGoal = (() => {
    const target = goal?.targetAmount;
    if (!target || target <= 0 || summary.totalValue <= 0) return null;
    if (summary.totalValue >= target) return { reached: true, rounds: 0 };
    const r = summary.totalProfitPercent / 100;
    if (r <= 0) return null; // ยังไม่มีกำไร คำนวณไม่ได้
    return {
      reached: false,
      rounds: Math.ceil(Math.log(target / summary.totalValue) / Math.log(1 + r)),
    };
  })();

  // ยอดรวมสด ๆ ของแถวที่กำลังกรอกใน modal (เป็น THB) — โชว์ให้เห็นก่อนกดจด
  const powderRowsTotal = powderRows.reduce((s, r) => {
    const n = parseFloat(r.amount.replace(/,/g, ''));
    return s + (Number.isFinite(n) && n > 0 ? convertToTHB(n, r.currency || 'THB') : 0);
  }, 0);

  // ── เงินรอลงทุน (จดเอง) → ลงได้ครั้งละเท่าไหร่ ──
  // ตั้งใจไม่หักอัตโนมัติ: ผู้ใช้กรอกยอดจริงทับเมื่อไหร่ก็ได้ ระบบแค่เตือนถ้ามีการซื้อหลังวันที่จด
  const dryPowder = plan?.dryPowder && plan.dryPowder > 0 ? plan.dryPowder : 0;
  const powderItemCount = plan?.dryPowderItems?.length ?? 0;
  const powderTotalRounds = dcaRoundsCount ? dcaRoundsCount * powderMonths : null;
  const powderPerRound = powderTotalRounds && dryPowder > 0 ? dryPowder / powderTotalRounds : null;
  const powderEveryDays = dcaRoundsCount ? 30 / dcaRoundsCount : null;
  // ซื้อไปแล้วกี่รายการหลังวันที่จดยอด — สัญญาณว่ายอดที่จดไว้เก่าแล้ว
  const boughtSincePowder = (() => {
    const asOf = plan?.dryPowderAsOf;
    if (!asOf || dryPowder <= 0) return null;
    let count = 0;
    let cost = 0;
    const add = (dateStr: string, amount: number) => {
      if (toChristianYear(dateStr || '').slice(0, 10) <= asOf) return;
      count++;
      cost += amount;
    };
    investments.forEach((inv) =>
      add(inv.buyDate, convertToTHB(inv.buyPrice, inv.currency) * inv.quantity + (inv.fees || 0))
    );
    realizedTrades.forEach((t) => add(t.buyDate, convertToTHB(t.buyPrice, t.currency) * t.quantity));
    return count > 0 ? { count, cost, asOf } : null;
  })();
  const fmtDateTH = (iso: string): string =>
    new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

  // (เอาการ์ด "วางแผนถึงเป้า" ออกทั้งก้อน — ตัวจำลอง / กรอบเวลา 1/3/5/10 ปี / สัดส่วนแบ่งไม้
  //  ทั้งหมดเป็นเลขคาดการณ์ที่ไม่ได้ใช้ตัดสินใจตอนกดซื้อ จึงลบทั้งการคำนวณและ UI ทิ้ง)

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
            <Ionicons name="briefcase-outline" size={24} color="#ffffff" />
            <Text style={styles.headerTitle}> พอร์ตการลงทุน</Text>
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
            <Text style={styles.summaryCost}>ลงทุนไปแล้ว {formatCurrency(summary.totalCost)}</Text>
          </View>
        </View>

        <View style={[
          styles.actionButtons,
          isDesktop && styles.actionButtonsDesktop,
        ]}>
          <TouchableOpacity
            style={[styles.addButton, styles.updateButton]}
            onPress={handleUpdatePrices}
            disabled={isUpdatingPrices}
          >
            {isUpdatingPrices ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons name="refresh-outline" size={18} color={COLORS.primary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('AddInvestment', {})}
          >
            <Ionicons name="add-circle-outline" size={18} color="#ffffff" />
            <Text style={styles.addButtonText}></Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButton, styles.updateButton]}
            onPress={() => navigation.navigate('Accounts')}
          >
            <Ionicons name="wallet-outline" size={18} color={COLORS.primary} />
            <Text style={styles.updateButtonText}></Text>
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

        {/* ── การ์ดเป้าหมายพอร์ตรวม ── */}
        <View style={styles.goalCard}>
          <View style={styles.goalCardHeader}>
            <Text style={styles.goalCardTitle}>
              <Ionicons name="disc-outline" size={18} color={COLORS.primary} /> เป้าหมายพอร์ตรวม
            </Text>
            <TouchableOpacity onPress={openGoalModal}>
              <Text style={styles.goalCardEdit}>{goal ? 'แก้ไข' : 'ตั้งเป้า'}</Text>
            </TouchableOpacity>
          </View>

          {!goalAnalysis ? (
            <Text style={styles.goalCardEmpty}>
              ปักยอดพอร์ตที่อยากได้ แล้วระบบจะสรุปให้ว่าไปได้กี่ % และต้องลงเดือนละเท่าไหร่ถึงจะทันกรอบเวลา
            </Text>
          ) : (
            <>
              <View style={styles.goalCardTopRow}>
                <Text style={styles.goalCardSub}>
                  ต้นทุนที่ลงไปแล้ว {formatCurrency(goalAnalysis.currentValue)}
                </Text>
                <Text style={styles.goalCardSub}>
                  {goalAnalysis.reached ? 'ถึงเป้าแล้ว 🎉' : `ไปได้ ${Math.max(0, Math.min(100, goalAnalysis.progressRatio * 100)).toFixed(0)}%`}
                </Text>
              </View>
              <View style={styles.goalTrack}>
                <View
                  style={[
                    styles.goalFill,
                    {
                      width: `${Math.max(0, Math.min(100, goalAnalysis.progressRatio * 100))}%`,
                      backgroundColor: goalAnalysis.reached ? COLORS.success : COLORS.primary,
                    },
                  ]}
                />
              </View>
              <Text style={styles.goalCardSub}>
                เป้า {formatCurrency(goalAnalysis.targetAmount)}
                {!goalAnalysis.reached && ` • ขาดอีก ${formatCurrency(goalAnalysis.remaining)}`}
              </Text>

              {/* ถ้าขายตอนนี้แล้วลงทุนซ้ำทั้งก้อน ต้องทำกำไร % เท่านี้อีกกี่รอบถึงเป้า (ทบต้น) */}
              {roundsToGoal && (
                <Text style={styles.tpSubText}>
                  {roundsToGoal.reached
                    ? 'ถ้าขายตอนนี้ มูลค่าถึงเป้าแล้ว 🎉'
                    : `ถ้าขายตอนนี้ (+${summary.totalProfitPercent.toFixed(2)}% = ${formatCurrency(summary.totalProfit)}) แล้วลงทุนซ้ำทั้งก้อนได้ % เท่าเดิม → อีก ~${roundsToGoal.rounds} รอบถึงเป้า`}
                </Text>
              )}

              {/* ตั้งใจไม่โชว์ "คาดถึงเป้าในอีกกี่ปี" และแถว KPI คาดการณ์บนการ์ดนี้
                  — เป็นเลขพยากรณ์ที่ยังไม่เกิดจริง อ่านแล้วเข้าใจผิดว่าถึงเป้าแล้ว
                  ตัวเลข "ต้องลง/ครั้ง" ตามกรอบเวลายังดูได้ในปุ่ม "ดูรายละเอียดแผน" ด้านล่าง */}

              {/* งบใช้จ่ายรายเดือน (เงินเดือน/ใช้ไปแล้ว/เหลือใช้ได้อีก) เอาออกจากหน้านี้แล้ว
                  — ดูที่หน้าหลักได้อยู่แล้ว (Income / Expense / Balance) ไม่ต้องมีซ้ำ */}
            </>
          )}

          {/* เงินรอลงทุนไม่โชว์ซ้ำที่นี่ — การ์ดเต็ม (จดยอด/แบ่งกี่ครั้ง/รายการย่อย)
              อยู่ถัดลงไปก่อน "รายการลงทุน" แล้ว */}
        </View>

        {/* ── ผลงานจริง (realized): กำไรที่ขายแล้วเท่านั้น ไม่นับกำไรลอยตัว ──
            โชว์เฉพาะเมื่อมีการขายบันทึกไว้จริง — ยังไม่มีก็ไม่ต้องมีการ์ดเปล่ามากินที่
            (ปุ่ม "ย้อนคืน" อยู่ในการ์ดนี้ พอเริ่มบันทึกขาย การ์ดจะโผล่มาเอง) */}
        {realized.tradeCount > 0 && (
          <View style={styles.goalCard}>
            <Text style={styles.goalCardTitle}>
              <Ionicons name="ribbon-outline" size={18} color={COLORS.primary} /> ผลงานจริง (ที่ขายแล้ว)
            </Text>
              <View style={styles.kpiRow}>
                <View style={styles.kpiCell}>
                  <Text style={styles.kpiLabel}>กำไรจริง</Text>
                  <Text style={[styles.kpiValue, realized.totalPnlTHB < 0 && styles.kpiValueNeg]}>
                    {realized.totalPnlTHB >= 0 ? '+' : ''}{formatCurrency(realized.totalPnlTHB)}
                  </Text>
                </View>
                <View style={styles.kpiCell}>
                  <Text style={styles.kpiLabel}>คิดเป็น</Text>
                  <Text style={[styles.kpiValue, realized.totalPnlPercent < 0 && styles.kpiValueNeg]}>
                    {realized.totalPnlPercent >= 0 ? '+' : ''}{realized.totalPnlPercent.toFixed(1)}%
                  </Text>
                </View>
                <View style={styles.kpiCell}>
                  <Text style={styles.kpiLabel}>ชนะ {realized.winCount}/{realized.tradeCount} ดีล</Text>
                  <Text style={styles.kpiValue}>{realized.winRatePercent.toFixed(0)}%</Text>
                </View>
              </View>
              <View style={styles.planLine}>
                <Text style={styles.planLineLabel}>ผลตอบแทนจริงต่อปี (ถือเฉลี่ย {realized.avgHoldYears.toFixed(1)} ปี)</Text>
                <Text style={styles.planLineValue}>
                  {realized.annualReturnPercent != null
                    ? `${realized.annualReturnPercent >= 0 ? '+' : ''}${realized.annualReturnPercent.toFixed(1)}%`
                    : realized.tooShort
                      ? 'ถือสั้นเกินไป'
                      : '—'}
                </Text>
              </View>
              {/* จุดที่สำคัญที่สุด: ของจริง vs ที่ตั้งไว้ */}
              {goal?.expectedAnnualReturnPercent != null && realized.annualReturnPercent != null && (
                <Text
                  style={[
                    styles.tpSubText,
                    {
                      color:
                        realized.annualReturnPercent >= goal.expectedAnnualReturnPercent
                          ? COLORS.success
                          : COLORS.error,
                    },
                  ]}
                >
                  {realized.annualReturnPercent >= goal.expectedAnnualReturnPercent
                    ? `✓ ทำได้จริง ${realized.annualReturnPercent.toFixed(1)}% เทียบกับที่ตั้งไว้ ${goal.expectedAnnualReturnPercent}% — แผนใช้ตัวเลขจริงคำนวณให้แล้ว`
                    : `⚠ ทำได้จริง ${realized.annualReturnPercent.toFixed(1)}% แต่ตั้งไว้ ${goal.expectedAnnualReturnPercent}% — แผนด้านล่างเปลี่ยนไปใช้ตัวเลขจริงแล้ว`}
                </Text>
              )}
              {realized.bestTrade && realized.worstTrade && realized.tradeCount > 1 && (
                <Text style={styles.tpSubText}>
                  ดีที่สุด {realized.bestTrade.trade.symbol} {realized.bestTrade.pnlPercent >= 0 ? '+' : ''}
                  {realized.bestTrade.pnlPercent.toFixed(1)}% • แย่ที่สุด {realized.worstTrade.trade.symbol}{' '}
                  {realized.worstTrade.pnlPercent >= 0 ? '+' : ''}{realized.worstTrade.pnlPercent.toFixed(1)}%
                </Text>
              )}

              {/* ── รายดีล + ปุ่มย้อนคืน: กดขายผิด/กรอกเลขผิด ต้องกู้กลับได้ ── */}
              <TouchableOpacity
                style={styles.detailToggleInline}
                onPress={() => setShowRealizedList((v) => !v)}
              >
                <Ionicons
                  name={showRealizedList ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={COLORS.primary}
                />
                <Text style={styles.detailToggleText}>
                  {showRealizedList ? ' ซ่อนรายการที่ขายแล้ว' : ` ดูรายการที่ขายแล้ว (${realized.tradeCount})`}
                </Text>
              </TouchableOpacity>

              {showRealizedList &&
                realizedResults.map((r) => (
                  <View key={r.trade.id} style={styles.realizedRow}>
                    <View style={styles.realizedRowLeft}>
                      <Text style={styles.realizedRowTitle} numberOfLines={1}>
                        {r.trade.symbol || r.trade.name}
                      </Text>
                      <Text style={styles.realizedRowSub}>
                        {r.trade.quantity} หน่วย • ขาย {fmtDateTH(r.trade.sellDate)} @{' '}
                        {formatCurrencyWithType(r.trade.sellPrice, r.trade.currency)}
                        {r.trade.platform ? ` • ${r.trade.platform}` : ''}
                      </Text>
                      {/* เหตุผลที่ขาย — ตัวที่ทำให้ประวัติกลายเป็นสมุดทบทวนฝีมือ ไม่ใช่แค่ตารางเลข */}
                      {r.trade.notes ? (
                        <Text style={styles.realizedRowNote} numberOfLines={2}>
                          “{r.trade.notes}”
                        </Text>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.realizedRowPnl,
                        { color: r.pnlTHB >= 0 ? COLORS.success : COLORS.error },
                      ]}
                    >
                      {r.pnlTHB >= 0 ? '+' : ''}{formatCurrency(r.pnlTHB)}
                      {'\n'}
                      <Text style={styles.realizedRowPnlPct}>
                        {r.pnlPercent >= 0 ? '+' : ''}{r.pnlPercent.toFixed(1)}%
                      </Text>
                    </Text>
                    <TouchableOpacity
                      style={styles.undoButton}
                      onPress={() => handleUndoSell(r.trade)}
                    >
                      <Ionicons name="arrow-undo-outline" size={14} color={COLORS.primary} />
                      <Text style={styles.undoButtonText}> ย้อนคืน</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              {showRealizedList && realizedResults.some((r) => !r.trade.sourceInvestment) && (
                <Text style={styles.tpSubText}>
                  * บางรายการยังไม่มีข้อมูลสำรอง (ขายไว้ก่อนมีฟีเจอร์นี้) — ย้อนคืนได้ตามจำนวน/ต้นทุน/แพลตฟอร์ม
                  แต่โน้ตกับเป้าหมายกำไรจะไม่กลับมา
                </Text>
              )}
          </View>
        )}

        {/* การ์ดนี้โชว์ตลอดถ้ามีของที่เช็คแท่งเทียนได้ (คริปโต/หุ้น) —
            เมื่อก่อนซ่อนทั้งการ์ดตอนไม่มีสัญญาณ ทำให้แยกไม่ออกว่า "เช็คแล้วไม่มี" หรือ "พัง/ไม่ได้เช็ค" */}
        {redCheckedCount > 0 && (
          <View style={styles.losersCard}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="warning" size={16} color={COLORS.error} />
              <Text style={styles.losersTitle}>ถึงคิวลงไม้ — แดงติดกันครบคู่ (2/4/6 แท่ง)</Text>
            </View>
            {redChecking ? (
              <Text style={styles.tpSubText}>กำลังเช็คแท่งเทียนของ {redCheckedCount} ตัว…</Text>
            ) : redAlerts.length === 0 ? (
              <Text style={styles.tpSubText}>
                เช็ค {redCheckedCount} ตัวแล้ว — ยังไม่มีตัวไหนแดงติดกันครบคู่ (นับเฉพาะแท่งที่ปิดแล้ว
                · แดงเลขคี่ยังไม่นับ){'\n'}
                หมายเหตุ: หุ้นเช็คได้เฉพาะบนเว็บที่ deploy แล้ว (ต้องใช้ /api/yahoo-quote) — คริปโตเช็คได้ทุกที่
              </Text>
            ) : null}
            {redAlerts.map((a) => (
              <View key={a.symbol} style={styles.loserRow}>
                <Text style={styles.loserName} numberOfLines={1}>
                  {a.symbol || a.name} <Text style={styles.tpSubText}>· แดง {a.count} แท่ง</Text>
                </Text>
                <Text style={styles.loserPct}>{a.dropPercent.toFixed(2)}%</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── การ์ด "เงินรอลงทุน" — อยู่ก่อนรายการลงทุน ──
            ต้องเห็นก่อนเลื่อนดูหุ้น: มีเงินพร้อมลงเท่าไหร่ / ลงได้ครั้งละเท่าไหร่ แล้วค่อยไปเลือกตัว
            (เดิมอยู่ท้ายสุดหลังรายการหุ้น ต้องเลื่อนผ่านทั้งพอร์ตก่อนจะเจอ) */}
        <View style={styles.goalCard}>
          <View style={styles.goalCardHeader}>
            <Text style={styles.goalCardTitle}>
              <Ionicons name="cash-outline" size={18} color={COLORS.primary} /> เงินรอลงทุน · แบ่งลงกี่ครั้ง
            </Text>
            <TouchableOpacity onPress={openPowderModal}>
              <Text style={styles.goalCardEdit}>{dryPowder > 0 ? 'แก้ยอด' : 'จดยอด'}</Text>
            </TouchableOpacity>
          </View>

          {/* แบ่งลงกี่ครั้ง/เดือน — ปรับตรงนี้ ไม่มี modal แผนแยกแล้ว (เหลือค่านี้ค่าเดียวที่ยังใช้) */}
          <View style={styles.roundsRow}>
            <Text style={styles.planLineLabel}>แบ่งลงกี่ครั้ง / เดือน</Text>
            <View style={styles.roundsStepper}>
              <TouchableOpacity style={styles.roundsBtn} onPress={() => changeDcaRounds(-1)}>
                <Ionicons name="remove" size={16} color={COLORS.primary} />
              </TouchableOpacity>
              <Text style={styles.roundsValue}>{dcaRoundsCount ?? '—'}</Text>
              <TouchableOpacity style={styles.roundsBtn} onPress={() => changeDcaRounds(1)}>
                <Ionicons name="add" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.roundsHint}>
              {powderEveryDays ? `~${Math.max(1, Math.round(powderEveryDays))} วัน/ครั้ง` : 'ยังไม่ตั้ง'}
            </Text>
          </View>

          {dryPowder <= 0 ? (
            <Text style={styles.goalCardEmpty}>
              กด "จดยอด" ใส่เงินที่พร้อมลงตอนนี้ → ระบบจะบอกว่าลงได้ครั้งละเท่าไหร่ ทุกกี่วัน
            </Text>
          ) : !dcaRoundsCount ? (
            <Text style={styles.goalCardEmpty}>
              มีเงินรอลงทุน {formatCurrency(dryPowder)} — กด + ตั้ง "แบ่งลงกี่ครั้ง/เดือน" ก่อน ถึงจะหารให้ได้
            </Text>
          ) : (
            <>
              <View style={styles.chipRow}>
                {[1, 3, 6, 12].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.chip, m === powderMonths && styles.chipActive]}
                    onPress={() => setPowderMonths(m)}
                  >
                    <Text style={[styles.chipText, m === powderMonths && styles.chipTextActive]}>
                      {m} เดือน
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* รายการย่อยที่จดไว้ — แยกตามแหล่งเงิน/โบรก (ถ้าจดแบบยอดรวมก้อนเดียวจะไม่มีบรรทัดนี้) */}
              {(plan?.dryPowderItems || []).map((it) => (
                <View key={it.id} style={styles.planLine}>
                  <Text style={styles.planLineLabel}>
                    {it.label || 'ไม่ระบุชื่อ'}
                    {it.asOf ? ` · ${fmtDateTH(it.asOf)}` : ''}
                  </Text>
                  <Text style={styles.planLineValue}>
                    {formatCurrencyWithType(it.amount, it.currency ?? 'THB')}
                    {(it.currency ?? 'THB') !== 'THB'
                      ? ` (${formatCurrency(convertToTHB(it.amount, it.currency))})`
                      : ''}
                  </Text>
                </View>
              ))}
              <View style={styles.planLine}>
                <Text style={styles.planLineLabel}>
                  เงินรอลงทุนที่จดไว้
                  {powderItemCount > 0 ? ` (รวม ${powderItemCount} รายการ)` : ''}
                </Text>
                <Text style={styles.planLineValue}>{formatCurrency(dryPowder)}</Text>
              </View>
              <View style={[styles.planLine, styles.reserveTotalRow]}>
                <Text style={styles.reserveTotalLabel}>
                  ลงได้ครั้งละ ({dcaRoundsCount} ครั้ง/ด. × {powderMonths} ด. = {powderTotalRounds} ครั้ง)
                </Text>
                <Text style={styles.reserveTotalValue}>
                  {powderPerRound == null ? '—' : formatCurrency(powderPerRound)}
                </Text>
              </View>
              {/* "ซื้อทุก ๆ กี่วัน" ไม่ต้องมีบรรทัดแยก — โชว์อยู่ข้างปุ่ม −/+ ด้านบนแล้ว */}
              {boughtSincePowder ? (
                <Text style={[styles.tpSubText, { color: COLORS.warning }]}>
                  ⚠ ซื้อไป {boughtSincePowder.count} รายการ (~{formatCurrency(boughtSincePowder.cost)}) หลังจดยอดเมื่อ{' '}
                  {fmtDateTH(boughtSincePowder.asOf)} — กด "แก้ยอด" อัปเดตเงินรอลงทุนให้ตรงจริง
                </Text>
              ) : plan?.dryPowderAsOf ? (
                <Text style={styles.tpSubText}>
                  จดยอดไว้เมื่อ {fmtDateTH(plan.dryPowderAsOf)} · ยังไม่มีการซื้อหลังจากนั้น
                </Text>
              ) : null}
            </>
          )}
        </View>

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

  // ── ท้ายรายการหุ้น: เหลือแค่การ์ดสำรอง (ปิดไว้) ──
  // การ์ด "เงินรอลงทุน" ย้ายขึ้นไปอยู่ก่อน "รายการลงทุน" แล้ว — ต้องเห็นก่อนเลื่อนดูหุ้น
  const planningFooterElement = (
    <View>

        {/* ── การ์ดเงินรอลงทุน (สำรอง) หลายสกุล + สมการความมั่งคั่ง ── */}
        {/* ซ่อนไว้ชั่วคราวตามที่ผู้ใช้ต้องการ — เปลี่ยน false กลับเป็น true เพื่อโชว์อีกครั้ง */}
        {false && reserveAccounts.length > 0 && (() => {
          // ต้นทุน investments รวมตาม platform (THB) — ไว้หักออกจาก "ยอดที่เติมเข้า" ของบัญชี reserve
          const investedByPlatform: Record<string, number> = {};
          investments.forEach((inv) => {
            const key = (inv.platform || '').trim().toLowerCase();
            if (!key) return;
            const costTHB = convertToTHB(inv.buyPrice, inv.currency ?? 'THB') * inv.quantity + (inv.fees || 0);
            investedByPlatform[key] = (investedByPlatform[key] || 0) + costTHB;
          });

          // ต่อบัญชี: เงินสดรอลงทุน = ยอดที่เติม(THB) − ต้นทุนที่ซื้อบน platform นั้น
          const rows = reserveAccounts.map((a) => {
            const fundedTHB = convertToTHB(a.manualBalance || 0, a.currency);
            const platKey = (a.platform || '').trim().toLowerCase();
            const investedTHB = platKey ? (investedByPlatform[platKey] || 0) : 0;
            return { a, fundedTHB, investedTHB, cashTHB: fundedTHB - investedTHB, hasPlatform: !!platKey };
          });

          const reserveCashTHB = rows.reduce((s, r) => s + r.cashTHB, 0);
          const wealth = reserveCashTHB + summary.totalValue;
          // ต้นทุนที่หักไปแล้ว (จาก platform ที่ผูกบัญชี) — ที่เหลือคือสินทรัพย์ที่ยังไม่ได้ผูก
          const matchedCostTHB = Array.from(
            new Set(rows.filter((r) => r.hasPlatform).map((r) => (r.a.platform || '').trim().toLowerCase()))
          ).reduce((s, k) => s + (investedByPlatform[k] || 0), 0);
          const unlinkedCostTHB = summary.totalCost - matchedCostTHB;

          return (
            <View style={styles.goalCard}>
              <View style={styles.goalCardHeader}>
                <Text style={styles.goalCardTitle}>
                  <Ionicons name="cash-outline" size={18} color={COLORS.primary} /> เงินรอลงทุน (สำรอง)
                </Text>
              </View>
              <View style={styles.horizonBox}>
                {rows.map(({ a, fundedTHB, investedTHB, cashTHB, hasPlatform }) => (
                  <View key={a.id} style={styles.reserveAcctRow}>
                    <View style={styles.horizonRow}>
                      <Text style={styles.horizonYears}>
                        {a.name} ({a.currency}){a.platform ? ` · ${a.platform}` : ''}
                      </Text>
                      <Text style={[styles.horizonRate, cashTHB < 0 && { color: COLORS.error }]}>
                        {formatCurrency(cashTHB)}
                      </Text>
                    </View>
                    {hasPlatform ? (
                      <Text style={styles.reserveAcctSub}>
                        เติม {formatCurrency(fundedTHB)} − ลงทุนแล้ว {formatCurrency(investedTHB)}
                      </Text>
                    ) : (
                      <Text style={styles.reserveAcctSub}>ยังไม่ได้ผูก platform — โชว์ยอดที่เติมตรงๆ</Text>
                    )}
                  </View>
                ))}
                <View style={[styles.horizonRow, styles.reserveTotalRow]}>
                  <Text style={styles.reserveTotalLabel}>รวมเงินสดรอลงทุน (THB)</Text>
                  <Text style={[styles.reserveTotalValue, reserveCashTHB < 0 && { color: COLORS.error }]}>
                    {formatCurrency(reserveCashTHB)}
                  </Text>
                </View>
              </View>
              <View style={styles.wealthBox}>
                <View style={styles.horizonRow}>
                  <Text style={styles.horizonYears}>+ ต้นทุนที่ลงไปแล้ว</Text>
                  <Text style={styles.horizonRate}>{formatCurrency(summary.totalCost)}</Text>
                </View>
                <View style={styles.horizonRow}>
                  <Text style={styles.horizonYears}>+ กำไร/ขาดทุน</Text>
                  <Text style={[styles.horizonRate, isProfit ? styles.profitPositive : styles.profitNegative]}>
                    {isProfit ? '+' : ''}{formatCurrency(summary.totalProfit)}
                  </Text>
                </View>
                <View style={[styles.horizonRow, styles.reserveTotalRow]}>
                  <Text style={styles.reserveTotalLabel}>ความมั่งคั่งเพื่อลงทุนรวม</Text>
                  <Text style={styles.reserveTotalValue}>{formatCurrency(wealth)}</Text>
                </View>
              </View>
              {reserveAccounts.some((a) => a.manualBalance == null) && (
                <Text style={styles.tpSubText}>
                  * บางบัญชียังไม่ได้ใส่ยอดที่เติม — ไปกรอกที่หน้า "บัญชีของฉัน"
                </Text>
              )}
              {unlinkedCostTHB > 1 && (
                <Text style={styles.tpSubText}>
                  * มีสินทรัพย์ต้นทุน ~{formatCurrency(unlinkedCostTHB)} ที่ platform ยังไม่ตรงกับบัญชี reserve ไหน — ตั้ง platform ให้ตรงกัน เพื่อไม่ให้เงินสดรอลงทุนเกินจริง
                </Text>
              )}
            </View>
          );
        })()}
      </View>
  );

  return (
    <View style={styles.container}>
      <View style={[
        styles.innerContainer,
        isDesktop && styles.innerContainerDesktop,
      ]}>
        {isDesktop ? (
          <FlatList
            data={visibleInvestments}
            renderItem={renderInvestmentItem}
            keyExtractor={(item) => item.id}
            numColumns={2}
            key="desktop-2col"
            columnWrapperStyle={styles.flatListRow}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={listHeaderElement}
            ListFooterComponent={planningFooterElement}
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
            {planningFooterElement}
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
          <View style={styles.modalCard}>
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
                  {qty > 0 && price > 0 && (
                    <View style={styles.answerBox}>
                      <Text style={styles.answerLabel}>กำไร/ขาดทุนจริงที่จะบันทึก</Text>
                      <Text style={[styles.answerBig, pnl < 0 && { color: COLORS.error }]}>
                        {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)} ({pnl >= 0 ? '+' : ''}
                        {pct.toFixed(1)}%)
                      </Text>
                    </View>
                  )}
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
          </View>
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
          <View style={styles.modalCard}>
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
          </View>
        </View>
      </Modal>

      {/* modal "แผนเติมเงิน" เอาออกแล้ว — เหลือค่าเดียวที่ยังใช้ (แบ่งลงกี่ครั้ง/เดือน)
          ปรับด้วยปุ่ม −/+ ในการ์ด "เงินรอลงทุน" ได้เลย ไม่ต้องเปิดฟอร์ม */}

      {/* ── Modal จดยอดเงินรอลงทุน — จดแยกได้หลายรายการ ยอดรวมคือผลบวกของทุกแถว ── */}
      <Modal
        visible={powderModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPowderModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              <Ionicons name="cash-outline" size={18} color={COLORS.primary} /> จดยอดเงินรอลงทุน
            </Text>
            <Text style={styles.modalLabel}>เงินที่พร้อมลงทุนตอนนี้ — จดแยกรายการได้</Text>
            {powderRows.map((r, idx) => (
              <View key={r.id} style={styles.powderItemBox}>
                <View style={styles.powderRow}>
                <TextInput
                  style={[styles.modalInput, styles.powderRowLabel]}
                  value={r.label}
                  onChangeText={(v) => updatePowderRow(r.id, { label: v })}
                  placeholder={idx === 0 ? 'ชื่อ/แหล่งเงิน เช่น Dime' : 'ชื่อ/แหล่งเงิน'}
                  placeholderTextColor={COLORS.textSecondary}
                />
                <TextInput
                  style={[styles.modalInput, styles.powderRowAmount]}
                  value={r.amount}
                  onChangeText={(v) => updatePowderRow(r.id, { amount: v })}
                  keyboardType="numeric"
                  placeholder="ยอด"
                  placeholderTextColor={COLORS.textSecondary}
                />
                <TouchableOpacity style={styles.powderRowDelete} onPress={() => removePowderRow(r.id)}>
                  <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
                </View>
                {/* สกุลเงินของแถวนี้ — ตัวเลือกมาจากหน้า "สกุลเงิน & แพลตฟอร์ม" ที่ตั้งไว้ */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.powderCurrencyRow}
                >
                  {currencyOptions.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.powderCurBtn, r.currency === c && styles.chipActive]}
                      onPress={() => updatePowderRow(r.id, { currency: c })}
                    >
                      <Text style={[styles.chipText, r.currency === c && styles.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ))}
            <TouchableOpacity
              style={styles.powderAddBtn}
              onPress={() => setPowderRows((rows) => [...rows, newPowderRow(rows.length)])}
            >
              <Ionicons name="add" size={16} color={COLORS.primary} />
              <Text style={styles.powderAddBtnText}> เพิ่มรายการ</Text>
            </TouchableOpacity>
            <View style={[styles.planLine, styles.reserveTotalRow]}>
              <Text style={styles.reserveTotalLabel}>ยอดรวมที่จะจด (แปลงเป็น THB)</Text>
              <Text style={styles.reserveTotalValue}>{formatCurrency(powderRowsTotal)}</Text>
            </View>
            <Text style={styles.modalHint}>
              ยอดนี้ไม่หักอัตโนมัติ — ซื้อเสร็จแล้วกลับมาแก้ยอดของรายการนั้นได้เลย
              (ล้างทั้งชื่อและยอดของแถว = ลบรายการนั้นทิ้ง)
              {plan?.dryPowderAsOf ? ` · จดล่าสุด ${fmtDateTH(plan.dryPowderAsOf)}` : ''}
            </Text>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSavePowder}>
              <Text style={styles.modalSaveBtnText}>จดยอด ({formatCurrency(powderRowsTotal)})</Text>
            </TouchableOpacity>
            <View style={styles.modalBottomRow}>
              <TouchableOpacity onPress={() => setPowderModalVisible(false)}>
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  innerContainerDesktop: {
    alignSelf: 'center',
    width: '100%',
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
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
    letterSpacing: 2,
    color: '#ffffff',
  },
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
    fontWeight: 'bold',
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
    fontWeight: '600',
    fontFamily: 'NotoSansThai_600SemiBold',
  },
  summaryPercent: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'NotoSansThai_600SemiBold',
  },
  summaryCost: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    color: '#ffffff',
    opacity: 0.9,
    marginTop: 8,
  },
  profitPositive: {
    color: COLORS.success,
  },
  profitNegative: {
    color: COLORS.error,
  },
  goalCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 0,
    padding: 16,
    marginBottom: 16,
    marginHorizontal:16
  },
  goalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  goalCardTitle: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  goalCardEdit: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.primary,
  },
  // ── ตัวปรับ "แบ่งลงกี่ครั้ง/เดือน" ในการ์ดเงินรอลงทุน (แทน modal แผนที่เอาออก) ──
  roundsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  roundsStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  roundsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  roundsValue: {
    minWidth: 34,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  roundsHint: {
    width: 92,
    textAlign: 'right',
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  goalCardEmpty: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    lineHeight: 18,
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
  goalTrack: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  goalFill: {
    height: 8,
    borderRadius: 4,
  },
  // แถวตัวเลขสำคัญในการ์ดสรุป — ยุบสาระของหลายการ์ดเหลือแถวเดียว
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  kpiCell: {
    flex: 1,
    backgroundColor: `${COLORS.primary}0D`,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  kpiLabel: {
    fontSize: 10,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 15,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
  },
  kpiValueNeg: {
    color: COLORS.error,
  },
  // ปุ่มกาง/ยุบ (เหลือใช้ที่ลิสต์ "ที่ขายแล้ว")
  detailToggleText: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
  },
  // ── การ์ดตัวเลขแบบบรรทัด: ป้าย-ซ้าย ค่า-ขวา ไม่มีตารางหลายคอลัมน์ ──
  planLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 12,
  },
  planLineLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  planLineValue: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
    textAlign: 'right',
  },
  // ชิปเลือก "แบ่งลงกี่เดือน" ของเงินรอลงทุน
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    marginBottom: 6,
  },
  chip: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: '#ffffff',
    fontFamily: 'NotoSansThai_600SemiBold',
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
  losersTitle: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
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
  horizonBox: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
  },
  horizonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  reserveAcctRow: {
    paddingVertical: 2,
  },
  reserveAcctSub: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  simActiveText: {
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
  },
  // ปุ่มสลับโหมดของการ์ดวางแผนถึงเป้า (ยุบ 3 ตารางเหลือ 1)
  horizonYears: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  horizonRate: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
  },
  reserveTotalRow: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  reserveTotalLabel: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  reserveTotalValue: {
    fontSize: 15,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
  },
  wealthBox: {
    marginTop: 10,
    backgroundColor: `${COLORS.primary}0D`,
    padding: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
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
  modalHint: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 6,
    lineHeight: 16,
  },
  // ── แถวจดเงินรอลงทุน: ชื่อ/แหล่งเงิน + ยอด + ปุ่มลบ + สกุลเงิน ──
  powderItemBox: {
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  powderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  powderCurrencyRow: { flexGrow: 0 },
  powderCurBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  powderRowLabel: { flex: 3, padding: 10, fontSize: 14 },
  powderRowAmount: { flex: 2, padding: 10, fontSize: 14, textAlign: 'right' },
  powderRowDelete: { paddingHorizontal: 2, paddingVertical: 6 },
  powderAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  powderAddBtnText: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
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
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  updateButtonText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  typeScroll: {
    maxHeight: 140,
  },
  typeScrollContent: {
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  typeWrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding:16
  },
  typeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    padding: 16,
    width: 200,
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
  typeCardDesktop: {
    flex: 1,
    minWidth: 160,
  },
  typeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },

  typeName: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
    flex: 1,
  },
  typeCount: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  typeValue: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
    marginBottom: 8,
  },
  typeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeProfit: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'NotoSansThai_600SemiBold',
  },
  typePercentage: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  listHeader: {
    padding:16
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '600',
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
  realizedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  realizedRowLeft: {
    flex: 1,
  },
  realizedRowTitle: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  realizedRowSub: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  realizedRowNote: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.primary,
    marginTop: 2,
  },
  realizedRowPnl: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    textAlign: 'right',
  },
  realizedRowPnlPct: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  undoButtonText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.primary,
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
    marginHorizontal:16
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
  investmentContent: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  investmentLeft: {
    flex: 1,
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
    fontWeight: '600',
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
    justifyContent: 'center',
    marginLeft: 16,
  },
  investmentValue: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
    marginBottom: 4,
  },
  investmentProfit: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'NotoSansThai_600SemiBold',
    marginBottom: 2,
  },
  investmentPercent: {
    fontSize: 13,
    fontWeight: '600',
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
    fontWeight: '300',
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
