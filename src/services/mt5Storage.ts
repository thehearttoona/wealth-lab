import AsyncStorage from '@react-native-async-storage/async-storage';
import { MT5Settings, GridSettings } from '../types/mt5';

const MT5_SETTINGS_KEY = '@mt5_settings';
const GRID_SETTINGS_KEY = '@grid_settings';

export const saveMT5Settings = async (settings: MT5Settings): Promise<void> => {
  try {
    await AsyncStorage.setItem(MT5_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving MT5 settings:', error);
    throw error;
  }
};

export const getMT5Settings = async (): Promise<MT5Settings | null> => {
  try {
    const data = await AsyncStorage.getItem(MT5_SETTINGS_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error loading MT5 settings:', error);
    return null;
  }
};

export const saveGridSettings = async (settings: GridSettings): Promise<void> => {
  try {
    await AsyncStorage.setItem(GRID_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving grid settings:', error);
    throw error;
  }
};

export const getGridSettings = async (): Promise<GridSettings | null> => {
  try {
    const data = await AsyncStorage.getItem(GRID_SETTINGS_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error loading grid settings:', error);
    return null;
  }
};

export const clearMT5Settings = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(MT5_SETTINGS_KEY);
  } catch (error) {
    console.error('Error clearing MT5 settings:', error);
    throw error;
  }
};
