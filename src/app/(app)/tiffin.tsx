import React, { useState, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../store/authStore";
import { supabase } from "../../services/supabase";
import { useToastStore } from "../../store/toastStore";
import { Theme } from "../../constants/Theme";
import { ChevronLeft, Coffee, Sun, Moon, Calendar, Settings, ChevronRight, Check } from "lucide-react-native";

export default function TiffinTracker() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Rate states (defaults)
  const [breakfastRate, setBreakfastRate] = useState("40");
  const [lunchRate, setLunchRate] = useState("80");
  const [dinnerRate, setDinnerRate] = useState("80");

  const [hasBreakfast, setHasBreakfast] = useState(false);
  const [hasLunch, setHasLunch] = useState(false);
  const [hasDinner, setHasDinner] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Format date key: YYYY-MM-DD
  const formatDateKey = (date: Date) => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split("T")[0];
  };

  const selectedDateStr = formatDateKey(selectedDate);

  // 1. Fetch tiffin logs for the current month
  const { data: monthlyLogs, isLoading: isLogsLoading } = useQuery({
    queryKey: ["tiffin-logs-month", user?.id],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("tiffin_logs")
        .select("*")
        .eq("profile_id", user?.id)
        .gte("log_date", startOfMonth.toISOString().split("T")[0]);

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user?.id,
  });

  // Load selected date status
  useEffect(() => {
    if (monthlyLogs) {
      const activeLog = monthlyLogs.find((log) => log.log_date === selectedDateStr);
      if (activeLog) {
        setHasBreakfast(activeLog.has_breakfast);
        setHasLunch(activeLog.has_lunch);
        setHasDinner(activeLog.has_dinner);
        setBreakfastRate(activeLog.breakfast_rate.toString());
        setLunchRate(activeLog.lunch_rate.toString());
        setDinnerRate(activeLog.dinner_rate.toString());
      } else {
        setHasBreakfast(false);
        setHasLunch(false);
        setHasDinner(false);
      }
    }
  }, [selectedDateStr, monthlyLogs]);

  // Mutation to log/toggle daily tiffins
  const logTiffinMutation = useMutation({
    mutationFn: async () => {
      const bRate = Number(breakfastRate) || 0;
      const lRate = Number(lunchRate) || 0;
      const dRate = Number(dinnerRate) || 0;

      const payload = {
        profile_id: user?.id,
        log_date: selectedDateStr,
        has_breakfast: hasBreakfast,
        has_lunch: hasLunch,
        has_dinner: hasDinner,
        breakfast_rate: bRate,
        lunch_rate: lRate,
        dinner_rate: dRate,
      };

      const { error } = await supabase.from("tiffin_logs").upsert(payload, {
        onConflict: "profile_id, log_date",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["tiffin-logs-month", user?.id] });
      showToast("Meals updated", "success");
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to update meals", "error");
    },
  });

  // Calculate monthly stats
  let breakfastCount = 0;
  let lunchCount = 0;
  let dinnerCount = 0;
  let totalBill = 0;

  monthlyLogs?.forEach((log) => {
    if (log.has_breakfast) {
      breakfastCount++;
      totalBill += Number(log.breakfast_rate);
    }
    if (log.has_lunch) {
      lunchCount++;
      totalBill += Number(log.lunch_rate);
    }
    if (log.has_dinner) {
      dinnerCount++;
      totalBill += Number(log.dinner_rate);
    }
  });

  const totalMeals = breakfastCount + lunchCount + dinnerCount;

  // Generate last 7 days helper for calendar scroll
  const getDaysArray = () => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      arr.push(d);
    }
    return arr;
  };

  const calendarDays = getDaysArray();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 50 }}>
        {/* Top Navigation */}
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
          <Text className="text-white text-lg font-bold">Tiffin Tracker</Text>
          <TouchableOpacity
            onPress={() => {
              Theme.haptics.light();
              setIsConfigOpen(!isConfigOpen);
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className={`p-2 rounded-xl border-[0.5px] ${
              isConfigOpen ? "bg-accentCyan/10 border-accentCyan" : "bg-surfaceLight border-border"
            }`}
          >
            <Settings size={18} color={isConfigOpen ? "#00F5D4" : "#A3A3A3"} />
          </TouchableOpacity>
        </View>

      {/* PRICE RATE CONFIG COLLAPSED COMPONENT */}
      {isConfigOpen && (
        <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 mb-6 space-y-4">
          <Text className="text-accentGray text-[10px] font-bold uppercase tracking-widest">
            Configure Meal Rates (₹)
          </Text>
          <View className="flex-row space-x-3 gap-2">
            <View className="flex-1 bg-surfaceLight border-[0.5px] border-border rounded-xl p-3">
              <Text className="text-accentGray text-[9px] mb-1 font-bold">Breakfast</Text>
              <TextInput
                className="text-white font-bold text-sm"
                keyboardType="numeric"
                value={breakfastRate}
                onChangeText={setBreakfastRate}
              />
            </View>
            <View className="flex-1 bg-surfaceLight border-[0.5px] border-border rounded-xl p-3">
              <Text className="text-accentGray text-[9px] mb-1 font-bold">Lunch</Text>
              <TextInput
                className="text-white font-bold text-sm"
                keyboardType="numeric"
                value={lunchRate}
                onChangeText={setLunchRate}
              />
            </View>
            <View className="flex-1 bg-surfaceLight border-[0.5px] border-border rounded-xl p-3">
              <Text className="text-accentGray text-[9px] mb-1 font-bold">Dinner</Text>
              <TextInput
                className="text-white font-bold text-sm"
                keyboardType="numeric"
                value={dinnerRate}
                onChangeText={setDinnerRate}
              />
            </View>
          </View>
        </View>
      )}

      {/* MONTHLY BILLING CARD SUMMARY */}
      <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 mb-6">
        <View className="flex-row justify-between items-center mb-4">
          <View>
            <Text className="text-accentGray text-[10px] font-bold uppercase tracking-widest">
              Monthly Bill Est.
            </Text>
            <Text className="text-white text-3xl font-black mt-1">₹ {totalBill.toFixed(2)}</Text>
          </View>
          <View className="bg-accentCyan/10 px-3 py-1.5 rounded-lg border-[0.5px] border-accentCyan/20">
            <Text className="text-accentCyan text-xs font-bold">{totalMeals} Meals Taken</Text>
          </View>
        </View>

        {/* Meal split bars progress */}
        <View className="space-y-2 mt-2">
          {/* Breakfast count progress */}
          <View className="flex-row justify-between text-xs">
            <Text className="text-accentGray text-[10px]">Breakfast Count</Text>
            <Text className="text-white text-[10px] font-bold">{breakfastCount} days</Text>
          </View>
          {/* Lunch count progress */}
          <View className="flex-row justify-between text-xs">
            <Text className="text-accentGray text-[10px]">Lunch Count</Text>
            <Text className="text-white text-[10px] font-bold">{lunchCount} days</Text>
          </View>
          {/* Dinner count progress */}
          <View className="flex-row justify-between text-xs">
            <Text className="text-accentGray text-[10px]">Dinner Count</Text>
            <Text className="text-white text-[10px] font-bold">{dinnerCount} days</Text>
          </View>
        </View>
      </View>

      {/* CALENDAR WEEKLY HORIZONTAL SCROLL SELECTOR */}
      <View className="mb-6">
        <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-3">
          Select Day
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          {calendarDays.map((day) => {
            const isSelected = formatDateKey(day) === selectedDateStr;
            const dayName = day.toLocaleDateString("en-US", { weekday: "short" });
            const dateNum = day.getDate();
            return (
              <TouchableOpacity
                key={day.toISOString()}
                onPress={() => {
                  Theme.haptics.light();
                  setSelectedDate(day);
                }}
                className={`w-12 py-3 rounded-xl mr-2.5 items-center justify-center border-[0.5px] ${
                  isSelected
                    ? "bg-accentCyan/10 border-accentCyan"
                    : "bg-surface border-border"
                }`}
              >
                <Text
                  className={`text-[9px] font-bold uppercase ${
                    isSelected ? "text-accentCyan" : "text-accentGray"
                  }`}
                >
                  {dayName}
                </Text>
                <Text
                  className={`text-sm font-black mt-1 ${
                    isSelected ? "text-white" : "text-accentGray"
                  }`}
                >
                  {dateNum}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* TODAY / SELECTED DAY TOGGLE CHECKLIST */}
      <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 mb-6 space-y-4">
        <View className="flex-row justify-between items-center border-b-[0.5px] border-neutral-900 pb-3 mb-2">
          <Text className="text-white font-bold text-sm">
            {selectedDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </Text>
          <Text className="text-accentGray text-xs font-bold">Meal Toggles</Text>
        </View>

        {/* Breakfast Toggle */}
        <TouchableOpacity
          onPress={() => {
            Theme.haptics.light();
            setHasBreakfast(!hasBreakfast);
          }}
          className={`flex-row items-center justify-between p-4 rounded-xl border-[0.5px] ${
            hasBreakfast ? "bg-accentCyan/5 border-accentCyan" : "bg-surfaceLight border-border"
          }`}
        >
          <View className="flex-row items-center">
            <Coffee size={18} color={hasBreakfast ? "#00F5D4" : "#A3A3A3"} />
            <Text className={`text-sm font-semibold ml-3 ${hasBreakfast ? "text-white" : "text-accentGray"}`}>
              Breakfast
            </Text>
          </View>
          <View className={`w-5 h-5 rounded border-[1.5px] items-center justify-center ${
            hasBreakfast ? "bg-accentCyan border-accentCyan" : "border-border"
          }`}>
            {hasBreakfast && <Check size={12} color="#0D0D0D" strokeWidth={3} />}
          </View>
        </TouchableOpacity>

        {/* Lunch Toggle */}
        <TouchableOpacity
          onPress={() => {
            Theme.haptics.light();
            setHasLunch(!hasLunch);
          }}
          className={`flex-row items-center justify-between p-4 rounded-xl border-[0.5px] ${
            hasLunch ? "bg-accentCyan/5 border-accentCyan" : "bg-surfaceLight border-border"
          }`}
        >
          <View className="flex-row items-center">
            <Sun size={18} color={hasLunch ? "#00F5D4" : "#A3A3A3"} />
            <Text className={`text-sm font-semibold ml-3 ${hasLunch ? "text-white" : "text-accentGray"}`}>
              Lunch
            </Text>
          </View>
          <View className={`w-5 h-5 rounded border-[1.5px] items-center justify-center ${
            hasLunch ? "bg-accentCyan border-accentCyan" : "border-border"
          }`}>
            {hasLunch && <Check size={12} color="#0D0D0D" strokeWidth={3} />}
          </View>
        </TouchableOpacity>

        {/* Dinner Toggle */}
        <TouchableOpacity
          onPress={() => {
            Theme.haptics.light();
            setHasDinner(!hasDinner);
          }}
          className={`flex-row items-center justify-between p-4 rounded-xl border-[0.5px] ${
            hasDinner ? "bg-accentCyan/5 border-accentCyan" : "bg-surfaceLight border-border"
          }`}
        >
          <View className="flex-row items-center">
            <Moon size={18} color={hasDinner ? "#00F5D4" : "#A3A3A3"} />
            <Text className={`text-sm font-semibold ml-3 ${hasDinner ? "text-white" : "text-accentGray"}`}>
              Dinner
            </Text>
          </View>
          <View className={`w-5 h-5 rounded border-[1.5px] items-center justify-center ${
            hasDinner ? "bg-accentCyan border-accentCyan" : "border-border"
          }`}>
            {hasDinner && <Check size={12} color="#0D0D0D" strokeWidth={3} />}
          </View>
        </TouchableOpacity>

        {/* Save button */}
        <TouchableOpacity
          onPress={() => logTiffinMutation.mutate()}
          disabled={logTiffinMutation.isPending}
          className="bg-accentCyan py-3.5 rounded-xl justify-center items-center active:opacity-90 mt-4"
        >
          {logTiffinMutation.isPending ? (
            <ActivityIndicator size="small" color="#0D0D0D" />
          ) : (
            <Text className="text-background font-bold text-sm">Save Day Status</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* STATISTICS MODULE */}
      <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-4">
        Statistics
      </Text>

      <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 mb-6 space-y-4">
        <View className="flex-row justify-between py-1 border-b-[0.5px] border-neutral-900">
          <Text className="text-accentGray text-xs">Total Meals Taken</Text>
          <Text className="text-white text-xs font-bold">{totalMeals}</Text>
        </View>
        <View className="flex-row justify-between py-1 border-b-[0.5px] border-neutral-900">
          <Text className="text-accentGray text-xs">Avg. Bill Per Meal</Text>
          <Text className="text-white text-xs font-bold">
            ₹ {totalMeals > 0 ? (totalBill / totalMeals).toFixed(2) : "0.00"}
          </Text>
        </View>
        <View className="flex-row justify-between py-1">
          <Text className="text-accentGray text-xs">Most Common Meal</Text>
          <Text className="text-white text-xs font-bold">
            {breakfastCount >= lunchCount && breakfastCount >= dinnerCount
              ? "Breakfast"
              : lunchCount >= breakfastCount && lunchCount >= dinnerCount
              ? "Lunch"
              : "Dinner"}
          </Text>
        </View>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}
