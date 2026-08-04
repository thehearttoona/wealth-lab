import { Dimensions, Platform } from 'react-native';
import { useState, useEffect } from 'react';

const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
};

// จงใจไม่มีเพดานความกว้างสำหรับเดสก์ท็อปแล้ว — ทุกหน้าใช้ความกว้างเต็ม pane (หลังหัก sidebar)
// เดิมมี DESKTOP_MAX_WIDTH = 1200 / DESKTOP_CONTENT_MAX_WIDTH = 800 ถูกถอดออกทั้งคู่
// ถ้าจอกว้างขึ้นแล้วเนื้อหาดูโปร่งเกิน ให้แก้ด้วยการ "เพิ่มจำนวนคอลัมน์" ไม่ใช่ใส่เพดานกลับมา
// (ดูตัวอย่างการคิดคอลัมน์จากความกว้างจริงที่ PortfolioScreen — GRID_COL_TARGET)
// ยกเว้นเดียวที่ยังจำกัดความกว้างได้: การ์ดใน Modal และการ์ด login — เป็น overlay ไม่ใช่เนื้อหาหน้า

export function useResponsive() {
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });
    return () => subscription.remove();
  }, []);

  const width = dimensions.width;
  const isDesktop = width >= BREAKPOINTS.desktop;
  const isTablet = width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
  const isMobile = width < BREAKPOINTS.tablet;
  const isWide = width >= BREAKPOINTS.wide;
  const isWeb = Platform.OS === 'web';

  return {
    width,
    height: dimensions.height,
    isDesktop,
    isTablet,
    isMobile,
    isWide,
    isWeb,
    // Sidebar width
    sidebarWidth: isWide ? 240 : 200,
  };
}
