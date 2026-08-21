import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import {
  Investment,
  InvestmentType,
  Currency,
  INVESTMENT_TYPES,
  INVESTMENT_PLATFORMS,
  DEFAULT_CURRENCIES,
} from '../types/investment';
import {
  getInvestments,
  saveInvestments,
  updateInvestment,
  updateInvestmentsPlatform,
  deleteInvestments,
} from '../services/investmentStorage';
import { updateInvestmentPrice, searchCryptoList, searchStockList } from '../services/priceApi';
import { searchFundList } from '../services/fundCatalog';
import { getPlatforms } from '../services/platformStorage';
import { getCurrencies } from '../services/currencyStorage';
import { formatCurrencyWithType, COLORS } from '../utils/constants';
import { notify, confirmAsk } from '../utils/dialog';
import { MascotEmpty } from '../components/Mascot';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ManageByPlatform'>;

const UNASSIGNED = 'ไม่ระบุแพลตฟอร์ม';
const FETCHABLE: InvestmentType[] = ['crypto', 'stock_th', 'stock_foreign', 'gold'];
// ประเภทที่ค้นชื่อเต็มจากตัวย่อได้ (crypto/หุ้น = API ค้นหา, กองทุน = แคตตาล็อก funds.json)
const SEARCHABLE: InvestmentType[] = ['crypto', 'stock_th', 'stock_foreign', 'fund'];

// ผลค้นหาแบบรวมทุกประเภทให้หน้าจอใช้เหมือนกันหมด
interface SymbolHit {
  symbol: string;
  name: string;
  currency?: string;
}

// ค้นตัวย่อ → ชื่อเต็ม ตามประเภทของแถวนั้น (ใช้ตัวเดียวกับหน้า "เพิ่มการลงทุน" ทีละรายการ)
const searchByType = async (type: InvestmentType, query: string): Promise<SymbolHit[]> => {
  const q = query.trim();
  if (!q) return [];
  if (type === 'crypto') {
    return (await searchCryptoList(q)).map((c) => ({ symbol: c.symbol.toUpperCase(), name: c.name }));
  }
  if (type === 'stock_th' || type === 'stock_foreign') {
    return (await searchStockList(q, type === 'stock_th' ? 'th' : 'foreign')).map((s) => ({
      symbol: s.symbol,
      name: s.name,
      currency: s.currency,
    }));
  }
  if (type === 'fund') {
    return (await searchFundList(q)).map((f) => ({ symbol: f.abbr || f.id, name: f.name }));
  }
  return [];
};

// แถวสำหรับ "เพิ่มหลายรายการ"
interface AddRow {
  key: string;
  type: InvestmentType;
  symbol: string;
  name: string;
  quantity: string;
  buyPrice: string;
  currency: Currency;
  currentPrice: string;
  fetching?: boolean;
  searching?: boolean;
  hits?: SymbolHit[];   // ผลค้นหาที่ยังไม่ได้เลือก
}

const confirmMsg = (msg: string): Promise<boolean> => confirmAsk('ยืนยัน', msg);

