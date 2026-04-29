import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Insight, getAllInsights } from '../utils/aiAnalysis';
import { COLORS } from '../utils/constants';
import { useResponsive } from '../utils/responsive';

export default function StatisticsScreen() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const { isDesktop } = useResponsive();

  const loadInsights = async () => {
    setLoading(true);
    const allInsights = await getAllInsights();
    setInsights(allInsights);
    setLoading(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadInsights();
    }, [])
  );

  const getInsightColor = (type: string) => {
    switch (type) {
      case 'warning':
        return '#ff9800';
      case 'alert':
        return '#f44336';
      case 'tip':
        return '#2196f3';
      case 'success':
        return '#4caf50';
      default:
        return COLORS.primary;
    }
  };

  const getInsightBackground = (type: string) => {
    switch (type) {
      case 'warning':
        return '#2A1F0E';
      case 'alert':
        return '#2A1015';
      case 'tip':
        return '#0F1E2E';
      case 'success':
        return '#0F2A1E';
      default:
        return COLORS.background;
    }
  };

  const renderInsight = (insight: Insight, index: number) => {
    const color = getInsightColor(insight.type);
    const backgroundColor = getInsightBackground(insight.type);

    return (
      <View
        key={index}
        style={[
          styles.insightCard,
          { backgroundColor, borderLeftColor: color },
          isDesktop && styles.insightCardDesktop,
        ]}
      >
        <View style={styles.insightHeader}>
          <Text style={styles.insightIcon}>{insight.icon}</Text>
          <Text style={[styles.insightTitle, { color }]}>{insight.title}</Text>
        </View>
        <Text style={styles.insightMessage}>{insight.message}</Text>

        {insight.actionable && (
          <View style={styles.actionableContainer}>
            <Text style={styles.actionableLabel}>💡 คำแนะนำ:</Text>
            <Text style={styles.actionableText}>{insight.actionable}</Text>
          </View>
        )}

        {insight.savingPotential && insight.savingPotential > 0 && (
          <View style={styles.savingContainer}>
            <Text style={styles.savingText}>
              💰 ประหยัดได้: ฿{insight.savingPotential.toFixed(0)}/เดือน
            </Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>กำลังวิเคราะห์ข้อมูล...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={isDesktop ? styles.desktopWrapper : undefined}>
        <View style={[styles.header, isDesktop && styles.headerDesktop]}>
          <Text style={styles.headerTitle}>📊 วิเคราะห์การเงิน</Text>
          <Text style={styles.headerSubtitle}>AI วิเคราะห์และแนะนำเพื่อคุณ</Text>
        </View>

        <TouchableOpacity style={styles.refreshButton} onPress={loadInsights}>
          <Text style={styles.refreshButtonText}>🔄 รีเฟรช</Text>
        </TouchableOpacity>

        <View style={styles.content}>
          {insights.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📝</Text>
              <Text style={styles.emptyTitle}>ยังไม่มีข้อมูลเพียงพอ</Text>
              <Text style={styles.emptyText}>
                เริ่มบันทึกค่าใช้จ่ายและการลงทุน{'\n'}เพื่อรับคำแนะนำจาก AI
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryText}>
                  พบ <Text style={styles.summaryCount}>{insights.length}</Text> คำแนะนำ
                </Text>
              </View>

              <View style={isDesktop ? styles.insightsGridDesktop : undefined}>
                {insights.map((insight, index) => renderInsight(insight, index))}
              </View>

              <View style={isDesktop ? styles.bottomRowDesktop : undefined}>
                <View style={[styles.infoBox, isDesktop && styles.bottomBoxDesktop]}>
                  <Text style={styles.infoTitle}>ℹ️ เกี่ยวกับการวิเคราะห์</Text>
                  <Text style={styles.infoText}>
                    • วิเคราะห์จากข้อมูลจริงของคุณ{'\n'}
                    • ใช้กฎการเงินที่เป็นที่ยอมรับ{'\n'}
                    • อัปเดตตามข้อมูลล่าสุดอัตโนมัติ{'\n'}
                    • ข้อมูลไม่ออกจากเครื่อง ปลอดภัย 100%
                  </Text>
                </View>

                <View style={[styles.tipBox, isDesktop && styles.bottomBoxDesktop]}>
                  <Text style={styles.tipTitle}>💡 เคล็ดลับ</Text>
                  <Text style={styles.tipText}>
                    บันทึกข้อมูลสม่ำเสมอเพื่อให้ AI วิเคราะห์ได้แม่นยำยิ่งขึ้น
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  desktopWrapper: {
    maxWidth: 900,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  header: {
    backgroundColor: COLORS.primary,
    padding: 20,
    paddingTop: 60,
    paddingBottom: 30,
  },
  headerDesktop: {
    paddingTop: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.9,
    marginTop: 4,
  },
  refreshButton: {
    margin: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  refreshButtonText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    paddingTop: 0,
  },
  summaryBox: {
    backgroundColor: COLORS.primary,
    borderRadius: 0,
    padding: 16,
    marginBottom: 16,
  },
  summaryText: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
  },
  summaryCount: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  insightsGridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  insightCard: {
    borderRadius: 0,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  insightCardDesktop: {
    flex: 1,
    minWidth: 300,
    marginBottom: 0,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  insightIcon: {
    fontSize: 24,
  },
  insightTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  insightMessage: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
    marginBottom: 8,
  },
  actionableContainer: {
    backgroundColor: 'rgba(30, 55, 80, 0.7)',
    borderRadius: 0,
    padding: 12,
    marginTop: 8,
  },
  actionableLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  actionableText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  savingContainer: {
    backgroundColor: COLORS.success,
    borderRadius: 0,
    padding: 10,
    marginTop: 8,
  },
  savingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  bottomRowDesktop: {
    flexDirection: 'row',
    gap: 16,
  },
  bottomBoxDesktop: {
    flex: 1,
  },
  infoBox: {
    backgroundColor: '#162030',
    borderRadius: 0,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7986CB',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#7986CB',
    lineHeight: 22,
  },
  tipBox: {
    backgroundColor: '#2A2210',
    borderRadius: 0,
    padding: 16,
    marginBottom: 32,
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFB74D',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 14,
    color: '#FFB74D',
    lineHeight: 20,
  },
});
