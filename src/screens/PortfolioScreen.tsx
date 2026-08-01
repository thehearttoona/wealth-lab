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
import { Investment, InvestmentType, PortfolioSummary, INVESTMENT_TYPES, RealizedTrade } from '../types/investment';
import { getRealizedTrades, saveRealizedTrade, deleteRealizedTrade } from '../services/realizedStorage';
import { summarizeRealized, analyzeRealizedTrade } from '../utils/realizedAnalysis';
import {
  getInvestments,
  deleteInvestment,
  getPortfolioSummary,
  updateInvestment,
  saveInvestment,
} from '../services/investmentStorage';
import { formatCurrency, formatCurrencyWithType, convertToTHB, toChristianYear, COLORS, INVEST_EXPENSE_CATEGORY } from '../utils/constants';
import { investedByMonth, currentMonthKey, setAsideStreak } from '../utils/savingsDiscipline';
import { updateInvestmentPrice, getTwoRedDays } from '../services/priceApi';
import { analyzePortfolioGoal, PortfolioGoal, PortfolioGoalAnalysis, monthsToReachGoal, monthlyToAnnualPercent, GOAL_HORIZONS, requiredMonthlyContribution } from '../utils/investmentGoals';
import { getPortfolioGoal, savePortfolioGoal, deletePortfolioGoal } from '../services/portfolioGoalStorage';
import { getInvestmentPlan, saveInvestmentPlan, deleteInvestmentPlan, InvestmentPlan } from '../services/investmentPlanStorage';
import { getIncomes } from '../services/incomeStorage';
import { getExpenses } from '../services/storage';
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
  const [planModalVisible, setPlanModalVisible] = useState(false);
  const [planPercentInput, setPlanPercentInput] = useState('');
  const [planRoundsInput, setPlanRoundsInput] = useState('');
  const [planIncomeInput, setPlanIncomeInput] = useState('');
  const [planPowderInput, setPlanPowderInput] = useState('');   // เงินรอลงทุนที่จดเอง
  const [powderMonths, setPowderMonths] = useState(1);          // จะกระจายเงินก้อนนี้กี่เดือน
  const [monthSalary, setMonthSalary] = useState(0);   // เงินเดือนที่บันทึกในเดือนปัจจุบัน
  const [monthExpense, setMonthExpense] = useState(0); // รายจ่ายรวมในเดือนปัจจุบัน (ไม่รวมหมวด "ลงทุน")
  const [monthInvestLogged, setMonthInvestLogged] = useState(0); // ที่บันทึกเป็นรายจ่ายหมวด "ลงทุน" เดือนนี้
  const [reserveAccounts, setReserveAccounts] = useState<Account[]>([]); // บัญชีบทบาท "รอลงทุน"
  const [redAlerts, setRedAlerts] = useState<{ symbol: string; name: string; dropPercent: number; count: number }[]>([]);
  const [reqHorizon, setReqHorizon] = useState(5); // กรอบเวลาที่เลือกในการ์ด "เดือนละเท่าไหร่ถึงเป้า" (ปี)
  const [showPlanDetail, setShowPlanDetail] = useState(false); // กาง/ยุบรายละเอียดแผน — เริ่มต้นยุบไว้ให้หน้าไม่ยาว
  // ตัวจำลอง "ปรับ 2 ตัว → คำตอบเดียว" แทนตาราง what-if 3 ตัว (null = ยังไม่แตะ ใช้ % จากแผนที่ตั้งไว้)
  const [simPct, setSimPct] = useState<number | null>(null);
  const [simReturn, setSimReturn] = useState(3); // กำไร %/เดือน ที่สมมติ
  // ── การขายจริง: ตัวชี้วัดฝีมือที่วัดได้ (ต่างจากกำไรลอยตัว) ──
  const [realizedTrades, setRealizedTrades] = useState<RealizedTrade[]>([]);
  const [sellTarget, setSellTarget] = useState<Investment | null>(null);
  const [sellQtyInput, setSellQtyInput] = useState('');
  const [sellPriceInput, setSellPriceInput] = useState('');
  const [sellDateInput, setSellDateInput] = useState('');
  const [sellFeesInput, setSellFeesInput] = useState('');
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
      // เดือนปัจจุบันเป็น YYYY-MM แล้วกรองเฉพาะรายการของเดือนนี้ (แปลง พ.ศ.→ค.ศ. ก่อน)
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const inThisMonth = (dateStr: string) => toChristianYear(dateStr || '').slice(0, 7) === monthKey;

      const [incomes, expenses] = await Promise.all([getIncomes(), getExpenses()]);
      setMonthSalary(
        incomes
          .filter((i) => i.category === 'เงินเดือน' && inThisMonth(i.date))
          .reduce((s, i) => s + i.amount, 0)
      );
      // กันหมวด "ลงทุน" ออกจากงบใช้จ่าย — เงินที่โอนไปลงทุนคือการออม ไม่ใช่เงินที่ใช้หมดไป
      // ถ้านับรวม จะดูเหมือนใช้เกินงบทั้งที่จริง ๆ คือทำตามแผน
      const monthExpenses = expenses.filter((e) => e.type !== 'income' && inThisMonth(e.date));
      setMonthExpense(
        monthExpenses
          .filter((e) => e.category !== INVEST_EXPENSE_CATEGORY)
          .reduce((s, e) => s + e.amount, 0)
      );
      setMonthInvestLogged(
        monthExpenses
          .filter((e) => e.category === INVEST_EXPENSE_CATEGORY)
          .reduce((s, e) => s + e.amount, 0)
      );
    } catch {
      setMonthSalary(0);
      setMonthInvestLogged(0);
      setMonthExpense(0);
    }

    // เช็คแดงติดกันเป็นเลขคู่ (2/4/6…) เฉพาะ crypto/หุ้น — ทำแบบ background ไม่บล็อกการโหลด
    const candleTargets = allInvestments.filter((i) =>
      ['crypto', 'stock_th', 'stock_foreign'].includes(i.type)
    );
    Promise.all(
      candleTargets.map(async (i) => ({ inv: i, alert: await getTwoRedDays(i.type, i.symbol) }))
    )
      .then((results) =>
        setRedAlerts(
          results
            .filter((r) => r.alert !== null)
            .map((r) => ({
              symbol: r.inv.symbol,
              name: r.inv.name,
              dropPercent: r.alert!.dropPercent,
              count: r.alert!.count,
            }))
            // เรียงจากลบเยอะสุด → น้อยสุด (dropPercent เป็นค่าลบ)
            .sort((a, b) => a.dropPercent - b.dropPercent)
        )
      )
      .catch(() => {});
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
  };

  const handleConfirmSell = async () => {
    if (!sellTarget) return;
    const qty = parseFloat(sellQtyInput.replace(/,/g, ''));
    const price = parseFloat(sellPriceInput.replace(/,/g, ''));
    const date = sellDateInput.trim();
    const sellFee = parseFloat(sellFeesInput.replace(/,/g, '')) || 0;
    if (!qty || qty <= 0 || qty > sellTarget.quantity) {
      showMsg(`จำนวนที่ขายต้องมากกว่า 0 และไม่เกิน ${sellTarget.quantity}`);
      return;
    }
    if (!price || price <= 0) { showMsg('กรุณากรอกราคาขาย'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { showMsg('วันที่ขายต้องเป็นรูปแบบ YYYY-MM-DD'); return; }

    // ค่าธรรมเนียมซื้อ ปันตามสัดส่วนที่ขาย แล้วบวกค่าธรรมเนียมขายที่กรอก
    const buyFeeShare = (sellTarget.fees || 0) * (qty / sellTarget.quantity);
    try {
      await saveRealizedTrade({
        id: Date.now().toString(),
        symbol: sellTarget.symbol,
        name: sellTarget.name,
        assetType: sellTarget.type,
        currency: sellTarget.currency ?? 'THB',
        quantity: qty,
        buyPrice: sellTarget.buyPrice,
        sellPrice: price,
        buyDate: toChristianYear(sellTarget.buyDate || '').slice(0, 10),
        sellDate: date,
        fees: buyFeeShare + sellFee,
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
      setSellTarget(null);
      showMsg('บันทึกการขายแล้ว');
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

  const openPlanModal = () => {
    setPlanPercentInput(plan?.setAsidePercent?.toString() || '');
    setPlanRoundsInput(plan?.dcaRounds?.toString() || '');
    // pre-fill เงินเดือนคาดหวัง: ใช้ค่าที่ตั้งไว้ก่อน ไม่งั้น fallback เป็นเงินเดือนล่าสุดของเดือนนี้
    setPlanIncomeInput(
      (plan?.expectedIncome || monthSalary || '').toString().replace(/^0$/, '')
    );
    setPlanPowderInput(plan?.dryPowder ? plan.dryPowder.toString() : '');
    setPlanModalVisible(true);
  };

  const handleSavePlan = async () => {
    const percent = parseFloat(planPercentInput.replace(/,/g, ''));
    const rounds = parseInt(planRoundsInput, 10);
    const income = parseFloat(planIncomeInput.replace(/,/g, ''));
    if (!percent || percent <= 0 || percent > 100) { showMsg('กรุณากรอก % ที่กันไว้ (1-100)'); return; }
    if (!rounds || rounds <= 0) { showMsg('กรุณากรอกจำนวนครั้งที่ถูกต้อง'); return; }
    // เงินเดือนไม่บังคับ — ถ้าเว้นว่าง ระบบจะใช้เงินเดือนที่ import มาแทน
    const powder = parseFloat(planPowderInput.replace(/,/g, ''));
    const powderValue = Number.isFinite(powder) && powder >= 0 ? powder : undefined;
    // แตะยอดเงินรอลงทุนเมื่อไหร่ ให้ประทับวันที่ใหม่ — ไว้เตือนว่าซื้อไปกี่รายการหลังจากจด
    const powderChanged = powderValue !== plan?.dryPowder;
    try {
      const newPlan: InvestmentPlan = {
        setAsidePercent: percent,
        dcaRounds: rounds,
        expectedIncome: Number.isFinite(income) && income > 0 ? income : undefined,
        dryPowder: powderValue,
        dryPowderAsOf:
          powderValue == null
            ? undefined
            : powderChanged
              ? new Date().toISOString().slice(0, 10)
              : plan?.dryPowderAsOf,
      };
      await saveInvestmentPlan(newPlan);
      setPlan(newPlan);
      setPlanModalVisible(false);
    } catch {
      showMsg('บันทึกแผนไม่สำเร็จ');
    }
  };

  const handleDeletePlan = async () => {
    try {
      await deleteInvestmentPlan();
      setPlan(null);
      setPlanModalVisible(false);
    } catch {
      showMsg('ลบแผนไม่สำเร็จ');
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

  const renderInvestmentItem = ({ item }: { item: Investment }) => {
    const { currentPriceNative, value, profit, profitPercent } = calcItemStats(item);
    const isProfit = profit >= 0;
    // วิเคราะห์รายตัว: โตเฉลี่ย/ปี (จากวันซื้อ) — ข้อมูลจริง ไม่ใช่คำแนะนำให้ขาย
    const growth = getHoldingAnnualGrowth(item.buyDate, item.buyPrice, currentPriceNative);

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

  // ── ตัวเลขแผนเติมเงิน: คำนวณครั้งเดียวที่นี่ ใช้ทั้งการ์ดสรุปด้านบนและรายละเอียดด้านล่าง ──
  // ฐานที่นิ่ง = เงินเดือนคาดหวังที่ตั้งไว้ (ถ้ายังไม่ตั้ง fallback เป็นเงินเดือนที่บันทึกเดือนนี้)
  const baseIncome = plan?.expectedIncome && plan.expectedIncome > 0 ? plan.expectedIncome : monthSalary;
  const hasPlanNumbers = !!plan && baseIncome > 0;
  const setAside = plan ? baseIncome * (plan.setAsidePercent / 100) : 0; // จ่ายตัวเองก่อน (ไม่หักรายจ่าย)
  // เดือน = รอบบัญชี (ฐานคำนวณ) แต่หน่วยที่ผู้ใช้ลงมือจริงคือ "ครั้ง" — ทุกตัวเลขบนจอจึงหารเป็นต่อครั้ง
  const dcaRoundsCount = plan?.dcaRounds && plan.dcaRounds > 0 ? plan.dcaRounds : null;
  const perRound = plan && plan.dcaRounds > 0 ? setAside / plan.dcaRounds : null;
  const spendBudget = baseIncome - setAside;      // งบใช้จ่าย = กันลงทุนก่อนแล้วเหลือเท่านี้
  const leftToSpend = spendBudget - monthExpense; // เหลือใช้ได้อีก (< 0 = ใช้เกินงบ)

  // ── วินัยการกันเงิน: "กันไว้" กับ "ลงจริง" ตรงกันหรือเปล่า ──
  // อ่านจากรายการลงทุนที่บันทึกไว้แล้ว ไม่ต้องให้กรอกอะไรเพิ่ม
  const investedPerMonth = investedByMonth(investments, realizedTrades);
  const investedThisMonth = investedPerMonth[currentMonthKey()] ?? 0;
  const investProgress = setAside > 0 ? Math.min(1, investedThisMonth / setAside) : 0;
  const investShortfall = Math.max(0, setAside - investedThisMonth);
  const streakMonths = setAsideStreak(investedPerMonth, setAside);
  // แปลงเงินที่ลงไปแล้ว/ที่ยังขาด เป็นจำนวน "ครั้ง" — ลงแล้วกี่ไม้ เหลืออีกกี่ไม้
  const roundsDone =
    perRound && perRound > 0 ? Math.min(dcaRoundsCount ?? 0, Math.floor(investedThisMonth / perRound)) : 0;
  const roundsLeft = perRound && perRound > 0 ? Math.ceil(investShortfall / perRound) : null;
  // เงินที่ต้องเติมต่อเดือนของกรอบเวลาที่เลือก — null = คำนวณไม่ได้, 0 = ปล่อยให้โตเองก็ถึง
  const reqMonthly =
    goalAnalysis && !goalAnalysis.reached && goalAnalysis.currentValue > 0 && goalAnalysis.projectionRatePercent
      ? requiredMonthlyContribution(
          goalAnalysis.currentValue,
          goalAnalysis.targetAmount,
          goalAnalysis.projectionRatePercent,
          reqHorizon
        )
      : null;
  // ── เงินรอลงทุน (จดเอง) → ลงได้ครั้งละเท่าไหร่ ──
  // ตั้งใจไม่หักอัตโนมัติ: ผู้ใช้กรอกยอดจริงทับเมื่อไหร่ก็ได้ ระบบแค่เตือนถ้ามีการซื้อหลังวันที่จด
  const dryPowder = plan?.dryPowder && plan.dryPowder > 0 ? plan.dryPowder : 0;
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

  // เงินที่ต้องเติม "ต่อครั้ง" — เลขคณิตเดิม แค่หารด้วยจำนวนครั้งที่ตั้งไว้
  const reqPerRound = reqMonthly != null && dcaRoundsCount ? reqMonthly / dcaRoundsCount : reqMonthly;
  // ต้องโตปีละกี่ % ของกรอบเวลาที่เลือก (แบบไม่เติมเงินเพิ่ม)
  const horizonRate =
    goalAnalysis?.requiredByHorizon.find((h) => h.years === reqHorizon)?.annualReturnPercent ?? null;

  // ── ตัวจำลอง: กัน % + กำไร %/เดือน → ถึงเป้าในกี่เดือน (คำตอบเดียว แทนตาราง what-if 3 ตัว) ──
  const simPctValue = simPct ?? plan?.setAsidePercent ?? 20;
  const simContribution = baseIncome > 0 ? baseIncome * (simPctValue / 100) : 0;
  const simMonths =
    goalAnalysis && !goalAnalysis.reached && goalAnalysis.currentValue > 0
      ? monthsToReachGoal(goalAnalysis.currentValue, goalAnalysis.targetAmount, simReturn, simContribution)
      : null;
  const fmtMonthsAnswer = (n: number | null): string => {
    if (n == null) return 'ไปไม่ถึง';
    const m = Math.round(n);
    if (m < 1) return 'ถึงแล้ว';
    if (m < 24) return `${m} เดือน`;
    return `${(n / 12).toFixed(1)} ปี`;
  };

  // สัดส่วน 3 กลุ่มตามต้นทุนที่ถืออยู่ — ยังไม่มีพอร์ตให้แบ่งเท่ากัน
  const shares = (() => {
    const cTH = summary.byType.stock_th?.cost ?? 0;
    const cFR = summary.byType.stock_foreign?.cost ?? 0;
    const cCR = summary.byType.crypto?.cost ?? 0;
    const s3 = cTH + cFR + cCR;
    const pick = (c: number) => (s3 > 0 ? c / s3 : 1 / 3);
    return [
      { key: 'stock_th', label: 'หุ้นไทย', share: pick(cTH) },
      { key: 'stock_foreign', label: 'หุ้นต่างประเทศ', share: pick(cFR) },
      { key: 'crypto', label: 'คริปโต', share: pick(cCR) },
    ];
  })();

  // ทำกำไรก้อนนี้อีกกี่ครั้งถึงเป้า — ยุบการ์ดเดิมเหลือข้อความบรรทัดเดียว (อิงมูลค่าตลาด)
  const profitTimesText: string | null = (() => {
    if (!goalAnalysis) return null;
    const gap = goalAnalysis.targetAmount - summary.totalValue;
    if (gap <= 0) return 'มูลค่าถึงเป้าแล้ว 🎉';
    if (summary.totalProfit <= 0) return 'ยังไม่มีกำไร';
    return `อีก ~${Math.ceil(gap / summary.totalProfit)} ครั้ง`;
  })();

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

              {/* ตั้งใจไม่โชว์ "คาดถึงเป้าในอีกกี่ปี" และแถว KPI คาดการณ์บนการ์ดนี้
                  — เป็นเลขพยากรณ์ที่ยังไม่เกิดจริง อ่านแล้วเข้าใจผิดว่าถึงเป้าแล้ว
                  ตัวเลข "ต้องลง/ครั้ง" ตามกรอบเวลายังดูได้ในปุ่ม "ดูรายละเอียดแผน" ด้านล่าง */}

              {/* ── วินัยการกันเงิน: จุดที่แผนพังบ่อยสุด — "กันไว้" ไม่เท่ากับ "ลงจริง" ── */}
              {hasPlanNumbers && setAside > 0 && (
                <View style={styles.disciplineBox}>
                  <View style={styles.planLine}>
                    <Text style={styles.planLineLabel}>
                      {dcaRoundsCount ? 'ลงแล้วเดือนนี้ (ครั้ง)' : 'เดือนนี้ลงจริง / กันไว้'}
                    </Text>
                    <Text
                      style={[
                        styles.planLineValue,
                        { color: investShortfall > 0 ? COLORS.warning : COLORS.success },
                      ]}
                    >
                      {dcaRoundsCount
                        ? `${roundsDone} / ${dcaRoundsCount} ครั้ง`
                        : `${formatCurrency(investedThisMonth)} / ${formatCurrency(setAside)}`}
                    </Text>
                  </View>
                  <View style={styles.goalTrack}>
                    <View
                      style={[
                        styles.goalFill,
                        {
                          width: `${investProgress * 100}%`,
                          backgroundColor: investShortfall > 0 ? COLORS.warning : COLORS.success,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.tpSubText}>
                    {investShortfall > 0
                      ? dcaRoundsCount && perRound
                        ? `เหลืออีก ${roundsLeft} ครั้ง · ครั้งละ ${formatCurrency(perRound)} (รวม ${formatCurrency(investShortfall)})`
                        : `ยังต้องโอนเข้าลงทุนอีก ${formatCurrency(investShortfall)} (ทำได้ ${(investProgress * 100).toFixed(0)}%)`
                      : dcaRoundsCount
                        ? '✓ ลงครบทุกครั้งแล้วเดือนนี้'
                        : '✓ กันเงินครบแล้วเดือนนี้'}
                    {streakMonths > 0
                      ? ` • ทำครบติดกัน ${streakMonths} เดือน`
                      : ' • ยังไม่มีเดือนที่ทำครบติดกัน'}
                  </Text>
                </View>
              )}

              {hasPlanNumbers && leftToSpend < 0 ? (
                <Text style={[styles.tpSubText, { color: COLORS.error }]}>
                  ⚠ เดือนนี้ใช้เกินงบไป {formatCurrency(-leftToSpend)} — กระทบเงินที่กันไว้ลงทุน
                </Text>
              ) : !hasPlanNumbers ? (
                <Text style={styles.tpSubText}>
                  * ยังไม่ได้ตั้งแผนเติมเงิน/เงินเดือน — กด "ดูรายละเอียดแผน" ด้านล่างเพื่อตั้งค่า
                </Text>
              ) : null}
            </>
          )}
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

        {redAlerts.length > 0 && (
          <View style={styles.losersCard}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="warning" size={16} color={COLORS.error} />
              <Text style={styles.losersTitle}>ราคาลงแดงติดกัน (2/4/6 แท่ง)</Text>
            </View>
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

  // ── ชุดวางแผนถึงเป้า → ย้ายมาต่อท้ายรายการหุ้น (footer) เพื่อให้ "พอร์ต+หุ้นที่ถือ" ขึ้นก่อน ──
  const planningFooterElement = (
    <View>
        {/* ── ปุ่มกาง/ยุบ: ค่าเริ่มต้นยุบไว้ ให้หน้าเหลือแค่การ์ดสรุปด้านบน ไม่ต้องเลื่อนผ่านตารางเยอะ ── */}
        <TouchableOpacity style={styles.detailToggle} onPress={() => setShowPlanDetail((v) => !v)}>
          <Ionicons
            name={showPlanDetail ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={COLORS.primary}
          />
          <Text style={styles.detailToggleText}>
            {showPlanDetail ? ' ซ่อนแผน' : ' วางแผนถึงเป้า'}
          </Text>
        </TouchableOpacity>
        {!showPlanDetail && (
          <Text style={styles.detailToggleHint}>ลองปรับ % ที่กัน / กำไรที่ทำได้ → ดูว่าถึงเป้าเร็วแค่ไหน</Text>
        )}

        {showPlanDetail && (
          <View style={styles.goalCard}>
            <Text style={styles.goalCardTitle}>
              <Ionicons name="options-outline" size={18} color={COLORS.primary} /> วางแผนถึงเป้า
            </Text>

            {goalAnalysis && !goalAnalysis.reached && goalAnalysis.currentValue > 0 ? (
              <>
                {/* กรอบเวลา — ชิปแถวเดียว แทนตาราง 1/3/5/10 ปี */}
                <View style={styles.chipRow}>
                  {GOAL_HORIZONS.map((y) => (
                    <TouchableOpacity
                      key={y}
                      style={[styles.chip, y === reqHorizon && styles.chipActive]}
                      onPress={() => setReqHorizon(y)}
                    >
                      <Text style={[styles.chipText, y === reqHorizon && styles.chipTextActive]}>{y} ปี</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.planLine}>
                  <Text style={styles.planLineLabel}>
                    ต้องลง/{dcaRoundsCount ? 'ครั้ง' : 'เดือน'} (โต {(goalAnalysis.projectionRatePercent ?? 0).toFixed(0)}%/ปี)
                  </Text>
                  <Text style={styles.planLineValue}>
                    {reqPerRound == null
                      ? '—'
                      : reqPerRound <= 0
                        ? 'โตเองถึง'
                        : `${formatCurrency(reqPerRound)}${dcaRoundsCount ? ` × ${dcaRoundsCount} ครั้ง` : ''}`}
                  </Text>
                </View>
                <View style={styles.planLine}>
                  <Text style={styles.planLineLabel}>ถ้าไม่เติมเงินเลย ต้องโตปีละ</Text>
                  <Text style={styles.planLineValue}>{horizonRate == null ? '—' : `${horizonRate.toFixed(1)}%`}</Text>
                </View>
                {profitTimesText != null && (
                  <View style={styles.planLine}>
                    <Text style={styles.planLineLabel}>ทำกำไรก้อนนี้อีกกี่ครั้งถึงเป้า</Text>
                    <Text style={styles.planLineValue}>{profitTimesText}</Text>
                  </View>
                )}

                {/* ลองปรับดู — ปุ่ม 2 ตัว → คำตอบเดียว แทนตารางจำลอง 3 ตัว (18 แถว) */}
                <View style={styles.simDivider} />
                <Text style={styles.horizonHeader}>ลองปรับดู</Text>
                <View style={styles.stepRow}>
                  <Text style={styles.stepLabel}>กันเงินลงทุน</Text>
                  <View style={styles.stepControl}>
                    <TouchableOpacity style={styles.stepBtn} onPress={() => setSimPct(Math.max(0, simPctValue - 5))}>
                      <Ionicons name="remove" size={15} color={COLORS.primary} />
                    </TouchableOpacity>
                    <Text style={styles.stepValue}>{simPctValue}%</Text>
                    <TouchableOpacity style={styles.stepBtn} onPress={() => setSimPct(Math.min(90, simPctValue + 5))}>
                      <Ionicons name="add" size={15} color={COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.stepHint}>
                    {simContribution <= 0
                      ? 'ไม่มีฐานเงินได้'
                      : dcaRoundsCount
                        ? `${formatCurrency(simContribution / dcaRoundsCount)}/ครั้ง`
                        : `${formatCurrency(simContribution)}/ด.`}
                  </Text>
                </View>
                <View style={styles.stepRow}>
                  <Text style={styles.stepLabel}>กำไร/เดือน</Text>
                  <View style={styles.stepControl}>
                    <TouchableOpacity style={styles.stepBtn} onPress={() => setSimReturn(Math.max(0, simReturn - 1))}>
                      <Ionicons name="remove" size={15} color={COLORS.primary} />
                    </TouchableOpacity>
                    <Text style={styles.stepValue}>{simReturn}%</Text>
                    <TouchableOpacity style={styles.stepBtn} onPress={() => setSimReturn(Math.min(20, simReturn + 1))}>
                      <Ionicons name="add" size={15} color={COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.stepHint}>≈ {monthlyToAnnualPercent(simReturn).toFixed(0)}%/ปี</Text>
                </View>
                <View style={styles.answerBox}>
                  <Text style={styles.answerLabel}>ถึงเป้าใน</Text>
                  <Text style={styles.answerBig}>{fmtMonthsAnswer(simMonths)}</Text>
                </View>

                {/* แบ่งไม้จากเงินที่กันไว้จริง — บรรทัดละกลุ่ม ไม่ใช่ตาราง 4 คอลัมน์ */}
                {simContribution > 0 && (
                  <>
                    <View style={styles.simDivider} />
                    <Text style={styles.horizonHeader}>
                      แบ่งไม้จาก {formatCurrency(simContribution)}/เดือน
                      {dcaRoundsCount ? ` · ${dcaRoundsCount} ครั้ง` : ''}
                    </Text>
                    {shares.map(({ key, label, share }) => {
                      const amt = simContribution * share;
                      const perTradeAmt = dcaRoundsCount ? simContribution / dcaRoundsCount : null;
                      const trades = perTradeAmt && perTradeAmt > 0 ? Math.round(amt / perTradeAmt) : null;
                      return (
                        <View key={key} style={styles.planLine}>
                          <Text style={styles.planLineLabel}>{label} {(share * 100).toFixed(0)}%</Text>
                          <Text style={styles.planLineValue}>
                            {formatCurrency(amt)}{trades != null ? ` · ${trades} ไม้` : ''}
                          </Text>
                        </View>
                      );
                    })}
                  </>
                )}
              </>
            ) : (
              <Text style={styles.goalCardEmpty}>
                {!goalAnalysis
                  ? 'ตั้งเป้าหมายพอร์ตก่อน (ปุ่ม "ตั้งเป้า" ด้านบน) ระบบถึงจะวางแผนให้ได้'
                  : goalAnalysis.reached
                    ? 'ถึงเป้าแล้ว 🎉 ตั้งเป้าใหม่ที่สูงขึ้นได้เลย'
                    : 'ยังไม่มีต้นทุนในพอร์ต — เพิ่มการลงทุนก่อน'}
              </Text>
            )}

            {/* เงินรอลงทุนที่จดเอง → แบ่งเป็นครั้ง (คนละก้อนกับ % เงินเดือน) */}
            <View style={styles.simDivider} />
            <View style={styles.goalCardHeader}>
              <Text style={styles.horizonHeader}>เงินรอลงทุน · แบ่งลงกี่ครั้ง</Text>
              <TouchableOpacity onPress={openPlanModal}>
                <Text style={styles.goalCardEdit}>{dryPowder > 0 ? 'แก้ยอด' : 'กรอกยอด'}</Text>
              </TouchableOpacity>
            </View>
            {dryPowder <= 0 ? (
              <Text style={styles.goalCardEmpty}>
                กรอก "เงินรอลงทุนที่มีตอนนี้" ในปุ่มด้านบน → ระบบจะบอกว่าลงได้ครั้งละเท่าไหร่ ทุกกี่วัน
              </Text>
            ) : !dcaRoundsCount ? (
              <Text style={styles.goalCardEmpty}>
                มีเงินรอลงทุน {formatCurrency(dryPowder)} — ตั้ง "แบ่งลงกี่ครั้งต่อเดือน" ก่อน ถึงจะหารให้ได้
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
                <View style={styles.planLine}>
                  <Text style={styles.planLineLabel}>เงินรอลงทุนที่จดไว้</Text>
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
                <View style={styles.planLine}>
                  <Text style={styles.planLineLabel}>ซื้อทุก ๆ</Text>
                  <Text style={styles.planLineValue}>
                    {powderEveryDays == null ? '—' : `~${Math.max(1, Math.round(powderEveryDays))} วัน`}
                  </Text>
                </View>
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

            {/* งบเดือนนี้ (จ่ายตัวเองก่อน) — ยุบ envelope 5 แถว + DCA 2 แถว เหลือ 5 บรรทัด */}
            <View style={styles.simDivider} />
            <View style={styles.goalCardHeader}>
              <Text style={styles.horizonHeader}>งบเดือนนี้ · จ่ายตัวเองก่อน</Text>
              <TouchableOpacity onPress={openPlanModal}>
                <Text style={styles.goalCardEdit}>{plan ? 'แก้ไข' : 'ตั้งแผน'}</Text>
              </TouchableOpacity>
            </View>
            {!hasPlanNumbers ? (
              <Text style={styles.goalCardEmpty}>
                ตั้ง "เงินเดือนต่อเดือน" + "กันกี่ %" + จำนวนครั้ง → ระบบจะบอกงบใช้จ่าย เหลือใช้ได้อีกเท่าไหร่ และลงได้ครั้งละเท่าไหร่
              </Text>
            ) : (
              <>
                <View style={styles.planLine}>
                  <Text style={styles.planLineLabel}>เงินเดือน (ฐาน)</Text>
                  <Text style={styles.planLineValue}>{formatCurrency(baseIncome)}</Text>
                </View>
                <View style={styles.planLine}>
                  <Text style={styles.planLineLabel}>กันลงทุน ({plan!.setAsidePercent}%)</Text>
                  <Text style={styles.planLineValue}>−{formatCurrency(setAside)}</Text>
                </View>
                <View style={styles.planLine}>
                  <Text style={styles.planLineLabel}>ใช้ไปแล้ว (งบ {formatCurrency(spendBudget)})</Text>
                  <Text style={styles.planLineValue}>−{formatCurrency(monthExpense)}</Text>
                </View>
                {monthInvestLogged > 0 && (
                  <View style={styles.planLine}>
                    <Text style={styles.planLineLabel}>
                      หมวด "ลงทุน" เดือนนี้ (กันออกจากงบใช้จ่ายแล้ว)
                    </Text>
                    <Text style={styles.planLineValue}>{formatCurrency(monthInvestLogged)}</Text>
                  </View>
                )}
                <View style={[styles.planLine, styles.reserveTotalRow]}>
                  <Text style={styles.reserveTotalLabel}>เหลือใช้ได้อีก</Text>
                  <Text style={[styles.reserveTotalValue, leftToSpend < 0 && { color: COLORS.error }]}>
                    {formatCurrency(leftToSpend)}
                  </Text>
                </View>
                <View style={styles.planLine}>
                  <Text style={styles.planLineLabel}>
                    ลงได้ต่อครั้ง ({plan!.dcaRounds} ครั้ง · {Math.max(1, investments.length)} ตัว)
                  </Text>
                  <Text style={styles.planLineValue}>
                    {perRound == null
                      ? '—'
                      : `${formatCurrency(perRound)} · ${formatCurrency(perRound / Math.max(1, investments.length))}/ตัว`}
                  </Text>
                </View>
              </>
            )}
          </View>
        )}

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
                  {qty > 0 && price > 0 && (
                    <View style={styles.answerBox}>
                      <Text style={styles.answerLabel}>กำไร/ขาดทุนจริงที่จะบันทึก</Text>
                      <Text style={[styles.answerBig, pnl < 0 && { color: COLORS.error }]}>
                        {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)} ({pnl >= 0 ? '+' : ''}
                        {pct.toFixed(1)}%)
                      </Text>
                    </View>
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

      {/* ── Modal ตั้ง/แก้แผนเติมเงิน ── */}
      <Modal
        visible={planModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPlanModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              <Ionicons name="wallet-outline" size={18} color={COLORS.primary} /> แผนเติมเงินต่อครั้ง
            </Text>
            <Text style={styles.modalLabel}>เงินเดือน/เงินได้ต่อเดือน (โดยประมาณ)</Text>
            <TextInput
              style={styles.modalInput}
              value={planIncomeInput}
              onChangeText={setPlanIncomeInput}
              keyboardType="numeric"
              placeholder="เช่น 50000 — ใช้เป็นฐานคำนวณที่นิ่งทั้งเดือน"
              placeholderTextColor={COLORS.textSecondary}
            />
            <Text style={styles.modalLabel}>กันเงินเดือนไปลงทุนกี่ % </Text>
            <TextInput
              style={styles.modalInput}
              value={planPercentInput}
              onChangeText={setPlanPercentInput}
              keyboardType="numeric"
              placeholder="เช่น 20"
              placeholderTextColor={COLORS.textSecondary}
            />
            <Text style={styles.modalLabel}>แบ่งลงกี่ครั้งต่อเดือน</Text>
            <TextInput
              style={styles.modalInput}
              value={planRoundsInput}
              onChangeText={setPlanRoundsInput}
              keyboardType="numeric"
              placeholder="เช่น 10"
              placeholderTextColor={COLORS.textSecondary}
            />
            <Text style={styles.modalLabel}>เงินรอลงทุนที่มีตอนนี้ (จดเอง · ไม่บังคับ)</Text>
            <TextInput
              style={styles.modalInput}
              value={planPowderInput}
              onChangeText={setPlanPowderInput}
              keyboardType="numeric"
              placeholder="เช่น 50000 — ยอดคงเหลือที่พร้อมลงทุน"
              placeholderTextColor={COLORS.textSecondary}
            />
            <Text style={styles.modalHint}>
              ยอดนี้ไม่หักอัตโนมัติ — ซื้อเสร็จแล้วกลับมากรอกยอดจริงทับได้เลย ระบบจะเตือนให้เองถ้ามีการซื้อหลังวันที่จด
            </Text>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSavePlan}>
              <Text style={styles.modalSaveBtnText}>บันทึกแผน</Text>
            </TouchableOpacity>
            <View style={styles.modalBottomRow}>
              {plan && (
                <TouchableOpacity onPress={handleDeletePlan}>
                  <Text style={styles.modalDeleteText}>ลบแผน</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setPlanModalVisible(false)}>
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
  // บล็อกวินัยการกันเงิน — "กันไว้" vs "ลงจริง" เดือนนี้
  disciplineBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  // ปุ่มกาง/ยุบรายละเอียดแผน
  detailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  detailToggleText: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
  },
  detailToggleHint: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    lineHeight: 16,
  },
  // ── การ์ด "วางแผนถึงเป้า": ทุกอย่างเป็นบรรทัด ป้าย-ซ้าย ค่า-ขวา ไม่มีตารางหลายคอลัมน์ ──
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
  simDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },
  // ชิปเลือกกรอบเวลา 1/3/5/10 ปี
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
  // ปุ่ม −/+ ปรับสมมติฐาน
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 8,
  },
  stepLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  stepControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stepValue: {
    minWidth: 46,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
  },
  stepHint: {
    width: 92,
    textAlign: 'right',
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  // คำตอบเดียวตัวใหญ่ — แทนตาราง what-if
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
  horizonHeader: {
    fontSize: 10,
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
    marginBottom: 6,
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
