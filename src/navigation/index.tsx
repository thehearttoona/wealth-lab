import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import LoginScreen from '../screens/LoginScreen';
import { NavigationContainer } from '@react-navigation/native';
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
import RecurringBillsScreen from '../screens/RecurringBillsScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import AddInvestmentScreen from '../screens/AddInvestmentScreen';
import ManageByPlatformScreen from '../screens/ManageByPlatformScreen';
import AddTradingOrderScreen from '../screens/AddTradingOrderScreen';
import ExpenseTrackingScreen from '../screens/ExpenseTrackingScreen';
import AddMonthlySummaryScreen from '../screens/AddMonthlySummaryScreen';
import AddIncomeScreen from '../screens/AddIncomeScreen';
import IncomeScreen from '../screens/IncomeScreen';
import InstallmentsScreen from '../screens/InstallmentsScreen';
import AddInstallmentScreen from '../screens/AddInstallmentScreen';
import AccountsScreen from '../screens/AccountsScreen';
import ImportStatementScreen from '../screens/ImportStatementScreen';
import ManageCatalogScreen from '../screens/ManageCatalogScreen';
import { refreshCurrencyCache } from '../services/currencyStorage';
import { COLORS } from '../utils/constants';
import { useResponsive } from '../utils/responsive';
import AIAssistant from '../components/AIAssistant';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_ITEMS = [
  {
    name: 'ExpenseTrackingTab',
    title: 'Home',
    icon: 'home',
    iconOutline: 'home-outline',
    customIcon: (size: number, color: string) => <HomeIcon size={size} color={color} />,
    component: ExpenseTrackingScreen,
  },
  { name: 'PortfolioTab', title: 'Port', icon: 'briefcase', iconOutline: 'briefcase-outline', customIcon: null, component: PortfolioScreen },
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
        <Text style={sidebarStyles.logoText}></Text>
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

function DesktopTabNavigator() {
  const [activeTab, setActiveTab] = useState('ExpenseTrackingTab');
  const { sidebarWidth } = useResponsive();

  const ActiveComponent = TAB_ITEMS.find((item) => item.name === activeTab)?.component || ExpenseTrackingScreen;

  return (
    <View style={[desktopStyles.container]}>
      <View style={[{ width: sidebarWidth }]}>
        <DesktopSidebar activeTab={activeTab} onTabPress={setActiveTab} />
      </View>
      <View style={desktopStyles.content}>
        <ActiveComponent />
      </View>
    </View>
  );
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
        tabBarLabelStyle: { fontSize: 10, fontFamily: 'Nunito_600SemiBold', marginTop: 2 },
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

function TabNavigator() {
  const { isDesktop } = useResponsive();
  return isDesktop ? <DesktopTabNavigator /> : <MobileTabNavigator />;
}

export default function Navigation() {
  const { user, loading } = useAuth();

  // โหลดสกุลเงินที่ผู้ใช้ตั้งเองเข้าแคชของ convertToTHB ก่อนหน้าจอไหนจะคิดมูลค่ารวม
  useEffect(() => {
    if (user) refreshCurrencyCache();
  }, [user]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <NavigationContainer>
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
          component={TabNavigator}
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
          name="AddTradingOrder"
          component={AddTradingOrderScreen}
          options={{ title: 'บันทึกออเดอร์' }}
        />
        <Stack.Screen
          name="AddMonthlySummary"
          component={AddMonthlySummaryScreen}
          options={{ headerShown: false }}
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
      </Stack.Navigator>
    </NavigationContainer>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    marginBottom: 8,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  logoMark: {
    height: 60,
    width:200,
    aspectRatio: 1536 / 1024,
    flexShrink: 0,
  },
  logoText: {
    fontSize: 16,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
    letterSpacing: 0.3,
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

