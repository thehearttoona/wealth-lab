import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../utils/constants';
import { useResponsive } from '../utils/responsive';
import mt5Api from '../services/mt5Api';
import { getMT5Settings } from '../services/mt5Storage';

const QUICK_ORDER_SETTINGS_KEY = '@quick_order_settings';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface DCAEntry {
  id: string;
  price: string;
  quantity: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function fmt(value: number, decimals = 2): string {
  return value.toLocaleString('th-TH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function parseNum(s: string): number {
  const n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

// ─────────────────────────────────────────────
// Section Header
// ─────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={18} color={COLORS.primary} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// Result Row
// ─────────────────────────────────────────────

function ResultRow({
  label,
  value,
  valueColor,
  subValue,
}: {
  label: string;
  value: string;
  valueColor?: string;
  subValue?: string;
}) {
  return (
    <View style={styles.resultRow}>
      <Text style={styles.resultLabel}>{label}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.resultValue, valueColor ? { color: valueColor } : undefined]}>
          {value}
        </Text>
        {subValue ? <Text style={styles.resultSubValue}>{subValue}</Text> : null}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// TP/SL Calculator
// ─────────────────────────────────────────────

function TPSLCalculator() {
  const [direction, setDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [entryPrice, setEntryPrice] = useState('');
  const [tpPoints, setTpPoints] = useState('1000');
  const [slPoints, setSlPoints] = useState('1000');
  const [pointValue, setPointValue] = useState('0.01');

  const entry = parseNum(entryPrice);
  const tp = parseNum(tpPoints);
  const sl = parseNum(slPoints);
  const pv = parseFloat(pointValue) || 0.01;

  const hasEntry = entry > 0;

  const tpPrice = hasEntry
    ? direction === 'BUY'
      ? entry + tp * pv
      : entry - tp * pv
    : null;

  const slPrice = hasEntry
    ? direction === 'BUY'
      ? entry - sl * pv
      : entry + sl * pv
    : null;

  const tpAmount = tpPrice !== null ? Math.abs(tpPrice - entry) : null;
  const slAmount = slPrice !== null ? Math.abs(slPrice - entry) : null;
  const rrRatio =
    tpAmount && slAmount && slAmount > 0 ? (tpAmount / slAmount).toFixed(2) : null;

  const decimals = pv < 0.01 ? 5 : pv < 0.1 ? 4 : pv < 1 ? 2 : 2;

  return (
    <View style={styles.card}>
      <SectionHeader icon="analytics-outline" title="TP / SL Calculator" />

      {/* Direction */}
      <View style={styles.directionRow}>
        {(['BUY', 'SELL'] as const).map((d) => (
          <TouchableOpacity
            key={d}
            style={[
              styles.directionBtn,
              direction === d && (d === 'BUY' ? styles.directionBuyActive : styles.directionSellActive),
            ]}
            onPress={() => setDirection(d)}
          >
            <Text
              style={[
                styles.directionBtnText,
                direction === d && styles.directionBtnTextActive,
              ]}
            >
              {d === 'BUY' ? '▲ BUY' : '▼ SELL'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Inputs */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>ราคา Entry</Text>
        <TextInput
          style={styles.input}
          value={entryPrice}
          onChangeText={setEntryPrice}
          placeholder="0.00"
          placeholderTextColor={COLORS.textSecondary}
          keyboardType="decimal-pad"
        />
      </View>

      <View style={styles.inputRow2}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.inputLabel}>TP (จุด)</Text>
          <TextInput
            style={styles.input}
            value={tpPoints}
            onChangeText={setTpPoints}
            placeholder="1000"
            placeholderTextColor={COLORS.textSecondary}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.inputLabel}>SL (จุด)</Text>
          <TextInput
            style={styles.input}
            value={slPoints}
            onChangeText={setSlPoints}
            placeholder="1000"
            placeholderTextColor={COLORS.textSecondary}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>
          มูลค่า 1 จุด{' '}
          <Text style={styles.inputHint}>(0.01 = XAUUSD, 0.0001 = Forex, 1 = Crypto)</Text>
        </Text>
        <TextInput
          style={styles.input}
          value={pointValue}
          onChangeText={setPointValue}
          placeholder="0.01"
          placeholderTextColor={COLORS.textSecondary}
          keyboardType="decimal-pad"
        />
      </View>

      {/* Results */}
      {hasEntry && tpPrice !== null && slPrice !== null ? (
        <View style={styles.resultBoxVertical}>
          <ResultRow
            label={direction === 'BUY' ? 'Take Profit (TP)' : 'Take Profit (TP)'}
            value={fmt(tpPrice, decimals)}
            valueColor={COLORS.success}
            subValue={`+${fmt(tpAmount!, decimals)}`}
          />
          <View style={styles.divider} />
          <ResultRow
            label="Stop Loss (SL)"
            value={fmt(slPrice, decimals)}
            valueColor={COLORS.error}
            subValue={`-${fmt(slAmount!, decimals)}`}
          />
          {rrRatio && (
            <>
              <View style={styles.divider} />
              <ResultRow
                label="Risk / Reward"
                value={`1 : ${rrRatio}`}
                valueColor={parseFloat(rrRatio) >= 1.5 ? COLORS.success : COLORS.textSecondary}
              />
            </>
          )}
        </View>
      ) : (
        <View style={styles.emptyResult}>
          <Text style={styles.emptyResultText}>ใส่ราคา Entry เพื่อคำนวณ</Text>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────
// DCA Average Price Calculator
// ─────────────────────────────────────────────

function DCACalculator() {
  const [entries, setEntries] = useState<DCAEntry[]>([
    { id: '1', price: '', quantity: '' },
    { id: '2', price: '', quantity: '' },
  ]);

  const addEntry = useCallback(() => {
    setEntries((prev) => [...prev, { id: Date.now().toString(), price: '', quantity: '' }]);
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id).length >= 2
      ? prev.filter((e) => e.id !== id)
      : prev
    );
  }, []);

  const updateEntry = useCallback((id: string, field: 'price' | 'quantity', value: string) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  }, []);

  // Calculations
  const validEntries = entries.filter((e) => parseNum(e.price) > 0 && parseNum(e.quantity) > 0);
  const totalCost = validEntries.reduce((s, e) => s + parseNum(e.price) * parseNum(e.quantity), 0);
  const totalQty = validEntries.reduce((s, e) => s + parseNum(e.quantity), 0);
  const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;

  return (
    <View style={styles.card}>
      <SectionHeader icon="layers-outline" title="คำนวณราคาเฉลี่ย (DCA)" />

      {/* Column Headers */}
      <View style={styles.dcaHeader}>
        <Text style={[styles.dcaHeaderText, { flex: 1.2 }]}>ราคาซื้อ</Text>
        <Text style={[styles.dcaHeaderText, { flex: 1 }]}>จำนวน / Lot</Text>
        <View style={{ width: 32 }} />
      </View>

      {entries.map((entry, index) => (
        <View key={entry.id} style={styles.dcaEntryRow}>
          <Text style={styles.dcaIndex}>{index + 1}</Text>
          <TextInput
            style={[styles.input, { flex: 1.2 }]}
            value={entry.price}
            onChangeText={(v) => updateEntry(entry.id, 'price', v)}
            placeholder="0.00"
            placeholderTextColor={COLORS.textSecondary}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[styles.input, { flex: 1, marginLeft: 8 }]}
            value={entry.quantity}
            onChangeText={(v) => updateEntry(entry.id, 'quantity', v)}
            placeholder="0.00"
            placeholderTextColor={COLORS.textSecondary}
            keyboardType="decimal-pad"
          />
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => removeEntry(entry.id)}
            disabled={entries.length <= 2}
          >
            <Ionicons
              name="close-circle"
              size={20}
              color={entries.length <= 2 ? COLORS.border : COLORS.error}
            />
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={styles.addEntryBtn} onPress={addEntry}>
        <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
        <Text style={styles.addEntryText}>เพิ่มรายการ</Text>
      </TouchableOpacity>

      {/* Results */}
      {validEntries.length >= 1 ? (
        <View style={styles.resultBoxVertical}>
          <ResultRow label="จำนวนรวม" value={fmt(totalQty, 4)} />
          <View style={styles.divider} />
          <ResultRow label="ต้นทุนรวม" value={`฿${fmt(totalCost, 2)}`} />
          <View style={styles.divider} />
          <ResultRow
            label="ราคาเฉลี่ย"
            value={fmt(avgPrice, 5)}
            valueColor={COLORS.primary}
          />
          {validEntries.length >= 2 && (
            <>
              <View style={styles.divider} />
              {validEntries.map((e, i) => {
                const p = parseNum(e.price);
                const diff = p - avgPrice;
                const pct = avgPrice > 0 ? (diff / avgPrice) * 100 : 0;
                return (
                  <ResultRow
                    key={e.id}
                    label={`รายการ ${i + 1}`}
                    value={fmt(p, 5)}
                    valueColor={diff >= 0 ? COLORS.error : COLORS.success}
                    subValue={`${diff >= 0 ? '+' : ''}${fmt(diff, 5)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`}
                  />
                );
              })}
            </>
          )}
        </View>
      ) : (
        <View style={styles.emptyResult}>
          <Text style={styles.emptyResultText}>ใส่ราคาและจำนวนเพื่อคำนวณ</Text>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────
// Quick Order
// ─────────────────────────────────────────────

interface QuickOrderSettings {
  symbol: string;
  lot: string;
  tpPoints: string;
  slPoints: string;
  magic: string;
}

const DEFAULT_SETTINGS: QuickOrderSettings = {
  symbol: 'XAUUSD',
  lot: '0.01',
  tpPoints: '1000',
  slPoints: '1000',
  magic: '888888',
};

function QuickOrderPanel() {
  const [settings, setSettings] = useState<QuickOrderSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(QUICK_ORDER_SETTINGS_KEY).then((raw) => {
      if (raw) setSettings(JSON.parse(raw));
    });
  }, []);

  const saveSettings = useCallback((updated: QuickOrderSettings) => {
    setSettings(updated);
    AsyncStorage.setItem(QUICK_ORDER_SETTINGS_KEY, JSON.stringify(updated));
  }, []);

  const update = useCallback(
    (field: keyof QuickOrderSettings, value: string) => {
      saveSettings({ ...settings, [field]: value });
    },
    [settings, saveSettings]
  );

  const handleOrder = useCallback(
    async (direction: 'BUY' | 'SELL') => {
      const lot = parseFloat(settings.lot);
      const tpPoints = parseFloat(settings.tpPoints);
      const slPoints = parseFloat(settings.slPoints);
      const magic = parseInt(settings.magic, 10);

      if (!settings.symbol.trim() || isNaN(lot) || lot <= 0) {
        Alert.alert('ข้อมูลไม่ครบ', 'กรุณาใส่ Symbol และ Lot ให้ถูกต้อง');
        return;
      }

      Alert.alert(
        `ยืนยัน ${direction} ${settings.symbol}`,
        `Lot: ${lot}\nTP: ${tpPoints} จุด\nSL: ${slPoints} จุด`,
        [
          { text: 'ยกเลิก', style: 'cancel' },
          {
            text: `${direction === 'BUY' ? '▲' : '▼'} ยืนยัน`,
            style: direction === 'BUY' ? 'default' : 'destructive',
            onPress: async () => {
              setIsLoading(true);
              setLastResult(null);
              try {
                const mt5Settings = await getMT5Settings();
                if (mt5Settings?.backendUrl) {
                  mt5Api.setBaseUrl(mt5Settings.backendUrl);
                }
                const result = await mt5Api.openOrder({
                  symbol: settings.symbol.trim().toUpperCase(),
                  direction,
                  lot,
                  tpPoints,
                  slPoints,
                  magic,
                });
                setLastResult({ success: result.success, message: result.message });
              } catch (e: any) {
                setLastResult({ success: false, message: e.message ?? 'Error' });
              } finally {
                setIsLoading(false);
              }
            },
          },
        ]
      );
    },
    [settings]
  );

  return (
    <View style={styles.card}>
      <SectionHeader icon="flash-outline" title="Quick Order → MT5" />

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Symbol</Text>
        <TextInput
          style={styles.input}
          value={settings.symbol}
          onChangeText={(v) => update('symbol', v.toUpperCase())}
          placeholder="XAUUSD"
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="characters"
        />
      </View>

      <View style={styles.inputRow2}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.inputLabel}>Lot Size</Text>
          <TextInput
            style={styles.input}
            value={settings.lot}
            onChangeText={(v) => update('lot', v)}
            placeholder="0.01"
            placeholderTextColor={COLORS.textSecondary}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.inputLabel}>Magic</Text>
          <TextInput
            style={styles.input}
            value={settings.magic}
            onChangeText={(v) => update('magic', v)}
            placeholder="888888"
            placeholderTextColor={COLORS.textSecondary}
            keyboardType="number-pad"
          />
        </View>
      </View>

      <View style={styles.inputRow2}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.inputLabel}>TP (จุด)</Text>
          <TextInput
            style={styles.input}
            value={settings.tpPoints}
            onChangeText={(v) => update('tpPoints', v)}
            placeholder="1000"
            placeholderTextColor={COLORS.textSecondary}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.inputLabel}>SL (จุด)</Text>
          <TextInput
            style={styles.input}
            value={settings.slPoints}
            onChangeText={(v) => update('slPoints', v)}
            placeholder="1000"
            placeholderTextColor={COLORS.textSecondary}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      {/* BUY / SELL Buttons */}
      <View style={styles.orderBtnRow}>
        <TouchableOpacity
          style={[styles.orderBtn, styles.orderBtnBuy, isLoading && styles.orderBtnDisabled]}
          onPress={() => handleOrder('BUY')}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="trending-up" size={18} color="#fff" />
              <Text style={styles.orderBtnText}>BUY</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.orderBtn, styles.orderBtnSell, isLoading && styles.orderBtnDisabled]}
          onPress={() => handleOrder('SELL')}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="trending-down" size={18} color="#fff" />
              <Text style={styles.orderBtnText}>SELL</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Result */}
      {lastResult && (
        <View style={[styles.resultBox, { borderColor: lastResult.success ? COLORS.success : COLORS.error }]}>
          <Ionicons
            name={lastResult.success ? 'checkmark-circle' : 'close-circle'}
            size={16}
            color={lastResult.success ? COLORS.success : COLORS.error}
          />
          <Text style={[styles.resultLabel, { color: lastResult.success ? COLORS.success : COLORS.error, flex: 1 }]}>
            {lastResult.message}
          </Text>
        </View>
      )}

      <Text style={styles.inputHint}>
        * ต้องเชื่อมต่อ MT5 ก่อน (ตั้งค่าใน Grid MT5 tab)
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────

export default function TradingCalculatorScreen() {
  const { isDesktop } = useResponsive();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
      keyboardShouldPersistTaps="handled"
    >
      <QuickOrderPanel />
      <TPSLCalculator />
      <DCACalculator />
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  contentDesktop: {
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    fontFamily: 'NotoSansThai_400Regular',
  },
  directionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  directionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  directionBuyActive: {
    backgroundColor: `${COLORS.success}22`,
    borderColor: COLORS.success,
  },
  directionSellActive: {
    backgroundColor: `${COLORS.error}22`,
    borderColor: COLORS.error,
  },
  directionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  directionBtnTextActive: {
    color: COLORS.text,
  },
  inputGroup: {
    gap: 6,
  },
  inputRow2: {
    flexDirection: 'row',
    gap: 8,
  },
  inputLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: 'NotoSansThai_400Regular',
  },
  inputHint: {
    fontSize: 10,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    opacity: 0.7,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  resultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.background,
    borderRadius: 0,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
  },
  resultBoxVertical: {
    backgroundColor: COLORS.background,
    borderRadius: 0,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    marginTop: 4,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontFamily: 'NotoSansThai_400Regular',
  },
  resultValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: 'NotoSansThai_400Regular',
  },
  resultSubValue: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    opacity: 0.6,
  },
  emptyResult: {
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  emptyResultText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontFamily: 'NotoSansThai_400Regular',
  },
  // Quick Order
  orderBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  orderBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 0,
  },
  orderBtnBuy: {
    backgroundColor: COLORS.success,
  },
  orderBtnSell: {
    backgroundColor: COLORS.error,
  },
  orderBtnDisabled: {
    opacity: 0.5,
  },
  orderBtnText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'NotoSansThai_400Regular',
    color: '#fff',
    letterSpacing: 1,
  },
  // DCA
  dcaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  dcaHeaderText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: 'NotoSansThai_400Regular',
  },
  dcaEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dcaIndex: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    width: 16,
    textAlign: 'center',
  },
  removeBtn: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: `${COLORS.primary}44`,
    borderStyle: 'dashed',
  },
  addEntryText: {
    fontSize: 13,
    color: COLORS.primary,
    fontFamily: 'NotoSansThai_400Regular',
  },
});