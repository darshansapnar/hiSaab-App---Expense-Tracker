import React, { useEffect } from "react";
import { StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface StaggeredCardProps {
  index?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
  staggerMs?: number;
  duration?: number;
}

export function StaggeredCard({
  index = 0,
  children,
  style,
  className,
  staggerMs = 40,
  duration = 240,
}: StaggeredCardProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    const delay = Math.min(index * staggerMs, 300);
    opacity.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.quad) }));
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration, easing: Easing.out(Easing.quad) })
    );
  }, [index, staggerMs, duration]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]} className={className}>
      {children}
    </Animated.View>
  );
}
