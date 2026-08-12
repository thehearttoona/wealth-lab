import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { UserCurrency, UserPlatform } from '../types/investment';
import {
  getCurrencies,
  saveCurrency,
  updateCurrency,
  deleteCurrency,
  seedDefaultCurrencies,
  refreshCurrencyCache,
} from '../services/currencyStorage';
import {
  getPlatforms,
  savePlatform,
  updatePlatform,
  deletePlatform,
  seedDefaultPlatforms,
} from '../services/platformStorage';
import { renameCurrencyEverywhere, renamePlatformEverywhere } from '../services/catalogRename';
import { getInvestments } from '../services/investmentStorage';
import { getRealizedTrades } from '../services/realizedStorage';
import { getAccounts } from '../services/accountStorage';
import { getRateToTHB } from '../services/priceApi';
import { COLORS } from '../utils/constants';
import { notify, confirmAsk } from '../utils/dialog';

type Tab = 'currency' | 'platform';

// นับว่าแต่ละสกุลเงิน/แพลตฟอร์มถูกใช้อยู่กี่รายการ — ตัวเลขนี้คือเงื่อนไขห้ามลบ
interface Usage {
  currency: { [code: string]: number };
  platform: { [name: string]: number };
}

const EMPTY_USAGE: Usage = { currency: {}, platform: {} };

/** บรรทัดสรุปค่าธรรมเนียมใต้ชื่อแพลตฟอร์มในลิสต์ — "ยังไม่ตั้ง" ต้องต่างจาก "ฟรี" */
const platformFeeLabel = (p: UserPlatform): string => {
  const parts: string[] = [];
  if (p.feePercent != null) parts.push(`${p.feePercent}% ต่อคำสั่ง`);
  if (p.feeMinTHB != null) parts.push(`ขั้นต่ำ ${p.feeMinTHB} บาท`);
  return parts.length > 0 ? parts.join(' · ') : 'ยังไม่ได้ตั้งค่าธรรมเนียม';
};

