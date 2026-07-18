import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto"; // Prevents issues with URL parsing in react-native

// Custom storage adapter using React Native AsyncStorage for token persistence (avoids 2KB SecureStore limits)
const AsyncStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      // Fallback
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      // Fallback
    }
  },
};

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const rawKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Provide valid syntax fallback values to prevent top-level createClient exceptions on unconfigured envs
const supabaseUrl = rawUrl && rawUrl.startsWith("http") && !rawUrl.includes("your-supabase-project")
  ? rawUrl
  : "https://placeholder-project.supabase.co";

const supabaseAnonKey = rawKey && rawKey !== "your-supabase-anon-key"
  ? rawKey
  : "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
