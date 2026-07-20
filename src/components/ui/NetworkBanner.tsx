import React, { useEffect, useState, useRef } from "react";
import { View, Text, Animated, StyleSheet, Platform } from "react-native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { WifiOff, CheckCircle2 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetworkStore } from "../../store/networkStore";

export function NetworkBanner() {
  const insets = useSafeAreaInsets();
  const setIsConnectedStore = useNetworkStore((state) => state.setIsConnected);

  const [status, setStatus] = useState<"online" | "offline" | "back_online">("online");
  const wasOfflineRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Animated values for smooth slide and fade
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const showBanner = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const hideBanner = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -80,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  useEffect(() => {
    // Single global NetInfo subscription listener
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);

      // Update global Zustand network store
      setIsConnectedStore(Boolean(state.isConnected), state.isInternetReachable);

      if (!isOnline) {
        // Device is offline
        wasOfflineRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        setStatus("offline");
        showBanner();
      } else if (wasOfflineRef.current) {
        // Connection restored after being offline
        wasOfflineRef.current = false;
        setStatus("back_online");
        showBanner();

        // Automatically hide online banner after 2.5 seconds
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          hideBanner();
          setTimeout(() => setStatus("online"), 300);
        }, 2500);
      }
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [setIsConnectedStore]);

  if (status === "online") {
    return null;
  }

  const isOffline = status === "offline";
  const topMargin = Platform.OS === "ios" ? insets.top + 4 : insets.top + 8;

  return (
    <View pointerEvents="box-none" style={[styles.absoluteContainer, { top: topMargin }]}>
      <Animated.View
        style={[
          styles.bannerCard,
          isOffline ? styles.offlineBg : styles.onlineBg,
          {
            transform: [{ translateY }],
            opacity,
          },
        ]}
      >
        <View style={styles.contentRow}>
          {isOffline ? (
            <WifiOff size={16} color="#F59E0B" style={styles.icon} />
          ) : (
            <CheckCircle2 size={16} color="#22C55E" style={styles.icon} />
          )}

          <Text style={[styles.text, isOffline ? styles.offlineText : styles.onlineText]}>
            {isOffline
              ? "You're offline. Connect to the internet to sync your data."
              : "Back online. Your data is syncing."}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  absoluteContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 99999,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  bannerCard: {
    width: "100%",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  offlineBg: {
    backgroundColor: "rgba(21, 30, 46, 0.95)",
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  onlineBg: {
    backgroundColor: "rgba(21, 30, 46, 0.95)",
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    lineHeight: 16,
  },
  offlineText: {
    color: "#F59E0B",
  },
  onlineText: {
    color: "#22C55E",
  },
});
