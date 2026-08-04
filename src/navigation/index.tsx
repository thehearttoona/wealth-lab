import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import LoginScreen from '../screens/LoginScreen';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Path } from 'react-native-svg';

function HomeIcon({ size = 24, color = '#000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G fill="none" fillRule="evenodd">
        <Path
          fill={color}
          d="M10.8 2.65a2 2 0 0 1 2.4 0l7 5.25a2 2 0 0 1 .8 1.6V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a2 2 0 0 1 .8-1.6z"
        />
      </G>
    </Svg>
  );
}
import { RootStackParamList } from '../types';
import HomeScreen from '../screens/HomeScreen';
import AddExpenseScreen from '../screens/AddExpenseScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import AddInvestmentScreen from '../screens/AddInvestmentScreen';
import ManageByPlatformScreen from '../screens/ManageByPlatformScreen';
import AddIncomeScreen from '../screens/AddIncomeScreen';
import IncomeScreen from '../screens/IncomeScreen';
import InstallmentsScreen from '../screens/InstallmentsScreen';
import AddInstallmentScreen from '../screens/AddInstallmentScreen';
import AccountsScreen from '../screens/AccountsScreen';
import ImportStatementScreen from '../screens/ImportStatementScreen';
import ManageCatalogScreen from '../screens/ManageCatalogScreen';
import ProfileScreen from '../screens/ProfileScreen';
import OverviewScreen from '../screens/OverviewScreen';
import StatisticsScreen from '../screens/StatisticsScreen';
import TaxScreen from '../screens/TaxScreen';
import PurchaseGoalsScreen from '../screens/PurchaseGoalsScreen';
import SellReviewScreen from '../screens/SellReviewScreen';
import { refreshCurrencyCache } from '../services/currencyStorage';
import { COLORS } from '../utils/constants';
import { useResponsive } from '../utils/responsive';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

// ref ไว้สั่ง "เด้งกลับหน้าแท็บ" ตอนกดไซด์บาร์ขณะเปิดหน้าลูกค้างอยู่
const navigationRef = createNavigationContainerRef<RootStackParamList>();

// แท็บที่ไซด์บาร์เลือกไว้ — state อยู่เหนือ NavigationContainer (ดู DesktopShell ท้ายไฟล์)
// จึงต้องส่งลงมาให้ screen ราก (ที่อยู่ข้างใน) ผ่าน context
const DesktopTabContext = createContext<string>('HomeTab');

const TAB_ITEMS = [
  {
    name: 'HomeTab',
    title: 'หน้าหลัก',
    icon: 'home',
    iconOutline: 'home-outline',
    customIcon: (size: number, color: string) => <HomeIcon size={size} color={color} />,
    component: HomeScreen,
  },
  { name: 'PortfolioTab', title: 'พอร์ต', icon: 'briefcase', iconOutline: 'briefcase-outline', customIcon: null, component: PortfolioScreen },
  { name: 'ProfileTab', title: 'โปรไฟล์', icon: 'person', iconOutline: 'person-outline', customIcon: null, component: ProfileScreen },
];

