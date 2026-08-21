import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { Investment } from '../types/investment';
import { RealizedTrade } from '../types/investment';
import { UserPlatform } from '../types/investment';
import { getPlatforms } from '../services/platformStorage';
import { UserCurrency } from '../types/investment';
import { getCurrencies } from '../services/currencyStorage';
import { resolveTradeFee } from '../utils/tradeFee';
import { TaxProfile, GAIN_RULE_LABELS } from '../types/tax';
import { getTaxProfile } from '../services/taxStorage';
import { UserProfile, incomeExemptionFor } from '../types/userProfile';
import { getUserProfile } from '../services/userProfileStorage';
import { calculateTax, gainRuleFor, taxYearOf } from '../utils/taxCalc';
import {
  getInvestments,
  deleteInvestment,
  setInvestmentCycle,
} from '../services/investmentStorage';
import { getRealizedTrades, saveRealizedTrade } from '../services/realizedStorage';
import { summarizeRealized } from '../utils/realizedAnalysis';
import {
  getInvestmentPlan,
  saveInvestmentPlan,
  InvestmentPlan,
  DryPowderItem,
  sumDryPowderItems,
} from '../services/investmentPlanStorage';
import { nextLegTHBOf, countSymbols } from '../utils/dryPowder';
import { InvestmentCycle, BasketKey, BASKET_ORDER, basketLabel, basketAccepts } from '../types/cycle';
import {
  getOpenCycles,
  getClosedCycles,
  openCycle,
  updateCycle,
  closeCycle,
  deleteCycle,
} from '../services/cycleStorage';
import {
  legsOfCycle,
  orphanLegsForBasket,
  summarizeCycle,
  exitPlanForCycle,
  FeeRule,
  summarizeCycleHistory,
  legCostTHB,
  legValueTHB,
} from '../utils/cycles';
import { CycleCard, CycleStartCard, CycleHistoryCard } from '../components/CycleCard';
import { CycleSettingsModal, CloseCycleModal, CloseCycleRow } from '../components/CycleModals';
import { MenuRow, MenuCard } from '../components/MenuRow';
import { MascotEmpty } from '../components/Mascot';
import { COLORS, formatCurrency, toChristianYear } from '../utils/constants';
import { notify, confirmAsk } from '../utils/dialog';
import { useResponsive } from '../utils/responsive';

const currentTaxYear = new Date().getFullYear() + 543;

/** ยอดบาทพร้อมเครื่องหมาย — ชุดเดียวกับที่หน้าพอร์ตใช้ */
const baht = (n: number, showPlus = false): string =>
  `${n < 0 ? '-' : showPlus ? '+' : ''}฿${formatCurrency(Math.abs(n))}`;

/**
 * หน้า "รอบลงทุน" — ยกการ์ดรอบทั้งหมดออกมาจากพอร์ต (ดู CLAUDE.md §6.5)
 * พอร์ตเหลือหน้าที่เดียวคือ "ถืออะไรอยู่/ถึงคิวลงไม้ตัวไหน" ส่วนการตัดสินใจระดับรอบ
 * (เป้ากำไรของตะกร้า · เหลือกระสุนกี่ไม้ · ปิดทั้งตะกร้า) มาอยู่ที่นี่ทั้งชุด
 */
