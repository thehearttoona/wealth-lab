import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { COLORS } from '../utils/constants';
import { useResponsive } from '../utils/responsive';
import HomeScreen from './HomeScreen';
import RecurringBillsScreen from './RecurringBillsScreen';

type ExpenseTrackingScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'ExpenseTracking'
>;

export default function ExpenseTrackingScreen() {
  const navigation = useNavigation<ExpenseTrackingScreenNavigationProp>();
  const [activeTab, setActiveTab] = useState<'daily' | 'recurring'>('daily');
  const { isDesktop } = useResponsive();
  
  return (
    <View style={styles.container}>
      {/* <View style={[styles.header, isDesktop && styles.headerDesktop]}>
        <View style={[styles.tabContainer, isDesktop && styles.tabContainerDesktop]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'daily' && styles.tabActive, isDesktop && styles.tabDesktop]}
            onPress={() => setActiveTab('daily')}
          >
            <Text style={[styles.tabText, activeTab === 'daily' && styles.tabTextActive]}>
              รายวัน
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'recurring' && styles.tabActive, isDesktop && styles.tabDesktop]}
            onPress={() => setActiveTab('recurring')}
          >
            <Text style={[styles.tabText, activeTab === 'recurring' && styles.tabTextActive]}>
              รายเดือน
            </Text>
          </TouchableOpacity>
        </View>
      </View> */}

      <View style={styles.content}>
        {activeTab === 'daily' ? (
          <HomeScreen />
        ) : (
          <RecurringBillsScreen />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 25,
    paddingBottom: 0,
    paddingHorizontal: 20,
  },
  headerDesktop: {
    paddingTop: 0,
    paddingHorizontal: 0,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  tabContainerDesktop: {
    gap: 0,
    maxWidth: 400,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabDesktop: {
    paddingVertical: 16,
  },
  tabActive: {
    borderBottomColor: '#ffffff',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'NotoSansThai_400Regular',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
});
