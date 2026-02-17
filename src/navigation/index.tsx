import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FontAwesome } from '@expo/vector-icons';
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
import GridTradingScreen from '../screens/GridTradingScreen';
import { COLORS } from '../utils/constants';
import { useResponsive } from '../utils/responsive';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_ITEMS = [
  { name: 'ExpenseTrackingTab', title: 'รายจ่าย', icon: 'credit-card' as const, component: ExpenseTrackingScreen },
  { name: 'OverviewTab', title: 'ภาพรวม', icon: 'pie-chart' as const, component: OverviewScreen },
  { name: 'PortfolioTab', title: 'พอร์ตการลงทุน', icon: 'briefcase' as const, component: PortfolioScreen },
  { name: 'TradingTab', title: 'Trading', icon: 'line-chart' as const, component: TradingOrdersScreen },
  { name: 'GridTradingTab', title: 'Grid MT5', icon: 'th' as const, component: GridTradingScreen },
  { name: 'StatisticsTab', title: 'วิเคราะห์', icon: 'bar-chart' as const, component: StatisticsScreen },
];

function DesktopSidebar({ activeTab, onTabPress }: { activeTab: string; onTabPress: (name: string) => void }) {
  return (
    <View style={sidebarStyles.container}>
      <View style={sidebarStyles.logoSection}>
        <FontAwesome name="diamond" size={20} color={COLORS.primary} />
        <Text style={sidebarStyles.logoText}>Narix Tracking</Text>
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
        tabBarItemStyle: {
          paddingVertical: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      {TAB_ITEMS.map((item) => (
        <Tab.Screen
          key={item.name}
          name={item.name}
          component={item.component}
          options={{
            title: item.name === 'ExpenseTrackingTab' ? 'Narix รายจ่าย' : item.title,
            tabBarIcon: ({ color }) => <FontAwesome name={item.icon} size={18} color={color} />,
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

function TabNavigator() {
  const { isDesktop } = useResponsive();

  if (isDesktop) {
    return <DesktopTabNavigator />;
  }

  return <MobileTabNavigator />;
}

export default function Navigation() {
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
          options={({ route }) => ({
            title: route.params.type === 'daily' ? 'Add Daily Expense' : 'Add Recurring Expense',
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
    paddingTop: 24,
  },
  logoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 8,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  logoText: {
    fontSize: 16,
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
