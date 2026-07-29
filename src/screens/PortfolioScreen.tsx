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
import { Investment, PortfolioSummary, INVESTMENT_TYPES } from '../types/investment';
import {
  getInvestments,
  deleteInvestment,
  getPortfolioSummary,
  updateInvestment,
} from '../services/investmentStorage';
import { formatCurrency, formatCurrencyWithType, convertToTHB, toChristianYear, COLORS } from '../utils/constants';
import { updateInvestmentPrice, getTwoRedDays } from '../services/priceApi';
import { analyzePortfolioGoal, PortfolioGoal, PortfolioGoalAnalysis, yearsToReachGoal, INVEST_PERCENT_STEPS, monthsToReachGoal, monthlyToAnnualPercent, MONTHLY_RETURN_STEPS, GOAL_HORIZONS, requiredMonthlyContribution } from '../utils/investmentGoals';
import { getPortfolioGoal, savePortfolioGoal, deletePortfolioGoal } from '../services/portfolioGoalStorage';
import { getInvestmentPlan, saveInvestmentPlan, deleteInvestmentPlan, InvestmentPlan } from '../services/investmentPlanStorage';
import { getIncomes } from '../services/incomeStorage';
import { getExpenses } from '../services/storage';
import { getAccounts } from '../services/accountStorage';
import { Account } from '../types/account';
import { getTakeProfitSuggestion } from '../utils/takeProfit';
import { getHoldingAnnualGrowth, getYearsToTarget } from '../utils/holdingAnalysis';
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
  const [monthSalary, setMonthSalary] = useState(0);   // เงินเดือนที่บันทึกในเดือนปัจจุบัน
  const [monthExpense, setMonthExpense] = useState(0); // รายจ่ายรวมในเดือนปัจจุบัน
  const [reserveAccounts, setReserveAccounts] = useState<Account[]>([]); // บัญชีบทบาท "รอลงทุน"
  const [redAlerts, setRedAlerts] = useState<{ symbol: string; name: string; dropPercent: number; count: number }[]>([]);
  const [reqHorizon, setReqHorizon] = useState(5); // กรอบเวลาที่เลือกในการ์ด "เดือนละเท่าไหร่ถึงเป้า" (ปี)

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
      setMonthExpense(
        expenses
          .filter((e) => e.type !== 'income' && inThisMonth(e.date))
          .reduce((s, e) => s + e.amount, 0)
      );
    } catch {
      setMonthSalary(0);
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
    setPlanModalVisible(true);
  };

  const handleSavePlan = async () => {
    const percent = parseFloat(planPercentInput.replace(/,/g, ''));
    const rounds = parseInt(planRoundsInput, 10);
    const income = parseFloat(planIncomeInput.replace(/,/g, ''));
    if (!percent || percent <= 0 || percent > 100) { showMsg('กรุณากรอก % ที่กันไว้ (1-100)'); return; }
    if (!rounds || rounds <= 0) { showMsg('กรุณากรอกจำนวนรอบที่ถูกต้อง'); return; }
    // เงินเดือนไม่บังคับ — ถ้าเว้นว่าง ระบบจะใช้เงินเดือนที่ import มาแทน
    try {
      const newPlan: InvestmentPlan = {
        setAsidePercent: percent,
        dcaRounds: rounds,
        expectedIncome: Number.isFinite(income) && income > 0 ? income : undefined,
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

  const renderInvestmentItem = ({ item }: { item: Investment }) => {
    // ราคาปัจจุบัน (currentPrice) เก็บเป็นสกุลเงินเดียวกับ item.currency (สกุลที่เลือกตอนเพิ่มการลงทุน)
    // ต้องแปลงเป็น THB ก่อนคำนวณ cost/value/profit เพื่อรวมพอร์ตข้ามสกุลเงินได้
    const buyPriceInTHB = convertToTHB(item.buyPrice, item.currency);
    const currentPriceNative = item.currentPrice ?? item.buyPrice;
    const currentPriceInTHB = convertToTHB(currentPriceNative, item.currency);
    const cost = buyPriceInTHB * item.quantity + (item.fees || 0);
    const value = currentPriceInTHB * item.quantity;
    const profit = value - cost;
    const profitPercent = cost > 0 ? (profit / cost) * 100 : 0;
    const isProfit = profit >= 0;
    const tp = getTakeProfitSuggestion(item.type, profitPercent);
    // วิเคราะห์รายตัว: โตเฉลี่ย/ปี (จากวันซื้อ) + คาดอีกกี่ปีถึงจุดขายทำกำไร
    const growth = getHoldingAnnualGrowth(item.buyDate, item.buyPrice, currentPriceNative);
    const yearsToTarget = getYearsToTarget(profitPercent, tp.suggestedPercent, growth.annualReturnPercent);

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
        <View style={styles.tpRow}>
          {tp.reached ? (
            <Text style={[styles.tpText, { color: COLORS.success }]}>
              ถึงจุดขายทำกำไรแล้ว (เป้า +{tp.suggestedPercent}%)
            </Text>
          ) : (
            <Text style={styles.tpText}>
              เป้าขายทำกำไร +{tp.suggestedPercent}%
              {profitPercent > 0 ? ` • อีก ${tp.gapPercent.toFixed(1)}%` : ''}
            </Text>
          )}
          {growth.tooNew ? (
            <Text style={styles.tpSubText}>ถือ &lt; 3 เดือน ยังประเมินโต/ปีไม่ได้</Text>
          ) : growth.annualReturnPercent != null ? (
            <Text style={styles.tpSubText}>
              AVG โตเฉลี่ย ~{growth.annualReturnPercent >= 0 ? '+' : ''}{growth.annualReturnPercent.toFixed(1)}%/ปี
              {!tp.reached && yearsToTarget != null && yearsToTarget > 0
                ? ` • คาดถึงจุดขายในอีก ~${yearsToTarget.toFixed(1)} ปี`
                : !tp.reached && growth.annualReturnPercent <= 0
                  ? ' • ราคายังไม่โต ยังคาดวันถึงจุดขายไม่ได้'
                  : ''}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDelete(item.id, item.name)}
        >
          <Ionicons name="trash-outline" size={14} color={COLORS.textSecondary} />
          <Text style={styles.deleteButtonText}> ลบ</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTypeCard = (type: string, data: any, icon: string) => {
    const isProfit = data.profit >= 0;
    const percentage = summary.totalValue > 0 ? (data.value / summary.totalValue) * 100 : 0;

    return (
      <View key={type} style={[
        styles.typeCard,
        isDesktop && styles.typeCardDesktop,
      ]}>
        <View style={styles.typeHeader}>
          <Ionicons name={icon as any} size={20} color={COLORS.primary} />
          <Text style={styles.typeName}>
            {INVESTMENT_TYPES.find((t) => t.value === type)?.label || type}
          </Text>
          <Text style={styles.typeCount}>({data.count})</Text>
        </View>
        <Text style={styles.typeValue}>{formatCurrency(data.value)}</Text>
        <View style={styles.typeFooter}>
          <Text style={[styles.typeProfit, isProfit ? styles.profitPositive : styles.profitNegative]}>
            {isProfit ? '+' : ''}{formatCurrency(data.profit)}
          </Text>
          <Text style={styles.typePercentage}>{percentage.toFixed(2)}%</Text>
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
  const goalAnalysis: PortfolioGoalAnalysis | null = goal
    ? analyzePortfolioGoal(goal, summary.totalCost, summary.totalCost, portfolioStartDate)
    : null;

  // ตัวที่กำไร (ทั้งที่ถึงเป้าและยังไม่ถึง) — โชว์ % + คาดกี่ปีถึงเป้าขายทำกำไร เรียงใกล้/เกินเป้าก่อน
  const shouldSell = investments
    .map((inv) => {
      const curNative = inv.currentPrice ?? inv.buyPrice;
      const buyTHB = convertToTHB(inv.buyPrice, inv.currency);
      const curTHB = convertToTHB(curNative, inv.currency);
      const cost = buyTHB * inv.quantity + (inv.fees || 0);
      const value = curTHB * inv.quantity;
      const pct = cost > 0 ? ((value - cost) / cost) * 100 : 0;
      const target = getTakeProfitSuggestion(inv.type, pct).suggestedPercent;
      const growth = getHoldingAnnualGrowth(inv.buyDate, inv.buyPrice, curNative);
      const yearsToTarget = getYearsToTarget(pct, target, growth.annualReturnPercent);
      return { inv, pct, target, reached: pct >= target, yearsToTarget };
    })
    .filter((h) => h.pct > 0)
    .sort((a, b) => b.pct / b.target - a.pct / a.target);

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
            <Text style={styles.updateButtonText}>
              {isUpdatingPrices ? ' กำลังอัปเดต...' : ' อัปเดตราคา'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('AddInvestment', {})}
          >
            <Ionicons name="add-circle-outline" size={18} color="#ffffff" />
            <Text style={styles.addButtonText}> เพิ่มการลงทุน</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButton, styles.updateButton]}
            onPress={() => navigation.navigate('Accounts')}
          >
            <Ionicons name="wallet-outline" size={18} color={COLORS.primary} />
            <Text style={styles.updateButtonText}> บัญชี</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButton, styles.updateButton]}
            onPress={() => navigation.navigate('ManageByPlatform')}
          >
            <Ionicons name="layers-outline" size={18} color={COLORS.primary} />
            <Text style={styles.updateButtonText}> จัดการหลายรายการ</Text>
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
              ปักยอดพอร์ตที่อยากได้ แล้วระบบจะสรุปให้ว่าต้องโตปีละกี่ % (1/3/5/10 ปี) และคาดว่าจะถึงเป้าเมื่อไหร่
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

              {!goalAnalysis.reached && goalAnalysis.requiredByHorizon.length > 0 && (
                <View style={styles.horizonBox}>
                  <Text style={styles.horizonHeader}>ต้องโตเฉลี่ยปีละ</Text>
                  {goalAnalysis.requiredByHorizon.map((h) => (
                    <View key={h.years} style={styles.horizonRow}>
                      <Text style={styles.horizonYears}>ภายใน {h.years} ปี</Text>
                      <Text style={styles.horizonRate}>~{h.annualReturnPercent.toFixed(1)}% / ปี</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* ประมาณวันถึงเป้า — จาก % ที่ตั้งเอง หรือพาซจริง */}
              {!goalAnalysis.reached && (
                <Text style={styles.goalVerdict}>
                  {goalAnalysis.projectedYearsToReach != null
                    ? ` ${goalAnalysis.projectionSource === 'user' ? 'ที่คาดโตปีละ' : 'พาซปัจจุบันโตเฉลี่ยปีละ'} ~${goalAnalysis.projectionRatePercent!.toFixed(1)}% → คาดถึงเป้าในอีก ~${goalAnalysis.projectedYearsToReach.toFixed(1)} ปี (≈ ${new Date(goalAnalysis.projectedDate!).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })})`
                    : 'ใส่ "คาดโตปีละกี่ %" ในปุ่มแก้ไข เพื่อให้ระบบคำนวณว่าจะถึงเป้าในกี่ปี'}
                </Text>
              )}
            </>
          )}
        </View>

        {/* ── การ์ด: เดือนละเท่าไหร่ถึงเป้า + แบ่งลงหุ้นไทย/ต่างประเทศ/คริปโต ── */}
        {goalAnalysis && !goalAnalysis.reached && goalAnalysis.currentValue > 0 && (() => {
          const r = goalAnalysis.projectionRatePercent; // % คาดโต (ผู้ใช้ตั้ง หรือพาซจริง)
          const income = plan?.expectedIncome && plan.expectedIncome > 0 ? plan.expectedIncome : monthSalary;
          if (r == null || r <= 0) {
            return (
              <View style={styles.goalCard}>
                <Text style={styles.goalCardTitle}>
                  <Ionicons name="calculator-outline" size={18} color={COLORS.primary} /> เดือนละเท่าไหร่ถึงเป้า
                </Text>
                <Text style={styles.goalCardEmpty}>
                  ใส่ "คาดโตปีละกี่ %" ที่การ์ดเป้าหมายก่อน ระบบถึงจะคำนวณว่าต้องลงทุนเดือนละเท่าไหร่เพื่อให้ถึงเป้า
                </Text>
              </View>
            );
          }
          const current = goalAnalysis.currentValue; // = ต้นทุนที่ลงจริง (ไม่รวมกำไรลอยตัว)
          const target = goalAnalysis.targetAmount;
          const rows = GOAL_HORIZONS.map((years) => ({
            years,
            monthly: requiredMonthlyContribution(current, target, r, years),
          }));
          // สัดส่วนตามพอร์ตปัจจุบัน (ต้นทุน) ใน 3 กลุ่ม — ถ้ายังไม่มีพอร์ตให้แบ่งเท่ากัน
          const cTH = summary.byType.stock_th?.cost ?? 0;
          const cFR = summary.byType.stock_foreign?.cost ?? 0;
          const cCR = summary.byType.crypto?.cost ?? 0;
          const s3 = cTH + cFR + cCR;
          const shares = s3 > 0
            ? [
                { key: 'stock_th', label: 'หุ้นไทย', share: cTH / s3 },
                { key: 'stock_foreign', label: 'หุ้นต่างประเทศ', share: cFR / s3 },
                { key: 'crypto', label: 'คริปโต', share: cCR / s3 },
              ]
            : [
                { key: 'stock_th', label: 'หุ้นไทย', share: 1 / 3 },
                { key: 'stock_foreign', label: 'หุ้นต่างประเทศ', share: 1 / 3 },
                { key: 'crypto', label: 'คริปโต', share: 1 / 3 },
              ];
          const selected = rows.find((x) => x.years === reqHorizon) ?? rows[0];
          const selMonthly = selected.monthly ?? 0;
          const dcaRounds = plan?.dcaRounds ?? null;
          const perTrade = dcaRounds && dcaRounds > 0 ? selMonthly / dcaRounds : null;
          return (
            <View style={styles.goalCard}>
              <View style={styles.goalCardHeader}>
                <Text style={styles.goalCardTitle}>
                  <Ionicons name="calculator-outline" size={18} color={COLORS.primary} /> เดือนละเท่าไหร่ถึงเป้า
                </Text>
              </View>
              <Text style={styles.goalCardSub}>
                จากต้นทุน {formatCurrency(current)} • คาดโต {r.toFixed(1)}%/ปี • เป้า {formatCurrency(target)}
                {s3 <= 0 ? ' • ยังไม่มีพอร์ต → แบ่งเท่ากัน 3 กลุ่ม' : ''}
              </Text>
              <View style={styles.horizonBox}>
                <View style={styles.horizonRow}>
                  <Text style={[styles.simCol, styles.simHead, { flex: 1 }]}>ถึงเป้าใน</Text>
                  <Text style={[styles.simCol, styles.simHead, { flex: 1.5, textAlign: 'right' }]}>ต้องลง/เดือน</Text>
                  <Text style={[styles.simCol, styles.simHead, { flex: 1.2, textAlign: 'right' }]}>% ของเงินได้</Text>
                </View>
                {rows.map(({ years, monthly }) => {
                  const isSel = years === selected.years;
                  const pctSal = income > 0 && monthly != null ? (monthly / income) * 100 : null;
                  return (
                    <TouchableOpacity key={years} onPress={() => setReqHorizon(years)}>
                      <View style={[styles.horizonRow, isSel && styles.simRowActive]}>
                        <Text style={[styles.simCol, { flex: 1 }, isSel && styles.simActiveText]}>
                          {years} ปี{isSel ? ' ●' : ''}
                        </Text>
                        <Text style={[styles.simCol, { flex: 1.5, textAlign: 'right' }, isSel && styles.simActiveText]}>
                          {monthly == null ? '—' : monthly <= 0 ? 'โตเองถึง' : formatCurrency(monthly)}
                        </Text>
                        <Text style={[styles.simCol, { flex: 1.2, textAlign: 'right' }, isSel && styles.simActiveText]}>
                          {pctSal == null ? '—' : `${pctSal.toFixed(0)}%`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* แบ่งลงแต่ละกลุ่มของกรอบเวลาที่เลือก */}
              <Text style={[styles.horizonHeader, { marginTop: 12 }]}>
                แบ่งลงแต่ละกลุ่ม (เป้า {selected.years} ปี → {selMonthly > 0 ? formatCurrency(selMonthly) : '0'}/เดือน)
              </Text>
              <View style={styles.horizonBox}>
                <View style={styles.horizonRow}>
                  <Text style={[styles.simCol, styles.simHead, { flex: 1.3 }]}>กลุ่ม</Text>
                  <Text style={[styles.simCol, styles.simHead, { flex: 0.8, textAlign: 'right' }]}>สัดส่วน</Text>
                  <Text style={[styles.simCol, styles.simHead, { flex: 1.4, textAlign: 'right' }]}>เงิน/เดือน</Text>
                  <Text style={[styles.simCol, styles.simHead, { flex: 1, textAlign: 'right' }]}>ไม้/เดือน</Text>
                </View>
                {shares.map(({ key, label, share }) => {
                  const amt = selMonthly * share;
                  const trades = perTrade && perTrade > 0 ? Math.round(amt / perTrade) : null;
                  return (
                    <View key={key} style={styles.horizonRow}>
                      <Text style={[styles.simCol, { flex: 1.3 }]}>{label}</Text>
                      <Text style={[styles.simCol, { flex: 0.8, textAlign: 'right' }]}>{(share * 100).toFixed(0)}%</Text>
                      <Text style={[styles.simCol, { flex: 1.4, textAlign: 'right' }]}>{formatCurrency(amt)}</Text>
                      <Text style={[styles.simCol, { flex: 1, textAlign: 'right' }]}>{trades == null ? '—' : `${trades} ไม้`}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.tpSubText}>
                {dcaRounds && dcaRounds > 0
                  ? `แตกเป็นไม้จาก "จำนวนรอบ DCA ${dcaRounds} รอบ/เดือน" (งบ ~${formatCurrency(perTrade || 0)}/ไม้) • แตะแถวบนเพื่อเปลี่ยนกรอบเวลา`
                  : 'ตั้ง "จำนวนรอบ DCA" ที่การ์ดแผนเติมเงิน เพื่อดูจำนวนไม้/เดือน • แตะแถวบนเพื่อเปลี่ยนกรอบเวลา'}
                {' '}• สัดส่วนอิงพอร์ตปัจจุบัน (ต้นทุน)
              </Text>
            </View>
          );
        })()}

        {/* ── การ์ดจำลอง: กันเงินลงทุน 10–80% → ถึงเป้าเร็วแค่ไหน ── */}
        {goalAnalysis && !goalAnalysis.reached && (() => {
          const income = plan?.expectedIncome && plan.expectedIncome > 0 ? plan.expectedIncome : monthSalary;
          const r = goalAnalysis.projectionRatePercent; // % คาดโต (ผู้ใช้ตั้ง หรือพาซจริง)
          if (income <= 0 || r == null || r <= 0) {
            return (
              <View style={styles.goalCard}>
                <Text style={styles.goalCardTitle}>
                  <Ionicons name="flash-outline" size={18} color={COLORS.primary} /> จำลอง % ลงทุน → ถึงเป้าเร็วแค่ไหน
                </Text>
                <Text style={styles.goalCardEmpty}>
                  ต้องมี (1) เงินเดือน/เงินได้ต่อเดือน — ตั้งที่การ์ด "แผนเติมเงิน" และ (2) "คาดโตปีละกี่ %" — ตั้งที่การ์ดเป้าหมาย ก่อน ระบบถึงจะจำลองให้ได้
                </Text>
              </View>
            );
          }
          const rows = INVEST_PERCENT_STEPS.map((pct) => {
            const monthly = income * (pct / 100);
            const years = yearsToReachGoal(goalAnalysis.currentValue, goalAnalysis.targetAmount, r, monthly);
            return { pct, monthly, years };
          });
          const currentPct = plan?.setAsidePercent ?? null;
          // ต่ำกว่า 1 ปี → โชว์เป็นเดือน ; ตั้งแต่ 1 ปีขึ้นไป → โชว์เป็นปี
          const fmtDur = (y: number | null): string => {
            if (y == null) return '—';
            if (y < 1) {
              const m = Math.round(y * 12);
              return m < 1 ? '< 1 เดือน' : `${m} เดือน`;
            }
            return `${y.toFixed(1)} ปี`;
          };
          return (
            <View style={styles.goalCard}>
              <View style={styles.goalCardHeader}>
                <Text style={styles.goalCardTitle}>
                  <Ionicons name="flash-outline" size={18} color={COLORS.primary} /> จำลอง % ลงทุน → ถึงเป้าเร็วแค่ไหน
                </Text>
              </View>
              <Text style={styles.goalCardSub}>
                ฐานเงินได้ {formatCurrency(income)}/เดือน • คาดโต {r.toFixed(1)}%/ปี • เป้า {formatCurrency(goalAnalysis.targetAmount)}
              </Text>
              <View style={styles.horizonBox}>
                <View style={styles.horizonRow}>
                  <Text style={[styles.simCol, styles.simHead, { flex: 1 }]}>กัน %</Text>
                  <Text style={[styles.simCol, styles.simHead, { flex: 1.4, textAlign: 'right' }]}>ลงทุน/เดือน</Text>
                  <Text style={[styles.simCol, styles.simHead, { flex: 1.2, textAlign: 'right' }]}>ถึงเป้าใน</Text>
                </View>
                {rows.map(({ pct, monthly, years }) => {
                  const isCurrent = currentPct != null && pct === currentPct;
                  return (
                    <View key={pct} style={[styles.horizonRow, isCurrent && styles.simRowActive]}>
                      <Text style={[styles.simCol, { flex: 1 }, isCurrent && styles.simActiveText]}>
                        {pct}%{isCurrent ? ' ●' : ''}
                      </Text>
                      <Text style={[styles.simCol, { flex: 1.4, textAlign: 'right' }, isCurrent && styles.simActiveText]}>
                        {formatCurrency(monthly)}
                      </Text>
                      <Text style={[styles.simCol, { flex: 1.2, textAlign: 'right' }, isCurrent && styles.simActiveText]}>
                        {fmtDur(years)}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.tpSubText}>
                กัน % มากขึ้น = ถึงเป้าไวขึ้น แต่เหลือใช้น้อยลง • ● = % ที่ตั้งไว้ตอนนี้
              </Text>
            </View>
          );
        })()}

        {/* ── การ์ดจำลอง: ทำกำไร X%/เดือน → ถึงเป้าเร็วแค่ไหน ── */}
        {goalAnalysis && !goalAnalysis.reached && goalAnalysis.currentValue > 0 && (() => {
          const income = plan?.expectedIncome && plan.expectedIncome > 0 ? plan.expectedIncome : monthSalary;
          const currentPct = plan?.setAsidePercent ?? null;
          // เงินเติมต่อเดือน = กัน % ที่ตั้งไว้ × เงินได้ (ถ้ายังไม่ตั้งแผน = 0 → จำลองแบบทบต้นล้วน)
          const monthlyContribution = currentPct != null && income > 0 ? income * (currentPct / 100) : 0;
          const rows = MONTHLY_RETURN_STEPS.map((mpct) => {
            const annual = monthlyToAnnualPercent(mpct);
            const months = monthsToReachGoal(
              goalAnalysis.currentValue,
              goalAnalysis.targetAmount,
              mpct,
              monthlyContribution
            );
            return { mpct, annual, months };
          });
          const fmtMonths = (n: number | null): string => {
            if (n == null) return '—';
            const m = Math.round(n);
            if (m < 1) return '< 1 เดือน';
            if (m < 12) return `${m} เดือน`;
            const y = n / 12;
            return `${y.toFixed(1)} ปี`;
          };
          return (
            <View style={styles.goalCard}>
              <View style={styles.goalCardHeader}>
                <Text style={styles.goalCardTitle}>
                  <Ionicons name="rocket-outline" size={18} color={COLORS.primary} /> จำลอง % กำไร/เดือน → ถึงเป้าเร็วแค่ไหน
                </Text>
              </View>
              <Text style={styles.goalCardSub}>
                จากต้นทุนที่ลงไปแล้ว {formatCurrency(goalAnalysis.currentValue)}
                {monthlyContribution > 0 ? ` • เติมเพิ่ม ${formatCurrency(monthlyContribution)}/เดือน` : ' • ไม่เติมเงินเพิ่ม (ทบต้นล้วน)'}
                {' '}• เป้า {formatCurrency(goalAnalysis.targetAmount)}
              </Text>
              <View style={styles.horizonBox}>
                <View style={styles.horizonRow}>
                  <Text style={[styles.simCol, styles.simHead, { flex: 1 }]}>กำไร/เดือน</Text>
                  <Text style={[styles.simCol, styles.simHead, { flex: 1.2, textAlign: 'right' }]}>≈ ต่อปี</Text>
                  <Text style={[styles.simCol, styles.simHead, { flex: 1.2, textAlign: 'right' }]}>ถึงเป้าใน</Text>
                </View>
                {rows.map(({ mpct, annual, months }) => (
                  <View key={mpct} style={styles.horizonRow}>
                    <Text style={[styles.simCol, { flex: 1 }]}>{mpct}%</Text>
                    <Text style={[styles.simCol, { flex: 1.2, textAlign: 'right' }]}>{annual.toFixed(0)}%</Text>
                    <Text style={[styles.simCol, { flex: 1.2, textAlign: 'right' }]}>{fmtMonths(months)}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.tpSubText}>
                ทำกำไรต่อเดือนได้มาก = ถึงเป้าไวขึ้นแบบทบต้น • ตัวเลขนี้สมมติทำได้สม่ำเสมอทุกเดือน (จริงมีขึ้นมีลง)
              </Text>
            </View>
          );
        })()}

        {/* ── การ์ดแผนเติมเงิน: กันเงินเดือน % → สะสม − ลงทุนไปแล้ว = เหลือรอลงทุน ── */}
        <View style={styles.goalCard}>
          <View style={styles.goalCardHeader}>
            <Text style={styles.goalCardTitle}>
              <Ionicons name="wallet-outline" size={18} color={COLORS.primary} /> แผนเติมเงินต่อรอบ
            </Text>
            <TouchableOpacity onPress={openPlanModal}>
              <Text style={styles.goalCardEdit}>{plan ? 'แก้ไข' : 'ตั้งแผน'}</Text>
            </TouchableOpacity>
          </View>
          {!plan ? (
            <Text style={styles.goalCardEmpty}>
              ตั้ง "เงินเดือนต่อเดือน" + "กันกี่ %" + จำนวนรอบ → ระบบแบ่งเงินเดือนนี้ให้เห็นครบ: เงินลงทุน / งบใช้จ่าย / เหลือใช้ได้ แบบกันลงทุน "ก่อนใช้" (จ่ายตัวเองก่อน) และคำนวณว่าลงได้ต่อรอบ/ต่อหุ้นเท่าไหร่
            </Text>
          ) : (
            (() => {
              // ฐานที่นิ่ง: เงินเดือนคาดหวังที่ตั้งไว้ (ของเดิมที่ยังไม่ตั้งจะ fallback เป็นเงินเดือนเดือนนี้)
              const baseIncome = plan.expectedIncome && plan.expectedIncome > 0 ? plan.expectedIncome : monthSalary;
              const setAside = baseIncome * (plan.setAsidePercent / 100);   // จ่ายตัวเองก่อน (ไม่หักรายจ่าย)
              const perRound = setAside / plan.dcaRounds;
              const n = Math.max(1, investments.length);
              const perHolding = perRound / n;
              const spendBudget = baseIncome - setAside;      // งบใช้จ่าย = กันลงทุนก่อนแล้วเหลือเท่านี้
              const leftToSpend = spendBudget - monthExpense; // เหลือใช้ได้อีก (< 0 = ใช้เกินงบ)
              return (
                <>
                  <Text style={styles.goalCardSub}>
                    กัน {plan.setAsidePercent}% • {plan.dcaRounds} รอบ/เดือน • จ่ายตัวเองก่อน
                  </Text>
                  {baseIncome === 0 ? (
                    <Text style={styles.tpSubText}>
                      * ยังไม่ได้ตั้งเงินเดือนต่อเดือน — กด "แก้ไข" เพื่อกรอกฐานเงินเดือน ระบบจะคำนวณให้
                    </Text>
                  ) : null}
                  {/* Envelope: แบ่งเงินเดือนนี้เป็น เงินลงทุน / งบใช้จ่าย / เหลือใช้ได้ */}
                  <View style={styles.horizonBox}>
                    <View style={styles.horizonRow}>
                      <Text style={styles.horizonYears}>เงินเดือน (ฐาน)</Text>
                      <Text style={styles.horizonRate}>{formatCurrency(baseIncome)}</Text>
                    </View>
                    <View style={styles.horizonRow}>
                      <Text style={styles.horizonYears}>กันลงทุน ({plan.setAsidePercent}%)</Text>
                      <Text style={styles.horizonRate}>−{formatCurrency(setAside)}</Text>
                    </View>
                    <View style={styles.horizonRow}>
                      <Text style={styles.horizonYears}>งบใช้จ่าย</Text>
                      <Text style={styles.horizonRate}>{formatCurrency(spendBudget)}</Text>
                    </View>
                    <View style={styles.horizonRow}>
                      <Text style={styles.horizonYears}>ใช้ไปแล้วเดือนนี้</Text>
                      <Text style={styles.horizonRate}>−{formatCurrency(monthExpense)}</Text>
                    </View>
                    <View style={[styles.horizonRow, styles.reserveTotalRow]}>
                      <Text style={styles.reserveTotalLabel}>เหลือใช้ได้อีก</Text>
                      <Text style={[styles.reserveTotalValue, leftToSpend < 0 && { color: COLORS.error }]}>
                        {formatCurrency(leftToSpend)}
                      </Text>
                    </View>
                  </View>
                  {/* DCA: เงินลงทุนที่กันไว้ → ทยอยลงกี่ต่อรอบ/ต่อหุ้น */}
                  <View style={styles.wealthBox}>
                    <View style={styles.horizonRow}>
                      <Text style={styles.horizonYears}>ลงได้ต่อรอบ</Text>
                      <Text style={styles.horizonRate}>{formatCurrency(perRound)}</Text>
                    </View>
                    <View style={styles.horizonRow}>
                      <Text style={styles.horizonYears}>ต่อหุ้น/รอบ ({n} ตัว)</Text>
                      <Text style={styles.horizonRate}>{formatCurrency(perHolding)}</Text>
                    </View>
                  </View>
                  {baseIncome > 0 && leftToSpend < 0 && (
                    <Text style={[styles.tpSubText, { color: COLORS.error }]}>
                      ⚠ เดือนนี้ใช้เกินงบไป {formatCurrency(-leftToSpend)} — กระทบเงินที่กันไว้ลงทุน
                    </Text>
                  )}
                </>
              );
            })()
          )}
        </View>

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

        {Object.keys(summary.byType).length > 0 && (
          isDesktop ? (
            <View style={styles.typeWrapContainer}>
              {Object.entries(summary.byType).map(([type, data]) =>
                renderTypeCard(type, data, getTypeIcon(type))
              )}
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.typeScroll}
              contentContainerStyle={styles.typeScrollContent}
            >
              {Object.entries(summary.byType).map(([type, data]) =>
                renderTypeCard(type, data, getTypeIcon(type))
              )}
            </ScrollView>
          )
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

        {shouldSell.length > 0 && (
          <View style={styles.losersCard}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
              <Text style={styles.losersTitle}>ควรขายทำกำไร</Text>
            </View>
            {shouldSell.map(({ inv, pct, target, reached, yearsToTarget }) => (
              <View key={inv.id} style={styles.sellItem}>
                <View style={styles.loserRow}>
                  <Text style={styles.loserName} numberOfLines={1}>{inv.symbol || inv.name}</Text>
                  <Text style={[styles.loserPct, { color: COLORS.success }]}>+{pct.toFixed(1)}%</Text>
                </View>
                <Text style={styles.tpSubText}>
                  เป้า +{target}% • {reached
                    ? 'ถึงเป้าแล้ว'
                    : yearsToTarget != null
                      ? `คาดถึงเป้าในอีก ~${yearsToTarget.toFixed(1)} ปี`
                      : 'ยังประเมินไม่ได้'}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>รายการลงทุน</Text>
          <Text style={styles.tpNote}>* เป้าขายทำกำไรเป็นแนวทางทั่วไปตามประเภทสินทรัพย์</Text>
        </View>
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
            data={investments}
            renderItem={renderInvestmentItem}
            keyExtractor={(item) => item.id}
            numColumns={2}
            key="desktop-2col"
            columnWrapperStyle={styles.flatListRow}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={listHeaderElement}
            ListEmptyComponent={
              <Text style={styles.emptyText}>ยังไม่มีการลงทุน{'\n'}เริ่มเพิ่มการลงทุนของคุณเลย!</Text>
            }
          />
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {listHeaderElement}
            <View style={styles.listcontainer}>
            {investments.length === 0 ? (
              <Text style={styles.emptyText}>ยังไม่มีการลงทุน{'\n'}เริ่มเพิ่มการลงทุนของคุณเลย!</Text>
            ) : (
              investments.map((item) => (
                <View key={item.id}>{renderInvestmentItem({ item })}</View>
              ))
            )}
            </View>
          </ScrollView>
        )}
      </View>

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
              <Ionicons name="wallet-outline" size={18} color={COLORS.primary} /> แผนเติมเงินต่อรอบ
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
            <Text style={styles.modalLabel}>ทยอยลงกี่รอบต่อเดือน</Text>
            <TextInput
              style={styles.modalInput}
              value={planRoundsInput}
              onChangeText={setPlanRoundsInput}
              keyboardType="numeric"
              placeholder="เช่น 10"
              placeholderTextColor={COLORS.textSecondary}
            />
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
  goalVerdict: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
    marginTop: 12,
    lineHeight: 18,
  },
  tpRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    marginTop: -4,
  },
  tpText: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
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
  sellItem: {
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
  tpNote: {
    fontSize: 10,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 2,
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
  simCol: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
  },
  simHead: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  simRowActive: {
    backgroundColor: `${COLORS.primary}12`,
    borderRadius: 6,
    paddingHorizontal: 6,
  },
  simActiveText: {
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
  },
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
  deleteButton: {
    padding: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
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
