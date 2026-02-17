import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TradingOrder, OrderType, OrderStatus, AssetType } from '../types';
import { saveTradingOrder, updateTradingOrder } from '../services/tradingStorage';
import { COLORS } from '../utils/constants';

const FOREX_PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD',
  'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'NZD/USD', 'USD/CHF',
  'XAU/USD', 'XAG/USD', 'GOLD', 'SILVER', 'OIL'
];

type AddTradingOrderScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'AddTradingOrder'
>;
type AddTradingOrderScreenRouteProp = RouteProp<RootStackParamList, 'AddTradingOrder'>;

export default function AddTradingOrderScreen() {
  const navigation = useNavigation<AddTradingOrderScreenNavigationProp>();
  const route = useRoute<AddTradingOrderScreenRouteProp>();
  const { order } = route.params || {};

  const isEditing = !!order;

  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<OrderType>('buy');
  const [assetType, setAssetType] = useState<AssetType>('forex');
  const [entryPrice, setEntryPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [status, setStatus] = useState<OrderStatus>('open');
  const [exitPrice, setExitPrice] = useState('');
  const [fees, setFees] = useState('');
  const [notes, setNotes] = useState('');
  const [lotSize, setLotSize] = useState('0.01');
  const [leverage, setLeverage] = useState('100');
  const [showPairPicker, setShowPairPicker] = useState(false);

  useEffect(() => {
    if (order) {
      setSymbol(order.symbol);
      setName(order.name);
      setType(order.type);
      setAssetType(order.assetType || 'forex');
      setEntryPrice(order.entryPrice.toString());
      setQuantity(order.quantity.toString());
      setStopLoss(order.stopLoss?.toString() || '');
      setTakeProfit(order.takeProfit?.toString() || '');
      setStatus(order.status);
      setExitPrice(order.exitPrice?.toString() || '');
      setFees(order.fees?.toString() || '');
      setNotes(order.notes || '');
      if (order.forexData) {
        setLotSize(order.forexData.lotSize.toString());
        setLeverage(order.forexData.leverage?.toString() || '100');
      }
    }
  }, [order]);

  const calculatePips = (): number | undefined => {
    if (!exitPrice || !entryPrice || assetType !== 'forex') return undefined;

    const entry = parseFloat(entryPrice);
    const exit = parseFloat(exitPrice);
    const isJPYPair = symbol.includes('JPY');
    const pipFactor = isJPYPair ? 0.01 : 0.0001;

    if (type === 'buy') {
      return (exit - entry) / pipFactor;
    } else {
      return (entry - exit) / pipFactor;
    }
  };

  const calculatePnL = (): number | undefined => {
    if (status !== 'closed' || !exitPrice) return undefined;

    const entry = parseFloat(entryPrice);
    const exit = parseFloat(exitPrice);
    const fee = fees ? parseFloat(fees) : 0;

    if (assetType === 'forex') {
      const pips = calculatePips() || 0;
      const lot = parseFloat(lotSize);
      const isJPYPair = symbol.includes('JPY');
      const pipValue = isJPYPair ? (lot * 1000) : (lot * 10);
      return (pips * pipValue) - fee;
    } else {
      const qty = parseFloat(quantity);
      if (type === 'buy') {
        return (exit - entry) * qty - fee;
      } else {
        return (entry - exit) * qty - fee;
      }
    }
  };

  const handleSave = async () => {
    // Validation
    if (!symbol.trim()) {
      if (Platform.OS === 'web') {
        window.alert('กรุณากรอกสัญลักษณ์');
      } else {
        Alert.alert('ข้อผิดพลาด', 'กรุณากรอกสัญลักษณ์');
      }
      return;
    }
    if (!name.trim()) {
      if (Platform.OS === 'web') {
        window.alert('กรุณากรอกชื่อ');
      } else {
        Alert.alert('ข้อผิดพลาด', 'กรุณากรอกชื่อ');
      }
      return;
    }
    if (!entryPrice || parseFloat(entryPrice) <= 0) {
      if (Platform.OS === 'web') {
        window.alert('กรุณากรอกราคาเข้าที่ถูกต้อง');
      } else {
        Alert.alert('ข้อผิดพลาด', 'กรุณากรอกราคาเข้าที่ถูกต้อง');
      }
      return;
    }
    if (!quantity || parseFloat(quantity) <= 0) {
      if (Platform.OS === 'web') {
        window.alert('กรุณากรอกจำนวนที่ถูกต้อง');
      } else {
        Alert.alert('ข้อผิดพลาด', 'กรุณากรอกจำนวนที่ถูกต้อง');
      }
      return;
    }

    if (status === 'closed' && (!exitPrice || parseFloat(exitPrice) <= 0)) {
      if (Platform.OS === 'web') {
        window.alert('กรุณากรอกราคาออกสำหรับออเดอร์ที่ปิดแล้ว');
      } else {
        Alert.alert('ข้อผิดพลาด', 'กรุณากรอกราคาออกสำหรับออเดอร์ที่ปิดแล้ว');
      }
      return;
    }

    try {
      const pnl = calculatePnL();
      const pips = calculatePips();

      const orderData: TradingOrder = {
        id: order?.id || Date.now().toString(),
        symbol: symbol.trim().toUpperCase(),
        name: name.trim(),
        type,
        assetType,
        entryPrice: parseFloat(entryPrice),
        quantity: assetType === 'forex' ? parseFloat(lotSize) : parseFloat(quantity),
        stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
        takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
        entryDate: order?.entryDate || new Date().toISOString(),
        exitDate: status === 'closed' ? new Date().toISOString() : undefined,
        exitPrice: exitPrice ? parseFloat(exitPrice) : undefined,
        status,
        fees: fees ? parseFloat(fees) : undefined,
        notes: notes.trim() || undefined,
        pnl,
        forexData: assetType === 'forex' ? {
          pair: symbol,
          lotSize: parseFloat(lotSize),
          leverage: leverage ? parseInt(leverage) : undefined,
          pips,
        } : undefined,
      };

      if (isEditing) {
        await updateTradingOrder(orderData);
        if (Platform.OS === 'web') {
          window.alert('แก้ไขออเดอร์เรียบร้อย');
        } else {
          Alert.alert('สำเร็จ', 'แก้ไขออเดอร์เรียบร้อย');
        }
      } else {
        await saveTradingOrder(orderData);
        if (Platform.OS === 'web') {
          window.alert('บันทึกออเดอร์เรียบร้อย');
        } else {
          Alert.alert('สำเร็จ', 'บันทึกออเดอร์เรียบร้อย');
        }
      }
      navigation.goBack();
    } catch (error) {
      if (Platform.OS === 'web') {
        window.alert('ไม่สามารถบันทึกข้อมูลได้');
      } else {
        Alert.alert('ข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้');
      }
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.label}>ประเภทสินทรัพย์</Text>
        <View style={styles.assetTypeContainer}>
          {(['forex', 'crypto', 'stock', 'other'] as AssetType[]).map((asset) => (
            <TouchableOpacity
              key={asset}
              style={[
                styles.assetTypeButton,
                assetType === asset && styles.assetTypeButtonActive,
              ]}
              onPress={() => setAssetType(asset)}
            >
              <Text
                style={[
                  styles.assetTypeText,
                  assetType === asset && styles.assetTypeTextActive,
                ]}
              >
                {asset === 'forex' ? 'Forex' :
                 asset === 'crypto' ? 'Crypto' :
                 asset === 'stock' ? 'หุ้น' : 'อื่นๆ'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>ประเภท</Text>
        <View style={styles.typeContainer}>
          <TouchableOpacity
            style={[styles.typeButton, type === 'buy' && styles.buyButton]}
            onPress={() => setType('buy')}
          >
            <Ionicons
              name="arrow-up"
              size={20}
              color={type === 'buy' ? '#ffffff' : COLORS.success}
            />
            <Text style={[styles.typeText, type === 'buy' && styles.typeTextSelected]}>
              BUY
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeButton, type === 'sell' && styles.sellButton]}
            onPress={() => setType('sell')}
          >
            <Ionicons
              name="arrow-down"
              size={20}
              color={type === 'sell' ? '#ffffff' : COLORS.error}
            />
            <Text style={[styles.typeText, type === 'sell' && styles.typeTextSelected]}>
              SELL
            </Text>
          </TouchableOpacity>
        </View>

        {assetType === 'forex' ? (
          <>
            <Text style={styles.label}>คู่สกุลเงิน (Forex Pair) *</Text>
            <TouchableOpacity
              style={styles.pairPickerButton}
              onPress={() => setShowPairPicker(!showPairPicker)}
            >
              <Text style={styles.pairPickerText}>
                {symbol || 'เลือกคู่สกุลเงิน'}
              </Text>
              <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
            
            {showPairPicker && (
              <ScrollView style={styles.pairList} nestedScrollEnabled={true}>
                {FOREX_PAIRS.map((pair) => (
                  <TouchableOpacity
                    key={pair}
                    style={styles.pairItem}
                    onPress={() => {
                      setSymbol(pair);
                      setName(pair);
                      setShowPairPicker(false);
                    }}
                  >
                    <Text style={styles.pairItemText}>{pair}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        ) : (
          <>
            <Text style={styles.label}>สัญลักษณ์ *</Text>
            <TextInput
              style={styles.input}
              value={symbol}
              onChangeText={setSymbol}
              placeholder="เช่น BTC, AAPL, GOLD"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="characters"
            />
          </>
        )}

        {assetType !== 'forex' && (
          <>
            <Text style={styles.label}>ชื่อเต็ม *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="เช่น Bitcoin, Apple Inc."
              placeholderTextColor={COLORS.textSecondary}
            />
          </>
        )}

        <View style={styles.row}>
          <View style={styles.halfWidth}>
            <Text style={styles.label}>ราคาเข้า (บาท) *</Text>
            <TextInput
              style={styles.input}
              value={entryPrice}
              onChangeText={setEntryPrice}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          <View style={styles.halfWidth}>
            <Text style={styles.label}>
              {assetType === 'forex' ? 'Lot Size *' : 'จำนวน *'}
            </Text>
            <TextInput
              style={styles.input}
              value={assetType === 'forex' ? lotSize : quantity}
              onChangeText={assetType === 'forex' ? setLotSize : setQuantity}
              keyboardType="decimal-pad"
              placeholder={assetType === 'forex' ? '0.01' : '0'}
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>
        </View>

        {assetType === 'forex' && (
          <View style={styles.row}>
            <View style={styles.halfWidth}>
              <Text style={styles.label}>Leverage</Text>
              <TextInput
                style={styles.input}
                value={leverage}
                onChangeText={setLeverage}
                keyboardType="numeric"
                placeholder="100"
                placeholderTextColor={COLORS.textSecondary}
              />
              <Text style={styles.hintText}>อัตราส่วน 1:{leverage || '100'}</Text>
            </View>
            <View style={styles.halfWidth}>
              <Text style={styles.label}>มูลค่าที่ควบคุม</Text>
              <Text style={styles.leverageValue}>
                {lotSize && entryPrice ? 
                  `฿${(parseFloat(lotSize) * 100000 * parseFloat(entryPrice)).toLocaleString('th-TH', { maximumFractionDigits: 0 })}` 
                  : '฿0'}
              </Text>
              <Text style={styles.hintText}>Lot × 100,000 × ราคา</Text>
            </View>
          </View>
        )}

        <View style={styles.row}>
          <View style={styles.halfWidth}>
            <Text style={styles.label}>Stop Loss (บาท)</Text>
            <TextInput
              style={styles.input}
              value={stopLoss}
              onChangeText={setStopLoss}
              keyboardType="decimal-pad"
              placeholder="ไม่บังคับ"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          <View style={styles.halfWidth}>
            <Text style={styles.label}>Take Profit (บาท)</Text>
            <TextInput
              style={styles.input}
              value={takeProfit}
              onChangeText={setTakeProfit}
              keyboardType="decimal-pad"
              placeholder="ไม่บังคับ"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>
        </View>

        <Text style={styles.label}>สถานะ</Text>
        <View style={styles.statusContainer}>
          {(['open', 'closed', 'cancelled'] as OrderStatus[]).map((statusType) => (
            <TouchableOpacity
              key={statusType}
              style={[
                styles.statusButton,
                status === statusType && styles.statusButtonSelected,
              ]}
              onPress={() => setStatus(statusType)}
            >
              <Text
                style={[
                  styles.statusText,
                  status === statusType && styles.statusTextSelected,
                ]}
              >
                {statusType === 'open' ? 'เปิดอยู่' : statusType === 'closed' ? 'ปิดแล้ว' : 'ยกเลิก'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {status === 'closed' && (
          <View style={styles.closedSection}>
            <Text style={styles.label}>ราคาออก (บาท) *</Text>
            <TextInput
              style={styles.input}
              value={exitPrice}
              onChangeText={setExitPrice}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={COLORS.textSecondary}
            />

            {exitPrice && entryPrice && (assetType === 'forex' ? lotSize : quantity) && (
              <View style={styles.pnlPreview}>
                {assetType === 'forex' && (
                  <View style={styles.pipsInfo}>
                    <Text style={styles.pipsLabel}>Pips:</Text>
                    <Text style={[
                      styles.pipsValue,
                      (calculatePips() || 0) >= 0 ? styles.profitPositive : styles.profitNegative,
                    ]}>
                      {(calculatePips() || 0) >= 0 ? '+' : ''}{(calculatePips() || 0).toFixed(1)}
                    </Text>
                  </View>
                )}
                <Text style={styles.pnlLabel}>กำไร/ขาดทุนโดยประมาณ:</Text>
                <Text
                  style={[
                    styles.pnlValue,
                    (calculatePnL() || 0) >= 0 ? styles.profitPositive : styles.profitNegative,
                  ]}
                >
                  {(calculatePnL() || 0) >= 0 ? '+' : ''}
                  ฿{(calculatePnL() || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            )}
          </View>
        )}

        <Text style={styles.label}>ค่าธรรมเนียม (บาท)</Text>
        <TextInput
          style={styles.input}
          value={fees}
          onChangeText={setFees}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={COLORS.textSecondary}
        />

        <Text style={styles.label}>หมายเหตุ</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="บันทึกเพิ่มเติม (ถ้ามี)"
          placeholderTextColor={COLORS.textSecondary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>
            {isEditing ? 'บันทึกการแก้ไข' : 'บันทึก'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 20,
  },
  label: {
    fontSize: 10,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
    marginBottom: 12,
    marginTop: 24,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    padding: 16,
    fontSize: 16,
    fontFamily: 'NotoSansThai_300Light',
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  typeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 12,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
  },
  buyButton: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  sellButton: {
    backgroundColor: COLORS.error,
    borderColor: COLORS.error,
  },
  typeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  typeTextSelected: {
    color: '#ffffff',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  statusContainer: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 12,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 0,
    alignItems: 'center',
  },
  statusButtonSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
  },
  statusTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  closedSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pnlPreview: {
    marginTop: 16,
    padding: 12,
    backgroundColor: COLORS.background,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  pnlLabel: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  pnlValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  profitPositive: {
    color: COLORS.success,
  },
  profitNegative: {
    color: COLORS.error,
  },
  assetTypeContainer: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 12,
  },
  assetTypeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 0,
    alignItems: 'center',
  },
  assetTypeButtonActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  assetTypeText: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.text,
  },
  assetTypeTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  pairPickerButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pairPickerText: {
    fontSize: 16,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.text,
  },
  pairList: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
    maxHeight: 200,
  },
  pairItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  pairItemText: {
    fontSize: 16,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
  },
  hintText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  leverageValue: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
    marginTop: 8,
  },
  pipsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  pipsLabel: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  pipsValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 0,
    padding: 18,
    alignItems: 'center',
    marginTop: 40,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
