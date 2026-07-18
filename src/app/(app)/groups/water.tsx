import React, { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  TextInput,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../../store/authStore";
import { supabase } from "../../../services/supabase";
import { useToastStore } from "../../../store/toastStore";
import { Theme } from "../../../constants/Theme";
import { ChevronLeft, Plus, Minus, Trash2, Droplet, Calendar, Award } from "lucide-react-native";

export default function WaterTracker() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);

  const [quantity, setQuantity] = useState(1);
  const [rate, setRate] = useState("30");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Fetch monthly water jar logs
  const { data: logs, isLoading: isLogsLoading } = useQuery({
    queryKey: ["water-logs", groupId],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("water_jar_logs")
        .select("*, profile:profiles(*)")
        .eq("group_id", groupId)
        .gte("delivery_date", startOfMonth.toISOString().split("T")[0])
        .order("delivery_date", { ascending: false });

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!groupId,
  });

  // 2. Fetch group info (to verify group details)
  const { data: group } = useQuery({
    queryKey: ["group", groupId],
    queryFn: async () => {
      const { data, error } = await supabase.from("groups").select("*").eq("id", groupId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!groupId,
  });

  // Mutation to log a water jar delivery
  const logMutation = useMutation({
    mutationFn: async () => {
      const dateStr = new Date().toISOString().split("T")[0];
      const payload = {
        group_id: groupId,
        logged_by: user?.id,
        quantity,
        rate: Number(rate) || 30.0,
        delivery_date: dateStr,
      };

      const { error } = await supabase.from("water_jar_logs").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["water-logs", groupId] });
      showToast("Water jar delivery logged successfully", "success");
      setQuantity(1);
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to log delivery", "error");
    },
  });

  // Mutation to delete a logged delivery
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("water_jar_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["water-logs", groupId] });
      showToast("Delivery entry deleted", "success");
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to delete entry", "error");
    },
  });

  // Calculations
  const totalCount = logs?.reduce((sum, log) => sum + log.quantity, 0) || 0;
  const totalBill = logs?.reduce((sum, log) => sum + log.quantity * Number(log.rate), 0) || 0;

  if (isLogsLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#00F5D4" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background px-6">
      {/* Header */}
      <View className="flex-row justify-between items-center mb-6">
        <TouchableOpacity
          onPress={() => {
            Theme.haptics.light();
            router.back();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="p-1 rounded-full bg-surfaceLight border-[0.5px] border-border"
        >
          <ChevronLeft size={20} color="#00F5D4" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-bold">Water Jar Tracker</Text>
        <View className="w-8" />
      </View>

      {/* MONTHLY SUMMARY CARD */}
      <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 mb-6">
        <View className="flex-row justify-between items-center mb-3">
          <View>
            <Text className="text-accentGray text-[10px] font-bold uppercase tracking-widest">
              Monthly Bill
            </Text>
            <Text className="text-white text-3xl font-black mt-1">₹ {totalBill.toFixed(2)}</Text>
          </View>
          <View className="bg-accentCyan/10 px-3.5 py-2 rounded-xl border-[0.5px] border-accentCyan/20 flex-row items-center">
            <Droplet size={14} color="#00F5D4" className="mr-1" />
            <Text className="text-accentCyan text-xs font-bold">{totalCount} Jars</Text>
          </View>
        </View>
        <Text className="text-accentGray text-[10px] leading-relaxed">
          Logged deliveries for {group?.name || "Shared flat"}. Costs can be split equally in group settlements.
        </Text>
      </View>

      {/* ADD WATER JAR DELIVERED Stepper */}
      <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 mb-6">
        <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-4">
          Log New Delivery
        </Text>

        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-white text-sm font-semibold">Quantity</Text>
          {/* Stepper buttons */}
          <View className="flex-row items-center bg-surfaceLight border-[0.5px] border-border rounded-xl p-1">
            <TouchableOpacity
              onPress={() => {
                Theme.haptics.light();
                setQuantity(Math.max(1, quantity - 1));
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="w-10 h-10 justify-center items-center rounded-lg bg-surface active:opacity-80"
            >
              <Minus size={16} color="#A3A3A3" />
            </TouchableOpacity>
            <Text className="text-white font-black text-base px-6">{quantity}</Text>
            <TouchableOpacity
              onPress={() => {
                Theme.haptics.light();
                setQuantity(quantity + 1);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="w-10 h-10 justify-center items-center rounded-lg bg-surface active:opacity-80"
            >
              <Plus size={16} color="#00F5D4" />
            </TouchableOpacity>
          </View>
        </View>

        <View className="flex-row items-center justify-between mb-5">
          <Text className="text-white text-sm font-semibold">Rate Per Jar (₹)</Text>
          <View className="bg-surfaceLight border-[0.5px] border-border rounded-xl px-3 py-2 w-24 flex-row items-center">
            <Text className="text-accentCyan text-xs mr-1">₹</Text>
            <TextInput
              className="text-white font-bold text-sm flex-1 text-center"
              keyboardType="numeric"
              value={rate}
              onChangeText={setRate}
            />
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={() => logMutation.mutate()}
          disabled={logMutation.isPending}
          className="bg-accentCyan py-4 rounded-xl items-center active:opacity-90 shadow-lg"
        >
          {logMutation.isPending ? (
            <ActivityIndicator size="small" color="#0D0D0D" />
          ) : (
            <Text className="text-background font-black text-sm">Log Jar Delivery</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* HISTORICAL TIMELINE FEED */}
      <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-4">
        Delivery History
      </Text>

      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isCreator = item.logged_by === user?.id;
          return (
            <View className="flex-row items-center bg-surface border-[0.5px] border-border p-4 rounded-xl mb-3">
              <View className="w-10 h-10 justify-center items-center rounded-xl bg-surfaceLight mr-3">
                <Droplet size={18} color="#00F5D4" />
              </View>
              <View className="flex-1 mr-2">
                <Text className="text-white text-sm font-bold">
                  {item.quantity} Water Can{item.quantity > 1 ? "s" : ""}
                </Text>
                <Text className="text-accentGray text-[10px] mt-0.5" numberOfLines={1}>
                  Logged by {item.profile?.display_name || "Someone"} • ₹{item.rate}/jar
                </Text>
              </View>
              <View className="items-end mr-2">
                <Text className="text-white font-bold text-sm">₹ {item.quantity * Number(item.rate)}</Text>
                <Text className="text-accentGray text-[9px] mt-0.5">
                  {new Date(item.delivery_date).toLocaleDateString()}
                </Text>
              </View>
              {isCreator && (
                <TouchableOpacity
                  onPress={() => {
                    Theme.haptics.medium();
                    deleteMutation.mutate(item.id);
                  }}
                  className="p-2 bg-surfaceLight rounded-lg active:scale-95 ml-1"
                >
                  <Trash2 size={14} color="#FF007F" />
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View className="py-10 items-center">
            <Text className="text-accentGray text-sm">No water jar logs recorded.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
