import React, { useMemo, useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Image, Animated } from "react-native";
import { getInitials, getAvatarColor } from "../../utils/avatarUtils";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | number;

interface UserAvatarProps {
  name?: string | null;
  avatarUrl?: string | null;
  userId?: string | null;
  size?: AvatarSize;
  style?: any;
  className?: string;
  textStyle?: any;
}

const SIZE_MAP: Record<string, { dimension: number; fontSize: number }> = {
  xs: { dimension: 24, fontSize: 10 },
  sm: { dimension: 32, fontSize: 12 },
  md: { dimension: 40, fontSize: 15 },
  lg: { dimension: 56, fontSize: 20 },
  xl: { dimension: 80, fontSize: 28 },
};

export function UserAvatar({
  name,
  avatarUrl,
  userId,
  size = "md",
  style,
  className,
  textStyle,
}: UserAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [avatarUrl, name]);

  // Compute dimensions and font size
  const { dimension, fontSize } = useMemo(() => {
    if (typeof size === "number") {
      return { dimension: size, fontSize: Math.max(10, Math.round(size * 0.4)) };
    }
    return SIZE_MAP[size] || SIZE_MAP.md;
  }, [size]);

  // Compute initials and background color
  const initials = useMemo(() => getInitials(name), [name]);
  const backgroundColor = useMemo(() => getAvatarColor(userId || name), [userId, name]);

  const hasValidImage = Boolean(
    avatarUrl &&
    typeof avatarUrl === "string" &&
    avatarUrl.trim().length > 5 &&
    (avatarUrl.startsWith("http://") ||
      avatarUrl.startsWith("https://") ||
      avatarUrl.startsWith("file://") ||
      avatarUrl.startsWith("data:")) &&
    !imageError
  );

  return (
    <Animated.View
      style={[
        styles.avatarContainer,
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          backgroundColor: hasValidImage ? "transparent" : backgroundColor,
          opacity: fadeAnim,
        },
        style,
      ]}
      className={className}
    >
      {hasValidImage ? (
        <Image
          source={{ uri: avatarUrl! }}
          style={{
            width: dimension,
            height: dimension,
            borderRadius: dimension / 2,
          }}
          onError={() => setImageError(true)}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.initialsText, { fontSize }, textStyle]} numberOfLines={1}>
          {initials}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  avatarContainer: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  initialsText: {
    color: "#FFFFFF",
    fontWeight: "800",
    textAlign: "center",
    includeFontPadding: false,
  },
});
