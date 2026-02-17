import AsyncStorage from '@react-native-async-storage/async-storage';
import { MonthlySummary } from '../types';

const MONTHLY_SUMMARY_KEY = '@monthly_summary';

export const saveMonthlySummary = async (summary: MonthlySummary): Promise<void> => {
  try {
    const existingSummaries = await getMonthlySummaries();
    const index = existingSummaries.findIndex((s) => s.month === summary.month);
    
    let updatedSummaries;
    if (index >= 0) {
      // Update existing
      updatedSummaries = existingSummaries.map((s) =>
        s.month === summary.month ? summary : s
      );
    } else {
      // Add new
      updatedSummaries = [...existingSummaries, summary];
    }
    
    await AsyncStorage.setItem(MONTHLY_SUMMARY_KEY, JSON.stringify(updatedSummaries));
  } catch (error) {
    console.error('Error saving monthly summary:', error);
    throw error;
  }
};

export const getMonthlySummaries = async (): Promise<MonthlySummary[]> => {
  try {
    const summaries = await AsyncStorage.getItem(MONTHLY_SUMMARY_KEY);
    return summaries ? JSON.parse(summaries) : [];
  } catch (error) {
    console.error('Error getting monthly summaries:', error);
    return [];
  }
};

export const getMonthlySummaryByMonth = async (month: string): Promise<MonthlySummary | null> => {
  try {
    const summaries = await getMonthlySummaries();
    return summaries.find((s) => s.month === month) || null;
  } catch (error) {
    console.error('Error getting monthly summary by month:', error);
    return null;
  }
};

export const deleteMonthlySummary = async (month: string): Promise<void> => {
  try {
    const summaries = await getMonthlySummaries();
    const filteredSummaries = summaries.filter((s) => s.month !== month);
    await AsyncStorage.setItem(MONTHLY_SUMMARY_KEY, JSON.stringify(filteredSummaries));
  } catch (error) {
    console.error('Error deleting monthly summary:', error);
    throw error;
  }
};

// Get summaries for a specific year
export const getMonthlySummariesByYear = async (year: number): Promise<MonthlySummary[]> => {
  try {
    const summaries = await getMonthlySummaries();
    return summaries
      .filter((s) => s.month.startsWith(`${year}-`))
      .sort((a, b) => a.month.localeCompare(b.month));
  } catch (error) {
    console.error('Error getting monthly summaries by year:', error);
    return [];
  }
};
