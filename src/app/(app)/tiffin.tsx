import React, { useState, useEffect, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../store/authStore";
import { supabase } from "../../services/supabase";
import { useToastStore } from "../../store/toastStore";
import { Theme } from "../../constants/Theme";
import { Colors } from "../../constants/Colors";
import {
  ChevronLeft,
  Coffee,
  Moon,
  Settings,
  ChevronRight,
  Check,
  AlertCircle,
  X
} from "lucide-react-native";

export default function TiffinTracker() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);

  // Month navigation state
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Price inputs for Settings modal
  const [breakfastInput, setBreakfastInput] = useState("30");
  const [dinnerInput, setDinnerInput] = useState("30");

  // 1. Fetch user profile for default meal prices saved in DB
  const { data: profile, isLoading: isProfileLoading, refetch: refetchProfile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("default_breakfast_rate, default_dinner_rate")
        .eq("id", user?.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const profileBreakfast = profile?.default_breakfast_rate !== undefined && profile?.default_breakfast_rate !== null
    ? Number(profile.default_breakfast_rate)
    : 30;

  const profileDinner = profile?.default_dinner_rate !== undefined && profile?.default_dinner_rate !== null
    ? Number(profile.default_dinner_rate)
    : 30;

  // Initialize input state values on profile load
  useEffect(() => {
    if (profile) {
      setBreakfastInput(profileBreakfast.toString());
      setDinnerInput(profileDinner.toString());
    }
  }, [profile]);

  // Mutation to update settings in the profiles table
  const updateRatesMutation = useMutation({
    mutationFn: async (vars: { breakfast: number; dinner: number }) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          default_breakfast_rate: vars.breakfast,
          default_dinner_rate: vars.dinner,
        })
        .eq("id", user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["tiffin-logs-month", user?.id, currentYear, currentMonth] });
      refetchProfile();
      refetchLogs();
      showToast("Mess prices updated successfully", "success");
      setIsSettingsOpen(false);
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to update prices", "error");
    },
  });

  const handleSaveSettings = () => {
    const bPrice = Number(breakfastInput);
    const dPrice = Number(dinnerInput);

    if (isNaN(bPrice) || isNaN(dPrice)) {
      showToast("Prices must be valid numbers", "error");
      return;
    }
    if (breakfastInput.trim() === "" || dinnerInput.trim() === "") {
      showToast("Price cannot be empty", "error");
      return;
    }
    if (bPrice < 0 || dPrice < 0) {
      showToast("Price cannot be negative", "error");
      return;
    }
    if (bPrice > 500 || dPrice > 500) {
      showToast("Maximum price limit is ₹500", "error");
      return;
    }

    updateRatesMutation.mutate({ breakfast: bPrice, dinner: dPrice });
  };

  const formatDateKey = (date: Date) => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split("T")[0];
  };

  const selectedDateStr = formatDateKey(selectedDate);

  // Fetch tiffin logs for the selected year and month
  const { data: monthlyLogs, isLoading: isLogsLoading, refetch: refetchLogs, isRefetching } = useQuery({
    queryKey: ["tiffin-logs-month", user?.id, currentYear, currentMonth],
    queryFn: async () => {
      const startOfMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
      const endOfMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-31`;

      const { data, error } = await supabase
        .from("tiffin_logs")
        .select("*")
        .eq("profile_id", user?.id)
        .gte("log_date", startOfMonthStr)
        .lte("log_date", endOfMonthStr);

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user?.id,
  });

  // Toggle meal mutation (one tap)
  const logTiffinMutation = useMutation({
    mutationFn: async (vars: {
      date: string;
      breakfast: boolean;
      dinner: boolean;
    }) => {
      const payload = {
        profile_id: user?.id,
        log_date: vars.date,
        has_breakfast: vars.breakfast,
        has_lunch: false,
        has_dinner: vars.dinner,
        breakfast_rate: profileBreakfast,
        lunch_rate: 0,
        dinner_rate: profileDinner,
      };

      const { error } = await supabase.from("tiffin_logs").upsert(payload, {
        onConflict: "profile_id, log_date",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["tiffin-logs-month", user?.id, currentYear, currentMonth] });
      showToast("Meal entry updated", "success");
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to update tiffin log", "error");
    },
  });

  // Active status for the selected day
  const selectedLog = useMemo(() => {
    return monthlyLogs?.find((l) => l.log_date === selectedDateStr);
  }, [monthlyLogs, selectedDateStr]);

  const hasBreakfast = selectedLog?.has_breakfast || false;
  const hasDinner = selectedLog?.has_dinner || false;

  // QUICK ACTIONS
  const handleMarkBreakfast = () => {
    Theme.haptics.medium();
    logTiffinMutation.mutate({
      date: selectedDateStr,
      breakfast: true,
      dinner: hasDinner,
    });
  };

  const handleMarkDinner = () => {
    Theme.haptics.medium();
    logTiffinMutation.mutate({
      date: selectedDateStr,
      breakfast: hasBreakfast,
      dinner: true,
    });
  };

  const handleMarkBoth = () => {
    Theme.haptics.medium();
    logTiffinMutation.mutate({
      date: selectedDateStr,
      breakfast: true,
      dinner: true,
    });
  };

  const handleClearToday = () => {
    Theme.haptics.medium();
    logTiffinMutation.mutate({
      date: selectedDateStr,
      breakfast: false,
      dinner: false,
    });
  };

  // SUMMARY STATS CALCULATIONS (using configured rates)
  const stats = useMemo(() => {
    let breakfasts = 0;
    let dinners = 0;
    let loggedDays = monthlyLogs?.length || 0;

    monthlyLogs?.forEach((log) => {
      if (log.has_breakfast) breakfasts++;
      if (log.has_dinner) dinners++;
    });

    const totalMeals = breakfasts + dinners;
    const totalBill = breakfasts * profileBreakfast + dinners * profileDinner;
    
    const skippedBreakfasts = loggedDays - breakfasts;
    const skippedDinners = loggedDays - dinners;
    
    const moneySaved = skippedBreakfasts * profileBreakfast + skippedDinners * profileDinner;
    const skippedMeals = skippedBreakfasts + skippedDinners;

    const attendancePct = loggedDays > 0 ? (totalMeals / (loggedDays * 2)) * 100 : 0;
    const avgCostPerDay = loggedDays > 0 ? totalBill / loggedDays : 0;

    return {
      breakfasts,
      dinners,
      totalMeals,
      totalBill,
      moneySaved,
      skippedMeals,
      attendancePct,
      avgCostPerDay,
      loggedDays
    };
  }, [monthlyLogs, profileBreakfast, profileDinner]);

  // MONTH CALENDAR GRID CALCULATOR
  const calendarGrid = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();

    const grid = [];
    for (let i = 0; i < firstDayIndex; i++) {
      grid.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      grid.push(new Date(currentYear, currentMonth, day));
    }
    return grid;
  }, [currentYear, currentMonth]);

  const handlePrevMonth = () => {
    Theme.haptics.light();
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    Theme.haptics.light();
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const monthName = new Date(currentYear, currentMonth).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Calculate today's status card details
  const todayDateStr = formatDateKey(new Date());
  const todayLog = monthlyLogs?.find((l) => l.log_date === todayDateStr);
  const todayMealsCount = (todayLog?.has_breakfast ? 1 : 0) + (todayLog?.has_dinner ? 1 : 0);

  // Today's cost calculation
  const todayBill = (todayLog?.has_breakfast ? profileBreakfast : 0) + (todayLog?.has_dinner ? profileDinner : 0);

  const getDayMealsStatus = (dayDateStr: string) => {
    const log = monthlyLogs?.find((l) => l.log_date === dayDateStr);
    return {
      b: log ? log.has_breakfast : null,
      d: log ? log.has_dinner : null,
      logged: !!log
    };
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isFuture = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date.getTime() > today.getTime();
  };

  const formatRupees = (amount: number) => {
    return `₹${amount.toLocaleString("en-IN")}`;
  };

  if (isLogsLoading || isProfileLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0B1220" }} className="justify-center items-center">
        <ActivityIndicator size="large" color="#14E5D4" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }}>
      {/* Top Navigation */}
      <View className="flex-row justify-between items-center px-6 pb-4 border-b-[0.5px] border-white/5">
        <TouchableOpacity
          onPress={() => {
            Theme.haptics.light();
            router.back();
          }}
          className="p-1 rounded-full bg-[#151E2E] border-[0.5px] border-white/10"
        >
          <ChevronLeft size={20} color="#14E5D4" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-bold">Tiffin Tracker</Text>
        <TouchableOpacity
          onPress={() => {
            Theme.haptics.light();
            setIsSettingsOpen(true);
          }}
          className="p-1.5 rounded-full bg-[#151E2E] border-[0.5px] border-white/10"
        >
          <Settings size={18} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetchLogs} tintColor="#14E5D4" />
        }
      >
        {/* TODAY MEAL MARK REMINDER NOTIFICATION */}
        {!todayLog && (
          <View className="bg-amber-500/10 border-[0.5px] border-amber-500/20 rounded-2xl p-4 mt-5 flex-row items-center">
            <AlertCircle size={20} color="#F59E0B" className="mr-2" />
            <View className="flex-1">
              <Text className="text-amber-500 text-xs font-bold uppercase tracking-wider">Reminder</Text>
              <Text className="text-[#94A3B8] text-[10px] mt-0.5 leading-relaxed">
                You haven't logged today's meals yet. Keep your billing accurate!
              </Text>
            </View>
          </View>
        )}

        {/* 2X2 METRICS GRID SUMMARY */}
        <View className="flex-row flex-wrap mt-6 gap-3">
          {/* Card 1: Today's status */}
          <View className="w-[48%] bg-[#151E2E] border-[0.5px] border-white/5 p-4 rounded-2xl shadow-lg flex-col justify-between">
            <View>
              <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-wider">Today's Meals</Text>
              <Text className="text-[#94A3B8] text-[9px] mt-0.5 mb-1.5">Logs recorded today</Text>
            </View>
            <View className="flex-row items-baseline">
              <Text className="text-white text-2xl font-black">{todayMealsCount}</Text>
              <Text className="text-[#94A3B8] text-xs font-bold ml-1">/ 2</Text>
            </View>
          </View>

          {/* Card 2: Meals This Month */}
          <View className="w-[48%] bg-[#151E2E] border-[0.5px] border-white/5 p-4 rounded-2xl shadow-lg flex-col justify-between">
            <View>
              <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-wider">Meals This Month</Text>
              <Text className="text-[#94A3B8] text-[9px] mt-0.5 mb-1.5">Total meals consumed</Text>
            </View>
            <Text className="text-white text-2xl font-black">{stats.totalMeals}</Text>
          </View>

          {/* Card 3: Current Bill estimate */}
          <View className="w-[48%] bg-[#151E2E] border-[0.5px] border-white/5 p-4 rounded-2xl shadow-lg flex-col justify-between">
            <View>
              <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-wider">Current Bill</Text>
              <Text className="text-[#94A3B8] text-[9px] mt-0.5 mb-1.5">Estimated month cost</Text>
            </View>
            <Text className="text-[#14E5D4] text-2xl font-black">{formatRupees(stats.totalBill)}</Text>
          </View>

          {/* Card 4: Money Saved */}
          <View className="w-[48%] bg-[#151E2E] border-[0.5px] border-white/5 p-4 rounded-2xl shadow-lg flex-col justify-between">
            <View>
              <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-wider">Money Saved</Text>
              <Text className="text-[#94A3B8] text-[9px] mt-0.5 mb-1.5">Saved from skipped meals</Text>
            </View>
            <Text className="text-[#22C55E] text-2xl font-black">{formatRupees(stats.moneySaved)}</Text>
          </View>
        </View>

        {/* ONE-TAP MEAL TOGGLE LOGGING */}
        <View className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-5 mt-6 shadow-lg">
          <View className="flex-row justify-between items-center border-b border-white/5 pb-3.5 mb-4">
            <View>
              <Text className="text-white font-bold text-sm">
                {selectedDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
              <Text className="text-[#94A3B8] text-[10px] mt-0.5">Tapping logs immediately</Text>
            </View>
            {isToday(selectedDate) && (
              <View className="bg-[#14E5D4]/10 border-[0.5px] border-[#14E5D4]/20 px-2 py-0.5 rounded-full">
                <Text className="text-[#14E5D4] text-[8px] font-bold uppercase tracking-wider">Today</Text>
              </View>
            )}
          </View>

          <View className="space-y-3">
            {/* Breakfast Checkbox */}
            <TouchableOpacity
              onPress={() => {
                Theme.haptics.light();
                logTiffinMutation.mutate({
                  date: selectedDateStr,
                  breakfast: !hasBreakfast,
                  dinner: hasDinner,
                });
              }}
              className={`flex-row items-center justify-between p-4 rounded-xl border-[0.5px] ${
                hasBreakfast ? "bg-[#14E5D4]/5 border-[#14E5D4]" : "bg-white/5 border-white/10"
              }`}
            >
              <View className="flex-row items-center">
                <Coffee size={18} color={hasBreakfast ? "#14E5D4" : "#94A3B8"} />
                <Text className={`text-sm font-semibold ml-3 ${hasBreakfast ? "text-white" : "text-[#94A3B8]"}`}>
                  Breakfast (₹{profileBreakfast})
                </Text>
              </View>
              <View className={`w-5 h-5 rounded border-[1.5px] items-center justify-center ${
                hasBreakfast ? "bg-[#14E5D4] border-[#14E5D4]" : "border-[#94A3B8]/40"
              }`}>
                {hasBreakfast && <Check size={12} color="#0B1220" strokeWidth={3} />}
              </View>
            </TouchableOpacity>

            {/* Dinner Checkbox */}
            <TouchableOpacity
              onPress={() => {
                Theme.haptics.light();
                logTiffinMutation.mutate({
                  date: selectedDateStr,
                  breakfast: hasBreakfast,
                  dinner: !hasDinner,
                });
              }}
              className={`flex-row items-center justify-between p-4 rounded-xl border-[0.5px] ${
                hasDinner ? "bg-[#14E5D4]/5 border-[#14E5D4]" : "bg-white/5 border-white/10"
              }`}
            >
              <View className="flex-row items-center">
                <Moon size={18} color={hasDinner ? "#14E5D4" : "#94A3B8"} />
                <Text className={`text-sm font-semibold ml-3 ${hasDinner ? "text-white" : "text-[#94A3B8]"}`}>
                  Dinner (₹{profileDinner})
                </Text>
              </View>
              <View className={`w-5 h-5 rounded border-[1.5px] items-center justify-center ${
                hasDinner ? "bg-[#14E5D4] border-[#14E5D4]" : "border-[#94A3B8]/40"
              }`}>
                {hasDinner && <Check size={12} color="#0B1220" strokeWidth={3} />}
              </View>
            </TouchableOpacity>
          </View>

          {/* QUICK ACTIONS FOR TODAY */}
          <View className="flex-row flex-wrap gap-2.5 mt-5">
            <TouchableOpacity
              onPress={handleMarkBreakfast}
              className="flex-1 min-w-[45%] bg-[#14E5D4]/10 border border-[#14E5D4]/20 py-2.5 rounded-xl items-center active:opacity-85"
            >
              <Text className="text-[#14E5D4] text-[10px] font-black">Mark Breakfast</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleMarkDinner}
              className="flex-1 min-w-[45%] bg-[#14E5D4]/10 border border-[#14E5D4]/20 py-2.5 rounded-xl items-center active:opacity-85"
            >
              <Text className="text-[#14E5D4] text-[10px] font-black">Mark Dinner</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleMarkBoth}
              className="flex-1 min-w-[45%] bg-[#14E5D4] py-2.5 rounded-xl items-center active:opacity-90"
            >
              <Text className="text-[#0B1220] text-[10px] font-black">Mark Both</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleClearToday}
              className="flex-1 min-w-[45%] bg-white/5 border border-white/10 py-2.5 rounded-xl items-center active:opacity-85"
            >
              <Text className="text-[#94A3B8] text-[10px] font-bold">Clear Entries</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* MONTHLY CALENDAR GRID MODULE */}
        <View className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-5 mt-6 shadow-lg">
          <View className="flex-row justify-between items-center mb-5">
            <TouchableOpacity onPress={handlePrevMonth} className="p-1 rounded-lg bg-white/5 border border-white/10">
              <ChevronLeft size={16} color="#94A3B8" />
            </TouchableOpacity>
            <Text className="text-white text-sm font-black">{monthName}</Text>
            <TouchableOpacity onPress={handleNextMonth} className="p-1 rounded-lg bg-white/5 border border-white/10">
              <ChevronRight size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Calendar week header */}
          <View className="flex-row justify-between mb-3">
            {["S", "M", "T", "W", "T", "F", "S"].map((w, idx) => (
              <Text key={idx} className="w-[12%] text-center text-[#94A3B8] text-[9px] font-bold">
                {w}
              </Text>
            ))}
          </View>

          {/* Grid rows */}
          <View className="flex-row flex-wrap">
            {calendarGrid.map((day, idx) => {
              if (!day) {
                return <View key={`empty-${idx}`} className="w-[14.28%] h-12" />;
              }

              const dayDateStr = formatDateKey(day);
              const isSel = dayDateStr === selectedDateStr;
              const isTodayDay = isToday(day);
              const isFut = isFuture(day);
              const meals = getDayMealsStatus(dayDateStr);

              return (
                <TouchableOpacity
                  key={day.toISOString()}
                  onPress={() => {
                    Theme.haptics.light();
                    setSelectedDate(day);
                  }}
                  className={`w-[14.28%] h-12 justify-center items-center rounded-xl border ${
                    isSel
                      ? "border-[#14E5D4] bg-[#14E5D4]/10"
                      : isTodayDay
                      ? "border-white/20 bg-white/5"
                      : "border-transparent"
                  }`}
                >
                  <Text className={`text-xs font-bold ${
                    isFut ? "text-white/20" : isSel ? "text-white" : "text-[#94A3B8]"
                  }`}>
                    {day.getDate()}
                  </Text>
                  
                  {/* Two colored mini dots for meals (Breakfast, Dinner) */}
                  {!isFut && meals.logged && (
                    <View className="flex-row space-x-0.5 mt-1">
                      <View className={`w-1 h-1 rounded-full ${meals.b ? "bg-[#22C55E]" : "bg-[#EF4444]"}`} />
                      <View className={`w-1 h-1 rounded-full ${meals.d ? "bg-[#22C55E]" : "bg-[#EF4444]"}`} />
                    </View>
                  )}
                  {isFut && (
                    <View className="flex-row space-x-0.5 mt-1">
                      <View className="w-1 h-1 rounded-full bg-white/10" />
                      <View className="w-1 h-1 rounded-full bg-white/10" />
                    </View>
                  )}
                  {!isFut && !meals.logged && (
                    <View className="flex-row space-x-0.5 mt-1">
                      <View className="w-1 h-1 rounded-full bg-white/20" />
                      <View className="w-1 h-1 rounded-full bg-white/20" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* MONTHLY SUMMARY BILL PANEL */}
        <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mt-8 mb-4">
          Monthly Summary
        </Text>

        <View className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-5 mb-6 space-y-4 shadow-lg">
          <View className="flex-row justify-between py-2 border-b border-white/5">
            <Text className="text-[#94A3B8] text-xs font-medium">Today's Cost</Text>
            <Text className="text-white text-xs font-black">{formatRupees(todayBill)}</Text>
          </View>
          <View className="flex-row justify-between py-2 border-b border-white/5">
            <Text className="text-[#94A3B8] text-xs font-medium">Breakfasts Cost ({stats.breakfasts} × ₹{profileBreakfast})</Text>
            <Text className="text-white text-xs font-black">{formatRupees(stats.breakfasts * profileBreakfast)}</Text>
          </View>
          <View className="flex-row justify-between py-2 border-b border-white/5">
            <Text className="text-[#94A3B8] text-xs font-medium">Dinners Cost ({stats.dinners} × ₹{profileDinner})</Text>
            <Text className="text-white text-xs font-black">{formatRupees(stats.dinners * profileDinner)}</Text>
          </View>
          <View className="flex-row justify-between py-2 border-b border-white/5">
            <Text className="text-[#94A3B8] text-xs font-medium">Total Meals</Text>
            <Text className="text-white text-xs font-black">{stats.totalMeals} meals</Text>
          </View>
          <View className="flex-row justify-between py-2 border-b border-white/5">
            <Text className="text-[#94A3B8] text-xs font-medium">Skipped Meals Dues Saved</Text>
            <Text className="text-[#22C55E] text-xs font-black">{formatRupees(stats.moneySaved)}</Text>
          </View>
          <View className="flex-row justify-between py-2 border-b border-white/5">
            <Text className="text-[#94A3B8] text-xs font-medium">Average Cost Per Day</Text>
            <Text className="text-white text-xs font-black">{formatRupees(Math.round(stats.avgCostPerDay))}</Text>
          </View>
          <View className="flex-row justify-between py-2">
            <Text className="text-white text-sm font-bold">Total Month Bill</Text>
            <Text className="text-[#14E5D4] text-sm font-black">{formatRupees(stats.totalBill)}</Text>
          </View>
        </View>

        {/* STATISTICS MODULE */}
        <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mt-6 mb-4">
          Detailed Statistics
        </Text>

        <View className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-5 mb-6 space-y-4 shadow-lg">
          <View className="flex-row justify-between py-2 border-b border-white/5">
            <Text className="text-[#94A3B8] text-xs">Breakfasts Taken</Text>
            <Text className="text-white text-xs font-bold">{stats.breakfasts}</Text>
          </View>
          <View className="flex-row justify-between py-2 border-b border-white/5">
            <Text className="text-[#94A3B8] text-xs">Dinners Taken</Text>
            <Text className="text-white text-xs font-bold">{stats.dinners}</Text>
          </View>
          <View className="flex-row justify-between py-2 border-b border-white/5">
            <Text className="text-[#94A3B8] text-xs">Meals Missed</Text>
            <Text className="text-white text-xs font-bold">{stats.skippedMeals}</Text>
          </View>
          <View className="flex-row justify-between py-2">
            <Text className="text-[#94A3B8] text-xs">Attendance Percentage</Text>
            <Text className="text-white text-xs font-bold">{stats.attendancePct.toFixed(0)}%</Text>
          </View>
        </View>
      </ScrollView>

      {/* SETTINGS CONFIGURATION DIALOG MODAL */}
      <Modal visible={isSettingsOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-[#151E2E] border-t-[0.5px] border-white/10 rounded-t-3xl p-6 pb-10">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-white">Tiffin Settings</Text>
              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  setIsSettingsOpen(false);
                }}
                className="w-8 h-8 justify-center items-center rounded-full bg-white/5"
              >
                <X size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View className="space-y-4">
              {/* Price Rates input */}
              <View className="space-y-3">
                <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest">
                  Meal Costs (₹)
                </Text>
                <View className="flex-row space-x-3 gap-2">
                  <View className="flex-1 bg-white/5 border-[0.5px] border-white/10 rounded-xl p-3">
                    <Text className="text-[#94A3B8] text-[9px] mb-1 font-bold">Breakfast Price (₹)</Text>
                    <TextInput
                      className="text-white font-bold text-sm"
                      keyboardType="numeric"
                      value={breakfastInput}
                      onChangeText={setBreakfastInput}
                    />
                  </View>
                  <View className="flex-1 bg-white/5 border-[0.5px] border-white/10 rounded-xl p-3">
                    <Text className="text-[#94A3B8] text-[9px] mb-1 font-bold">Dinner Price (₹)</Text>
                    <TextInput
                      className="text-white font-bold text-sm"
                      keyboardType="numeric"
                      value={dinnerInput}
                      onChangeText={setDinnerInput}
                    />
                  </View>
                </View>
              </View>

              {/* Save / Cancel buttons */}
              <View className="flex-row space-x-2 mt-6">
                <TouchableOpacity
                  onPress={() => {
                    Theme.haptics.light();
                    setIsSettingsOpen(false);
                    // Revert input state to match loaded defaults
                    setBreakfastInput(profileBreakfast.toString());
                    setDinnerInput(profileDinner.toString());
                  }}
                  className="flex-1 bg-white/5 border border-white/10 py-3.5 rounded-xl items-center mr-2 active:opacity-85"
                >
                  <Text className="text-[#94A3B8] font-bold text-sm">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSaveSettings}
                  disabled={updateRatesMutation.isPending}
                  className="flex-1 bg-[#14E5D4] py-3.5 rounded-xl items-center justify-center active:opacity-90 shadow-md shadow-[#14E5D4]/20"
                >
                  {updateRatesMutation.isPending ? (
                    <ActivityIndicator size="small" color="#0B1220" />
                  ) : (
                    <Text className="text-[#0B1220] font-black text-sm">Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