export default function ManageByPlatformScreen() {
  const navigation = useNavigation<Nav>();
  // เดสก์ท็อปไม่มีเพดานความกว้างแล้ว — เนื้อหาใช้เต็ม pane (ดู utils/responsive.ts)

  const [mode, setMode] = useState<'edit' | 'add'>('edit');
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // โหมดแก้ไข
  const [selected, setSelected] = useState<string[]>([]);
  const [moveVisible, setMoveVisible] = useState(false);
  const [movePlatform, setMovePlatform] = useState('');

  // โหมดเพิ่ม
  const keySeq = React.useRef(0);
  const emptyRow = (): AddRow => ({
    key: `r${keySeq.current++}`,
    type: 'stock_th',
    symbol: '',
    name: '',
    quantity: '',
    buyPrice: '',
    currency: 'THB',
    currentPrice: '',
  });
  const [addPlatform, setAddPlatform] = useState('');
  const [addRows, setAddRows] = useState<AddRow[]>(() => [emptyRow()]);

  // ตัวเลือกแพลตฟอร์ม/สกุลเงิน = ของที่ผู้ใช้ตั้งไว้ในหน้า "สกุลเงิน & แพลตฟอร์ม" (ไม่ hardcode)
  // ยังไม่ได้รัน SQL หรือแคตตาล็อกว่าง → fallback เป็นค่าเริ่มต้นเดิม เพื่อไม่ให้หน้าใช้ไม่ได้
  const [platformOptions, setPlatformOptions] = useState<string[]>(INVESTMENT_PLATFORMS);
  const [currencyOptions, setCurrencyOptions] = useState<string[]>(
    DEFAULT_CURRENCIES.map((c) => c.code)
  );

  const load = async () => {
    try {
      setInvestments(await getInvestments());
    } catch {
      setInvestments([]);
    } finally {
      setLoading(false);
    }
    try {
      const [platList, curList] = await Promise.all([getPlatforms(), getCurrencies()]);
      if (platList.length > 0) setPlatformOptions(platList.map((p) => p.name));
      if (curList.length > 0) setCurrencyOptions(curList.map((c) => c.code));
    } catch {
      // ใช้ค่าเริ่มต้นต่อไป
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [])
  );

  // ── จัดกลุ่มตาม platform ── (มีชื่อก่อน เรียง A→Z, "ไม่ระบุ" ไว้ท้ายสุด)
  const groups = (() => {
    const map: Record<string, Investment[]> = {};
    investments.forEach((inv) => {
      const key = (inv.platform || '').trim() || UNASSIGNED;
      (map[key] = map[key] || []).push(inv);
    });
    return Object.keys(map)
      .sort((a, b) => {
        if (a === UNASSIGNED) return 1;
        if (b === UNASSIGNED) return -1;
        return a.localeCompare(b);
      })
      .map((platform) => ({ platform, items: map[platform] }));
  })();

  // ── selection helpers ──
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const toggleGroup = (items: Investment[]) => {
    const ids = items.map((i) => i.id);
    const allSel = ids.every((id) => selected.includes(id));
    setSelected((s) =>
      allSel ? s.filter((x) => !ids.includes(x)) : Array.from(new Set([...s, ...ids]))
    );
  };

  // ── bulk actions (โหมดแก้ไข) ──
  const handleMovePlatform = async () => {
    setBusy(true);
    try {
      await updateInvestmentsPlatform(selected, movePlatform.trim() || null);
      await load();
      setSelected([]);
      setMoveVisible(false);
      setMovePlatform('');
    } catch {
      notify('ย้ายแพลตฟอร์มไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkFetchPrice = async () => {
    setBusy(true);
    let ok = 0;
    const targets = investments.filter(
      (i) => selected.includes(i.id) && FETCHABLE.includes(i.type)
    );
    try {
      for (const inv of targets) {
        const p = await updateInvestmentPrice(inv.type, inv.symbol, inv.currency || 'THB');
        if (p !== null && p > 0) {
          await updateInvestment({ ...inv, currentPrice: p });
          ok++;
        }
      }
      await load();
      setSelected([]);
      notify(
        targets.length === 0
          ? 'รายการที่เลือกดึงราคาอัตโนมัติไม่ได้ (กองทุน/อื่นๆ ต้องกรอกเอง)'
          : `อัปเดตราคาสำเร็จ ${ok}/${targets.length} รายการ`
      );
    } catch {
      notify('ดึงราคาไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    const ok = await confirmMsg(`ต้องการลบ ${selected.length} รายการที่เลือกใช่หรือไม่?`);
    if (!ok) return;
    setBusy(true);
    try {
      await deleteInvestments(selected);
      await load();
      setSelected([]);
    } catch {
      notify('ลบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  // ── add-mode helpers ──
  const updateRow = (key: string, patch: Partial<AddRow>) =>
    setAddRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeRow = (key: string) =>
    setAddRows((rows) => (rows.length <= 1 ? [emptyRow()] : rows.filter((r) => r.key !== key)));

  // ค้นตัวย่อของแถวนั้น → โชว์รายการให้เลือก (ได้ทั้งตัวย่อจริงและชื่อเต็ม ไม่ต้องพิมพ์เอง)
  const handleRowSearch = async (key: string) => {
    const r = addRows.find((x) => x.key === key);
    if (!r) return;
    const q = r.symbol.trim();
    if (!q) {
      notify('พิมพ์ตัวย่อหรือชื่อที่อยากค้นก่อน');
      return;
    }
    updateRow(key, { searching: true, hits: [] });
    try {
      const hits = await searchByType(r.type, q);
      updateRow(key, { searching: false, hits });
      if (hits.length === 0) notify('ไม่พบรายการที่ค้น — พิมพ์ชื่อเต็มเองได้');
    } catch {
      updateRow(key, { searching: false, hits: [] });
      notify('ค้นหาไม่สำเร็จ (เน็ต/โควตา API) — พิมพ์ชื่อเต็มเองได้');
    }
  };

  // เลือกจากผลค้นหา → เติมตัวย่อ/ชื่อเต็ม/สกุลเงิน แล้วดึงราคาต่อให้เลย ไม่ต้องกดซ้ำ
  const pickHit = async (key: string, hit: SymbolHit) => {
    const currency = hit.currency && currencyOptions.includes(hit.currency) ? hit.currency : undefined;
    const patch: Partial<AddRow> = {
      symbol: hit.symbol,
      name: hit.name,
      hits: [],
      ...(currency ? { currency } : {}),
    };
    updateRow(key, patch);
    await fetchRowData(key, patch);
  };

  // ดึงข้อมูลของแถว: ชื่อเต็ม (ถ้ายังว่าง) + ราคาปัจจุบัน
  // override = ค่าที่เพิ่ง set ไปในจังหวะเดียวกัน (state ยังไม่อัปเดตทัน) ต้องส่งมาเองไม่งั้นอ่านค่าเก่า
  const fetchRowData = async (key: string, override?: Partial<AddRow>) => {
    const base = addRows.find((x) => x.key === key);
    if (!base) return;
    const r = { ...base, ...override };
    const sym = r.symbol.trim();
    if (!sym) {
      notify('กรอกตัวย่อ/รหัสก่อน');
      return;
    }
    updateRow(key, { fetching: true });
    try {
      // ชื่อเต็ม: เอาจากผลค้นหาที่ตัวย่อตรงที่สุด — ไม่ต้องพิมพ์เอง
      let name = r.name;
      if (!name.trim() && SEARCHABLE.includes(r.type)) {
        try {
          const hits = await searchByType(r.type, sym);
          const exact = hits.find((h) => h.symbol.toUpperCase() === sym.toUpperCase()) ?? hits[0];
          if (exact) name = exact.name;
        } catch {
          // ค้นชื่อไม่ได้ก็ไม่เป็นไร ยังดึงราคาต่อได้
        }
      }
      const price = FETCHABLE.includes(r.type)
        ? await updateInvestmentPrice(r.type, sym.toUpperCase(), r.currency)
        : null;
      updateRow(key, {
        fetching: false,
        name,
        currentPrice: price !== null && price > 0 ? price.toString() : r.currentPrice,
      });
      const gotName = !!name.trim() && !r.name.trim();
      const gotPrice = price !== null && price > 0;
      if (!gotPrice && FETCHABLE.includes(r.type)) {
        notify(
          gotName
            ? `ได้ชื่อ "${name}" แล้ว แต่ดึงราคาไม่ได้ — กรอกราคาปัจจุบันเอง`
            : 'ดึงข้อมูลไม่ได้ — ตรวจตัวย่อหรือกรอกเอง'
        );
      } else if (!gotPrice && !gotName && !r.name.trim()) {
        notify('ประเภทนี้ไม่มีราคาอัตโนมัติ — กรอกชื่อกับราคาเอง');
      }
    } catch {
      updateRow(key, { fetching: false });
      notify('ดึงข้อมูลไม่ได้');
    }
  };

  const handleSaveAll = async () => {
    // นับเฉพาะแถวที่เริ่มกรอกแล้ว (มีข้อมูลอย่างน้อย 1 ช่อง)
    const filled = addRows.filter(
      (r) => r.symbol.trim() || r.name.trim() || r.quantity.trim() || r.buyPrice.trim()
    );
    if (filled.length === 0) {
      notify('ยังไม่มีรายการให้บันทึก');
      return;
    }
    const invs: Investment[] = [];
    for (let i = 0; i < filled.length; i++) {
      const r = filled[i];
      if (
        !r.symbol.trim() ||
        !r.name.trim() ||
        !(parseFloat(r.quantity) > 0) ||
        !(parseFloat(r.buyPrice) > 0)
      ) {
        notify(`แถวที่ ${i + 1} กรอกไม่ครบ (ต้องมีตัวย่อ, ชื่อ, จำนวน, ราคา)`);
        return;
      }
      invs.push({
        id: `${Date.now()}-${i}`,
        type: r.type,
        symbol: r.symbol.trim().toUpperCase(),
        name: r.name.trim(),
        quantity: parseFloat(r.quantity),
        buyPrice: parseFloat(r.buyPrice),
        currency: r.currency,
        currentPrice: r.currentPrice ? parseFloat(r.currentPrice) : undefined,
        buyDate: new Date().toISOString(),
        platform: addPlatform.trim() || undefined,
      });
    }
    setBusy(true);
    try {
      await saveInvestments(invs);
      await load();
      setAddRows([emptyRow()]);
      notify(`บันทึก ${invs.length} รายการเรียบร้อย`);
    } catch {
      notify('บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* สลับโหมด */}
      <View style={styles.modeTabs}>
        <TouchableOpacity
          style={[styles.modeTab, mode === 'edit' && styles.modeTabActive]}
          onPress={() => setMode('edit')}
        >
          <Ionicons
            name="create-outline"
            size={16}
            color={mode === 'edit' ? '#ffffff' : COLORS.textSecondary}
          />
          <Text style={[styles.modeTabText, mode === 'edit' && styles.modeTabTextActive]}>
            แก้ไขหลายรายการ
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeTab, mode === 'add' && styles.modeTabActive]}
          onPress={() => setMode('add')}
        >
          <Ionicons
            name="add-circle-outline"
            size={16}
            color={mode === 'add' ? '#ffffff' : COLORS.textSecondary}
          />
          <Text style={[styles.modeTabText, mode === 'add' && styles.modeTabTextActive]}>
            เพิ่มหลายรายการ
          </Text>
        </TouchableOpacity>
      </View>

      {/* ═══════════ โหมดแก้ไข ═══════════ */}
      {mode === 'edit' && (
        <>
          <ScrollView
            style={styles.body}
            contentContainerStyle={{ padding: 16, paddingBottom: selected.length > 0 ? 96 : 24 }}
          >
            {groups.length === 0 ? (
              <MascotEmpty>ยังไม่มีการลงทุน{'\n'}ไปที่โหมด "เพิ่มหลายรายการ" เพื่อเริ่มได้เลย</MascotEmpty>
            ) : (
              groups.map((g) => {
                const ids = g.items.map((i) => i.id);
                const allSel = ids.every((id) => selected.includes(id));
                return (
                  <View key={g.platform} style={styles.groupCard}>
                    <TouchableOpacity style={styles.groupHeader} onPress={() => toggleGroup(g.items)}>
                      <Ionicons
                        name={allSel ? 'checkbox' : 'square-outline'}
                        size={18}
                        color={allSel ? COLORS.primary : COLORS.textSecondary}
                      />
                      <Text style={styles.groupName}>{g.platform}</Text>
                      <Text style={styles.groupCount}>{g.items.length} รายการ</Text>
                    </TouchableOpacity>
                    {g.items.map((inv) => {
                      const sel = selected.includes(inv.id);
                      return (
                        <TouchableOpacity
                          key={inv.id}
                          style={[styles.row, sel && styles.rowSelected]}
                          onPress={() => toggle(inv.id)}
                        >
                          <Ionicons
                            name={sel ? 'checkbox' : 'square-outline'}
                            size={18}
                            color={sel ? COLORS.primary : COLORS.textSecondary}
                          />
                          <View style={styles.rowInfo}>
                            <Text style={styles.rowSymbol}>
                              {inv.symbol} <Text style={styles.rowName}>· {inv.name}</Text>
                            </Text>
                            <Text style={styles.rowSub}>
                              {inv.quantity} หน่วย @ {formatCurrencyWithType(inv.buyPrice, inv.currency)}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* แถบเครื่องมือ เมื่อเลือกอย่างน้อย 1 */}
          {selected.length > 0 && (
            <View style={styles.actionBar}>
              <Text style={styles.actionBarText}>เลือก {selected.length} รายการ</Text>
              <View style={styles.actionBarBtns}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => setMoveVisible(true)}
                  disabled={busy}
                >
                  <Ionicons name="swap-horizontal-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.actionBtnText}>ย้าย</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleBulkFetchPrice}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <Ionicons name="refresh-outline" size={16} color={COLORS.primary} />
                  )}
                  <Text style={styles.actionBtnText}>ดึงราคา</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnDanger]}
                  onPress={handleBulkDelete}
                  disabled={busy}
                >
                  <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                  <Text style={[styles.actionBtnText, { color: COLORS.error }]}>ลบ</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}

      {/* ═══════════ โหมดเพิ่ม ═══════════ */}
      {mode === 'add' && (
        <ScrollView style={styles.body} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={styles.label}>แพลตฟอร์มของทั้งชุดนี้</Text>
          <View style={styles.chips}>
            {platformOptions.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.chip, addPlatform === p && styles.chipActive]}
                onPress={() => setAddPlatform(addPlatform === p ? '' : p)}
              >
                <Text style={[styles.chipText, addPlatform === p && styles.chipTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={addPlatform}
            onChangeText={setAddPlatform}
            placeholder="หรือพิมพ์ชื่อแพลตฟอร์มเอง (เว้นว่าง = ไม่ระบุ)"
            placeholderTextColor={COLORS.textSecondary}
          />

          {addRows.map((r, idx) => (
            <View key={r.key} style={styles.addCard}>
              <View style={styles.addCardHeader}>
                <Text style={styles.addCardTitle}>แถวที่ {idx + 1}</Text>
                <TouchableOpacity onPress={() => removeRow(r.key)}>
                  <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                {INVESTMENT_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    style={[styles.typeChip, r.type === t.value && styles.chipActive]}
                    onPress={() => updateRow(r.key, { type: t.value })}
                  >
                    <Text style={[styles.chipText, r.type === t.value && styles.chipTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.addRowFields}>
                <TextInput
                  style={[styles.input, styles.flex1]}
                  value={r.symbol}
                  onChangeText={(v) => updateRow(r.key, { symbol: v, hits: [] })}
                  placeholder="ตัวย่อ/ชื่อ เช่น PTT"
                  placeholderTextColor={COLORS.textSecondary}
                  autoCapitalize="characters"
                  returnKeyType="search"
                  onSubmitEditing={() => handleRowSearch(r.key)}
                />
                {/* ค้นตัวย่อ → ได้ชื่อเต็มมาให้เลือก ไม่ต้องพิมพ์ชื่อเอง */}
                {SEARCHABLE.includes(r.type) && (
                  <TouchableOpacity
                    style={styles.fetchBtn}
                    onPress={() => handleRowSearch(r.key)}
                    disabled={r.searching}
                  >
                    {r.searching ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Ionicons name="search-outline" size={16} color="#ffffff" />
                    )}
                  </TouchableOpacity>
                )}
              </View>
              {/* ผลค้นหา — กดแล้วเติมตัวย่อ/ชื่อ/สกุลเงิน แล้วดึงราคาต่อให้เอง */}
              {(r.hits?.length ?? 0) > 0 && (
                <View style={styles.hitBox}>
                  {r.hits!.slice(0, 8).map((h, hi) => (
                    <TouchableOpacity
                      key={`${h.symbol}-${hi}`}
                      style={styles.hitRow}
                      onPress={() => pickHit(r.key, h)}
                    >
                      <Text style={styles.hitSymbol}>{h.symbol}</Text>
                      <Text style={styles.hitName} numberOfLines={1}>
                        {h.name}
                        {h.currency ? ` · ${h.currency}` : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TextInput
                style={styles.input}
                value={r.name}
                onChangeText={(v) => updateRow(r.key, { name: v })}
                placeholder="ชื่อเต็ม (กดค้นหาแล้วจะเติมให้)"
                placeholderTextColor={COLORS.textSecondary}
              />
              <View style={styles.addRowFields}>
                <TextInput
                  style={[styles.input, styles.flex1]}
                  value={r.quantity}
                  onChangeText={(v) => updateRow(r.key, { quantity: v })}
                  placeholder="จำนวน"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="decimal-pad"
                />
                <TextInput
                  style={[styles.input, styles.flex1]}
                  value={r.buyPrice}
                  onChangeText={(v) => updateRow(r.key, { buyPrice: v })}
                  placeholder="ราคา AVG"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.currencyRow}>
                {currencyOptions.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.curBtn, r.currency === c && styles.chipActive]}
                    onPress={() => updateRow(r.key, { currency: c })}
                  >
                    <Text style={[styles.chipText, r.currency === c && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.addRowFields}>
                <TextInput
                  style={[styles.input, styles.flex1]}
                  value={r.currentPrice}
                  onChangeText={(v) => updateRow(r.key, { currentPrice: v })}
                  placeholder={`ราคาปัจจุบัน (${r.currency})`}
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="numeric"
                />
                {(FETCHABLE.includes(r.type) || SEARCHABLE.includes(r.type)) && (
                  <TouchableOpacity
                    style={styles.fetchBtnWide}
                    onPress={() => fetchRowData(r.key)}
                    disabled={r.fetching}
                  >
                    {r.fetching ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="cloud-download-outline" size={14} color="#ffffff" />
                        <Text style={styles.fetchBtnText}> ดึงข้อมูล</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}

          <TouchableOpacity style={styles.addRowBtn} onPress={() => setAddRows((r) => [...r, emptyRow()])}>
            <Ionicons name="add" size={18} color={COLORS.primary} />
            <Text style={styles.addRowBtnText}>เพิ่มแถว</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAll} disabled={busy}>
            {busy ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.saveBtnText}>บันทึกทั้งหมด ({addRows.length})</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Modal เลือกแพลตฟอร์มปลายทาง (ย้าย) */}
      <Modal visible={moveVisible} transparent animationType="fade" onRequestClose={() => setMoveVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={styles.modalCardContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>ย้าย {selected.length} รายการไปที่</Text>
            <View style={styles.chips}>
              {platformOptions.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, movePlatform === p && styles.chipActive]}
                  onPress={() => setMovePlatform(p)}
                >
                  <Text style={[styles.chipText, movePlatform === p && styles.chipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={movePlatform}
              onChangeText={setMovePlatform}
              placeholder="หรือพิมพ์เอง (เว้นว่าง = ไม่ระบุ)"
              placeholderTextColor={COLORS.textSecondary}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => {
                  setMoveVisible(false);
                  setMovePlatform('');
                }}
              >
                <Text style={styles.modalBtnGhostText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtn} onPress={handleMovePlatform} disabled={busy}>
                {busy ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalBtnText}>ยืนยัน</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  body: { flex: 1 },
  empty: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontFamily: 'NotoSansThai_300Light',
    fontSize: 14,
    marginTop: 60,
    lineHeight: 24,
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  modeTabActive: { backgroundColor: COLORS.primary, borderBottomColor: COLORS.primary },
  modeTabText: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
  },
  modeTabTextActive: { color: '#ffffff' },

  // group / rows (edit)
  groupCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: `${COLORS.primary}0D`,
  },
  groupName: { flex: 1, fontSize: 14, fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.text },
  groupCount: { fontSize: 11, fontFamily: 'NotoSansThai_400Regular', color: COLORS.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowSelected: { backgroundColor: `${COLORS.primary}12` },
  rowInfo: { flex: 1 },
  rowSymbol: { fontSize: 13, fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.text },
  rowName: { fontFamily: 'NotoSansThai_300Light', color: COLORS.textSecondary, fontSize: 12 },
  rowSub: { fontSize: 11, fontFamily: 'NotoSansThai_300Light', color: COLORS.textSecondary, marginTop: 2 },

  // action bar
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionBarText: { fontSize: 12, fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.text },
  actionBarBtns: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  actionBtnDanger: { borderColor: COLORS.error },
  actionBtnText: { fontSize: 12, fontFamily: 'NotoSansThai_400Regular', color: COLORS.primary },

  // add mode
  label: {
    fontSize: 10,
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    fontSize: 14,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.text,
    marginBottom: 8,
  },
  // ใช้กับ TextInput ในแถวเดียวกับปุ่ม — minWidth:0 จำเป็นเพราะ <input> บนเว็บ
  // มีความกว้างในตัว ~20 ตัวอักษร แล้ว min-width:auto ของ flex item ทำให้ย่อไม่ลง → แถวล้น
  flex1: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, fontFamily: 'NotoSansThai_400Regular', color: COLORS.text },
  chipTextActive: { color: '#ffffff' },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginRight: 8,
  },
  addCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginTop: 12,
  },
  addCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  addCardTitle: { fontSize: 12, fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.text },
  addRowFields: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  currencyRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  curBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  fetchBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.accent,
    height: 44,
  },
  fetchBtnWide: {
    backgroundColor: COLORS.accent,
    flexDirection: 'row',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.accent,
    height: 44,
  },
  fetchBtnText: { fontSize: 12, fontFamily: 'NotoSansThai_600SemiBold', color: '#ffffff' },
  // ── ผลค้นหาตัวย่อ (ชื่อเต็มมาจาก API/แคตตาล็อก ไม่ต้องพิมพ์เอง) ──
  hitBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginBottom: 8,
  },
  hitRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  hitSymbol: { fontSize: 13, fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.text },
  hitName: {
    fontSize: 11,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  addRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    marginTop: 12,
  },
  addRowBtnText: { fontSize: 13, fontFamily: 'NotoSansThai_400Regular', color: COLORS.primary },
  saveBtn: {
    backgroundColor: COLORS.primary,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '100%',
    flexGrow: 0,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCardContent: { padding: 20 },
  modalTitle: { fontSize: 15, fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.text, marginBottom: 16 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  modalBtnText: { color: '#ffffff', fontSize: 13, fontFamily: 'NotoSansThai_400Regular' },
  modalBtnGhost: { backgroundColor: 'transparent', borderColor: COLORS.border },
  modalBtnGhostText: { color: COLORS.text, fontSize: 13, fontFamily: 'NotoSansThai_400Regular' },
});
