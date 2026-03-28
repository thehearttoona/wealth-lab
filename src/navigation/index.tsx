import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import LoginScreen from '../screens/LoginScreen';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types';
import HomeScreen from '../screens/HomeScreen';
import AddExpenseScreen from '../screens/AddExpenseScreen';
import RecurringBillsScreen from '../screens/RecurringBillsScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import AddInvestmentScreen from '../screens/AddInvestmentScreen';
import StatisticsScreen from '../screens/StatisticsScreen';
import TradingOrdersScreen from '../screens/TradingOrdersScreen';
import AddTradingOrderScreen from '../screens/AddTradingOrderScreen';
import OverviewScreen from '../screens/OverviewScreen';
import ExpenseTrackingScreen from '../screens/ExpenseTrackingScreen';
import AddMonthlySummaryScreen from '../screens/AddMonthlySummaryScreen';
import AddIncomeScreen from '../screens/AddIncomeScreen';
import GridTradingScreen from '../screens/GridTradingScreen';
import TradingCalculatorScreen from '../screens/TradingCalculatorScreen';
import { COLORS } from '../utils/constants';
import { useResponsive } from '../utils/responsive';
import AIAssistant from '../components/AIAssistant';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_ITEMS = [
  { name: 'ExpenseTrackingTab', title: 'การเงิน', icon: 'credit-card' as const, mobileIcon: 'wallet-outline' as const, component: ExpenseTrackingScreen },
  { name: 'OverviewTab', title: 'ภาพรวม', icon: 'pie-chart' as const, mobileIcon: 'pie-chart-outline' as const, component: OverviewScreen },
  { name: 'PortfolioTab', title: 'พอร์ต', icon: 'briefcase' as const, mobileIcon: 'briefcase-outline' as const, component: PortfolioScreen },
  { name: 'TradingTab', title: 'เทรด', icon: 'line-chart' as const, mobileIcon: 'trending-up-outline' as const, component: TradingOrdersScreen },
  { name: 'GridTradingTab', title: 'Grid MT5', icon: 'th' as const, mobileIcon: 'grid-outline' as const, component: GridTradingScreen },
  { name: 'StatisticsTab', title: 'สถิติ', icon: 'bar-chart' as const, mobileIcon: 'bar-chart-outline' as const, component: StatisticsScreen },
  { name: 'CalculatorTab', title: 'คำนวณ', icon: 'calculator' as const, mobileIcon: 'calculator-outline' as const, component: TradingCalculatorScreen },
];

function DesktopSidebar({ activeTab, onTabPress }: { activeTab: string; onTabPress: (name: string) => void }) {
  return (
    <View style={sidebarStyles.container}>
      <View style={sidebarStyles.logoSection}>
        <Text style={sidebarStyles.logoText}>WEALTH LAB</Text>
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
              <FontAwesome
                name={item.icon}
                size={16}
                color={isActive ? COLORS.primary : COLORS.textSecondary}
              />
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
        headerShown: true,
        headerStyle: { backgroundColor: COLORS.surface },
        headerTitleStyle: {
          color: COLORS.text,
          fontSize: 14,
          fontFamily: 'NotoSansThai_400Regular',
          letterSpacing: 1,
        },
        headerShadowVisible: false,
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
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={item.mobileIcon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

function TabNavigator() {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ExpenseTrackingScreen />
      {/* <AIAssistant fabBottom={90} /> */}
    </View>
  );
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
                <FontAwesome name="chevron-left" size={16} color="#ffffff" />
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
    borderRadius: 8,
  },
  navItemActive: {
    backgroundColor: `${COLORS.primary}15`,
  },
  navText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '400',
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

