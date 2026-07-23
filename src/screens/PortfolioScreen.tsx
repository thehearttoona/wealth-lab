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
import { formatCurrency, formatCurrencyWithType, convertToTHB, COLORS } from '../utils/constants';
import { updateInvestmentPrice } from '../services/priceApi';
import { analyzePortfolioGoal, PortfolioGoal, PortfolioGoalAnalysis } from '../utils/investmentGoals';
import { getPortfolioGoal, savePortfolioGoal, deletePortfolioGoal } from '../services/portfolioGoalStorage';
import { getTakeProfitSuggestion } from '../utils/takeProfit';
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
      if (Platform.OS === 'web') {
        window.alert('เกิดข้อผิดพลาดในการอัปเดตราคา');
      } else {
        Alert.alert('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการอัปเดตราคา');
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
                <Text style={styles.investmentSymbol}>{item.symbol}</Text>
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
  const goalAnalysis: PortfolioGoalAnalysis | null = goal
    ? analyzePortfolioGoal(goal, summary.totalValue, summary.totalCost, portfolioStartDate)
    : null;

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
                  ถ้าขายตอนนี้ {formatCurrency(goalAnalysis.currentValue)}
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
            <Text style={styles.modalTitle}>🎯 เป้าหมายพอร์ตรวม</Text>
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 0,
    padding: 16,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_400Regular',
    color: '#ffffff',
    opacity: 0.9,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: 'NotoSansThai_600SemiBold',
    color: '#ffffff',
    marginBottom: 8,
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
    marginBottom: 8,
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
    marginVertical: 16,
  },
  typeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    padding: 16,
    width: 160,
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
  },
  investmentItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 0,
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
