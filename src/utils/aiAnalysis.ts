import { Expense } from '../types';
import { getExpenses } from '../services/storage';
import { getPortfolioSummary } from '../services/investmentStorage';

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
      icon: '💡',
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
        icon: '⚠️',
        title: `${maxCategory.category} สูงเกินไป`,
        message: `คุณใช้จ่าย${maxCategory.category} ${percentage.toFixed(1)}% ของรายจ่ายทั้งหมด แนะนำให้ลดลงเหลือ 25-30%`,
        savingPotential: maxCategory.amount * 0.2,
        actionable: `ลองลดค่า${maxCategory.category}ลง 20% จะประหยัดได้ประมาณ ฿${(maxCategory.amount * 0.2).toFixed(0)}/เดือน`,
      });
    }
  }

  // Insight 2: เปรียบเทียบกับเดือนที่แล้ว
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const lastMonthExpenses = dailyExpenses.filter((e) => {
    const expenseDate = new Date(e.date);
    return expenseDate.getMonth() === lastMonth && expenseDate.getFullYear() === lastMonthYear;
  });
  const lastMonthTotal = lastMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

  if (lastMonthTotal > 0) {
    const change = monthlyTotal - lastMonthTotal;
    const changePercent = (change / lastMonthTotal) * 100;

    if (changePercent > 20) {
      insights.push({
        type: 'alert',
        icon: '🔴',
        title: 'ค่าใช้จ่ายเพิ่มขึ้นมาก',
        message: `เดือนนี้ใช้จ่ายมากกว่าเดือนที่แล้ว ${changePercent.toFixed(1)}% (เพิ่ม ฿${change.toFixed(0)})`,
        actionable: 'ลองตรวจสอบว่ามีรายจ่ายพิเศษหรือไม่ และควรปรับลด',
      });
    } else if (changePercent < -10) {
      insights.push({
        type: 'success',
        icon: '✅',
        title: 'ประหยัดได้ดีมาก!',
        message: `เดือนนี้ใช้จ่ายน้อยกว่าเดือนที่แล้ว ${Math.abs(changePercent).toFixed(1)}% (ลด ฿${Math.abs(change).toFixed(0)})`,
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
      icon: '📊',
      title: 'แนวโน้มการใช้จ่ายสูง',
      message: `ถ้าใช้จ่ายต่อไปในอัตรานี้ คาดว่าเดือนนี้จะใช้ ฿${projectedMonthly.toFixed(0)}`,
      actionable: 'ลองตั้งเป้าหมายรายจ่ายและติดตามให้ใกล้เคียง',
    });
  }

  // Insight 4: แนะนำเฉพาะหมวดหมู่
  if (byCategory['อาหาร'] > 10000) {
    insights.push({
      type: 'tip',
      icon: '🍳',
      title: 'ประหยัดค่าอาหาร',
      message: 'ค่าอาหารของคุณสูง ลองทำอาหารเองบ้างวันละ 1-2 มื้อ',
      savingPotential: 3000,
      actionable: 'ประหยัดได้ประมาณ ฿3,000/เดือน',
    });
  }

  if (byCategory['บันเทิง'] > monthlyTotal * 0.25) {
    insights.push({
      type: 'tip',
      icon: '🎮',
      title: 'ลดค่าบันเทิง',
      message: 'ค่าบันเทิงสูงเกินไป ควรจำกัดไม่เกิน 20% ของรายจ่าย',
      actionable: 'ลองหาความบันเทิงฟรีหรือราคาถูกกว่า',
    });
  }

  if (byCategory['เดินทาง'] > 8000) {
    insights.push({
      type: 'tip',
      icon: '🚗',
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
      icon: '💼',
      title: 'เริ่มต้นลงทุน',
      message: 'ยังไม่มีพอร์ตการลงทุน ลองเริ่มลงทุนเพื่อสร้างความมั่งคั่ง',
      actionable: 'เริ่มจากกองทุนหรือหุ้นปันผล',
    }];
  }

  // Insight 1: กำไร/ขาดทุน
  if (summary.totalProfitPercent > 10) {
    insights.push({
      type: 'success',
      icon: '🎉',
      title: 'พอร์ตกำไรดีมาก!',
      message: `คุณทำกำไร ${summary.totalProfitPercent.toFixed(2)}% (฿${summary.totalProfit.toFixed(0)})`,
    });
  } else if (summary.totalProfitPercent < -10) {
    insights.push({
      type: 'alert',
      icon: '⚠️',
      title: 'พอร์ตขาดทุน',
      message: `พอร์ตขาดทุน ${Math.abs(summary.totalProfitPercent).toFixed(2)}% (฿${Math.abs(summary.totalProfit).toFixed(0)})`,
      actionable: 'ลองตรวจสอบและปรับพอร์ต หรือ hold ถ้าเชื่อในระยะยาว',
    });
  }

  // Insight 2: การกระจายความเสี่ยง
  const typeCount = Object.keys(summary.byType).length;
  if (typeCount === 1) {
    insights.push({
      type: 'warning',
      icon: '⚖️',
      title: 'ควรกระจายความเสี่ยง',
      message: 'คุณลงทุนในประเภทเดียว ควรกระจายเพื่อลดความเสี่ยง',
      actionable: 'ลองเพิ่มการลงทุนในประเภทอื่นๆ เช่น กองทุน, พันธบัตร',
    });
  }

  // Insight 3: ตรวจสอบการลงทุนแต่ละประเภท
  Object.entries(summary.byType).forEach(([type, data]) => {
    const percentage = (data.value / summary.totalValue) * 100;
    
    if (type === 'stock' && percentage > 70) {
      insights.push({
        type: 'warning',
        icon: '📈',
        title: 'หุ้นเยอะเกินไป',
        message: `หุ้นคิดเป็น ${percentage.toFixed(1)}% ของพอร์ต ความเสี่ยงสูง`,
        actionable: 'ควรลดสัดส่วนหุ้นลงและเพิ่มสินทรัพย์ที่มั่นคง',
      });
    }

    if (type === 'crypto' && percentage > 20) {
      insights.push({
        type: 'warning',
        icon: '₿',
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
