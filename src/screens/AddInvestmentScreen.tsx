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
import { RootStackParamList } from '../types';
import { Investment, InvestmentType, INVESTMENT_TYPES, Currency } from '../types/investment';
import { saveInvestment, updateInvestment } from '../services/investmentStorage';
import { updateInvestmentPrice, searchCryptoList, CryptoSearchResult, searchStockList, StockSearchResult } from '../services/priceApi';
import { COLORS } from '../utils/constants';

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
  
  const [type, setType] = useState<InvestmentType>('stock');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [currency, setCurrency] = useState<Currency>('THB');
  const [currentPrice, setCurrentPrice] = useState('');
  const [fees, setFees] = useState('');
  const [notes, setNotes] = useState('');
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CryptoSearchResult[]>([]);
  const [stockSearchResults, setStockSearchResults] = useState<StockSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

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
      const results = await searchStockList(searchQuery);
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

  const handleFetchRealtime = async () => {
    if (!symbol.trim()) {
      if (Platform.OS === 'web') {
        window.alert('กรุณากรอกตัวย่อ/รหัสก่อน');
      } else {
        Alert.alert('ข้อผิดพลาด', 'กรุณากรอกตัวย่อ/รหัสก่อน');
      }
      return;
    }

    setIsFetchingPrice(true);
    try {
      const price = await updateInvestmentPrice(type, symbol.trim().toUpperCase(), currency);
      if (price !== null && price > 0) {
        setCurrentPrice(price.toString());
        if (Platform.OS === 'web') {
          window.alert(`อัปเดตราคาสำเร็จ: ${price.toLocaleString()} ${currency}`);
        } else {
          Alert.alert('สำเร็จ', `อัปเดตราคาสำเร็จ: ${price.toLocaleString()} ${currency}`);
        }
      } else {
        if (Platform.OS === 'web') {
          window.alert('ไม่สามารถดึงราคาได้ กรุณาตรวจสอบตัวย่อ/รหัสหรือกรอกเอง');
        } else {
          Alert.alert('ข้อผิดพลาด', 'ไม่สามารถดึงราคาได้ กรุณาตรวจสอบตัวย่อ/รหัสหรือกรอกเอง');
        }
      }
    } catch (error) {
      if (Platform.OS === 'web') {
        window.alert('เกิดข้อผิดพลาดในการดึงราคา');
      } else {
        Alert.alert('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการดึงราคา');
      }
    } finally {
      setIsFetchingPrice(false);
    }
  };

  const handleSave = async () => {
    // Validation
    if (!symbol.trim()) {
      if (Platform.OS === 'web') {
        window.alert('กรุณากรอกตัวย่อ/รหัส');
      } else {
        Alert.alert('ข้อผิดพลาด', 'กรุณากรอกตัวย่อ/รหัส');
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
    if (!quantity || parseFloat(quantity) <= 0) {
      if (Platform.OS === 'web') {
        window.alert('กรุณากรอกจำนวนที่ถูกต้อง');
      } else {
        Alert.alert('ข้อผิดพลาด', 'กรุณากรอกจำนวนที่ถูกต้อง');
      }
      return;
    }
    if (!buyPrice || parseFloat(buyPrice) <= 0) {
      if (Platform.OS === 'web') {
        window.alert('กรุณากรอกราคาซื้อที่ถูกต้อง');
      } else {
        Alert.alert('ข้อผิดพลาด', 'กรุณากรอกราคาซื้อที่ถูกต้อง');
      }
      return;
    }

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
      };

      if (isEditing) {
        await updateInvestment(investmentData);
        if (Platform.OS === 'web') {
          window.alert('แก้ไขการลงทุนเรียบร้อย');
          navigation.goBack();
        } else {
          Alert.alert('สำเร็จ', 'แก้ไขการลงทุนเรียบร้อย', [
            { text: 'ตกลง', onPress: () => navigation.goBack() },
          ]);
        }
      } else {
        await saveInvestment(investmentData);
        if (Platform.OS === 'web') {
          window.alert('บันทึกการลงทุนเรียบร้อย');
          navigation.goBack();
        } else {
          Alert.alert('สำเร็จ', 'บันทึกการลงทุนเรียบร้อย', [
            { text: 'ตกลง', onPress: () => navigation.goBack() },
          ]);
        }
      }
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

        {type === 'stock' && (
          <View>
            <Text style={styles.label}>ค้นหาหุ้นต่างประเทศ</Text>
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
                placeholder="ค้นหาชื่อบริษัทหรือสัญลักษณ์ เช่น Apple, AAPL"
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
              {(['THB', 'USD', 'EUR', 'JPY', 'CNY'] as Currency[]).map((curr) => (
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
        </View>

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

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💡 เคล็ดลับ: ราคาปัจจุบันสามารถอัปเดตภายหลังได้ หรือเชื่อมต่อ API เพื่ออัปเดตอัตโนมัติ
          </Text>
        </View>

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
    fontWeight: '300',
    fontFamily: 'NotoSansThai_300Light',
  },
  typeTextSelected: {
    color: '#ffffff',
    fontWeight: '400',
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
  infoBox: {
    backgroundColor: COLORS.background,
    borderRadius: 0,
    padding: 16,
    marginTop: 24,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoText: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    lineHeight: 18,
    flex: 1,
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
  searchContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  searchInput: {
    flex: 1,
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
    maxHeight: 300,
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
    fontWeight: '600',
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
