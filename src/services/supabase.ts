import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const supabase = createClient('https://hdqycikfcxgxfipkcezw.supabase.co', 'sb_publishable__g-KVGLtna6bVK5NTQdklA_ngaU3oc0', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
