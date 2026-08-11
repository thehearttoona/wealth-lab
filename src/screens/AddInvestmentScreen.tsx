import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { Investment, InvestmentType, INVESTMENT_TYPES, INVESTMENT_PLATFORMS, DEFAULT_CURRENCIES, Currency, RedInterval, RED_INTERVALS, DEFAULT_RED_INTERVAL, DEFAULT_RED_EVERY } from '../types/investment';
import { getCurrencies } from '../services/currencyStorage';
import { getPlatforms } from '../services/platformStorage';
import { saveInvestment, updateInvestment } from '../services/investmentStorage';
import { updateInvestmentPrice, searchCryptoList, CryptoSearchResult, searchStockList, StockSearchResult } from '../services/priceApi';
import { searchFundList, FundCatalogItem } from '../services/fundCatalog';
import { COLORS } from '../utils/constants';
import { notify } from '../utils/dialog';

type AddInvestmentScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'AddInvestment'
>;
type AddInvestmentScreenRouteProp = RouteProp<RootStackParamList, 'AddInvestment'>;

export default function AddInvestmentScreen() {
  const navigation = useNavigation<AddInvestmentScreenNavigationProp>();
  const route = useRoute<AddInvestmentScreenRouteProp>();
  const { investment } = route.params || {};

  const isEditing = !!investment;
  
  const [type, setType] = useState<InvestmentType>('stock_th');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [currency, setCurrency] = useState<Currency>('THB');
  const [currentPrice, setCurrentPrice] = useState('');
  const [fees, setFees] = useState('');
  const [notes, setNotes] = useState('');
  const [platform, setPlatform] = useState('');
  // กฎ "ถึงคิวลงไม้" รายตัว — crypto/หุ้นเท่านั้นที่มีแท่งเทียนให้นับ
  // (กองทุน/ทอง/อื่น ๆ ไม่มีข้อมูลแท่งเทียน จึงไม่โชว์ส่วนนี้เลย)
  const [redInterval, setRedInterval] = useState<RedInterval>(DEFAULT_RED_INTERVAL);
  const [redEvery, setRedEvery] = useState(String(DEFAULT_RED_EVERY));
  // "ซื้อเพิ่มแล้วรอบนี้" ที่กดปิดไว้จากหน้าพอร์ต — หน้านี้แค่บอกสถานะกับให้กดยกเลิกได้
  // ต้องเห็นตรงนี้ด้วย เพราะเวลาจะซื้อเพิ่มจริงคนเข้ามาแก้จำนวน/ต้นทุนที่หน้านี้
  // ไม่งั้นจะงงว่าทำไมตัวนี้ราคาร่วงแต่การ์ดสรุปไม่ขึ้นเตือน
  const [keepRedAck, setKeepRedAck] = useState(true);
  const hasCandles = type === 'crypto' || type === 'stock_th' || type === 'stock_foreign';
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CryptoSearchResult[]>([]);
  const [stockSearchResults, setStockSearchResults] = useState<StockSearchResult[]>([]);
  const [fundSearchResults, setFundSearchResults] = useState<FundCatalogItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  // ตัวเลือกสกุลเงิน/แพลตฟอร์ม มาจากรายการที่ผู้ใช้จัดการเองในหน้า "สกุลเงิน & แพลตฟอร์ม"
  // ถ้ายังไม่ได้รัน SQL หรือรายการว่าง จะ fallback เป็นค่าเริ่มต้นเดิม
  const [currencyOptions, setCurrencyOptions] = useState<string[]>(
    DEFAULT_CURRENCIES.map((c) => c.code)
  );
  const [platformOptions, setPlatformOptions] = useState<string[]>(INVESTMENT_PLATFORMS);

  useEffect(() => {
    (async () => {
      try {
        const [curList, platList] = await Promise.all([getCurrencies(), getPlatforms()]);
        if (curList.length > 0) setCurrencyOptions(curList.map((c) => c.code));
        if (platList.length > 0) setPlatformOptions(platList.map((p) => p.name));
      } catch {
        // ใช้ค่าเริ่มต้นต่อไป
      }
    })();
  }, []);

  useEffect(() => {
    if (investment) {
      setType(investment.type);
      setSymbol(investment.symbol);
      setName(investment.name);
      setQuantity(investment.quantity.toString());
      setBuyPrice(investment.buyPrice.toString());
      setCurrency(investment.currency || 'THB');
      setCurrentPrice(investment.currentPrice?.toString() || '');
      setFees(investment.fees?.toString() || '');
      setNotes(investment.notes || '');
      setPlatform(investment.platform || '');
      setRedInterval(investment.redInterval || DEFAULT_RED_INTERVAL);
      setRedEvery(String(investment.redEvery || DEFAULT_RED_EVERY));
      setKeepRedAck(true);
    }
  }, [investment]);

  const handleSearchCrypto = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchCryptoList(searchQuery);
      setSearchResults(results);
      setShowSearchResults(true);
    } catch (error) {
      console.error('Error searching crypto:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchStock = async () => {
    if (!searchQuery.trim()) {
      setStockSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const market = type === 'stock_th' ? 'th' : type === 'stock_foreign' ? 'foreign' : 'all';
      const results = await searchStockList(searchQuery, market);
      setStockSearchResults(results);
      setShowSearchResults(true);
    } catch (error) {
      console.error('Error searching stock:', error);
      setStockSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectCrypto = (crypto: CryptoSearchResult) => {
    setSymbol(crypto.symbol);
    setName(crypto.name);
    setSearchQuery('');
    setShowSearchResults(false);
    setSearchResults([]);
  };

  const handleSelectStock = (stock: StockSearchResult) => {
    setSymbol(stock.symbol);
    setName(stock.name);
    setSearchQuery('');
    setShowSearchResults(false);
    setStockSearchResults([]);
  };

  const handleSearchFund = async () => {
    if (!searchQuery.trim()) {
      setFundSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchFundList(searchQuery);
      setFundSearchResults(results);
      setShowSearchResults(true);
    } catch (error) {
      console.error('Error searching fund:', error);
      setFundSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectFund = (fund: FundCatalogItem) => {
    setSymbol(fund.abbr || fund.id);
    setName(fund.name);
    setSearchQuery('');
    setShowSearchResults(false);
    setFundSearchResults([]);
  };

  const handleFetchRealtime = async () => {
    if (!symbol.trim()) {
      notify('กรุณากรอกตัวย่อ/รหัสก่อน', 'ข้อผิดพลาด');
      return;
    }

    setIsFetchingPrice(true);
    try {
      const price = await updateInvestmentPrice(type, symbol.trim().toUpperCase(), currency);
      if (price !== null && price > 0) {
        setCurrentPrice(price.toString());
        notify(`อัปเดตราคาสำเร็จ: ${price.toLocaleString('th-TH')} ${currency}`, 'สำเร็จ');
      } else {
        notify('ไม่สามารถดึงราคาได้ กรุณาตรวจสอบตัวย่อ/รหัสหรือกรอกเอง', 'ข้อผิดพลาด');
      }
    } catch (error) {
      notify('เกิดข้อผิดพลาดในการดึงราคา', 'ข้อผิดพลาด');
    } finally {
      setIsFetchingPrice(false);
    }
  };

  const handleSave = async () => {
    // Validation
    if (!symbol.trim()) {
      notify('กรุณากรอกตัวย่อ/รหัส', 'ข้อผิดพลาด');
      return;
    }
    if (!name.trim()) {
      notify('กรุณากรอกชื่อ', 'ข้อผิดพลาด');
      return;
    }
    if (!quantity || parseFloat(quantity) <= 0) {
      notify('กรุณากรอกจำนวนที่ถูกต้อง', 'ข้อผิดพลาด');
      return;
    }
    if (!buyPrice || parseFloat(buyPrice) <= 0) {
      notify('กรุณากรอกราคาซื้อที่ถูกต้อง', 'ข้อผิดพลาด');
      return;
    }

    const parsedRedEvery = Math.floor(parseFloat(redEvery));
    if (hasCandles && (!Number.isFinite(parsedRedEvery) || parsedRedEvery < 1 || parsedRedEvery > 12)) {
      notify('จำนวนแท่งแดงต้องเป็นตัวเลข 1–12', 'ข้อผิดพลาด');
      return;
    }
    // แก้กฎแท่งแดง = เริ่มนับใหม่ ของที่ปิดเตือนไว้ตามกฎเดิมใช้ต่อไม่ได้
    const redRuleChanged =
      (investment?.redInterval || DEFAULT_RED_INTERVAL) !== redInterval ||
      (investment?.redEvery || DEFAULT_RED_EVERY) !== parsedRedEvery;

    try {
      const investmentData: Investment = {
        id: investment?.id || Date.now().toString(),
        type,
        symbol: symbol.trim().toUpperCase(),
        name: name.trim(),
        quantity: parseFloat(quantity),
        buyPrice: parseFloat(buyPrice),
        currency,
        currentPrice: currentPrice ? parseFloat(currentPrice) : undefined,
        buyDate: investment?.buyDate || new Date().toISOString(),
        fees: fees ? parseFloat(fees) : undefined,
        notes: notes.trim() || undefined,
        platform: platform.trim() || undefined,
        // ⚠️ ต้องส่งกลับไปด้วยเสมอ — updateInvestment เขียนทับทั้งแถว ถ้าไม่ใส่จะกลายเป็น null
        // (บั๊กเดิม: กดแก้ไขรายการทีไร เป้าหมายกำไรที่ตั้งไว้หายทุกครั้งโดยไม่มีอะไรเตือน)
        targetReturnPercent: investment?.targetReturnPercent,
        targetDate: investment?.targetDate,
        // กฎแท่งแดงรายตัว — ตรงกับค่าเริ่มต้นก็ไม่ต้องเก็บ ปล่อยเป็น undefined ให้ระบบใช้ค่ากลาง
        redInterval: hasCandles && redInterval !== DEFAULT_RED_INTERVAL ? redInterval : undefined,
        redEvery:
          hasCandles && parsedRedEvery && parsedRedEvery !== DEFAULT_RED_EVERY
            ? parsedRedEvery
            : undefined,
        // ── "ซื้อเพิ่มแล้วรอบนี้" ที่ปิดเตือนไว้ ──
        // ต้องส่งกลับไปด้วยเหมือน targetReturnPercent (updateInvestment เขียนทับทั้งแถว)
        // ทิ้งเมื่อผู้ใช้กดยกเลิก หรือเมื่อกฎเปลี่ยน — "แดง 2 แท่ง" ของกฎรายวันกับรายสัปดาห์
        // คนละความหมายกัน เก็บเลขเดิมไว้ข้ามกฎจะปิดเตือนผิดรอบแบบไม่มีอะไรฟ้อง
        redAckCount: keepRedAck && !redRuleChanged ? investment?.redAckCount : undefined,
        redAckStreakAt: keepRedAck && !redRuleChanged ? investment?.redAckStreakAt : undefined,
      };

      if (isEditing) await updateInvestment(investmentData);
      else await saveInvestment(investmentData);
      await notify(isEditing ? 'แก้ไขการลงทุนเรียบร้อย' : 'บันทึกการลงทุนเรียบร้อย', 'สำเร็จ');
      navigation.goBack();
    } catch (error) {
      notify('ไม่สามารถบันทึกข้อมูลได้', 'ข้อผิดพลาด');
    }
  };

  // ประเภทที่ดึงราคาอัตโนมัติได้ (กองทุน/อื่นๆ ยังไม่รองรับ → กรอกเอง)
  const canFetchPrice = ['crypto', 'stock_th', 'stock_foreign', 'gold'].includes(type);

  return (
    <ScrollView style={styles.container}>
      {/* ฟอร์มกรอกทีละช่อง — บนเดสก์ท็อปคุมไว้ 600px เท่ากับฟอร์ม AddExpense/AddInstallment */}
      {/* เดสก์ท็อปไม่มีเพดานความกว้างแล้ว — เนื้อหาใช้เต็ม pane (ดู utils/responsive.ts) */}
      <View style={styles.content}>
        <Text style={styles.label}>ประเภทการลงทุน</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.typeContainer}
          contentContainerStyle={styles.typeContentContainer}
        >
          {INVESTMENT_TYPES.map((investmentType) => (
            <TouchableOpacity
              key={investmentType.value}
              style={[
                styles.typeButton,
                type === investmentType.value && styles.typeButtonSelected,
              ]}
              onPress={() => setType(investmentType.value)}
            >
              <Ionicons 
                name={investmentType.icon as any} 
                size={20} 
                color={type === investmentType.value ? '#ffffff' : COLORS.primary} 
              />
              <Text
                style={[
                  styles.typeText,
                  type === investmentType.value && styles.typeTextSelected,
                ]}
              >
                {investmentType.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {type === 'crypto' && (
          <View>
            <Text style={styles.label}>ค้นหา Cryptocurrency</Text>
            <View style={styles.searchContainer}>
              <TextInput
                style={[styles.input, styles.searchInput]}
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  if (text.trim().length === 0) {
                    setShowSearchResults(false);
                    setSearchResults([]);
                  }
                }}
                placeholder="ค้นหาชื่อหรือสัญลักษณ์ เช่น Bitcoin, BTC"
                placeholderTextColor={COLORS.textSecondary}
              />
              <TouchableOpacity
                style={styles.searchButton}
                onPress={handleSearchCrypto}
                disabled={isSearching || !searchQuery.trim()}
              >
                <Ionicons
                  name={isSearching ? 'sync' : 'search'}
                  size={20}
                  color="#ffffff"
                />
              </TouchableOpacity>
            </View>

            {showSearchResults && (
              <View style={styles.searchResults}>
                {searchResults.length > 0 ? (
                  searchResults.map((crypto) => (
                    <TouchableOpacity
                      key={crypto.id}
                      style={styles.searchResultItem}
                      onPress={() => handleSelectCrypto(crypto)}
                    >
                      <View>
                        <Text style={styles.searchResultSymbol}>{crypto.symbol}</Text>
                        <Text style={styles.searchResultName}>{crypto.name}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={styles.noResults}>ไม่พบผลลัพธ์</Text>
                )}
              </View>
            )}
          </View>
        )}

        {(type === 'stock_th' || type === 'stock_foreign') && (
          <View>
            <Text style={styles.label}>{type === 'stock_th' ? 'ค้นหาหุ้นไทย' : 'ค้นหาหุ้นต่างประเทศ'}</Text>
            <View style={styles.searchContainer}>
              <TextInput
                style={[styles.input, styles.searchInput]}
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  if (text.trim().length === 0) {
                    setShowSearchResults(false);
                    setStockSearchResults([]);
                  }
                }}
                placeholder={type === 'stock_th' ? 'ค้นหาชื่อบริษัทหรือสัญลักษณ์ เช่น ปตท., PTT' : 'ค้นหาชื่อบริษัทหรือสัญลักษณ์ เช่น Apple, AAPL'}
                placeholderTextColor={COLORS.textSecondary}
              />
              <TouchableOpacity
                style={styles.searchButton}
                onPress={handleSearchStock}
                disabled={isSearching || !searchQuery.trim()}
              >
                <Ionicons
                  name={isSearching ? 'sync' : 'search'}
                  size={20}
                  color="#ffffff"
                />
              </TouchableOpacity>
            </View>

            {showSearchResults && (
              <View style={styles.searchResults}>
                {stockSearchResults.length > 0 ? (
                  stockSearchResults.map((stock, index) => (
                    <TouchableOpacity
                      key={`${stock.symbol}-${index}`}
                      style={styles.searchResultItem}
                      onPress={() => handleSelectStock(stock)}
                    >
                      <View style={{flex: 1}}>
                        <Text style={styles.searchResultSymbol}>{stock.symbol}</Text>
                        <Text style={styles.searchResultName}>{stock.name}</Text>
                        <Text style={styles.searchResultRegion}>{stock.region} • {stock.currency}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={styles.noResults}>ไม่พบผลลัพธ์</Text>
                )}
              </View>
            )}
          </View>
        )}

        {type === 'fund' && (
          <View>
            <Text style={styles.label}>ค้นหากองทุน</Text>
            <View style={styles.searchContainer}>
              <TextInput
                style={[styles.input, styles.searchInput]}
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  if (text.trim().length === 0) {
                    setShowSearchResults(false);
                    setFundSearchResults([]);
                  }
                }}
                placeholder="ค้นหาชื่อย่อ/ชื่อกองทุน เช่น K-USA, KFF6MHX"
                placeholderTextColor={COLORS.textSecondary}
              />
              <TouchableOpacity
                style={styles.searchButton}
                onPress={handleSearchFund}
                disabled={isSearching || !searchQuery.trim()}
              >
                <Ionicons name={isSearching ? 'sync' : 'search'} size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {showSearchResults && (
              <View style={styles.searchResults}>
                {fundSearchResults.length > 0 ? (
                  fundSearchResults.map((fund) => (
                    <TouchableOpacity
                      key={fund.id}
                      style={styles.searchResultItem}
                      onPress={() => handleSelectFund(fund)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.searchResultSymbol}>{fund.abbr || fund.id}</Text>
                        <Text style={styles.searchResultName}>{fund.name}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={styles.noResults}>ไม่พบผลลัพธ์</Text>
                )}
              </View>
            )}
          </View>
        )}

        <Text style={styles.label}>ตัวย่อ/รหัส *</Text>
        <TextInput
          style={styles.input}
          value={symbol}
          onChangeText={setSymbol}
          placeholder="เช่น PTT, BTC, XAU"
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>ชื่อเต็ม *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="เช่น บริษัท ปตท. จำกัด (มหาชน)"
          placeholderTextColor={COLORS.textSecondary}
        />

        <View style={styles.row}>
          <View style={styles.halfWidth}>
            <Text style={styles.label}>จำนวน *</Text>
            <TextInput
              style={styles.input}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          <View style={styles.halfWidth}>
            <Text style={styles.label}>ราคา AVG *</Text>
            <TextInput
              style={styles.input}
              value={buyPrice}
              onChangeText={setBuyPrice}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.halfWidth}>
            <Text style={styles.label}>สกุลเงิน</Text>
            <View style={styles.currencyContainer}>
              {currencyOptions.map((curr) => (
                <TouchableOpacity
                  key={curr}
                  style={[
                    styles.currencyButton,
                    currency === curr && styles.currencyButtonActive,
                  ]}
                  onPress={() => setCurrency(curr)}
                >
                  <Text
                    style={[
                      styles.currencyButtonText,
                      currency === curr && styles.currencyButtonTextActive,
                    ]}
                  >
                    {curr}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {canFetchPrice && (
            <View style={styles.halfWidth}>
              <Text style={styles.label}>ราคา Realtime</Text>
              <TouchableOpacity
                style={styles.realtimeButton}
                onPress={handleFetchRealtime}
                disabled={isFetchingPrice}
              >
                <Ionicons
                  name={isFetchingPrice ? 'sync' : 'refresh-outline'}
                  size={16}
                  color="#ffffff"
                />
                <Text style={styles.realtimeButtonText}>
                  {isFetchingPrice ? 'กำลังดึงข้อมูล...' : 'ดึงราคาล่าสุด'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        {type === 'fund' && (
          <Text style={styles.fundHint}>
            * ค้นหากองทุนเพื่อเลือกชื่อได้ แต่ NAV ต้องกรอกเอง — ใส่ NAV ที่ซื้อ (ต้นทุน) และ NAV ปัจจุบันจากใบยืนยัน/แอป บลจ.
          </Text>
        )}

        <View style={styles.row}>
          <View style={styles.halfWidth}>
            <Text style={styles.label}>ราคาปัจจุบัน ({currency})</Text>
            <TextInput
              style={styles.input}
              value={currentPrice}
              onChangeText={setCurrentPrice}
              keyboardType="numeric"
              placeholder="ถ้าไม่กรอกจะใช้ราคาซื้อ"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          <View style={styles.halfWidth}>
            <Text style={styles.label}>ค่าธรรมเนียม (บาท)</Text>
            <TextInput
              style={styles.input}
              value={fees}
              onChangeText={setFees}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>
        </View>

        <Text style={styles.label}>แพลตฟอร์มที่ลงทุน</Text>
        <View style={styles.platformChips}>
          {platformOptions.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.platformChip, platform === p && styles.platformChipActive]}
              onPress={() => setPlatform(platform === p ? '' : p)}
            >
              <Text style={[styles.platformChipText, platform === p && styles.platformChipTextActive]}>
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={platform}
          onChangeText={setPlatform}
          placeholder="หรือพิมพ์ชื่อแพลตฟอร์มเอง"
          placeholderTextColor={COLORS.textSecondary}
        />

        {/* ── กฎ "ถึงคิวลงไม้" รายตัว ──
            ของที่แกว่งแรงอย่าง crypto ดูรายวันทัน แต่หุ้นที่ตั้งใจถือยาว ดูรายสัปดาห์/เดือน
            จะกรองสัญญาณรบกวนออกได้เยอะกว่า จึงต้องตั้งแยกได้ ไม่ใช่กฎเดียวใช้ทั้งพอร์ต */}
        {hasCandles && (
          <>
            <Text style={styles.label}>สัญญาณ "ถึงคิวลงไม้" ของตัวนี้</Text>
            <View style={styles.platformChips}>
              {RED_INTERVALS.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.platformChip, redInterval === r.value && styles.platformChipActive]}
                  onPress={() => setRedInterval(r.value)}
                >
                  <Text
                    style={[
                      styles.platformChipText,
                      redInterval === r.value && styles.platformChipTextActive,
                    ]}
                  >
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={redEvery}
              onChangeText={setRedEvery}
              keyboardType="numeric"
              placeholder="2"
              placeholderTextColor={COLORS.textSecondary}
            />
            <Text style={styles.redRuleHint}>
              เตือนเมื่อแดงติดกันครบทุก ๆ {redEvery || DEFAULT_RED_EVERY}{' '}
              {RED_INTERVALS.find((r) => r.value === redInterval)?.unit}
              {' '}(ครบ {redEvery || DEFAULT_RED_EVERY} / {(parseInt(redEvery, 10) || DEFAULT_RED_EVERY) * 2} / {(parseInt(redEvery, 10) || DEFAULT_RED_EVERY) * 3}…)
              {' '}· นับเฉพาะแท่งที่ปิดแล้ว
            </Text>

            {/* ตัวนี้กด "ซื้อเพิ่มแล้ว" ปิดเตือนไว้อยู่ — บอกตรงนี้เพราะหน้านี้คือที่ที่คนมาแก้จำนวน
                ตอนซื้อเพิ่มจริง ถ้าไม่บอกจะกลายเป็นว่าราคาร่วงแล้วการ์ดสรุปเงียบโดยไม่รู้สาเหตุ */}
            {!!investment?.redAckCount && (
              <TouchableOpacity
                style={styles.redAckRow}
                onPress={() => setKeepRedAck((v) => !v)}
              >
                <Ionicons
                  name={keepRedAck ? 'checkbox-outline' : 'square-outline'}
                  size={18}
                  color={keepRedAck ? COLORS.primary : COLORS.textSecondary}
                />
                <Text style={styles.redAckRowText}>
                  {' '}ซื้อเพิ่มแล้วตอนแดง {investment.redAckCount}{' '}
                  {RED_INTERVALS.find((r) => r.value === redInterval)?.unit} — ปิดแจ้งเตือนไว้
                  {'\n'}
                  <Text style={styles.redAckHint}>
                    {keepRedAck
                      ? 'เอาเครื่องหมายออกถ้าอยากให้เตือนอีกครั้งทันที'
                      : 'บันทึกแล้วจะกลับมาเตือนตัวนี้อีกครั้ง'}
                  </Text>
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <Text style={styles.label}>บันทึกเพิ่มเติม</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="ระบุรายละเอียดเพิ่มเติม (ถ้ามี)"
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
  // คำอธิบายกฎแท่งแดง — ต้องอ่านแล้วเห็นภาพทันทีว่าจะเตือนตอนไหน ไม่ต้องเดา
  // marginTop ต้องเป็นบวก: styles.input ไม่มี marginBottom เลย ค่าติดลบทำให้ข้อความ
  // ทับกล่อง input ที่อยู่เหนือมันขึ้นมา (เจอบนเว็บจริง)
  redRuleHint: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    marginTop: 8,
    marginBottom: 12,
    lineHeight: 18,
  },
  // แถวสถานะ "ซื้อเพิ่มแล้ว — ปิดแจ้งเตือนไว้" (กดเพื่อยกเลิก)
  redAckRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    marginBottom: 12,
  },
  redAckRowText: {
    flex: 1,
    // TextInput/Text ในแถว flex ต้องมี minWidth: 0 บนเว็บ ไม่งั้นความกว้างขั้นต่ำโดยธรรมชาติดันจนล้น
    minWidth: 0,
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
    lineHeight: 20,
  },
  // ข้อความช่วยในแถวเดียวกัน — ไม่มี margin เพราะซ้อนอยู่ใน Text (RN ไม่คิด margin ให้)
  redAckHint: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
  },
  label: {
    fontSize: 10,
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
    flexGrow: 0,
    marginVertical: 12,
  },
  typeContentContainer: {
    paddingRight: 24,
  },
  typeButton: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 0,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 12,
    alignItems: 'center',
    minWidth: 90,
    gap: 8,
  },
  typeButtonSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeText: {
    fontSize: 11,
    color: COLORS.text,
    fontFamily: 'NotoSansThai_300Light',
  },
  typeTextSelected: {
    color: '#ffffff',
    fontFamily: 'NotoSansThai_400Regular',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  currencyContainer: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  currencyButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 0,
    backgroundColor: COLORS.surface,
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  currencyButtonText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
    letterSpacing: 1,
  },
  currencyButtonTextActive: {
    color: '#ffffff',
  },
  platformChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  platformChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 0,
    backgroundColor: COLORS.surface,
  },
  platformChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  platformChipText: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
  },
  platformChipTextActive: {
    color: '#ffffff',
  },
  realtimeButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 0,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  realtimeButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  fundHint: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginTop: 8,
    lineHeight: 18,
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
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  searchContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  searchInput: {
    flex: 1,
    // <input> บนเว็บมีความกว้างในตัว ~20 ตัวอักษร และ flex item ได้ min-width:auto
    // ไม่ใส่ minWidth:0 ช่องค้นหาจะดันปุ่ม "ค้นหา" ล้นออกนอกจอบนมือถือ
    minWidth: 0,
  },
  searchButton: {
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 0,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 52,
  },
  searchResults: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 0,
    marginTop: 8,
  },
  searchResultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchResultSymbol: {
    fontSize: 14,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.text,
    marginBottom: 4,
  },
  searchResultName: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  searchResultRegion: {
    fontSize: 10,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    opacity: 0.7,
  },
  noResults: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    padding: 16,
    textAlign: 'center',
  },
});
