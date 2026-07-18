import * as Haptics from "expo-haptics";

export const Theme = {
  roundness: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },
  animation: {
    spring: {
      damping: 15,
      stiffness: 120,
      mass: 0.8,
    },
    timing: {
      duration: 200,
    },
  },
  haptics: {
    light: () => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {
        // Fallback for non-supported platforms
      }
    },
    medium: () => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (e) {
        // Fallback
      }
    },
    heavy: () => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (e) {
        // Fallback
      }
    },
    success: () => {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {
        // Fallback
      }
    },
    warning: () => {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch (e) {
        // Fallback
      }
    },
    error: () => {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch (e) {
        // Fallback
      }
    },
  },
};