export default function ManageCatalogScreen() {
  const [tab, setTab] = useState<Tab>('currency');
  const [currencies, setCurrencies] = useState<UserCurrency[]>([]);
  const [platforms, setPlatforms] = useState<UserPlatform[]>([]);
  const [usage, setUsage] = useState<Usage>(EMPTY_USAGE);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);

  // modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<UserCurrency | null>(null);
  const [editingPlatform, setEditingPlatform] = useState<UserPlatform | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [symbolInput, setSymbolInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  // ค่าธรรมเนียมของแพลตฟอร์ม — เก็บเป็น string ระหว่างพิมพ์ ว่าง = "ยังไม่ตั้ง" (ต่างจาก 0)
  const [feePercentInput, setFeePercentInput] = useState('');
  const [feeMinInput, setFeeMinInput] = useState('');
  const [fetchingRate, setFetchingRate] = useState(false);
  const [saving, setSaving] = useState(false);

  // ห่อ confirmAsk แบบ callback ไว้ เพราะจุดเรียกในไฟล์นี้เป็น handler ที่ไม่ใช่ async
  const askThen = (title: string, msg: string, onYes: () => void, yesLabel = 'ตกลง') => {
    confirmAsk(title, msg, yesLabel).then((ok) => { if (ok) onYes(); });
  };

  const load = useCallback(async () => {
    try {
      const [investments, accounts] = await Promise.all([getInvestments(), getAccounts()]);
      let realized: { currency?: string; platform?: string }[] = [];
      try {
        realized = await getRealizedTrades();
      } catch {
        realized = []; // ยังไม่ได้รัน sql/realized_trades.sql — ไม่ต้องนับ
      }

      const nextUsage: Usage = { currency: {}, platform: {} };
      const bump = (bucket: { [k: string]: number }, key?: string) => {
        const k = (key || '').trim();
        if (!k) return;
        bucket[k] = (bucket[k] || 0) + 1;
      };
      investments.forEach((inv) => {
        bump(nextUsage.currency, inv.currency);
        bump(nextUsage.platform, inv.platform);
      });
      accounts.forEach((acc) => {
        bump(nextUsage.currency, acc.currency);
        bump(nextUsage.platform, acc.platform);
      });
      // นับแพลตฟอร์มของรายการที่ขายแล้วด้วย — ยังต้องใช้ตอนกดย้อนคืนให้ของกลับเข้าโบรกเดิม
      // ถ้าไม่นับ จะดูเหมือนไม่มีใครใช้แล้วเผลอลบทิ้ง กลายเป็นชื่อกำพร้าตอนกู้คืน
      realized.forEach((t) => {
        bump(nextUsage.currency, t.currency);
        bump(nextUsage.platform, t.platform);
      });
      setUsage(nextUsage);

      let [curList, platList] = await Promise.all([getCurrencies(), getPlatforms()]);

      // เติมค่าเริ่มต้นให้ครั้งแรก — รวมชื่อที่เคยพิมพ์เองไว้ในรายการลงทุน/บัญชี จะได้ไม่มีของกำพร้า
      if (curList.length === 0) {
        try {
          curList = await seedDefaultCurrencies();
        } catch (e: any) {
          if (/does not exist|schema cache/i.test(e?.message || '')) setTableMissing(true);
        }
      }
      if (platList.length === 0) {
        try {
          platList = await seedDefaultPlatforms(Object.keys(nextUsage.platform));
        } catch (e: any) {
          if (/does not exist|schema cache/i.test(e?.message || '')) setTableMissing(true);
        }
      }

      setCurrencies(curList);
      setPlatforms(platList);
      await refreshCurrencyCache();
    } catch (e: any) {
      notify('โหลดข้อมูลไม่สำเร็จ\n' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const usedCount = (item: UserCurrency | UserPlatform): number =>
    'code' in item ? usage.currency[item.code] || 0 : usage.platform[item.name] || 0;

  // ── modal ──
  const openAdd = () => {
    setEditingCurrency(null);
    setEditingPlatform(null);
    setCodeInput('');
    setSymbolInput('');
    setRateInput('');
    setNameInput('');
    setFeePercentInput('');
    setFeeMinInput('');
    setModalVisible(true);
  };

  const openEditCurrency = (c: UserCurrency) => {
    setEditingCurrency(c);
    setEditingPlatform(null);
    setCodeInput(c.code);
    setSymbolInput(c.symbol || '');
    setRateInput(c.rateToTHB != null ? c.rateToTHB.toString() : '');
    setModalVisible(true);
  };

  const openEditPlatform = (p: UserPlatform) => {
    setEditingPlatform(p);
    setEditingCurrency(null);
    setNameInput(p.name);
    setFeePercentInput(p.feePercent != null ? String(p.feePercent) : '');
    setFeeMinInput(p.feeMinTHB != null ? String(p.feeMinTHB) : '');
    setModalVisible(true);
  };

  const handleFetchRate = async () => {
    const code = codeInput.trim().toUpperCase();
    if (!code) {
      notify('ใส่โค้ดสกุลเงินก่อน เช่น USD');
      return;
    }
    setFetchingRate(true);
    try {
      const rate = await getRateToTHB(code);
      if (rate == null) notify(`ไม่พบเรตของ ${code} — กรอกเองได้เลย`);
      else setRateInput(rate.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));
    } catch {
      notify('ดึงเรตไม่สำเร็จ — กรอกเองได้เลย');
    } finally {
      setFetchingRate(false);
    }
  };

  const handleSaveCurrency = async () => {
    const code = codeInput.trim().toUpperCase();
    if (!code) { notify('กรุณาใส่โค้ดสกุลเงิน เช่น USD'); return; }
    const dup = currencies.find((c) => c.code.toUpperCase() === code && c.id !== editingCurrency?.id);
    if (dup) { notify(`มีสกุลเงิน ${code} อยู่แล้ว`); return; }
    const rate = parseFloat(rateInput.replace(/,/g, ''));
    const item: UserCurrency = {
      id: editingCurrency?.id ?? Date.now().toString(),
      code,
      symbol: symbolInput.trim() || undefined,
      rateToTHB: Number.isFinite(rate) && rate > 0 ? rate : undefined,
      createdAt: editingCurrency?.createdAt ?? new Date().toISOString(),
    };
    const oldCode = editingCurrency?.code;
    const renaming = !!oldCode && oldCode !== code;
    const affected = oldCode ? usage.currency[oldCode] || 0 : 0;

    const run = async () => {
      setSaving(true);
      try {
        if (editingCurrency) await updateCurrency(item);
        else await saveCurrency(item);
        if (renaming && affected > 0) await renameCurrencyEverywhere(oldCode!, code);
        setModalVisible(false);
        await load();
      } catch (e: any) {
        notify('บันทึกไม่สำเร็จ\n' + (e?.message || String(e)));
      } finally {
        setSaving(false);
      }
    };

    if (renaming && affected > 0) {
      askThen(
        'เปลี่ยนชื่อสกุลเงิน',
        `"${oldCode}" → "${code}" จะไล่อัปเดตรายการที่ใช้อยู่ ${affected} รายการให้ด้วย`,
        run,
        'เปลี่ยนเลย'
      );
    } else {
      run();
    }
  };

  const handleSavePlatform = async () => {
    const name = nameInput.trim();
    if (!name) { notify('กรุณาใส่ชื่อแพลตฟอร์ม'); return; }
    const dup = platforms.find((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== editingPlatform?.id);
    if (dup) { notify(`มีแพลตฟอร์ม "${name}" อยู่แล้ว`); return; }
    // ว่าง = ยังไม่ตั้ง (undefined) ไม่ใช่ 0 — 0 แปลว่า "ฟรีจริง ๆ" คนละความหมายกัน
    const numOrUndef = (raw: string): number | undefined => {
      const v = parseFloat(raw.replace(/,/g, ''));
      return raw.trim() !== '' && Number.isFinite(v) && v >= 0 ? v : undefined;
    };
    const item: UserPlatform = {
      id: editingPlatform?.id ?? Date.now().toString(),
      name,
      feePercent: numOrUndef(feePercentInput),
      feeMinTHB: numOrUndef(feeMinInput),
      createdAt: editingPlatform?.createdAt ?? new Date().toISOString(),
    };
    const oldName = editingPlatform?.name;
    const renaming = !!oldName && oldName !== name;
    const affected = oldName ? usage.platform[oldName] || 0 : 0;

    const run = async () => {
      setSaving(true);
      try {
        if (editingPlatform) await updatePlatform(item);
        else await savePlatform(item);
        if (renaming && affected > 0) await renamePlatformEverywhere(oldName!, name);
        setModalVisible(false);
        await load();
      } catch (e: any) {
        notify('บันทึกไม่สำเร็จ\n' + (e?.message || String(e)));
      } finally {
        setSaving(false);
      }
    };

    if (renaming && affected > 0) {
      askThen(
        'เปลี่ยนชื่อแพลตฟอร์ม',
        `"${oldName}" → "${name}" จะไล่อัปเดตรายการที่ใช้อยู่ ${affected} รายการให้ด้วย`,
        run,
        'เปลี่ยนเลย'
      );
    } else {
      run();
    }
  };

  const handleDelete = () => {
    const item = editingCurrency ?? editingPlatform;
    if (!item) return;
    const label = editingCurrency ? editingCurrency.code : editingPlatform!.name;
    const count = usedCount(item);
    if (count > 0) {
      notify(`ลบไม่ได้ — ยังมี ${count} รายการใช้ "${label}" อยู่\nย้ายรายการเหล่านั้นไปใช้ตัวอื่นก่อน`);
      return;
    }
    askThen('ลบรายการ', `ลบ "${label}" ?`, async () => {
      try {
        if (editingCurrency) await deleteCurrency(editingCurrency.id);
        else await deletePlatform(editingPlatform!.id);
        setModalVisible(false);
        await load();
      } catch (e: any) {
        notify('ลบไม่สำเร็จ\n' + (e?.message || String(e)));
      }
    }, 'ลบ');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  const isCurrencyTab = tab === 'currency';

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, isCurrencyTab && styles.tabBtnActive]}
          onPress={() => setTab('currency')}
        >
          <Text style={[styles.tabText, isCurrencyTab && styles.tabTextActive]}>
            สกุลเงิน ({currencies.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, !isCurrencyTab && styles.tabBtnActive]}
          onPress={() => setTab('platform')}
        >
          <Text style={[styles.tabText, !isCurrencyTab && styles.tabTextActive]}>
            แพลตฟอร์ม ({platforms.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* เดสก์ท็อปไม่มีเพดานความกว้างแล้ว — เนื้อหาใช้เต็ม pane (ดู utils/responsive.ts) */}
      <ScrollView contentContainerStyle={styles.listContent}>
        {tableMissing && (
          <Text style={styles.warnBox}>
            ยังใช้ไม่ได้ — เอาไฟล์ `sql/catalog_currencies_platforms.sql` ไปรันที่ Supabase SQL editor ก่อน 1 ครั้ง
          </Text>
        )}

        <Text style={styles.intro}>
          {isCurrencyTab
            ? 'สกุลเงินที่เลือกได้ตอนบันทึกการลงทุน/บัญชี — "เรตต่อบาท" ใช้คิดมูลค่าพอร์ตรวม ถ้าไม่ตั้งจะถูกคิดเป็น 1:1 กับบาท'
            : 'แพลตฟอร์มที่เลือกได้ตอนบันทึกการลงทุน/บัญชี — เปลี่ยนชื่อแล้วรายการที่ใช้อยู่จะถูกอัปเดตตามให้'}
          {'\n'}ตัวที่มีรายการใช้อยู่จะลบไม่ได้ ต้องย้ายรายการออกก่อน
        </Text>

        {(isCurrencyTab ? currencies : platforms).map((item) => {
          const isCur = 'code' in item;
          const label = isCur ? (item as UserCurrency).code : (item as UserPlatform).name;
          const count = usedCount(item);
          const locked = count > 0;
          const cur = isCur ? (item as UserCurrency) : null;
          return (
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              onPress={() => (cur ? openEditCurrency(cur) : openEditPlatform(item as UserPlatform))}
            >
              <View style={styles.cardIcon}>
                <Text style={styles.cardIconText}>
                  {cur ? cur.symbol || cur.code.slice(0, 1) : label.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.cardMid}>
                <Text style={styles.cardName}>{label}</Text>
                <Text style={styles.cardSub}>
                  {cur
                    ? cur.rateToTHB != null
                      ? `1 ${cur.code} = ${cur.rateToTHB} บาท`
                      : cur.code === 'THB'
                        ? 'สกุลหลัก'
                        : '⚠ ยังไม่ตั้งเรต — ถูกคิดเป็น 1:1 กับบาท'
                    : platformFeeLabel(item as UserPlatform)}
                </Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={[styles.usageText, locked && styles.usageTextActive]}>
                  {locked ? `ใช้อยู่ ${count}` : 'ยังไม่ถูกใช้'}
                </Text>
                {locked && <Ionicons name="lock-closed" size={13} color={COLORS.textSecondary} />}
                <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add-circle-outline" size={20} color="#ffffff" />
          <Text style={styles.addBtnText}>
            {isCurrencyTab ? 'เพิ่มสกุลเงิน' : 'เพิ่มแพลตฟอร์ม'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Add/Edit modal ── */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={styles.modalCardContent}
            showsVerticalScrollIndicator={false}
          >
            {isCurrencyTab ? (
              <>
                <Text style={styles.modalTitle}>
                  <Ionicons name="cash-outline" size={18} color={COLORS.primary} />{' '}
                  {editingCurrency ? 'แก้ไขสกุลเงิน' : 'เพิ่มสกุลเงิน'}
                </Text>

                <Text style={styles.modalLabel}>โค้ดสกุลเงิน</Text>
                <TextInput
                  style={styles.modalInput}
                  value={codeInput}
                  onChangeText={setCodeInput}
                  autoCapitalize="characters"
                  placeholder="เช่น USD, GBP, SGD"
                  placeholderTextColor={COLORS.textSecondary}
                />

                <Text style={styles.modalLabel}>สัญลักษณ์ (ไม่บังคับ)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={symbolInput}
                  onChangeText={setSymbolInput}
                  placeholder="เช่น $ € ¥ — เว้นว่างจะใช้โค้ดแทน"
                  placeholderTextColor={COLORS.textSecondary}
                />

                <Text style={styles.modalLabel}>1 หน่วย = กี่บาท</Text>
                <View style={styles.rateRow}>
                  <TextInput
                    style={[styles.modalInput, styles.rateInput]}
                    value={rateInput}
                    onChangeText={setRateInput}
                    keyboardType="numeric"
                    placeholder="เช่น 35"
                    placeholderTextColor={COLORS.textSecondary}
                  />
                  <TouchableOpacity style={styles.rateBtn} onPress={handleFetchRate} disabled={fetchingRate}>
                    {fetchingRate ? (
                      <ActivityIndicator color={COLORS.primary} size="small" />
                    ) : (
                      <>
                        <Ionicons name="cloud-download-outline" size={15} color={COLORS.primary} />
                        <Text style={styles.rateBtnText}> ดึงเรตสด</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalHint}>
                  เรตสดมาจาก open.er-api.com (แคช 1 ชม.) — ดึงมาแล้วแก้เองได้ ระบบจะใช้ค่าที่บันทึกไว้เสมอ
                </Text>

                <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveCurrency} disabled={saving}>
                  <Text style={styles.modalSaveBtnText}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>
                  <Ionicons name="business-outline" size={18} color={COLORS.primary} />{' '}
                  {editingPlatform ? 'แก้ไขแพลตฟอร์ม' : 'เพิ่มแพลตฟอร์ม'}
                </Text>

                <Text style={styles.modalLabel}>ชื่อแพลตฟอร์ม</Text>
                <TextInput
                  style={styles.modalInput}
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="เช่น Bitkub, Dime!, IBKR"
                  placeholderTextColor={COLORS.textSecondary}
                />

                {/* ── ค่าธรรมเนียม / ค่าคอมมิชชัน ──
                    เป็นคุณสมบัติของแพลตฟอร์ม กรอกครั้งเดียวใช้กับทุกไม้ที่ซื้อผ่านที่นี่
                    เว้นว่าง = ยังไม่รู้ ไม่ใช่ฟรี — ระบบจะไม่เอาไปประมาณให้ */}
                <Text style={styles.modalLabel}>ค่าธรรมเนียมต่อคำสั่ง (% ของมูลค่า)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={feePercentInput}
                  onChangeText={setFeePercentInput}
                  keyboardType="numeric"
                  placeholder="เช่น 0.25 — เว้นว่างถ้ายังไม่รู้"
                  placeholderTextColor={COLORS.textSecondary}
                />

                <Text style={styles.modalLabel}>ขั้นต่ำต่อคำสั่ง (บาท)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={feeMinInput}
                  onChangeText={setFeeMinInput}
                  keyboardType="numeric"
                  placeholder="เช่น 50 — เว้นว่างถ้าไม่มีขั้นต่ำ"
                  placeholderTextColor={COLORS.textSecondary}
                />
                <Text style={styles.modalHint}>
                  คิดเป็น "% ของมูลค่า แต่ไม่ต่ำกว่าขั้นต่ำ" ตามที่โบรกส่วนใหญ่คิดจริง
                  {'\n'}เว้นว่างทั้งสองช่อง = ยังไม่ได้ตั้ง (ต่างจากกรอก 0 ซึ่งแปลว่าฟรี)
                  {'\n'}ยังใช้ไม่ได้ถ้ายังไม่ได้รัน `sql/user_platforms_fee.sql` — บันทึกได้แต่ค่าธรรมเนียมจะไม่ถูกเก็บ
                </Text>

                <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSavePlatform} disabled={saving}>
                  <Text style={styles.modalSaveBtnText}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.modalBottomRow}>
              {(editingCurrency || editingPlatform) && (
                <TouchableOpacity onPress={handleDelete}>
                  <Text
                    style={[
                      styles.modalDeleteText,
                      usedCount((editingCurrency ?? editingPlatform)!) > 0 && styles.modalDeleteTextLocked,
                    ]}
                  >
                    {usedCount((editingCurrency ?? editingPlatform)!) > 0
                      ? `ลบไม่ได้ (ใช้อยู่ ${usedCount((editingCurrency ?? editingPlatform)!)})`
                      : 'ลบ'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>ปิด</Text>
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
  tabRow: { flexDirection: 'row', backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabBtn: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: COLORS.primary },
  tabText: { fontSize: 13, fontFamily: 'NotoSansThai_400Regular', color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.primary, fontFamily: 'NotoSansThai_600SemiBold' },
  listContent: { padding: 16, gap: 10 },
  intro: { fontSize: 12, fontFamily: 'NotoSansThai_400Regular', color: COLORS.textSecondary, lineHeight: 18, marginBottom: 4 },
  warnBox: {
    fontSize: 12,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.warning,
    borderWidth: 1,
    borderColor: COLORS.warning,
    padding: 12,
    lineHeight: 18,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 12,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${COLORS.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardIconText: { fontSize: 15, fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.primary },
  cardMid: { flex: 1 },
  cardName: { fontSize: 15, fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.text },
  cardSub: { fontSize: 11, fontFamily: 'NotoSansThai_400Regular', color: COLORS.textSecondary, marginTop: 2 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  usageText: { fontSize: 11, fontFamily: 'NotoSansThai_400Regular', color: COLORS.textSecondary },
  usageTextActive: { color: COLORS.primary, fontFamily: 'NotoSansThai_600SemiBold' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    marginTop: 6,
  },
  addBtnText: { color: '#ffffff', fontSize: 15, fontFamily: 'NotoSansThai_600SemiBold' },
  // modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '100%',
    flexGrow: 0,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
  },
  modalCardContent: { padding: 20 },
  modalTitle: { fontSize: 16, fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.text, marginBottom: 12 },
  modalLabel: { fontSize: 12, fontFamily: 'NotoSansThai_500Medium', color: COLORS.textSecondary, marginTop: 12, marginBottom: 6 },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'NotoSansThai_400Regular',
    color: COLORS.text,
  },
  modalHint: { fontSize: 11, fontFamily: 'NotoSansThai_300Light', color: COLORS.textSecondary, marginTop: 6, lineHeight: 16 },
  rateRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  // minWidth:0 ไม่งั้น <input> ย่อไม่ลง แล้วปุ่ม "ดึงเรต" จะถูกดันล้นการ์ด modal บนมือถือ
  rateInput: { flex: 1, minWidth: 0 },
  rateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
    minWidth: 110,
  },
  rateBtnText: { fontSize: 12, fontFamily: 'NotoSansThai_500Medium', color: COLORS.primary },
  modalSaveBtn: { backgroundColor: COLORS.primary, paddingVertical: 13, alignItems: 'center', marginTop: 20 },
  modalSaveBtnText: { color: '#ffffff', fontSize: 15, fontFamily: 'NotoSansThai_600SemiBold' },
  modalBottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  modalDeleteText: { color: COLORS.error, fontSize: 13, fontFamily: 'NotoSansThai_500Medium' },
  modalDeleteTextLocked: { color: COLORS.textSecondary },
  modalCancelText: { color: COLORS.textSecondary, fontSize: 13, fontFamily: 'NotoSansThai_500Medium', marginLeft: 'auto' },
});
