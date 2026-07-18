import "../../global.css";
import React, { useEffect, useMemo } from "react";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
  Inter_900Black,
} from "@expo-google-fonts/inter";
import ToastContainer from "../components/ui/Toast";
import { useThemeStore } from "../store/themeStore";
import { Colors } from "../constants/Colors";
import { useAuth } from "../hooks/useAuth";

// Prevent splash screen auto-hiding until assets load
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Initialize Supabase auth session listener
  useAuth();

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    Inter_900Black,
  });

  const isDark = useThemeStore((state) => state.isDark);

  // Initialize QueryClient for data caching
  const queryClient = useMemo(() => new QueryClient(), []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  const activeBgColor = isDark ? Colors.background : "#F9F9FB";

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <StatusBar style={isDark ? "light" : "dark"} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: activeBgColor },
            }}
          />
          <ToastContainer />
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
