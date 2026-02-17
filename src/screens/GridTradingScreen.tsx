import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { COLORS } from '../utils/constants';
import { useResponsive } from '../utils/responsive';
import { mt5Api } from '../services/mt5Api';
import { getMT5Settings, saveMT5Settings, getGridSettings, saveGridSettings } from '../services/mt5Storage';
import { MT5Settings, GridSettings, Position, AccountInfo } from '../types/mt5';

export default function GridTradingScreen() {
  const { isDesktop } = useResponsive();

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [brokerSymbols, setBrokerSymbols] = useState<string[]>([]);

  // Grid Settings
  const [symbol, setSymbol] = useState('EURUSD');
  const [direction, setDirection] = useState<'BUY' | 'SELL' | null>(null);
  const [firstLot, setFirstLot] = useState('0.5');
  const [profitPoints, setProfitPoints] = useState('500');
  const [gridSpacing, setGridSpacing] = useState('500');  // New: spacing between orders
  const [magic, setMagic] = useState('999999');
  const [openingPrice, setOpeningPrice] = useState('');
  const [autoOpen, setAutoOpen] = useState(true);  // Auto open first order

  // Helper function to filter numeric input (only numbers and decimal point)
  const filterNumeric = (text: string, allowDecimal: boolean = true): string => {
    if (allowDecimal) {
      // Allow only numbers and one decimal point
      return text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    }
    // Allow only integers
    return text.replace(/[^0-9]/g, '');
  };

  // MT5 Settings
  const [backendUrl, setBackendUrl] = useState('http://localhost:8000');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('');

  // Trade History
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);
  const [tradeStats, setTradeStats] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (isConnected) {
      const interval = setInterval(() => {
        refreshPositions();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isConnected, magic]);

  useEffect(() => {
    if (isConnected && magic) {
      loadAutoCloseStatus();
    }
  }, [isConnected, magic]);

  useEffect(() => {
    if (isConnected) {
      loadTradeHistory();
    }
  }, [isConnected]);

  const loadSettings = async () => {
    const mt5Settings = await getMT5Settings();
    if (mt5Settings) {
      setBackendUrl(mt5Settings.backendUrl);
      setLogin(mt5Settings.login.toString());
      setPassword(mt5Settings.password);
      setServer(mt5Settings.server);
    }

    const gridSettings = await getGridSettings();
    if (gridSettings) {
      setSymbol(gridSettings.symbol);
      setDirection(gridSettings.direction);
      setFirstLot(gridSettings.firstLot.toString());
      setProfitPoints(gridSettings.profitPoints.toString());
      setGridSpacing(gridSettings.gridSpacing?.toString() || '500');
      setMagic(gridSettings.magic.toString());
    }
  };

  const handleConnect = async () => {
    if (!backendUrl || !login || !password || !server) {
      Alert.alert('Error', 'Please fill all MT5 settings');
      return;
    }

    setIsConnecting(true);
    mt5Api.setBaseUrl(backendUrl);

    const settings: MT5Settings = {
      backendUrl,
      login: parseInt(login),
      password,
      server,
    };

    const result = await mt5Api.connect(settings);
    setIsConnecting(false);

    if (result.success) {
      setIsConnected(true);
      setAccountInfo(result.data || null);
      await saveMT5Settings(settings);

      // Load symbols from broker
      const symbolsResult = await mt5Api.getSymbols();
      if (symbolsResult.success && symbolsResult.data) {
        setBrokerSymbols(symbolsResult.data.symbols);
      }

      // Connect WebSocket for real-time updates
      mt5Api.connectWebSocket((data) => {
        if (data.type === 'positions_update') {
          setPositions(data.positions || []);
          setPendingOrders(data.pending_orders || []);
          // Update account info real-time
          if (data.account) {
            setAccountInfo(data.account);
          }
        } else if (data.type === 'grid_auto_closed') {
          Alert.alert('🎯 Grid Auto-Closed', data.message);
          setPositions([]);
          setPendingOrders([]);
          refreshPositions();
          loadTradeHistory(); // Refresh history after grid close
        } else if (data.type === 'grid_auto_expanded') {
          Alert.alert('Auto-Grid Expanded', data.message);
          refreshPositions();
        } else if (data.type === 'grid_profit_target_hit') {
          Alert.alert('🎯 Profit Target Hit!', data.message);
          setPositions([]);
          setPendingOrders([]);
          refreshPositions();
          loadTradeHistory(); // Refresh history after grid close
        } else if (data.type === 'position_closed_no_auto') {
          Alert.alert('Position Closed', data.message + '\n(Auto-close is disabled)');
          refreshPositions();
        }
      });

      Alert.alert('Success', 'Connected to MT5');
    } else {
      Alert.alert('Connection Failed', result.message);
    }
  };

  const handleDisconnect = async () => {
    await mt5Api.disconnect();
    setIsConnected(false);
    setAccountInfo(null);
    setPositions([]);
    setPendingOrders([]);
  };

  const handleOpenGrid = async () => {
    console.log('=== handleOpenGrid called ===');
    console.log('direction:', direction);
    console.log('firstLot:', firstLot);
    console.log('profitPoints:', profitPoints);
    console.log('gridSpacing:', gridSpacing);
    console.log('symbol:', symbol);
    console.log('magic:', magic);

    if (!direction) {
      Alert.alert('Required', 'กรุณาเลือก BUY หรือ SELL');
      return;
    }

    const firstLotNum = parseFloat(firstLot);
    const profitPointsNum = parseFloat(profitPoints);
    const gridSpacingNum = parseFloat(gridSpacing) || 500;

    if (isNaN(firstLotNum) || firstLotNum <= 0) {
      Alert.alert('Error', 'กรุณาใส่ค่า First Lot ที่ถูกต้อง');
      return;
    }

    if (isNaN(profitPointsNum) || profitPointsNum <= 0) {
      Alert.alert('Error', 'กรุณาใส่ค่า Profit Points ที่ถูกต้อง');
      return;
    }

    // Calculate lot progression
    const lots = Array.from({ length: 7 }, (_, i) => firstLotNum * Math.pow(2, i));

    const openingPriceNum = openingPrice ? parseFloat(openingPrice) : undefined;

    const gridSettings: GridSettings = {
      symbol,
      direction,
      firstLot: firstLotNum,
      profitPoints: profitPointsNum,
      gridSpacing: gridSpacingNum,
      magic: parseInt(magic),
      autoOpen: autoOpen,
      openingPrice: openingPriceNum,
    };

    console.log('Sending gridSettings:', gridSettings);

    setIsLoading(true);

    try {
      const result = await mt5Api.startAutoGrid(gridSettings);
      console.log('API result:', result);
      setIsLoading(false);

      if (result.success) {
        await saveGridSettings(gridSettings);
        const firstOrderOpened = result.data?.first_order_opened;

        if (firstOrderOpened) {
          Alert.alert(
            '✅ สร้างชุดเทรดสำเร็จ!',
            `เปิดออเดอร์แรกแล้ว!\n\n` +
            `• Symbol: ${symbol}\n` +
            `• Lot: ${firstLotNum}\n` +
            `• Magic: ${magic}\n\n` +
            `Lot Progression:\n${lots.map((l, i) => `  ${i + 1}. ${l.toFixed(2)} lot`).join('\n')}\n\n` +
            `ระบบจะเปิดเพิ่มอีก 6 ออเดอร์อัตโนมัติ\n` +
            `เมื่อถึง ${profitPointsNum} points กำไร จะปิดทั้งหมด!`,
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert(
            '✅ สร้างชุดเทรดสำเร็จ!',
            `กำลังรอเปิดออเดอร์แรก...\n\n` +
            `เปิดออเดอร์แรก (${firstLotNum} lot) ใน MT5:\n` +
            `• Symbol: ${symbol}\n` +
            `• Magic: ${magic}\n\n` +
            `Lot Progression:\n${lots.map((l, i) => `  ${i + 1}. ${l.toFixed(2)} lot`).join('\n')}\n\n` +
            `ระบบจะเปิดเพิ่มอีก 6 ออเดอร์อัตโนมัติ\n` +
            `เมื่อถึง ${profitPointsNum} points กำไร จะปิดทั้งหมด!`,
            [{ text: 'OK' }]
          );
        }
        refreshPositions();
      } else {
        Alert.alert('❌ ไม่สำเร็จ', result.message || 'เกิดข้อผิดพลาด');
      }
    } catch (error: any) {
      console.error('handleOpenGrid error:', error);
      setIsLoading(false);
      Alert.alert('❌ Error', error.message || 'ไม่สามารถเชื่อมต่อ Backend ได้');
    }
  };

  const handleCloseGrid = async () => {
    const doCloseGrid = async () => {
      setIsLoading(true);
      const result = await mt5Api.closeGrid(parseInt(magic));
      setIsLoading(false);

      if (result.success) {
        const closedCount = (result.data?.positions_closed || 0) + (result.data?.orders_cancelled || 0);
        if (Platform.OS === 'web') {
          window.alert(`ปิดสำเร็จ! ปิด ${result.data?.positions_closed || 0} positions และยกเลิก ${result.data?.orders_cancelled || 0} pending orders\nProfit: $${result.data?.total_profit?.toFixed(2) || 0}`);
        } else {
          Alert.alert('Success', `ปิด ${result.data?.positions_closed || 0} positions และยกเลิก ${result.data?.orders_cancelled || 0} pending orders\nProfit: $${result.data?.total_profit?.toFixed(2) || 0}`);
        }
        refreshPositions();
        loadTradeHistory(); // Refresh history after manual close
      } else {
        if (Platform.OS === 'web') {
          window.alert(`ไม่สำเร็จ: ${result.message}`);
        } else {
          Alert.alert('Failed', result.message);
        }
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('คุณต้องการปิด Positions และยกเลิก Pending Orders ทั้งหมดใช่หรือไม่?');
      if (confirmed) {
        await doCloseGrid();
      }
    } else {
      Alert.alert(
        'Close All Positions',
        'Are you sure you want to close all positions?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Close All',
            style: 'destructive',
            onPress: doCloseGrid,
          },
        ]
      );
    }
  };

  const refreshPositions = async () => {
    const result = await mt5Api.getPositions(parseInt(magic));
    if (result.success && result.data) {
      setPositions(result.data.positions || []);
      setPendingOrders(result.data.pending_orders || []);
    }
  };

  const loadAutoCloseStatus = async () => {
    const result = await mt5Api.getAutoCloseStatus(parseInt(magic));
    if (result.success && result.data) {
      setAutoCloseEnabled(result.data.auto_close_enabled);
    }
  };

  const handleToggleAutoClose = async () => {
    const result = await mt5Api.toggleAutoClose(parseInt(magic));
    if (result.success && result.data) {
      setAutoCloseEnabled(result.data.auto_close_enabled);
      Alert.alert(
        'Auto-Close ' + (result.data.auto_close_enabled ? 'Enabled' : 'Disabled'),
        result.data.auto_close_enabled
          ? 'When any position closes, all remaining positions will be closed automatically.'
          : 'Positions will remain open even when other positions close.'
      );
    }
  };

  const loadTradeHistory = async () => {
    const historyResult = await mt5Api.getTradeHistory(20);
    if (historyResult.success && historyResult.data) {
      setTradeHistory(historyResult.data.history || []);
    }

    const statsResult = await mt5Api.getTradeStats();
    if (statsResult.success && statsResult.data) {
      setTradeStats(statsResult.data);
    }
  };

  const handleClearHistory = async () => {
    const doDelete = async () => {
      const result = await mt5Api.clearTradeHistory();
      if (result.success) {
        setTradeHistory([]);
        setTradeStats(null);
        Alert.alert('Success', 'ล้างประวัติเรียบร้อยแล้ว');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('ต้องการล้างประวัติทั้งหมดหรือไม่?')) {
        await doDelete();
      }
    } else {
      Alert.alert(
        'ล้างประวัติ',
        'ต้องการล้างประวัติทั้งหมดหรือไม่?',
        [
          { text: 'ยกเลิก', style: 'cancel' },
          { text: 'ล้าง', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (isConnected) {
      const accountResult = await mt5Api.getAccount();
      if (accountResult.success && accountResult.data) {
        setAccountInfo(accountResult.data);
      }
      await refreshPositions();
      await loadTradeHistory();
    }
    setRefreshing(false);
  };

  const totalProfit = positions.reduce((sum, pos) => sum + pos.profit, 0);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={isDesktop ? styles.desktopContentWrapper : undefined}>
        {/* Connection Status */}
        <View style={styles.statusCard}>
          <Text style={styles.sectionTitle}>MT5 Connection</Text>
          {isConnected ? (
            <>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Connected</Text>
              </View>
              {accountInfo && (
                <View style={styles.accountInfo}>
                  <Text style={styles.accountText}>Account: {accountInfo.login}</Text>
                  <Text style={styles.accountText}>Balance: ${accountInfo.balance.toFixed(2)}</Text>
                  <Text style={styles.accountText}>Equity: ${accountInfo.equity.toFixed(2)}</Text>
                  <Text style={[styles.accountText, { color: accountInfo.profit >= 0 ? COLORS.success : COLORS.error }]}>
                    P/L: ${accountInfo.profit.toFixed(2)}
                  </Text>
                </View>
              )}
              <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
                <Text style={styles.buttonText}>Disconnect</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={isDesktop ? styles.desktopFormWrapper : undefined}>
              <Text style={styles.label}>Backend URL</Text>
              <TextInput
                style={styles.input}
                placeholder="http://localhost:8000"
                value={backendUrl}
                onChangeText={setBackendUrl}
                autoCapitalize="none"
              />
              <Text style={styles.label}>MT5 Login</Text>
              <TextInput
                style={styles.input}
                placeholder="12345678"
                value={login}
                onChangeText={(text) => setLogin(filterNumeric(text, false))}
                keyboardType="number-pad"
              />
              <Text style={styles.label}>MT5 Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="MT5 Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <FontAwesome
                    name={showPassword ? 'eye' : 'eye-slash'}
                    size={20}
                    color={COLORS.text}
                  />
                </TouchableOpacity>
              </View>
              <Text style={styles.label}>MT5 Server</Text>
              <TextInput
                style={styles.input}
                placeholder="XMGlobal-Demo 4"
                value={server}
                onChangeText={setServer}
              />
              <TouchableOpacity
                style={[styles.connectButton, isConnecting && styles.disabledButton]}
                onPress={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Connect to MT5</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Grid Settings */}
        {isConnected && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Grid Trading Settings</Text>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                💡 Manual First Mode: Open your first position in MT5, then the system will auto-open 6 more positions with martingale (x2) progression.
              </Text>
            </View>

            <Text style={styles.label}>Symbol</Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setShowSymbolPicker(true)}
            >
              <Text style={styles.dropdownButtonText}>{symbol || 'Select Symbol'}</Text>
              <Text style={styles.dropdownArrow}>▼</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Direction</Text>
            <View style={styles.directionContainer}>
              <TouchableOpacity
                style={[styles.directionButton, direction === 'BUY' && styles.buyButton]}
                onPress={() => setDirection('BUY')}
              >
                <Text style={[styles.directionText, direction === 'BUY' && styles.activeDirectionText]}>
                  BUY
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.directionButton, direction === 'SELL' && styles.sellButton]}
                onPress={() => setDirection('SELL')}
              >
                <Text style={[styles.directionText, direction === 'SELL' && styles.activeDirectionText]}>
                  SELL
                </Text>
              </TouchableOpacity>
            </View>

            {/* On desktop: 4-column layout for the input groups */}
            {isDesktop ? (
              <View style={styles.desktopGridRow}>
                <View style={styles.quarterInputContainer}>
                  <Text style={styles.label}>First Lot</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.5"
                    value={firstLot}
                    onChangeText={(text) => setFirstLot(filterNumeric(text, true))}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.quarterInputContainer}>
                  <Text style={styles.label}>Profit Points</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="500"
                    value={profitPoints}
                    onChangeText={(text) => setProfitPoints(filterNumeric(text, false))}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.quarterInputContainer}>
                  <Text style={styles.label}>Grid Spacing (จุด)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="500"
                    value={gridSpacing}
                    onChangeText={(text) => setGridSpacing(filterNumeric(text, false))}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.quarterInputContainer}>
                  <Text style={styles.label}>Magic Number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="999999"
                    value={magic}
                    onChangeText={(text) => setMagic(filterNumeric(text, false))}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            ) : (
              <>
                <View style={styles.row}>
                  <View style={styles.halfInputContainer}>
                    <Text style={styles.label}>First Lot</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0.5"
                      value={firstLot}
                      onChangeText={(text) => setFirstLot(filterNumeric(text, true))}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.halfInputContainer}>
                    <Text style={styles.label}>Profit Points</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="500"
                      value={profitPoints}
                      onChangeText={(text) => setProfitPoints(filterNumeric(text, false))}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={styles.halfInputContainer}>
                    <Text style={styles.label}>Grid Spacing (จุด)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="500"
                      value={gridSpacing}
                      onChangeText={(text) => setGridSpacing(filterNumeric(text, false))}
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={styles.halfInputContainer}>
                    <Text style={styles.label}>Magic Number</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="999999"
                      value={magic}
                      onChangeText={(text) => setMagic(filterNumeric(text, false))}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
              </>
            )}

            {/* Auto Open Toggle */}
            <View style={styles.autoOpenContainer}>
              <Text style={styles.label}>เปิดออเดอร์อัตโนมัติ</Text>
              <TouchableOpacity
                style={[styles.autoOpenToggle, autoOpen ? styles.autoOpenOn : styles.autoOpenOff]}
                onPress={() => setAutoOpen(!autoOpen)}
              >
                <Text style={styles.autoOpenText}>
                  {autoOpen ? '✓ เปิดทันที' : '✗ รอเปิดเอง'}
                </Text>
              </TouchableOpacity>
            </View>

            {autoOpen && (
              <>
                <Text style={styles.label}>ราคาเปิด (ถ้าไม่ใส่จะใช้ราคาตลาด)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ราคาเปิดออเดอร์แรก (optional)"
                  value={openingPrice}
                  onChangeText={(text) => setOpeningPrice(filterNumeric(text, true))}
                  keyboardType="decimal-pad"
                />
              </>
            )}

            {!autoOpen && (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  📝 โหมด Manual: กด "สร้างชุดเทรด" แล้วไปเปิดออเดอร์แรกใน MT5 เอง ระบบจะเปิดอีก 6 ออเดอร์อัตโนมัติ
                </Text>
              </View>
            )}


            <View style={styles.lotPreview}>
              <Text style={styles.lotPreviewTitle}>Lot Progression (x2):</Text>
              <Text style={styles.lotPreviewText}>
                {firstLot ?
                  Array.from({ length: 7 }, (_, i) => (parseFloat(firstLot) * Math.pow(2, i)).toFixed(2)).join(' → ')
                  : '0.5 → 1 → 2 → 4 → 8 → 16 → 32'}
              </Text>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                📊 จะเปิด 7 Pending Orders ห่างกัน {gridSpacing || '500'} จุด{'\n'}
                • BUY: วาง Buy Limit ต่ำลงเรื่อยๆ{'\n'}
                • SELL: วาง Sell Limit สูงขึ้นเรื่อยๆ
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.createSetButton, isLoading && styles.disabledButton]}
              onPress={handleOpenGrid}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createSetButtonText}>สร้างชุดเทรด (Create Grid Set)</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Symbol Picker Modal */}
        <Modal
          visible={showSymbolPicker}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowSymbolPicker(false)}
        >
          <View style={[styles.modalOverlay, isDesktop && styles.desktopModalOverlay]}>
            <View style={[styles.modalContent, isDesktop && styles.desktopModalContent]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Symbol</Text>
                <TouchableOpacity onPress={() => setShowSymbolPicker(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.searchInput}
                placeholder="Search symbols..."
                value={symbolSearch}
                onChangeText={setSymbolSearch}
                autoCapitalize="characters"
              />

              <ScrollView style={styles.symbolList}>
                {(brokerSymbols.length > 0 ? brokerSymbols : ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'XAUUSD', 'BTCUSD', 'US30'])
                  .filter(sym => sym.toLowerCase().includes(symbolSearch.toLowerCase()))
                  .map((sym) => (
                    <TouchableOpacity
                      key={sym}
                      style={[styles.symbolListItem, symbol === sym && styles.symbolListItemActive]}
                      onPress={() => {
                        setSymbol(sym);
                        setSymbolSearch('');
                        setShowSymbolPicker(false);
                      }}
                    >
                      <Text style={[styles.symbolListText, symbol === sym && styles.symbolListTextActive]}>
                        {sym}
                      </Text>
                      {symbol === sym && <Text style={styles.checkMark}>✓</Text>}
                    </TouchableOpacity>
                  ))}
              </ScrollView>

              {brokerSymbols.length > 0 && (
                <Text style={styles.symbolCount}>
                  {brokerSymbols.filter(sym => sym.toLowerCase().includes(symbolSearch.toLowerCase())).length} symbols available
                </Text>
              )}
            </View>
          </View>
        </Modal>

        {/* Active Positions & Pending Orders */}
        {isConnected && (
          <View style={styles.card}>
            <View style={styles.positionsHeader}>
              <Text style={styles.sectionTitle}>
                Grid Status: {positions.length} Positions, {pendingOrders.length} Pending
              </Text>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={[styles.autoCloseToggle, autoCloseEnabled ? styles.autoCloseOn : styles.autoCloseOff]}
                  onPress={handleToggleAutoClose}
                >
                  <Text style={styles.autoCloseText}>
                    Auto-Close: {autoCloseEnabled ? 'ON' : 'OFF'}
                  </Text>
                </TouchableOpacity>
                {(positions.length > 0 || pendingOrders.length > 0) && (
                  <TouchableOpacity style={styles.closeAllButton} onPress={handleCloseGrid}>
                    <Text style={styles.closeAllText}>Close All</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {positions.length > 0 && (
              <View style={styles.totalProfitCard}>
                <Text style={styles.totalProfitLabel}>Total P/L:</Text>
                <Text style={[styles.totalProfitValue, { color: totalProfit >= 0 ? COLORS.success : COLORS.error }]}>
                  ${totalProfit.toFixed(2)}
                </Text>
              </View>
            )}

            {/* Active Positions */}
            {positions.length > 0 && (
              <View>
                <Text style={styles.subSectionTitle}>🟢 Active Positions ({positions.length})</Text>
                <View style={isDesktop ? styles.desktopPositionsGrid : undefined}>
                  {positions.map((pos, index) => (
                    <View key={pos.ticket} style={[styles.positionCard, isDesktop && styles.desktopPositionCard]}>
                      <View style={styles.positionHeader}>
                        <Text style={styles.positionTitle}>
                          #{index + 1} {pos.type} {pos.volume} lot
                        </Text>
                        <Text style={[styles.positionProfit, { color: pos.profit >= 0 ? COLORS.success : COLORS.error }]}>
                          ${pos.profit.toFixed(2)}
                        </Text>
                      </View>
                      <Text style={styles.positionDetail}>Symbol: {pos.symbol}</Text>
                      <Text style={styles.positionDetail}>Open: {pos.price_open.toFixed(5)} → Current: {pos.price_current.toFixed(5)}</Text>
                      {pos.tp > 0 && <Text style={styles.positionDetail}>TP: {pos.tp.toFixed(5)}</Text>}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Pending Orders */}
            {pendingOrders.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.subSectionTitle}>⏳ Pending Orders ({pendingOrders.length})</Text>
                <View style={isDesktop ? styles.desktopPositionsGrid : undefined}>
                  {pendingOrders.map((order, index) => (
                    <View key={order.ticket} style={[styles.positionCard, styles.pendingCard, isDesktop && styles.desktopPositionCard]}>
                      <View style={styles.positionHeader}>
                        <Text style={styles.positionTitle}>
                          #{index + 1} {order.type} {order.volume} lot
                        </Text>
                        <Text style={styles.pendingPrice}>@ {order.price_open.toFixed(5)}</Text>
                      </View>
                      <Text style={styles.positionDetail}>Symbol: {order.symbol}</Text>
                      {order.tp > 0 && <Text style={styles.positionDetail}>TP: {order.tp.toFixed(5)}</Text>}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {positions.length === 0 && pendingOrders.length === 0 && (
              <Text style={styles.emptyText}>No active positions or pending orders</Text>
            )}

            {(positions.length > 0 || pendingOrders.length > 0) && (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  💡 เมื่อ Position ใดถึง TP → ปิดทั้งหมด + ยกเลิก Pending Orders
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Trade History & Stats */}
        {isConnected && (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.historyHeader}
              onPress={() => setShowHistory(!showHistory)}
            >
              <Text style={styles.sectionTitle}>📊 ประวัติการเทรด</Text>
              <Text style={styles.expandIcon}>{showHistory ? '▼' : '▶'}</Text>
            </TouchableOpacity>

            {/* Stats Summary - Always visible */}
            {tradeStats && (
              <View style={styles.statsContainer}>
                <View style={[styles.statsRow, isDesktop && styles.desktopStatsRow]}>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>เทรดทั้งหมด</Text>
                    <Text style={styles.statValue}>{tradeStats.total_trades}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Win Rate</Text>
                    <Text style={[styles.statValue, { color: tradeStats.win_rate >= 50 ? COLORS.success : COLORS.error }]}>
                      {tradeStats.win_rate}%
                    </Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>กำไรสุทธิ</Text>
                    <Text style={[styles.statValue, { color: tradeStats.net_profit >= 0 ? COLORS.success : COLORS.error }]}>
                      ${tradeStats.net_profit?.toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={[styles.statsRow, isDesktop && styles.desktopStatsRow]}>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>ชนะ/แพ้</Text>
                    <Text style={styles.statValue}>
                      <Text style={{ color: COLORS.success }}>{tradeStats.winning_trades}</Text>
                      {' / '}
                      <Text style={{ color: COLORS.error }}>{tradeStats.losing_trades}</Text>
                    </Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>กำไรเฉลี่ย</Text>
                    <Text style={[styles.statValue, { color: COLORS.success }]}>
                      ${tradeStats.average_profit?.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>กำไรเฉลี่ย %</Text>
                    <Text style={[styles.statValue, { color: COLORS.success }]}>
                      {tradeStats.average_profit_percent?.toFixed(2) || '0.00'}%
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Trade History List */}
            {showHistory && (
              <>
                {tradeHistory.length > 0 ? (
                  <>
                    {tradeHistory.map((trade, index) => (
                      <View key={trade.id || index} style={[styles.historyCard, trade.profit >= 0 ? styles.historyWin : styles.historyLoss]}>
                        <View style={styles.historyRow}>
                          <Text style={styles.historySymbol}>{trade.symbol} {trade.direction}</Text>
                          <Text style={[styles.historyProfit, { color: trade.profit >= 0 ? COLORS.success : COLORS.error }]}>
                            ${trade.profit?.toFixed(2)} ({trade.profit_percent?.toFixed(2) || '0.00'}%)
                          </Text>
                        </View>
                        <View style={styles.historyRow}>
                          <Text style={styles.historyDetail}>
                            Lot: {trade.first_lot} → Max: {trade.max_positions_opened} pos
                          </Text>
                          <Text style={styles.historyDetail}>
                            {trade.close_reason === 'tp_hit' ? '🎯 TP' : trade.close_reason === 'manual_close' ? '✋ Manual' : trade.close_reason}
                          </Text>
                        </View>
                        <Text style={styles.historyDate}>
                          {new Date(trade.closed_at).toLocaleString('th-TH')} ({trade.duration_minutes?.toFixed(0)} นาที)
                        </Text>
                      </View>
                    ))}

                    <TouchableOpacity style={styles.clearHistoryButton} onPress={handleClearHistory}>
                      <Text style={styles.clearHistoryText}>🗑️ ล้างประวัติทั้งหมด</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={styles.emptyText}>ยังไม่มีประวัติการเทรด</Text>
                )}
              </>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 16,
  },
  desktopContentWrapper: {
    maxWidth: 900,
    alignSelf: 'center' as const,
    width: '100%' as any,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  desktopFormWrapper: {
    maxWidth: 500,
  },
  desktopGridRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
  },
  quarterInputContainer: {
    flex: 1,
  },
  desktopPositionsGrid: {
    flexWrap: 'wrap' as const,
    flexDirection: 'row' as const,
    gap: 12,
  },
  desktopPositionCard: {
    flexBasis: '48%' as any,
    flexGrow: 0,
    flexShrink: 0,
  },
  desktopStatsRow: {
    gap: 16,
  },
  desktopModalOverlay: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  desktopModalContent: {
    maxWidth: 500,
    maxHeight: 600,
    borderRadius: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '90%' as any,
  },
  statusCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.success,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    color: COLORS.success,
    fontWeight: '600',
  },
  accountInfo: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  accountText: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    marginBottom: 12,
    paddingRight: 4,
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 14,
    color: COLORS.text,
  },
  eyeButton: {
    padding: 8,
    paddingHorizontal: 12,
  },
  eyeIcon: {
    fontSize: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  halfInputContainer: {
    flex: 1,
  },
  directionContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  directionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginHorizontal: 4,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  buyButton: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  sellButton: {
    backgroundColor: COLORS.error,
    borderColor: COLORS.error,
  },
  directionText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  activeDirectionText: {
    color: '#fff',
  },
  connectButton: {
    backgroundColor: COLORS.primary,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  disconnectButton: {
    backgroundColor: COLORS.error,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  openButton: {
    backgroundColor: COLORS.success,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  createSetButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  createSetButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  positionsHeader: {
    flexDirection: 'column',
    marginBottom: 12,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  autoCloseToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    flex: 1,
    marginRight: 8,
  },
  autoCloseOn: {
    backgroundColor: COLORS.success,
  },
  autoCloseOff: {
    backgroundColor: COLORS.textSecondary,
  },
  autoCloseText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  closeAllButton: {
    backgroundColor: COLORS.error,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  closeAllText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  totalProfitCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  totalProfitLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalProfitValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 14,
    paddingVertical: 20,
  },
  positionCard: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  positionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  positionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  positionProfit: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  positionDetail: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  subSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 4,
  },
  pendingCard: {
    backgroundColor: '#2A2210',
    borderLeftWidth: 3,
    borderLeftColor: '#FFA726',
  },
  pendingPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFB74D',
  },
  warningCard: {
    backgroundColor: '#2A1F0E',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  warningText: {
    fontSize: 13,
    color: '#FFB74D',
  },
  infoBox: {
    backgroundColor: '#0F1E2E',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 13,
    color: '#42A5F5',
    lineHeight: 18,
  },
  lotPreview: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  lotPreviewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  lotPreviewText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: COLORS.surface,
  },
  dropdownButtonText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  dropdownArrow: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalClose: {
    fontSize: 24,
    color: COLORS.textSecondary,
    fontWeight: '300',
  },
  searchInput: {
    margin: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  symbolList: {
    maxHeight: 400,
  },
  symbolListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 4,
    borderRadius: 8,
    backgroundColor: '#243548',
  },
  symbolListItemActive: {
    backgroundColor: COLORS.primary,
  },
  symbolListText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
  },
  symbolListTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  checkMark: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
  symbolCount: {
    textAlign: 'center',
    padding: 12,
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  autoOpenContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  autoOpenToggle: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 120,
  },
  autoOpenOn: {
    backgroundColor: COLORS.success,
  },
  autoOpenOff: {
    backgroundColor: COLORS.textSecondary,
  },
  autoOpenText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Trade History Styles
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  expandIcon: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  statsContainer: {
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 10,
    borderRadius: 8,
    marginHorizontal: 3,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  historyCard: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  historyWin: {
    borderLeftColor: COLORS.success,
  },
  historyLoss: {
    borderLeftColor: COLORS.error,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historySymbol: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  historyProfit: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  historyDetail: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  historyDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  clearHistoryButton: {
    backgroundColor: '#3A2020',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  clearHistoryText: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: '500',
  },
});
