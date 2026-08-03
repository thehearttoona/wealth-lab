import { Expense } from '../types';
import { getExpenses } from '../services/storage';
import { getPortfolioSummary } from '../services/investmentStorage';
import { formatCurrency } from './constants';

export interface Insight {
  type: 'warning' | 'alert' | 'tip' | 'success';
  icon: string;
  title: string;
  message: string;
  actionable?: string;
  savingPotential?: number;
}

// วิเคราะห์ค่าใช้จ่าย
export const analyzeExpenses = async (): Promise<Insight[]> => {
  const insights: Insight[] = [];
  const expenses = await getExpenses();
  const dailyExpenses = expenses.filter((e) => e.type === 'daily');

  if (dailyExpenses.length === 0) {
    return [{
      type: 'tip',
      icon: 'bulb-outline',
      title: 'เริ่มจดบันทึกค่าใช้จ่าย',
      message: 'ยังไม่มีข้อมูลค่าใช้จ่าย ลองเริ่มบันทึกเพื่อดูข้อมูลเชิงลึก',
    }];
  }

  // คำนวณข้อมูลเดือนนี้
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthlyExpenses = dailyExpenses.filter((e) => {
    const expenseDate = new Date(e.date);
    return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear;
  });

  const monthlyTotal = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0);

  // จัดกลุ่มตามหมวดหมู่
  const byCategory: { [key: string]: number } = {};
  monthlyExpenses.forEach((e) => {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  });

  // Insight 1: หมวดหมู่ที่ใช้จ่ายมากที่สุด
  const maxCategory = Object.entries(byCategory).reduce(
    (max, [cat, amount]) => (amount > max.amount ? { category: cat, amount } : max),
    { category: '', amount: 0 }
  );

  if (maxCategory.amount > 0) {
    const percentage = (maxCategory.amount / monthlyTotal) * 100;
    if (percentage > 30) {
      insights.push({
        type: 'warning',
        icon: 'alert-circle-outline',
        title: `${maxCategory.category} สูงเกินไป`,
        message: `คุณใช้จ่าย${maxCategory.category} ${percentage.toFixed(1)}% ของรายจ่ายทั้งหมด แนะนำให้ลดลงเหลือ 25-30%`,
        savingPotential: maxCategory.amount * 0.2,
        actionable: `ลองลดค่า${maxCategory.category}ลง 20% จะประหยัดได้ประมาณ ${formatCurrency((maxCategory.amount * 0.2))}/เดือน`,
      });
    }
  }

  // Insight 2: เปรียบเทียบกับเดือนที่แล้ว "ช่วงเวลาเท่ากัน"
  //
  // ของเดิมเอายอดทั้งเดือนที่แล้ว (เต็มเดือน) มาเทียบกับเดือนนี้ที่เพิ่งผ่านไปไม่กี่วัน
  // วันที่ 2 ของเดือนจึงขึ้นว่า "ประหยัดได้ดีมาก ลดลง 100%" ทุกครั้ง ทั้งที่ยังไม่ได้ประหยัดอะไรเลย
  // แก้เป็นเทียบวันที่ 1..วันนี้ ของทั้งสองเดือน แล้วรอให้ผ่านไปพอสมควรก่อนค่อยสรุป
  const dayOfMonth = new Date().getDate();
  const MIN_DAYS_TO_COMPARE = 5;

  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const lastMonthSameWindowTotal = dailyExpenses
    .filter((e) => {
      const d = new Date(e.date);
      return (
        d.getMonth() === lastMonth &&
        d.getFullYear() === lastMonthYear &&
        d.getDate() <= dayOfMonth
      );
    })
    .reduce((sum, e) => sum + e.amount, 0);

  if (dayOfMonth >= MIN_DAYS_TO_COMPARE && lastMonthSameWindowTotal > 0) {
    const change = monthlyTotal - lastMonthSameWindowTotal;
    const changePercent = (change / lastMonthSameWindowTotal) * 100;
    const window = `เทียบวันที่ 1–${dayOfMonth} ของทั้งสองเดือน`;

    if (changePercent > 20) {
      insights.push({
        type: 'alert',
        icon: 'trending-up-outline',
        title: 'ค่าใช้จ่ายเพิ่มขึ้นมาก',
        message: `ช่วงนี้ใช้จ่ายมากกว่าเดือนที่แล้ว ${changePercent.toFixed(1)}% (เพิ่ม ${formatCurrency(change)}) — ${window}`,
        actionable: 'ลองตรวจสอบว่ามีรายจ่ายพิเศษหรือไม่ และควรปรับลด',
      });
    } else if (changePercent < -10) {
      insights.push({
        type: 'success',
        icon: 'trending-down-outline',
        title: 'ใช้จ่ายน้อยลง',
        message: `ช่วงนี้ใช้จ่ายน้อยกว่าเดือนที่แล้ว ${Math.abs(changePercent).toFixed(1)}% (ลด ${formatCurrency(Math.abs(change))}) — ${window}`,
      });
    }
  }

  // Insight 3: ค่าใช้จ่ายเฉลี่ยต่อวัน
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const currentDay = new Date().getDate();
  const avgPerDay = monthlyTotal / currentDay;
  const projectedMonthly = avgPerDay * daysInMonth;

  if (projectedMonthly > monthlyTotal * 1.5) {
    insights.push({
      type: 'warning',
      icon: 'stats-chart-outline',
      title: 'แนวโน้มการใช้จ่ายสูง',
      message: `ถ้าใช้จ่ายต่อไปในอัตรานี้ คาดว่าเดือนนี้จะใช้ ${formatCurrency(projectedMonthly)}`,
      actionable: 'ลองตั้งเป้าหมายรายจ่ายและติดตามให้ใกล้เคียง',
    });
  }

  // Insight 4: แนะนำเฉพาะหมวดหมู่
  if (byCategory['อาหาร'] > 10000) {
    insights.push({
      type: 'tip',
      icon: 'restaurant-outline',
      title: 'ประหยัดค่าอาหาร',
      message: 'ค่าอาหารของคุณสูง ลองทำอาหารเองบ้างวันละ 1-2 มื้อ',
      savingPotential: 3000,
      actionable: 'ประหยัดได้ประมาณ ฿3,000/เดือน',
    });
  }

  if (byCategory['บันเทิง'] > monthlyTotal * 0.25) {
    insights.push({
      type: 'tip',
      icon: 'game-controller-outline',
      title: 'ลดค่าบันเทิง',
      message: 'ค่าบันเทิงสูงเกินไป ควรจำกัดไม่เกิน 20% ของรายจ่าย',
      actionable: 'ลองหาความบันเทิงฟรีหรือราคาถูกกว่า',
    });
  }

  if (byCategory['เดินทาง'] > 8000) {
    insights.push({
      type: 'tip',
      icon: 'car-outline',
      title: 'ประหยัดค่าเดินทาง',
      message: 'ค่าเดินทางสูง ลองใช้ขนส่งสาธารณะหรือแชร์รถกับเพื่อน',
      savingPotential: 2000,
      actionable: 'ประหยัดได้ประมาณ ฿2,000/เดือน',
    });
  }

  return insights;
};

