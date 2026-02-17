import { StatusBar } from 'expo-status-bar';
import { useFonts, NotoSansThai_300Light, NotoSansThai_400Regular, NotoSansThai_500Medium, NotoSansThai_600SemiBold } from '@expo-google-fonts/noto-sans-thai';
import { Nunito_400Regular, Nunito_500Medium, Nunito_600SemiBold, Nunito_700Bold } from '@expo-google-fonts/nunito';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import Navigation from './src/navigation';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded] = useFonts({
    NotoSansThai_300Light,
    NotoSansThai_400Regular,
    NotoSansThai_500Medium,
    NotoSansThai_600SemiBold,
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
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
    <>
      <Navigation />
      <StatusBar style="dark" />
    </>
  );
}
