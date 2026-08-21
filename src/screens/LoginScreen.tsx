import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../services/supabase';
import { COLORS } from '../utils/constants';
import { Mascot } from '../components/Mascot';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    const redirectTo = Platform.OS === 'web'
      ? window.location.origin
      : 'narix://auth/callback';
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) setError(error.message);
    else if (data.url && Platform.OS !== 'web') Linking.openURL(data.url);
    setLoading(false);
  };

return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        {/* น้องหมุดแทนไฟล์ไอคอน 344KB ที่เคยโหลดตรงนี้ — เป็นจอแรกที่ทุกคนเห็น
            และเป็นที่เดียวที่มาสคอตทำหน้าที่ "แบรนด์" ไม่ใช่ "สถานะ" */}
        <View style={styles.logoMark}>
          <Mascot state="happy" size={118} />
        </View>
        <Text style={styles.logo}>Pakmut Wealth</Text>
        <Text style={styles.subtitle}>วางแผนการเงินและติดตามพอร์ตลงทุน</Text>

        <TouchableOpacity
          style={[styles.googleButton, loading && styles.buttonDisabled]}
          onPress={handleGoogleSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.text} size="small" />
          ) : (
            <Text style={styles.googleButtonText}>เข้าสู่ระบบด้วย Google</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    padding: 32,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoMark: {
    alignSelf: 'center',
    marginBottom: 12,
  },
  logo: {
    fontSize: 24,
    fontFamily: 'NotoSansThai_600SemiBold',
    color: COLORS.primary,
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  tabRow: {
    flexDirection: 'row',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 0,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontFamily: 'NotoSansThai_500Medium',
  },
  tabTextActive: {
    color: '#fff',
    fontFamily: 'NotoSansThai_600SemiBold',
  },
  label: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 8,
    fontFamily: 'NotoSansThai_500Medium',
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
    marginBottom: 16,
    fontFamily: 'NotoSansThai_400Regular',
  },
  error: {
    color: COLORS.error,
    fontSize: 12,
    marginBottom: 8,
    fontFamily: 'NotoSansThai_400Regular',
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 0,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'NotoSansThai_600SemiBold',
  },
  sentBox: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  sentIcon: { fontSize: 40, marginBottom: 4 },
  sentTitle: { fontSize: 18, fontFamily: 'NotoSansThai_600SemiBold', color: COLORS.text },
  sentDesc: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', fontFamily: 'NotoSansThai_400Regular' },
  link: {
    color: COLORS.primary,
    fontSize: 14,
    marginTop: 8,
    textDecorationLine: 'underline',
    fontFamily: 'NotoSansThai_400Regular',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: 'NotoSansThai_400Regular',
  },
  googleButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 0,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  googleButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: 'NotoSansThai_500Medium',
  },
});