function DesktopSidebar({ activeTab, onTabPress }: { activeTab: string; onTabPress: (name: string) => void }) {
  return (
    <View style={sidebarStyles.container}>
      <View style={sidebarStyles.logoSection}>
        <Image
          source={require('../../assets/brand-pakmutwealth-mark.png')}
          style={sidebarStyles.logoMark}
          resizeMode="contain"
          alt="Pakmut Wealth"
        />
      </View>
      <ScrollView style={sidebarStyles.navList}>
        {TAB_ITEMS.map((item) => {
          const isActive = activeTab === item.name;
          return (
            <TouchableOpacity
              key={item.name}
              style={[sidebarStyles.navItem, isActive && sidebarStyles.navItemActive]}
              onPress={() => onTabPress(item.name)}
            >
              {item.customIcon
                ? item.customIcon(16, isActive ? COLORS.primary : COLORS.textSecondary)
                : <Ionicons name={(isActive ? item.icon : item.iconOutline) as any} size={16} color={isActive ? COLORS.primary : COLORS.textSecondary} />
              }
              <Text style={[sidebarStyles.navText, isActive && sidebarStyles.navTextActive]}>
                {item.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// หน้าจอรากของ Stack บนเดสก์ท็อป — แค่สลับ component ตามแท็บที่ไซด์บาร์เลือก
// ไซด์บาร์ไม่ได้อยู่ในนี้แล้ว (อยู่นอก NavigationContainer) เพื่อให้ push หน้าลูกแล้วไซด์บาร์ยังอยู่
function DesktopRootScreen() {
  const activeTab = useContext(DesktopTabContext);
  const ActiveComponent = TAB_ITEMS.find((item) => item.name === activeTab)?.component || HomeScreen;
  return <ActiveComponent />;
}

function MobileTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          paddingBottom: 0,
          paddingTop: 0,
        },
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarLabelStyle: { fontSize: 10, fontFamily: 'NotoSansThai_600SemiBold', marginTop: 2 },
      }}
    >
      {TAB_ITEMS.map((item) => (
        <Tab.Screen
          key={item.name}
          name={item.name}
          component={item.component}
          options={{
            title: item.title,
            tabBarIcon: ({ color, size, focused }) =>
              item.customIcon
                ? item.customIcon(size, color)
                : <Ionicons name={(focused ? item.icon : item.iconOutline) as any} size={size} color={color} />,
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { user, loading } = useAuth();
  const { isDesktop, sidebarWidth } = useResponsive();
  const [activeTab, setActiveTab] = useState('HomeTab');

  // กดแท็บบนไซด์บาร์ขณะเปิดหน้าลูกอยู่ (เช่น "บัญชีของฉัน") ต้องเด้งกลับหน้าแท็บก่อน
  // ไม่งั้นจะกดแล้วเหมือนไม่มีอะไรเกิดขึ้น เพราะหน้าลูกทับอยู่
  const handleTabPress = useCallback((name: string) => {
    setActiveTab(name);
    if (navigationRef.isReady()) navigationRef.navigate('Pakmut Wealth', undefined);
  }, []);

  // แคชเรตของ convertToTHB เป็นตัวแปรระดับโมดูล ไม่ใช่ state — โหลดเสร็จแล้วไม่มีอะไร re-render
  // ถ้าปล่อยหน้าจอออกไปก่อน ยอดรวมจะถูกคิดด้วยเรต hardcode (USD 35) แล้วค้างผิดจนกว่าจะเปลี่ยนหน้า
  // เลยต้อง gate ไว้เหมือนที่ App.tsx รอฟอนต์ ยอมขึ้น spinner แป๊บเดียวดีกว่าโชว์ตัวเลขผิด
  const [currencyReady, setCurrencyReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setCurrencyReady(false);
      return;
    }
    let cancelled = false;
    // refreshCurrencyCache กลืน error เองอยู่แล้ว (ล้มเหลว = ใช้เรตเริ่มต้น) จึงไม่ต้อง catch ซ้ำ
    refreshCurrencyCache().finally(() => {
      if (!cancelled) setCurrencyReady(true);
    });
    return () => { cancelled = true; };
  }, [user]);

  if (loading || (user && !currencyReady)) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const stack = (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: COLORS.primary,
          },
          headerTintColor: '#ffffff',
          // ต้องระบุ fontFamily เอง ไม่งั้น header ของ navigator จะตกไปใช้ system font ไม่ตรงกับทั้งแอป
          // (ใช้ไฟล์ SemiBold ตรง ๆ ห้ามใส่ fontWeight คู่ เดี๋ยวเว็บจะ fake-bold ทับ)
          headerTitleStyle: {
            fontFamily: 'NotoSansThai_600SemiBold',
          },
        }}
      >
        <Stack.Screen
          name="Pakmut Wealth"
          component={isDesktop ? DesktopRootScreen : MobileTabNavigator}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AddExpense"
          component={AddExpenseScreen}
          options={({ route, navigation }) => ({
            title: route.params.type === 'daily' ? 'เพิ่มรายจ่าย' : 'เพิ่มค่าใช้จ่ายประจำ',
            headerBackTitleVisible: false,
            headerLeft: () => (
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
                <Ionicons name="chevron-back" size={16} color="#ffffff" />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="AddInvestment"
          component={AddInvestmentScreen}
          options={{ title: 'เพิ่มการลงทุน' }}
        />
        <Stack.Screen
          name="ManageByPlatform"
          component={ManageByPlatformScreen}
          options={({ navigation }) => ({
            title: 'จัดการตามแพลตฟอร์ม',
            headerLeft: () => (
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
                <Ionicons name="chevron-back" size={16} color="#ffffff" />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="AddIncome"
          component={AddIncomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="IncomeScreen"
          component={IncomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Installments"
          component={InstallmentsScreen}
          options={{ title: 'ค่าใช้จ่ายผ่อนชำระ' }}
        />
        <Stack.Screen
          name="AddInstallment"
          component={AddInstallmentScreen}
          options={{ title: 'เพิ่มรายการผ่อน' }}
        />
        <Stack.Screen
          name="Accounts"
          component={AccountsScreen}
          options={{ title: 'บัญชีของฉัน' }}
        />
        <Stack.Screen
          name="ManageCatalog"
          component={ManageCatalogScreen}
          options={({ navigation }) => ({
            title: 'สกุลเงิน & แพลตฟอร์ม',
            headerLeft: () => (
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
                <Ionicons name="chevron-back" size={16} color="#ffffff" />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="ImportStatement"
          component={ImportStatementScreen}
          options={{ title: 'นำเข้า statement' }}
        />
        <Stack.Screen
          name="Overview"
          component={OverviewScreen}
          options={{ title: 'ภาพรวมการเงิน' }}
        />
        <Stack.Screen
          name="Statistics"
          component={StatisticsScreen}
          options={{ title: 'สถิติ & ข้อสังเกต' }}
        />
        <Stack.Screen
          name="Tax"
          component={TaxScreen}
          options={{ title: 'ภาษี' }}
        />
        <Stack.Screen
          name="SellReview"
          component={SellReviewScreen}
          options={({ navigation }) => ({
            title: 'ทบทวนการขาย',
            headerLeft: () => (
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
                <Ionicons name="chevron-back" size={16} color="#ffffff" />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="PurchaseGoals"
          component={PurchaseGoalsScreen}
          options={({ navigation }) => ({
            title: 'ของที่อยากได้',
            headerLeft: () => (
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
                <Ionicons name="chevron-back" size={16} color="#ffffff" />
              </TouchableOpacity>
            ),
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );

  if (!isDesktop) return stack;

  // เดสก์ท็อป: ไซด์บาร์เป็นเปลือกถาวรอยู่นอก Stack — กดเข้าหน้าลูกแล้วเมนูซ้ายไม่หาย
  return (
    <DesktopTabContext.Provider value={activeTab}>
      <View style={desktopStyles.container}>
        <View style={{ width: sidebarWidth }}>
          <DesktopSidebar activeTab={activeTab} onTabPress={handleTabPress} />
        </View>
        <View style={desktopStyles.content}>{stack}</View>
      </View>
    </DesktopTabContext.Provider>
  );
}

const sidebarStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  logoSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  // ยืดตามความกว้างไซด์บาร์ที่เหลือจริง (200/240 − padding) ห้าม fix width
  // เดิมตั้ง 200 คู่กับ paddingHorizontal 24 → พื้นที่จริง 152px โลโก้เลยถูกตัดทุกครั้ง
  // resizeMode="contain" จัดสัดส่วนให้เอง ไม่ต้องใส่ aspectRatio มาตีกับ width/height
  logoMark: {
    width: '100%',
    height: 48,
  },
  navList: {
    flex: 1,
    paddingTop: 8,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    
    gap: 12,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 0,
  },
  navItemActive: {
    backgroundColor: `${COLORS.primary}15`,
  },
  navText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontFamily: 'NotoSansThai_400Regular',
  },
  navTextActive: {
    color: COLORS.primary,
    // สลับเป็นไฟล์ SemiBold จริง แทน fontWeight ที่ทำให้เว็บ fake-bold ตัว Light
    fontFamily: 'NotoSansThai_600SemiBold',
  },
});

const desktopStyles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
  },
});

