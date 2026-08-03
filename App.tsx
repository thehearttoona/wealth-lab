import { StatusBar } from 'expo-status-bar';
// ทั้งแอปใช้ Noto Sans Thai ตัวเดียว — เคยโหลด Nunito มาคู่กันแล้วฟอนต์ปนกันเวลามีไทยผสมอังกฤษ
import { useFonts, NotoSansThai_300Light, NotoSansThai_400Regular, NotoSansThai_500Medium, NotoSansThai_600SemiBold } from '@expo-google-fonts/noto-sans-thai';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Navigation from './src/navigation';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded] = useFonts({
    NotoSansThai_300Light,
    NotoSansThai_400Regular,
    NotoSansThai_500Medium,
    NotoSansThai_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Navigation />
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
