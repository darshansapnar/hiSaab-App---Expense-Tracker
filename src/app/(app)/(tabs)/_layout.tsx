import React from "react";
import { Tabs } from "expo-router";
import { Home, User, Users, BarChart2 } from "lucide-react-native";
import { Colors } from "../../../constants/Colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const tabHeight = 60 + insets.bottom;
  const paddingBottom = insets.bottom > 0 ? insets.bottom + 4 : 8;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.background, // Matches the deep dark blue/navy screen background color
          borderTopWidth: 0.5,
          borderTopColor: "rgba(255, 255, 255, 0.08)", // Subtle premium border separator
          height: tabHeight,
          paddingBottom: paddingBottom,
          paddingTop: 8,
        },
        tabBarActiveTintColor: Colors.accentCyan,
        tabBarInactiveTintColor: Colors.accentGray,
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: "Inter_500Medium",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Home size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: "Groups",
          tabBarIcon: ({ color }) => <Users size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: "Analytics",
          tabBarIcon: ({ color }) => <BarChart2 size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <User size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