// วิเคราะห์การลงทุน
export const analyzeInvestments = async (): Promise<Insight[]> => {
  const insights: Insight[] = [];
  const summary = await getPortfolioSummary();

  if (summary.totalValue === 0) {
    return [{
      type: 'tip',
      icon: 'briefcase-outline',
      title: 'เริ่มต้นลงทุน',
      message: 'ยังไม่มีพอร์ตการลงทุน ลองเริ่มลงทุนเพื่อสร้างความมั่งคั่ง',
      actionable: 'เริ่มจากกองทุนหรือหุ้นปันผล',
    }];
  }

  // Insight 1: กำไร/ขาดทุน
  if (summary.totalProfitPercent > 10) {
    insights.push({
      type: 'success',
      icon: 'trophy-outline',
      title: 'พอร์ตกำไรดีมาก!',
      message: `คุณทำกำไร ${summary.totalProfitPercent.toFixed(2)}% (${formatCurrency(summary.totalProfit)})`,
    });
  } else if (summary.totalProfitPercent < -10) {
    insights.push({
      type: 'alert',
      icon: 'alert-circle-outline',
      title: 'พอร์ตขาดทุน',
      message: `พอร์ตขาดทุน ${Math.abs(summary.totalProfitPercent).toFixed(2)}% (${formatCurrency(Math.abs(summary.totalProfit))})`,
      actionable: 'ลองตรวจสอบและปรับพอร์ต หรือ hold ถ้าเชื่อในระยะยาว',
    });
  }

  // Insight 2: การกระจายความเสี่ยง
  // รวม stock_th + stock_foreign เป็นกลุ่มเดียวกัน (หุ้นเหมือนกัน แค่คนละตลาด)
  // ไม่งั้นพอร์ตที่ถือหุ้นไทย+ต่างประเทศแต่ไม่มีสินทรัพย์อื่นเลย จะไม่โดนเตือนเรื่องกระจายความเสี่ยง
  const groupedTypes = new Set(
    Object.keys(summary.byType).map((t) => (t === 'stock_th' || t === 'stock_foreign' ? 'stock' : t))
  );
  if (groupedTypes.size === 1) {
    insights.push({
      type: 'warning',
      icon: 'git-compare-outline',
      title: 'ควรกระจายความเสี่ยง',
      message: 'คุณลงทุนในประเภทเดียว ควรกระจายเพื่อลดความเสี่ยง',
      actionable: 'ลองเพิ่มการลงทุนในประเภทอื่นๆ เช่น กองทุน, ทอง',
    });
  }

  // Insight 3: ตรวจสอบการลงทุนแต่ละประเภท
  const stockValue = (summary.byType['stock_th']?.value || 0) + (summary.byType['stock_foreign']?.value || 0);
  const stockPercentage = summary.totalValue > 0 ? (stockValue / summary.totalValue) * 100 : 0;
  if (stockValue > 0 && stockPercentage > 70) {
    insights.push({
      type: 'warning',
      icon: 'trending-up-outline',
      title: 'หุ้นเยอะเกินไป',
      message: `หุ้น (ไทย+ต่างประเทศ) คิดเป็น ${stockPercentage.toFixed(1)}% ของพอร์ต ความเสี่ยงสูง`,
      actionable: 'ควรลดสัดส่วนหุ้นลงและเพิ่มสินทรัพย์ที่มั่นคง',
    });
  }

  Object.entries(summary.byType).forEach(([type, data]) => {
    const percentage = (data.value / summary.totalValue) * 100;

    if (type === 'crypto' && percentage > 20) {
      insights.push({
        type: 'warning',
        icon: 'logo-bitcoin',
        title: 'Crypto มีความเสี่ยงสูง',
        message: `Crypto คิดเป็น ${percentage.toFixed(1)}% ซึ่งค่อนข้างสูง`,
        actionable: 'แนะนำไม่ควรเกิน 10-15% ของพอร์ต',
      });
    }
  });

  return insights;
};

// รวม Insights ทั้งหมด
export const getAllInsights = async (): Promise<Insight[]> => {
  const expenseInsights = await analyzeExpenses();
  const investmentInsights = await analyzeInvestments();
  
  return [...expenseInsights, ...investmentInsights];
};
