import { Dimensions, Platform } from 'react-native';
import { useState, useEffect } from 'react';

const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
};

const DESKTOP_MAX_WIDTH = 1200;
const DESKTOP_CONTENT_MAX_WIDTH = 800;

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
    // เพดานความกว้างของเลย์เอาต์หลายคอลัมน์ (หน้าหลัก/พอร์ต) — จอ 2560px จะได้ไม่ยืดจนอ่านไม่ไหว
    maxWidth: DESKTOP_MAX_WIDTH,
    // เพดานของเนื้อหาคอลัมน์เดียว (ลิสต์/ฟอร์ม)
    contentMaxWidth: DESKTOP_CONTENT_MAX_WIDTH,
    // Sidebar width
    sidebarWidth: isWide ? 240 : 200,
  };
}
