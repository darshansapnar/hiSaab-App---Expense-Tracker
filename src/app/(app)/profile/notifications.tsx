import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, CheckCheck, Trash2, Bell, Trash } from "lucide-react-native";
import { useNotificationsStore, AppNotification } from "../../../store/notificationsStore";
import { Theme } from "../../../constants/Theme";
import { Colors } from "../../../constants/Colors";

function getRelativeTime(timestamp: string) {
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now.getTime() - past.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 15) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays === 1) return "Yesterday";
  return past.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getNotificationIcon(type: AppNotification["type"]) {
  switch (type) {
    case "expense_added":
      return "💸";
    case "group_joined":
      return "👥";
    case "settlement_completed":
      return "🤝";
    case "tiffin_reminder":
      return "🍱";
    case "monthly_summary":
      return "📊";
    case "welcome":
      return "🎉";
    default:
      return "🔔";
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useNotificationsStore();

  const handleMarkAsRead = (id: string) => {
    Theme.haptics.light();
    markAsRead(id);
  };

  const handleMarkAllAsRead = () => {
    Theme.haptics.medium();
    markAllAsRead();
  };

  const handleDelete = (id: string) => {
    Theme.haptics.medium();
    deleteNotification(id);
  };

  const handleClearAll = () => {
    Theme.haptics.warning();
    clearAll();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }}>
      {/* Header */}
      <View className="flex-row justify-between items-center px-6 pb-4 border-b-[0.5px] border-white/5">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => {
              Theme.haptics.light();
              router.back();
            }}
            className="p-1 rounded-full bg-[#151E2E] border-[0.5px] border-white/10 mr-3"
          >
            <ChevronLeft size={20} color="#14E5D4" />
          </TouchableOpacity>
          <Text className="text-white text-lg font-bold">Notifications</Text>
        </View>

        {notifications.length > 0 && (
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={handleMarkAllAsRead}
              className="p-1.5 rounded-lg bg-white/5 border border-white/10 active:scale-95"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <CheckCheck size={16} color="#14E5D4" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleClearAll}
              className="p-1.5 rounded-lg bg-white/5 border border-white/10 active:scale-95"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Trash2 size={16} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Notifications List */}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View className="py-20 items-center justify-center px-6 bg-[#151E2E]/30 rounded-2xl border-[0.5px] border-white/5 shadow-md mt-10">
            <View className="w-12 h-12 rounded-full bg-white/5 items-center justify-center mb-4">
              <Bell size={24} color="#14E5D4" />
            </View>
            <Text className="text-white text-base font-bold text-center mb-1">
              No notifications yet.
            </Text>
            <Text className="text-[#94A3B8] text-xs text-center leading-relaxed max-w-[240px]">
              We'll let you know when something important happens.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => handleMarkAsRead(item.id)}
            activeOpacity={0.8}
            className={`flex-row items-start p-4 rounded-2xl mb-3 border-[0.5px] shadow-sm ${
              item.isRead
                ? "bg-[#151E2E]/40 border-white/5"
                : "bg-[#151E2E] border-white/10"
            }`}
          >
            {/* Left Icon */}
            <View className="w-10 h-10 rounded-xl bg-white/5 items-center justify-center mr-3.5">
              <Text style={{ fontSize: 18 }}>{getNotificationIcon(item.type)}</Text>
            </View>

            {/* Content info */}
            <View className="flex-1 mr-2">
              <View className="flex-row justify-between items-center mb-1">
                <Text className="text-white text-xs font-extrabold flex-1 mr-1" numberOfLines={1}>
                  {item.title}
                </Text>
                <Text className="text-[#94A3B8] text-[8px] font-medium">
                  {getRelativeTime(item.timestamp)}
                </Text>
              </View>
              <Text className="text-[#94A3B8] text-[11px] leading-relaxed font-medium">
                {item.description}
              </Text>
            </View>

            {/* Right actions/indicators */}
            <View className="items-end justify-between h-10 pl-1">
              {/* Unread teal dot badge */}
              {!item.isRead ? (
                <View className="w-2 h-2 rounded-full bg-[#14E5D4] mt-1" />
              ) : (
                <View className="w-2 h-2" />
              )}

              {/* Trash/delete action */}
              <TouchableOpacity
                onPress={() => handleDelete(item.id)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                className="p-1 rounded-md bg-white/5 active:scale-90 mt-2"
              >
                <Trash size={10} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}
