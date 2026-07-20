import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, useRootNavigationState } from "expo-router";
import { useAuthStore } from "../store/authStore";

export default function Index() {
  const session = useAuthStore((state) => state.session);
  const profile = useAuthStore((state) => state.profile);
  const isLoading = useAuthStore((state) => state.isLoading);
  const rootNavigationState = useRootNavigationState();

  // Guard against checking session or navigating before Expo Router navigation state is fully ready
  if (isLoading || !rootNavigationState?.key) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#00F5D4" />
      </View>
    );
  }

  if (session) {
    // Force onboarding if username/onboarding not completed
    if (!profile?.onboarding_completed) {
      return <Redirect href="/(auth)/profile-setup" />;
    }
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
