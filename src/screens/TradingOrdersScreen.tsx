import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TradingOrder } from '../types';
import {
  getTradingOrders,
  deleteTradingOrder,
  getOrderStatistics,
} from '../services/tradingStorage';
import { formatCurrency, COLORS } from '../utils/constants';
import { useResponsive } from '../utils/responsive';

type TradingOrdersScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'TradingOrders'
>;

export default function TradingOrdersScreen() {
  const navigation = useNavigation<TradingOrdersScreenNavigationProp>();
  const { isDesktop } = useResponsive();
  const [orders, setOrders] = useState<TradingOrder[]>([]);
  const [stats, setStats] = useState({
    totalOrders: 0,
    openOrders: 0,
    closedOrders: 0,
    totalPnL: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    openValue: 0,
  });
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');

  const loadData = async () => {
    const allOrders = await getTradingOrders();
    setOrders(allOrders);
    const statistics = await getOrderStatistics();
    setStats(statistics);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const handleDelete = (id: string, symbol: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`คุณต้องการลบออเดอร์ ${symbol} ใช่หรือไม่?`);
      if (confirmed) {
        deleteTradingOrder(id).then(() => loadData());
      }
    } else {
      Alert.alert('ลบออเดอร์', `คุณต้องการลบออเดอร์ ${symbol} ใช่หรือไม่?`, [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: async () => {
            await deleteTradingOrder(id);
            loadData();
          },
        },
      ]);
    }
  };

  const handleEdit = (order: TradingOrder) => {
    navigation.navigate('AddTradingOrder', { order });
  };

  const filteredOrders = orders.filter((order) => {
    if (filter === 'all') return true;
    return order.status === filter;
  });

  const renderOrderItem = ({ item }: { item: TradingOrder }) => {
    const isProfitable = (item.pnl || 0) > 0;
    const isOpen = item.status === 'open';
    const isForex = item.assetType === 'forex';

    return (
      <View style={styles.orderItem}>
        <TouchableOpacity
          style={styles.orderContent}
          onPress={() => handleEdit(item)}
        >
          <View style={styles.orderLeft}>
            <View style={styles.orderHeader}>
              <View style={styles.symbolContainer}>
                <Text style={styles.orderSymbol}>{item.symbol}</Text>
                {isForex && (
                  <View style={styles.forexBadge}>
                    <Text style={styles.forexBadgeText}>FOREX</Text>
                  </View>
                )}
                <View style={[
                  styles.typeBadge,
                  item.type === 'buy' ? styles.buyBadge : styles.sellBadge
                ]}>
                  <Text style={styles.typeBadgeText}>
                    {item.type === 'buy' ? 'BUY' : 'SELL'}
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  item.status === 'open' ? styles.openBadge :
                  item.status === 'closed' ? styles.closedBadge : styles.cancelledBadge
                ]}>
                  <Text style={styles.statusBadgeText}>
                    {item.status === 'open' ? 'OPEN' : item.status === 'closed' ? 'CLOSED' : 'CANCELLED'}
                  </Text>
                </View>
              </View>
              <Text style={styles.orderName}>{item.name}</Text>
            </View>
            <View style={styles.orderDetails}>
              <Text style={styles.orderInfo}>
                {isForex ? `${item.forexData?.lotSize} Lot` : `${item.quantity} หน่วย`} @ {formatCurrency(item.entryPrice)}
              </Text>
              {isForex && item.forexData?.leverage && (
                <Text style={styles.orderInfo}>
                  Leverage: 1:{item.forexData.leverage}
                </Text>
              )}
              {item.stopLoss && (
                <Text style={styles.orderInfo}>
                  SL: {formatCurrency(item.stopLoss)}
                </Text>
              )}
              {item.takeProfit && (
                <Text style={styles.orderInfo}>
                  TP: {formatCurrency(item.takeProfit)}
                </Text>
              )}
              {isForex && item.forexData?.pips && item.status === 'closed' && (
                <Text style={[
                  styles.orderPips,
                  isProfitable ? styles.profitPositive : styles.profitNegative
                ]}>
                  {isProfitable ? '+' : ''}{item.forexData.pips.toFixed(1)} pips
                </Text>
              )}
            </View>
          </View>
          <View style={styles.orderRight}>
            {isOpen ? (
              <>
                <Text style={styles.orderValue}>
                  {formatCurrency(item.entryPrice * item.quantity)}
                </Text>
                <Text style={styles.orderDate}>
                  {new Date(item.entryDate).toLocaleDateString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
              </>
            ) : (
              <>
                <Text style={[
                  styles.orderPnL,
                  isProfitable ? styles.profitPositive : styles.profitNegative
                ]}>
                  {isProfitable ? '+' : ''}{formatCurrency(item.pnl || 0)}
                </Text>
                {item.exitPrice && (
                  <Text style={styles.exitPrice}>
                    Exit: {formatCurrency(item.exitPrice)}
                  </Text>
                )}
              </>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDelete(item.id, item.symbol)}
        >
          <Ionicons name="trash-outline" size={14} color={COLORS.textSecondary} />
          <Text style={styles.deleteButtonText}> ลบ</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, isDesktop && { paddingTop: 20 }]}>
        <View style={isDesktop ? styles.desktopInnerContent : undefined}>
          <View style={styles.headerTitleContainer}>
            <Ionicons name="trending-up" size={24} color="#ffffff" />
            <Text style={styles.headerTitle}> Trading Orders</Text>
          </View>

          <View style={[
            styles.statsContainer,
            isDesktop && styles.statsContainerDesktop,
          ]}>
            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>กำไร/ขาดทุน</Text>
                <Text style={[
                  styles.statValue,
                  stats.totalPnL >= 0 ? styles.profitPositive : styles.profitNegative
                ]}>
                  {stats.totalPnL >= 0 ? '+' : ''}{formatCurrency(stats.totalPnL)}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Win Rate</Text>
                <Text style={styles.statValue}>{stats.winRate.toFixed(1)}%</Text>
              </View>
            </View>
            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>เปิดอยู่</Text>
                <Text style={styles.statValue}>{stats.openOrders}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>ปิดแล้ว</Text>
                <Text style={styles.statValue}>{stats.closedOrders}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>มูลค่าเปิด</Text>
                <Text style={styles.statValue}>{formatCurrency(stats.openValue)}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={isDesktop ? styles.desktopInnerContent : undefined}>
        <View style={[
          styles.filterContainer,
          isDesktop && { maxWidth: 500, alignSelf: 'center' as const, width: '100%' as unknown as number },
        ]}>
          {(['all', 'open', 'closed'] as const).map((filterType) => (
            <TouchableOpacity
              key={filterType}
              style={[
                styles.filterButton,
                filter === filterType && styles.filterButtonActive,
              ]}
              onPress={() => setFilter(filterType)}
            >
              <Text style={[
                styles.filterButtonText,
                filter === filterType && styles.filterButtonTextActive,
              ]}>
                {filterType === 'all' ? 'ทั้งหมด' : filterType === 'open' ? 'เปิดอยู่' : 'ปิดแล้ว'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.addButton,
            isDesktop && { maxWidth: 400, alignSelf: 'center' as const, width: '100%' as unknown as number },
          ]}
          onPress={() => navigation.navigate('AddTradingOrder', {})}
        >
          <Ionicons name="add-circle" size={18} color="#ffffff" />
          <Text style={styles.addButtonText}> เพิ่มออเดอร์ใหม่</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredOrders}
        renderItem={renderOrderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          isDesktop && {
            maxWidth: 1000,
            alignSelf: 'center' as const,
            width: '100%' as unknown as number,
            paddingHorizontal: 24,
          },
        ]}
        ListEmptyComponent={
          <Text style={styles.emptyText}>ยังไม่มีออเดอร์</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    padding: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  desktopInnerContent: {
    maxWidth: 1000,
    alignSelf: 'center',
    width: '100%',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  statsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 0,
    padding: 16,
    gap: 12,
  },
  statsContainerDesktop: {
    flexDirection: 'row',
    gap: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    flex: 1,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: '#ffffff',
    opacity: 0.8,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 0,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  addButton: {
    margin: 16,
    marginBottom: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 0,
    padding: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  orderItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  orderContent: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderLeft: {
    flex: 1,
  },
  orderHeader: {
    marginBottom: 8,
  },
  symbolContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  orderSymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 0,
  },
  buyBadge: {
    backgroundColor: COLORS.success,
  },
  sellBadge: {
    backgroundColor: COLORS.error,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 0,
  },
  openBadge: {
    backgroundColor: '#42A5F5',
  },
  closedBadge: {
    backgroundColor: '#607D8B',
  },
  cancelledBadge: {
    backgroundColor: '#FFA726',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  orderName: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  orderDetails: {
    gap: 4,
  },
  orderInfo: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  orderRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginLeft: 16,
  },
  orderValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  orderDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  orderPnL: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  exitPrice: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  profitPositive: {
    color: COLORS.success,
  },
  profitNegative: {
    color: COLORS.error,
  },
  forexBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 0,
    backgroundColor: '#FFA726',
  },
  forexBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  orderPips: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  deleteButton: {
    padding: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.background,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 16,
    marginTop: 32,
  },
});
