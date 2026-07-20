import React from "react";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuthStore } from "../../store/authStore";
import { useRealtimeSync } from "../../hooks/useRealtimeSync";

export default function AppLayout() {
  const session = useAuthStore((state) => state.session);
  const profile = useAuthStore((state) => state.profile);
  const isLoading = useAuthStore((state) => state.isLoading);

  // Mount global realtime listener sync
  useRealtimeSync();

  // Show skeletal spinner while session loading/retrieving completes
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#00F5D4" />
      </View>
    );
  }

  // If no session exists, block entry and force redirection to login flow
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  // If onboarding is not completed, redirect to profile setup
  if (!profile?.onboarding_completed) {
    return <Redirect href="/(auth)/profile-setup" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0D0D0D" },
      }}
    />
  );
}