export default function CyclesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDesktop } = useResponsive();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [realizedTrades, setRealizedTrades] = useState<RealizedTrade[]>([]);
  const [plan, setPlan] = useState<InvestmentPlan | null>(null);
  const [taxProfile, setTaxProfile] = useState<TaxProfile | null>(null);
  const [person, setPerson] = useState<UserProfile | null>(null);
  const [cycles, setCycles] = useState<InvestmentCycle[]>([]);
  const [closedCycles, setClosedCycles] = useState<InvestmentCycle[]>([]);
  // ค่าธรรมเนียมของแต่ละแพลตฟอร์ม — ใช้คิด "ราคาที่ต้องตั้งขาย" ให้รวมค่าธรรมเนียมขาขาย
  const [platforms, setPlatforms] = useState<UserPlatform[]>([]);
  const [currencies, setCurrencies] = useState<UserCurrency[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCycleHistory, setShowCycleHistory] = useState(false);
  // ── ตั้งค่ารอบ ──
  const [cycleSettings, setCycleSettings] = useState<InvestmentCycle | null>(null);
  const [cycleTargetInput, setCycleTargetInput] = useState('');
  const [cycleBudgetInput, setCycleBudgetInput] = useState('');
  const [cycleMaxLegsInput, setCycleMaxLegsInput] = useState('');
  // ── ปิดรอบ ──
  const [closeTarget, setCloseTarget] = useState<InvestmentCycle | null>(null);
  const [closeSelectedIds, setCloseSelectedIds] = useState<string[]>([]);
  const [closeFeesInput, setCloseFeesInput] = useState('');
  const [closeToPowder, setCloseToPowder] = useState(true);
  const [closeBusy, setCloseBusy] = useState(false);
  // ปิดรอบทำทีละไม้และไม่ใช่ transaction เดียว — เก็บผลไว้โชว์ว่าไม้ไหนไม่ผ่าน
  const [closeProgress, setCloseProgress] = useState<{
    done: number;
    total: number;
    failed: { symbol: string; message: string }[];
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setInvestments(await getInvestments());
    } catch {
      setInvestments([]);
    }
    try {
      setPlan(await getInvestmentPlan());
    } catch {
      setPlan(null);
    }
    try {
      setRealizedTrades(await getRealizedTrades());
    } catch {
      setRealizedTrades([]);
    }
    try {
      setTaxProfile(await getTaxProfile(currentTaxYear));
    } catch {
      setTaxProfile(null);
    }
    try {
      setPerson(await getUserProfile());
    } catch {
      setPerson(null);
    }
    try {
      // ยังไม่ได้รัน sql/investment_cycles.sql ก็คืน [] เอง การ์ดจะบอกให้ไปรัน SQL ตอนกดเปิดรอบ
      const [open, closed] = await Promise.all([getOpenCycles(), getClosedCycles()]);
      setCycles(open);
      setClosedCycles(closed);
    } catch {
      setCycles([]);
      setClosedCycles([]);
    }
    // ค่าธรรมเนียมล้มแยกจากก้อนอื่น — ไม่มีก็แค่ราคาที่โชว์ยังไม่รวมค่าธรรมเนียม (จอบอกเอง)
    try {
      setPlatforms(await getPlatforms());
    } catch {
      setPlatforms([]);
    }
    try {
      setCurrencies(await getCurrencies());
    } catch {
      setCurrencies([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [loadData])
  );

  // เงินต่อไม้ = "ไม้ถัดไป" จากหน้าเงินรอลงทุน (utils/dryPowder — ทางเดียวกันทั้งแอป)
  // ตัวนี้คือตัวแปลงงบที่เหลือให้เป็น "ลงได้อีกกี่ไม้" ซึ่งเป็นเลขที่ตัดสินกลยุทธ์นี้จริง ๆ
  // ต้องส่งจำนวนหุ้นไปด้วย (สูตรหารด้วย หุ้น × ครั้งต่อหุ้น) ไม่งั้นจอนี้ได้เลขคนละตัวกับหน้าเงินรอลงทุน
  const powderPerRound = nextLegTHBOf(plan, countSymbols(investments));

  // ค่าธรรมเนียมของคำสั่ง: แพลตฟอร์มก่อน → สกุลเงิน → ไม่รู้ (ดู utils/tradeFee.ts)
  //
  // ⚠️ ต้องประกาศ **เหนือ** cycleViews เสมอ — cycleViews เป็น .map() ที่รันทันทีตอน render
  // ไม่ใช่ callback ที่รอไว้ ถ้า feeOf อยู่ใต้มัน จะโดน TDZ แล้วทั้งจอพังด้วย
  // "Cannot access 'feeOf' before initialization" (เคยหลุดขึ้น production มาแล้ว 2026-08-21)
  // tsc จับไม่ได้เพราะการอ้างถึงอยู่ในตัว arrow function ซึ่ง TS ถือว่า "อาจรันทีหลัง"
  // ขั้นต่ำถูกแปลงเป็นบาทให้แล้วในตัว resolver ($1 ของ IBKR ไม่ใช่ 1 บาท)
  const feeOf = useCallback(
    (platform?: string, currency?: string): FeeRule | undefined => {
      const f = resolveTradeFee(platform, currency, platforms, currencies);
      return f.source == null ? undefined : { percent: f.percent, minTHB: f.minTHB };
    },
    [platforms, currencies]
  );

  const cycleViews = cycles.map((cycle) => {
    const legs = legsOfCycle(cycle, investments);
    return {
      cycle,
      status: summarizeCycle(cycle, legs, { perRoundTHB: powderPerRound }),
      orphanCount: orphanLegsForBasket(cycle, investments).length,
      exits: exitPlanForCycle(cycle, legs, feeOf),
    };
  });
  // ตะกร้าที่ยังไม่มีรอบเปิด และมีของถืออยู่จริง — ใช้ในการ์ด "ยังไม่ได้เปิดรอบ"
  const basketsWithoutCycle = BASKET_ORDER.map((basket) => {
    const legs = investments.filter((i) => basketAccepts(basket, i.type));
    return {
      basket,
      legCount: legs.length,
      costTHB: legs.reduce((s, i) => s + legCostTHB(i), 0),
    };
  }).filter((b) => b.legCount > 0 && !cycles.some((c) => c.basket === b.basket || c.basket === 'all'));
  const cycleHistory = summarizeCycleHistory(closedCycles);

  // ต้นทุน/มูลค่าของไม้ในรอบ ใช้สูตรเดียวกับ utils/cycles (นับค่าธรรมเนียมเป็นบาท)
  const buildCloseRows = (cycle: InvestmentCycle, list: Investment[]): CloseCycleRow[] =>
    legsOfCycle(cycle, list).map((inv) => {
      // ไม่มีราคาปัจจุบัน = ห้ามขายด้วยราคาที่เดาเอง (กองทุน/ทองที่กรอกมือ)
      const priceNative =
        typeof inv.currentPrice === 'number' && inv.currentPrice > 0 ? inv.currentPrice : null;
      const costTHB = legCostTHB(inv);
      const proceedsTHB = priceNative != null ? legValueTHB(inv) : 0;
      return {
        id: inv.id,
        symbol: inv.symbol,
        name: inv.name,
        currency: inv.currency ?? 'THB',
        quantity: inv.quantity,
        priceNative,
        costTHB,
        proceedsTHB,
        pnlTHB: priceNative != null ? proceedsTHB - costTHB : 0,
      };
    });

  const handleStartCycle = async (basket: BasketKey) => {
    try {
      // งบเริ่มต้น = กระสุนที่มีจริง (เงินรอลงทุน + ต้นทุนของไม้ที่จะดึงเข้ารอบ)
      const orphans = investments.filter((i) => !i.cycleId && basketAccepts(basket, i.type));
      const orphanCost = orphans.reduce((s, i) => s + legCostTHB(i), 0);
      const budget = Math.round(orphanCost + (plan?.dryPowder ?? 0));
      const created = await openCycle({
        basket,
        budgetTHB: budget > 0 ? budget : undefined,
      });
      // ดึงไม้ที่ถืออยู่เข้ารอบแรก — ไม่ดึงเข้าก็จะมีของค้างนอกระบบตลอดกาล
      if (
        orphans.length > 0 &&
        (await confirmAsk(
          'ดึงไม้ที่ถืออยู่เข้ารอบ',
          `${basketLabel(basket)} ถืออยู่ ${orphans.length} ไม้ (ต้นทุน ฿${formatCurrency(orphanCost)})\nดึงเข้ารอบที่ ${created.cycleNo} ไหม?`,
          'ดึงเข้ารอบ'
        ))
      ) {
        await setInvestmentCycle(orphans.map((i) => i.id), created.id);
      }
      notify(`เปิดรอบที่ ${created.cycleNo} · ${basketLabel(basket)} · เป้า +${created.targetProfitPercent}%`);
      loadData();
    } catch (e: any) {
      notify(String(e?.message || e), 'เปิดรอบไม่สำเร็จ');
    }
  };

  const handlePullOrphans = async (cycle: InvestmentCycle) => {
    const orphans = orphanLegsForBasket(cycle, investments);
    if (orphans.length === 0) return;
    if (
      !(await confirmAsk(
        'ดึงไม้เข้ารอบ',
        `ดึง ${orphans.length} ไม้เข้ารอบที่ ${cycle.cycleNo} · ${basketLabel(cycle.basket)}?\nไม้เหล่านี้จะถูกปิดพร้อมกันตอนปิดรอบ`,
        'ดึงเข้ารอบ'
      ))
    )
      return;
    try {
      await setInvestmentCycle(orphans.map((i) => i.id), cycle.id);
      loadData();
    } catch (e: any) {
      notify(String(e?.message || e), 'ดึงเข้ารอบไม่สำเร็จ');
    }
  };

  const openCycleSettings = (cycle: InvestmentCycle) => {
    setCycleTargetInput(String(cycle.targetProfitPercent));
    setCycleBudgetInput(cycle.budgetTHB ? String(Math.round(cycle.budgetTHB)) : '');
    setCycleMaxLegsInput(cycle.maxLegsPerSymbol ? String(cycle.maxLegsPerSymbol) : '');
    setCycleSettings(cycle);
  };

  const handleSaveCycleSettings = async () => {
    if (!cycleSettings) return;
    const target = parseFloat(cycleTargetInput.replace(/,/g, ''));
    if (!Number.isFinite(target) || target <= 0) {
      notify('เป้ากำไรรวมต้องมากกว่า 0');
      return;
    }
    const budgetRaw = cycleBudgetInput.replace(/,/g, '').trim();
    const budget = budgetRaw === '' ? undefined : parseFloat(budgetRaw);
    if (budget !== undefined && (!Number.isFinite(budget) || budget <= 0)) {
      notify('งบของรอบต้องเป็นตัวเลขมากกว่า 0 (เว้นว่าง = ไม่จำกัด)');
      return;
    }
    const legsRaw = cycleMaxLegsInput.replace(/,/g, '').trim();
    const maxLegs = legsRaw === '' ? undefined : parseInt(legsRaw, 10);
    if (maxLegs !== undefined && (!Number.isFinite(maxLegs) || maxLegs < 1)) {
      notify('เพดานจำนวนไม้ต้องเป็นจำนวนเต็มตั้งแต่ 1 (เว้นว่าง = ไม่จำกัด)');
      return;
    }
    const next: InvestmentCycle = {
      ...cycleSettings,
      targetProfitPercent: target,
      budgetTHB: budget,
      maxLegsPerSymbol: maxLegs,
    };
    try {
      await updateCycle(next);
      setCycles((list) => list.map((c) => (c.id === next.id ? next : c)));
      setCycleSettings(null);
    } catch (e: any) {
      notify(String(e?.message || e), 'บันทึกไม่สำเร็จ');
    }
  };

  // ลบรอบ = ยกเลิกรอบที่เปิดผิด ไม่ใช่ปิดรอบ — ต้องถอนไม้ออกก่อน
  // ไม่ถอน จะเหลือไม้ที่ชี้ไปยังรอบที่ไม่มีอยู่ แล้วมันจะไม่โผล่ในรอบไหนเลยและถูกลืม
  const handleDeleteCycle = async () => {
    if (!cycleSettings) return;
    const legs = legsOfCycle(cycleSettings, investments);
    if (
      !(await confirmAsk(
        'ลบรอบนี้',
        `รอบที่ ${cycleSettings.cycleNo} · ${basketLabel(cycleSettings.basket)}\n` +
          `${legs.length} ไม้จะถูกถอนออกจากตะกร้า (ไม่มีการขาย) แล้วรอบนี้จะถูกลบ`,
        'ลบรอบ'
      ))
    )
      return;
    try {
      if (legs.length > 0) await setInvestmentCycle(legs.map((i) => i.id), null);
      await deleteCycle(cycleSettings.id);
      setCycleSettings(null);
      loadData();
    } catch (e: any) {
      notify(String(e?.message || e), 'ลบรอบไม่สำเร็จ');
    }
  };

  const openCloseCycleModal = (cycle: InvestmentCycle) => {
    const rows = buildCloseRows(cycle, investments);
    // ติ๊กมาให้เฉพาะไม้ที่มีราคาปัจจุบัน — ที่เหลือขายเองที่การ์ดของมันในหน้าพอร์ต
    setCloseSelectedIds(rows.filter((r) => r.priceNative != null).map((r) => r.id));
    setCloseFeesInput('');
    setCloseToPowder(true);
    setCloseProgress(null);
    setCloseTarget(cycle);
  };

  /**
   * ปิดรอบ = ขายทุกไม้ที่เลือกในตะกร้า แล้วปิดแถวรอบ + เปิดรอบถัดไป
   *
   * กดซ้ำได้โดยธรรมชาติ: รอบยังเปิดอยู่จนกว่าไม้จะหมดตะกร้าจริง (อ่านสดจาก DB)
   * ล้มที่ไม้ที่ 7 → 6 ไม้แรกถูกบันทึกขายเรียบร้อย กดปิดรอบอีกครั้งก็ขายที่เหลือต่อ
   */
  const handleConfirmCloseCycle = async () => {
    const cycle = closeTarget;
    if (!cycle) return;
    const rows = buildCloseRows(cycle, investments).filter(
      (r) => closeSelectedIds.includes(r.id) && r.priceNative != null
    );
    if (rows.length === 0) {
      notify('เลือกไม้ที่จะขายก่อน');
      return;
    }
    const byId = new Map(investments.map((i) => [i.id, i]));
    const totalProceeds = rows.reduce((s, r) => s + r.proceedsTHB, 0);
    const feeTotal = parseFloat(closeFeesInput.replace(/,/g, '')) || 0;
    const today = new Date().toISOString().slice(0, 10);

    setCloseBusy(true);
    const failed: { symbol: string; message: string }[] = [];
    let done = 0;
    let netProceedsTHB = 0;
    for (const r of rows) {
      const inv = byId.get(r.id);
      if (!inv) continue;
      // ค่าธรรมเนียมขายรวม ปันตามสัดส่วนเงินที่ได้รับของแต่ละไม้
      const feeShare = totalProceeds > 0 ? feeTotal * (r.proceedsTHB / totalProceeds) : 0;
      try {
        await saveRealizedTrade({
          id: `${Date.now()}${done}`,
          symbol: inv.symbol,
          name: inv.name,
          assetType: inv.type,
          currency: inv.currency ?? 'THB',
          quantity: inv.quantity,
          buyPrice: inv.buyPrice,
          sellPrice: r.priceNative as number,
          buyDate: toChristianYear(inv.buyDate || '').slice(0, 10),
          sellDate: today,
          fees: (inv.fees || 0) + feeShare,
          notes: `ปิดรอบที่ ${cycle.cycleNo} · ${basketLabel(cycle.basket)}`,
          platform: inv.platform,
          sourceInvestment: inv,
          cycleId: cycle.id,
        });
        // บันทึกประวัติก่อน แล้วค่อยเอาออกจากพอร์ต — ลำดับกลับกันแล้วพังกลางทาง = ของหายทั้งสองที่
        await deleteInvestment(inv.id);
        done++;
        netProceedsTHB += r.proceedsTHB - feeShare;
      } catch (e: any) {
        failed.push({ symbol: inv.symbol || inv.name, message: String(e?.message || e) });
      }
    }
    setCloseProgress({ done, total: rows.length, failed });

    // ── เงินที่ได้เข้าเงินรอลงทุน: 1 แถวต่อการปิดรอบ ──
    // ไม่ใช่แถวละไม้ ไม่งั้นปิดรอบ 12 ไม้ทีเดียวการ์ดเงินรอลงทุนจะรกจนอ่านไม่ได้
    let warn = '';
    if (closeToPowder && netProceedsTHB > 0) {
      try {
        const base: InvestmentPlan = plan ?? { setAsidePercent: 0, dcaRounds: 0 };
        const existing = base.dryPowderItems ?? [];
        const seeded =
          existing.length === 0 && base.dryPowder && base.dryPowder > 0
            ? [{ id: `p${Date.now()}-legacy`, label: 'ยอดที่จดไว้เดิม', amount: base.dryPowder, currency: 'THB', asOf: base.dryPowderAsOf }]
            : existing;
        const items: DryPowderItem[] = [
          ...seeded,
          {
            id: `p${Date.now()}-cycle${cycle.cycleNo}`,
            label: `ปิดรอบ ${cycle.cycleNo} · ${basketLabel(cycle.basket)}`,
            amount: netProceedsTHB,
            currency: 'THB',
            asOf: today,
          },
        ];
        const nextPlan: InvestmentPlan = {
          ...base,
          dryPowderItems: items,
          dryPowder: sumDryPowderItems(items),
          dryPowderAsOf: today,
        };
        await saveInvestmentPlan(nextPlan);
        setPlan(nextPlan);
      } catch {
        warn += '\n(เพิ่มเข้าเงินรอลงทุนไม่สำเร็จ — ไปกด "จดยอด" ที่หน้าเงินรอลงทุนเพิ่มเองได้)';
      }
    }

    // ── ปิดแถวรอบเฉพาะเมื่อไม้หมดตะกร้าจริง ──
    // อ่านพอร์ตสดจาก DB ห้ามเชื่อ state: ปิดรอบทั้งที่ของยังอยู่ = ประวัติรอบโกหก
    let closedNow = false;
    try {
      const fresh = await getInvestments();
      if (legsOfCycle(cycle, fresh).length === 0) {
        // ผลของรอบคิดจากการขายทุกครั้งที่ผูก cycle_id ไว้ (รวมที่ขายบางส่วนไปก่อนหน้า)
        const allTrades = await getRealizedTrades();
        const mine = allTrades.filter((t) => t.cycleId === cycle.id);
        const sum = summarizeRealized(mine);
        const days = Math.max(
          0,
          Math.floor(
            (new Date(today).getTime() - new Date(toChristianYear(cycle.startedAt)).getTime()) /
              (24 * 60 * 60 * 1000)
          )
        );
        await closeCycle(cycle, {
          investedTHB: sum.totalCostTHB,
          profitTHB: sum.totalPnlTHB,
          days,
          closedAt: today,
        });
        closedNow = true;
        // เปิดรอบถัดไปด้วยค่าเดิมทันที — วงจรต้องต่อได้เลย ไม่ต้องมากดเปิดเอง
        await openCycle({
          basket: cycle.basket,
          targetProfitPercent: cycle.targetProfitPercent,
          budgetTHB: cycle.budgetTHB,
          maxLegsPerSymbol: cycle.maxLegsPerSymbol,
        });
      }
    } catch (e: any) {
      warn += `\n(ปิดแถวรอบไม่สำเร็จ: ${String(e?.message || e)})`;
    }

    setCloseBusy(false);
    if (failed.length === 0) {
      setCloseTarget(null);
      notify(
        (closedNow
          ? `ปิดรอบที่ ${cycle.cycleNo} แล้ว · ขาย ${done} ไม้ · เปิดรอบถัดไปให้เรียบร้อย`
          : `ขาย ${done} ไม้แล้ว · รอบยังเปิดอยู่ (ยังมีไม้เหลือในตะกร้า)`) + warn
      );
    } else {
      notify(`ขายสำเร็จ ${done}/${rows.length} ไม้ — ที่เหลือกดปิดรอบอีกครั้งได้${warn}`);
    }
    loadData();
  };

  // สรุปผลของทุกดีลที่ขายแล้ว — ใช้เป็นตัวเลขบนทางเข้า "ผลงานที่ขายแล้ว" ท้ายหน้า
  const realized = useMemo(() => summarizeRealized(realizedTrades), [realizedTrades]);

  // ── แถวในกล่องปิดรอบ + ภาษีของกำไรที่จะรับรู้ ──
  const tradesThisTaxYear = useMemo(
    () => realizedTrades.filter((t) => taxYearOf(t.sellDate) === currentTaxYear),
    [realizedTrades]
  );
  const taxOpts = useMemo(
    () => ({ incomeExemption: incomeExemptionFor(person, currentTaxYear).amount }),
    [person]
  );
  const closeRows = closeTarget ? buildCloseRows(closeTarget, investments) : [];
  const closeTax = (() => {
    if (!closeTarget || !taxProfile) return { taxTHB: null as number | null, note: undefined as string | undefined };
    const picked = closeRows.filter((r) => closeSelectedIds.includes(r.id) && r.priceNative != null);
    if (picked.length === 0) return { taxTHB: null, note: undefined };
    const feeTotal = parseFloat((closeFeesInput || '').replace(/,/g, '')) || 0;
    const totalProceeds = picked.reduce((s, r) => s + r.proceedsTHB, 0);
    const byId = new Map(investments.map((i) => [i.id, i]));
    // กำไรที่ต้องเสียภาษี รวมทีเดียวแล้วยัดเข้าฐานครั้งเดียว — ไม่คิดแยกก้อนแล้วบวกกัน
    // เพราะกำไรก้อนใหญ่พาดข้ามขั้นบันได คิดแยกจะได้ตัวเลขต่ำกว่าจริง
    let taxableGain = 0;
    let exemptGain = 0;
    picked.forEach((r) => {
      const inv = byId.get(r.id);
      if (!inv) return;
      const feeShare = totalProceeds > 0 ? feeTotal * (r.proceedsTHB / totalProceeds) : 0;
      const gain = r.pnlTHB - feeShare;
      if (gain <= 0) return; // ขาดทุนต่อไม้ไม่ลดภาษี (taxCalc เคลมป์ที่ 0 ต่อประเภทสินทรัพย์)
      const rule = gainRuleFor(inv.type, taxProfile);
      if (rule === 'exempt') exemptGain += gain;
      else if (rule === 'taxable_on_remit')
        taxableGain += gain * Math.min(1, Math.max(0, taxProfile.remittedRatio ?? 1));
      else taxableGain += gain;
    });
    if (taxableGain <= 0) {
      return {
        taxTHB: 0,
        note: exemptGain > 0 ? `กำไร ${GAIN_RULE_LABELS.exempt}` : undefined,
      };
    }
    const before = calculateTax(taxProfile, tradesThisTaxYear, taxOpts);
    const after = calculateTax(
      { ...taxProfile, otherIncome: taxProfile.otherIncome + taxableGain },
      tradesThisTaxYear,
      taxOpts
    );
    return {
      taxTHB: Math.max(0, after.tax - before.tax),
      note: exemptGain > 0 ? `บางส่วน ${GAIN_RULE_LABELS.exempt}` : undefined,
    };
  })();
  // เดือน พ.ย.–ธ.ค. = ปิดทั้งก้อนตอนนี้ทำให้กำไรกระจุกในปีภาษีเดียว
  const nearTaxYearEnd = new Date().getMonth() >= 10;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* เงินต่อไม้มาจากหน้า "เงินรอลงทุน" — ยังไม่ตั้ง แปลว่า "เหลือกี่ไม้" คำนวณให้ไม่ได้
            ต้องบอกตรงนี้ ไม่งั้นการ์ดจะขึ้น "ยังไม่ได้ตั้งงบของรอบ" แล้วหาไม่เจอว่าต้องไปตั้งที่ไหน */}
        {powderPerRound == null && cycles.length > 0 && (
          <Text style={styles.hint}>
            ยังคำนวณ "เหลือลงได้อีกกี่ไม้" ไม่ได้ — ไปที่ พอร์ต → เงินรอลงทุน
            จดยอดเงินที่พร้อมลงและตั้ง "ไม้ทั้งก้อน" ก่อน
          </Text>
        )}

        <View style={isDesktop ? styles.cardGrid : undefined}>
          {cycleViews.map(({ cycle, status, orphanCount, exits }) => (
            <CycleCard
              key={cycle.id}
              cycle={cycle}
              status={status}
              orphanCount={orphanCount}
              exits={exits}
              onPullOrphans={() => handlePullOrphans(cycle)}
              onPressClose={() => openCloseCycleModal(cycle)}
              onPressSettings={() => openCycleSettings(cycle)}
              style={isDesktop && styles.cardGridItem}
            />
          ))}
          {basketsWithoutCycle.length > 0 && (
            <CycleStartCard
              baskets={basketsWithoutCycle}
              onStart={handleStartCycle}
              style={isDesktop && styles.cardGridItem}
            />
          )}
          <CycleHistoryCard
            history={cycleHistory}
            expanded={showCycleHistory}
            onToggle={() => setShowCycleHistory((v) => !v)}
            style={isDesktop && styles.cardGridItem}
          />
        </View>

        {cycleViews.length === 0 && basketsWithoutCycle.length === 0 && (
          <MascotEmpty>
            ยังไม่มีรอบที่เปิดอยู่ และยังไม่มีของถืออยู่ให้เปิดรอบ — เพิ่มการลงทุนที่หน้าพอร์ตก่อน
            แล้วการ์ด "ยังไม่ได้เปิดรอบ" จะโผล่มาเอง
          </MascotEmpty>
        )}
        {/* ── ทางเข้า "ผลงานที่ขายแล้ว" ──
            ย้ายมาจากเมนูหน้าพอร์ต (2026-08-20): รายการขายทุกใบคือ "ผลของรอบ" อยู่แล้ว
            (การปิดรอบเขียน realized_trades ทีละไม้ ดู §6.5) อ่านคู่กับรอบที่เปิดอยู่
            และรอบที่ปิดแล้วในหน้าเดียวกันจึงตรงกว่าไปอยู่บนพอร์ต
            หน้าปลายทางยังเป็น RealizedScreen ใบเดิม — ปุ่มย้อนคืนการขายอยู่ที่นั่น */}
        <MenuCard>
          <MenuRow
            icon="ribbon-outline"
            title="ผลงานที่ขายแล้ว"
            tone={COLORS.success}
            value={realized.tradeCount > 0 ? baht(realized.totalPnlTHB, true) : '—'}
            valueNegative={realized.totalPnlTHB < 0}
            sub={
              realized.tradeCount > 0
                ? `ชนะ ${realized.winCount}/${realized.tradeCount} ดีล · ย้อนคืนการขายได้ที่นี่`
                : 'ยังไม่มีการขายที่บันทึกไว้'
            }
            onPress={() => navigation.navigate('Realized')}
            first
          />
        </MenuCard>

      </ScrollView>

      {/* ── Modal ของระบบรอบ: ตั้งค่ารอบ / ปิดรอบทั้งตะกร้า ── */}
      <CycleSettingsModal
        visible={cycleSettings !== null}
        cycle={cycleSettings}
        targetInput={cycleTargetInput}
        budgetInput={cycleBudgetInput}
        maxLegsInput={cycleMaxLegsInput}
        onChangeTarget={setCycleTargetInput}
        onChangeBudget={setCycleBudgetInput}
        onChangeMaxLegs={setCycleMaxLegsInput}
        onSave={handleSaveCycleSettings}
        onCancel={() => setCycleSettings(null)}
        onDelete={handleDeleteCycle}
      />
      <CloseCycleModal
        visible={closeTarget !== null}
        cycle={closeTarget}
        rows={closeRows}
        selectedIds={closeSelectedIds}
        onToggleRow={(id) =>
          setCloseSelectedIds((ids) =>
            ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
          )
        }
        feesInput={closeFeesInput}
        onChangeFees={setCloseFeesInput}
        toPowder={closeToPowder}
        onToggleToPowder={() => setCloseToPowder((v) => !v)}
        taxTHB={closeTax.taxTHB}
        taxNote={closeTax.note}
        showTaxYearHint={nearTaxYearEnd}
        busy={closeBusy}
        progress={closeProgress}
        onConfirm={handleConfirmCloseCycle}
        onCancel={() => setCloseTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingVertical: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 16,
    marginHorizontal: 16,
  },
  cardGridItem: {
    flexBasis: 520,
    flexGrow: 1,
    minWidth: 0,
    marginHorizontal: 0,
    marginBottom: 0,
  },
  hint: {
    marginHorizontal: 16,
    marginBottom: 16,
    fontSize: 12,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
});
