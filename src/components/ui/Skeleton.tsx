import React, { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: any;
  className?: string;
}

export function Skeleton({ width, height, borderRadius = 8, style, className }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: "rgba(255, 255, 255, 0.08)",
          opacity,
        },
        style,
      ]}
      className={className}
    />
  );
}

export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return <Skeleton width={size} height={size} borderRadius={size / 2} />;
}

export function SkeletonCard({ height = 100, style, className }: { height?: number | string; style?: any; className?: string }) {
  return (
    <View style={style} className={`bg-[#151E2E]/60 border-[0.5px] border-white/5 rounded-2xl p-5 w-full ${className || ""}`}>
      <Skeleton width="40%" height={12} borderRadius={4} className="mb-3" />
      <Skeleton width="80%" height={20} borderRadius={6} className="mb-2" />
      <Skeleton width="60%" height={10} borderRadius={4} />
    </View>
  );
}

export function SkeletonListItem() {
  return (
    <View className="flex-row items-center py-4 border-b-[0.5px] border-white/5">
      <SkeletonAvatar size={40} />
      <View className="flex-1 ml-4 space-y-2">
        <Skeleton width="50%" height={12} borderRadius={4} />
        <Skeleton width="30%" height={8} borderRadius={4} />
      </View>
      <Skeleton width={48} height={16} borderRadius={4} />
    </View>
  );
}

export function SkeletonGroupCard() {
  return (
    <View className="bg-[#151E2E]/60 border-[0.5px] border-white/5 rounded-2xl p-5 mb-4 w-full flex-row items-center justify-between shadow-md">
      <View className="flex-row items-center flex-1 mr-4">
        <Skeleton width={48} height={48} borderRadius={24} />
        <View className="ml-4 flex-1 space-y-2">
          <Skeleton width="65%" height={16} borderRadius={4} />
          <Skeleton width="35%" height={10} borderRadius={4} />
        </View>
      </View>
      <View className="items-end space-y-2">
        <Skeleton width={60} height={12} borderRadius={4} />
        <Skeleton width={40} height={8} borderRadius={4} />
      </View>
    </View>
  );
}

export function SkeletonExpenseItem() {
  return (
    <View className="flex-row items-center py-3.5 border-b-[0.5px] border-white/5 justify-between">
      <View className="flex-row items-center flex-1 mr-4">
        <Skeleton width={36} height={36} borderRadius={18} />
        <View className="ml-3 flex-1 space-y-1.5">
          <Skeleton width="55%" height={12} borderRadius={4} />
          <Skeleton width="30%" height={8} borderRadius={4} />
        </View>
      </View>
      <View className="items-end space-y-1.5">
        <Skeleton width={55} height={14} borderRadius={4} />
        <Skeleton width={35} height={8} borderRadius={4} />
      </View>
    </View>
  );
}

export function SkeletonChart() {
  return (
    <View className="bg-[#151E2E]/60 border-[0.5px] border-white/5 rounded-2xl p-5 w-full items-center justify-between mb-6 shadow-md">
      <Skeleton width="35%" height={10} borderRadius={4} className="self-start mb-6" />
      <View className="flex-row items-end justify-between w-full h-24 px-2">
        <Skeleton width="10%" height="45%" borderRadius={4} />
        <Skeleton width="10%" height="70%" borderRadius={4} />
        <Skeleton width="10%" height="30%" borderRadius={4} />
        <Skeleton width="10%" height="85%" borderRadius={4} />
        <Skeleton width="10%" height="55%" borderRadius={4} />
        <Skeleton width="10%" height="95%" borderRadius={4} />
        <Skeleton width="10%" height="40%" borderRadius={4} />
      </View>
    </View>
  );
}
