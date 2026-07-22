import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
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
import AddTradingOrderScreen from '../screens/AddTradingOrderScreen';
import ExpenseTrackingScreen from '../screens/ExpenseTrackingScreen';
import AddMonthlySummaryScreen from '../screens/AddMonthlySummaryScreen';
import AddIncomeScreen from '../screens/AddIncomeScreen';
import IncomeScreen from '../screens/IncomeScreen';
import InstallmentsScreen from '../screens/InstallmentsScreen';
import AddInstallmentScreen from '../screens/AddInstallmentScreen';
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
      {/* <View style={sidebarStyles.logoSection}>
        <Text style={sidebarStyles.logoText}>WEALTH LAB</Text>
      </View> */}
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
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500', marginTop: 2 },
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
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen
          name="Main"
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
  logoText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 0.5,
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
    fontWeight: '400',
    fontFamily: 'NotoSansThai_400Regular',
  },
  navTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
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

