import React, { useEffect } from "react";
import { StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface ScreenTransitionProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
  duration?: number;
  translateDistance?: number;
}

export function ScreenTransition({
  children,
  style,
  className,
  duration = 220,
  translateDistance = 15,
}: ScreenTransitionProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(translateDistance);

  useEffect(() => {
    opacity.value = withTiming(1, { duration, easing: Easing.out(Easing.quad) });
    translateY.value = withTiming(0, { duration, easing: Easing.out(Easing.quad) });
  }, [duration, translateDistance]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[{ flex: 1 }, animatedStyle, style]} className={className}>
      {children}
    </Animated.View>
  );
}
