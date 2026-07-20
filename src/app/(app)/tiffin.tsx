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
import { triggerWittyNotification } from "../../services/wittyNotifications";
import { ChevronLeft, Coffee, Moon, Settings, Check, AlertCircle, X } from "lucide-react-native";

export default function TiffinTracker() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);

  // Month navigation locked to current month
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Price inputs for Settings modal
  const [breakfastInput, setBreakfastInput] = useState("30");
  const [dinnerInput, setDinnerInput] = useState("30");

  // State for selected report modal
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  // 1. Fetch user profile for default meal prices saved in DB
  const {
    data: profile,
    isLoading: isProfileLoading,
    refetch: refetchProfile,
  } = useQuery({
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

  const profileBreakfast =
    profile?.default_breakfast_rate !== undefined && profile?.default_breakfast_rate !== null
      ? Number(profile.default_breakfast_rate)
      : 30;

  const profileDinner =
    profile?.default_dinner_rate !== undefined && profile?.default_dinner_rate !== null
      ? Number(profile.default_dinner_rate)
      : 30;

  // Initialize input state values on profile load
  useEffect(() => {
    if (profile) {
      setBreakfastInput(profileBreakfast.toString());
      setDinnerInput(profileDinner.toString());
    }
  }, [profile]);

  // Fetch all-time tiffin logs for the user
  const {
    data: allLogs,
    isLoading: isLogsLoading,
    refetch: refetchLogs,
    isRefetching,
  } = useQuery({
    queryKey: ["all-tiffin-logs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tiffin_logs")
        .select("*")
        .eq("profile_id", user?.id)
        .order("log_date", { ascending: false });

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user?.id,
  });

  // Mutation to update settings in the profiles table and current month logs
  const updateRatesMutation = useMutation({
    mutationFn: async (vars: { breakfast: number; dinner: number }) => {
      // 1. Update default profile rates
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          default_breakfast_rate: vars.breakfast,
          default_dinner_rate: vars.dinner,
        })
        .eq("id", user?.id);

      if (profileError) throw profileError;

      // 2. Update rates for existing logs in the current month
      const startOfMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
      const endOfMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-31`;
      const { error: logsError } = await supabase
        .from("tiffin_logs")
        .update({
          breakfast_rate: vars.breakfast,
          dinner_rate: vars.dinner,
        })
        .eq("profile_id", user?.id)
        .gte("log_date", startOfMonthStr)
        .lte("log_date", endOfMonthStr);

      if (logsError) throw logsError;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["all-tiffin-logs", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-tiffin-logs", user?.id] });
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

  // Toggle meal mutation (one tap)
  const logTiffinMutation = useMutation({
    mutationFn: async (vars: { date: string; breakfast: boolean; dinner: boolean }) => {
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
      queryClient.invalidateQueries({ queryKey: ["all-tiffin-logs", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-tiffin-logs", user?.id] });
      triggerWittyNotification("tiffin_logged", "Tiffin Logged");
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to update tiffin log", "error");
    },
  });

  // Filter all logs to just the current month's logs
  const monthlyLogs = useMemo(() => {
    const curMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    return allLogs?.filter((l) => l.log_date.startsWith(curMonthStr)) || [];
  }, [allLogs, currentYear, currentMonth]);

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

  // SUMMARY STATS CALCULATIONS (using actual logged rates)
  const stats = useMemo(() => {
    let breakfasts = 0;
    let dinners = 0;
    let loggedDays = monthlyLogs?.length || 0;
    let totalBill = 0;

    monthlyLogs?.forEach((log) => {
      const bRate = Number(log.breakfast_rate) || profileBreakfast;
      const dRate = Number(log.dinner_rate) || profileDinner;
      if (log.has_breakfast) {
        breakfasts++;
        totalBill += bRate;
      }
      if (log.has_dinner) {
        dinners++;
        totalBill += dRate;
      }
    });

    const totalMeals = breakfasts + dinners;

    const skippedBreakfasts = loggedDays - breakfasts;
    const skippedDinners = loggedDays - dinners;

    const moneySaved = skippedBreakfasts * profileBreakfast + skippedDinners * profileDinner;
    const skippedMeals = skippedBreakfasts + skippedDinners;

    const attendancePct = loggedDays > 0 ? (totalMeals / (loggedDays * 2)) * 100 : 0;
    const avgCostPerDay = loggedDays > 0 ? totalBill / loggedDays : 0;

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysElapsed = new Date().getDate();
    // Estimate Month-End bill using average meals/cost per day
    const avgCostPerCalendarDay = daysElapsed > 0 ? totalBill / daysElapsed : 0;
    const estimatedBill = totalMeals > 0 ? avgCostPerCalendarDay * daysInMonth : 0;

    return {
      breakfasts,
      dinners,
      totalMeals,
      totalBill,
      moneySaved,
      skippedMeals,
      attendancePct,
      avgCostPerDay,
      loggedDays,
      estimatedBill,
      daysInMonth,
    };
  }, [monthlyLogs, profileBreakfast, profileDinner, currentYear, currentMonth]);

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

  // Group logs to generate historical monthly reports
  const previousMonthsReports = useMemo(() => {
    if (!allLogs) return [];
    const curMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

    // Group logs by year-month
    const groups: Record<string, any[]> = {};
    allLogs.forEach((log) => {
      const ym = log.log_date.substring(0, 7); // "YYYY-MM"
      if (ym < curMonthStr) {
        if (!groups[ym]) groups[ym] = [];
        groups[ym].push(log);
      }
    });

    // Process each month's group
    return Object.entries(groups)
      .map(([ym, logs]) => {
        const [yStr, mStr] = ym.split("-");
        const year = parseInt(yStr);
        const month = parseInt(mStr) - 1;

        let breakfasts = 0;
        let dinners = 0;
        let totalSpent = 0;
        const loggedDays = logs.length;

        logs.forEach((log) => {
          if (log.has_breakfast) {
            breakfasts++;
            totalSpent += Number(log.breakfast_rate) || 30;
          }
          if (log.has_dinner) {
            dinners++;
            totalSpent += Number(log.dinner_rate) || 30;
          }
        });

        const totalMeals = breakfasts + dinners;
        const skippedMeals = loggedDays * 2 - totalMeals;
        const attendancePct = loggedDays > 0 ? (totalMeals / (loggedDays * 2)) * 100 : 0;

        const date = new Date(year, month);
        const monthLabel = date.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        });

        return {
          ym,
          monthLabel,
          year,
          month,
          breakfasts,
          dinners,
          breakfastMissed: loggedDays - breakfasts,
          dinnerMissed: loggedDays - dinners,
          totalMeals,
          skippedMeals,
          attendancePct,
          totalSpent,
          breakfastRate: logs[0]?.breakfast_rate || 30,
          dinnerRate: logs[0]?.dinner_rate || 30,
        };
      })
      .sort((a, b) => b.ym.localeCompare(a.ym)); // newest first
  }, [allLogs, currentYear, currentMonth]);

  const monthName = new Date(currentYear, currentMonth).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Calculate today's status card details
  const todayDateStr = formatDateKey(new Date());
  const todayLog = monthlyLogs?.find((l) => l.log_date === todayDateStr);
  const todayMealsCount = (todayLog?.has_breakfast ? 1 : 0) + (todayLog?.has_dinner ? 1 : 0);

  // Today's cost calculation
  const todayBill =
    (todayLog?.has_breakfast ? profileBreakfast : 0) + (todayLog?.has_dinner ? profileDinner : 0);

  const getDayMealsStatus = (dayDateStr: string) => {
    const log = monthlyLogs?.find((l) => l.log_date === dayDateStr);
    return {
      b: log ? log.has_breakfast : null,
      d: log ? log.has_dinner : null,
      logged: !!log,
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
        <>
          {/* TODAY MEAL MARK REMINDER NOTIFICATION */}
          {!todayLog && (
            <View className="bg-amber-500/10 border-[0.5px] border-amber-500/20 rounded-2xl p-4 mt-5 flex-row items-center">
              <AlertCircle size={20} color="#F59E0B" className="mr-2" />
              <View className="flex-1">
                <Text className="text-amber-500 text-xs font-bold uppercase tracking-wider">
                  Reminder
                </Text>
                <Text className="text-[#94A3B8] text-[10px] mt-0.5 leading-relaxed">
                  You haven't logged today's meals yet. Keep your billing accurate!
                </Text>
              </View>
            </View>
          )}

          {/* Prominent Tiffin Summary Banner */}
          <View className="bg-[#151E2E] border-[0.5px] border-white/5 p-5 rounded-2xl mt-6 shadow-xl">
            <Text className="text-[#94A3B8] text-[10px] font-bold uppercase tracking-widest">
              This Month Bill
            </Text>
            <Text className="text-[#14E5D4] text-3xl font-black mt-1.5">
              {formatRupees(stats.totalBill)}
            </Text>

            {stats.totalMeals > 0 && (
              <Text className="text-[#94A3B8] text-[10px] mt-1.5">
                Estimated Month-End Bill:{" "}
                <Text className="text-white font-bold">
                  {formatRupees(Math.round(stats.estimatedBill))}
                </Text>
              </Text>
            )}

            <View className="flex-row justify-between mt-4 pt-4 border-t border-white/5">
              <View>
                <Text className="text-[#94A3B8] text-[8px] uppercase tracking-wider">
                  Today's Meals
                </Text>
                <Text className="text-white text-xs font-bold mt-1">{todayMealsCount} / 2</Text>
              </View>
              <View className="items-center">
                <Text className="text-[#94A3B8] text-[8px] uppercase tracking-wider">
                  Breakfasts
                </Text>
                <Text className="text-white text-xs font-bold mt-1">{stats.breakfasts}</Text>
              </View>
              <View className="items-center">
                <Text className="text-[#94A3B8] text-[8px] uppercase tracking-wider">Dinners</Text>
                <Text className="text-white text-xs font-bold mt-1">{stats.dinners}</Text>
              </View>
              <View className="items-end">
                <Text className="text-[#94A3B8] text-[8px] uppercase tracking-wider">
                  Money Saved
                </Text>
                <Text className="text-[#22C55E] text-xs font-bold mt-1">
                  {formatRupees(stats.moneySaved)}
                </Text>
              </View>
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
                  <Text className="text-[#14E5D4] text-[8px] font-bold uppercase tracking-wider">
                    Today
                  </Text>
                </View>
              )}
            </View>

            {/* Meals selection */}
            <View style={{ gap: 12 }}>
              {/* Breakfast Toggle */}
              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.selection();
                  logTiffinMutation.mutate({
                    date: selectedDateStr,
                    breakfast: !hasBreakfast,
                    dinner: hasDinner,
                  });
                }}
                className={`flex-row justify-between items-center p-3.5 rounded-xl border ${
                  hasBreakfast ? "bg-white/5 border-white/10" : "border-white/5"
                }`}
              >
                <View className="flex-row items-center">
                  <Coffee size={18} color={hasBreakfast ? "#14E5D4" : "#94A3B8"} className="mr-3" />
                  <Text
                    className={`text-xs font-semibold ${hasBreakfast ? "text-white" : "text-[#94A3B8]"}`}
                  >
                    Breakfast Menu (₹{profileBreakfast})
                  </Text>
                </View>
                <View
                  className={`w-5 h-5 rounded border-[1.5px] items-center justify-center ${
                    hasBreakfast ? "bg-[#14E5D4] border-[#14E5D4]" : "border-[#94A3B8]/40"
                  }`}
                >
                  {hasBreakfast && <Check size={12} color="#0B1220" strokeWidth={3} />}
                </View>
              </TouchableOpacity>

              {/* Dinner Toggle */}
              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.selection();
                  logTiffinMutation.mutate({
                    date: selectedDateStr,
                    breakfast: hasBreakfast,
                    dinner: !hasDinner,
                  });
                }}
                className={`flex-row justify-between items-center p-3.5 rounded-xl border ${
                  hasDinner ? "bg-white/5 border-white/10" : "border-white/5"
                }`}
              >
                <View className="flex-row items-center">
                  <Moon size={18} color={hasDinner ? "#14E5D4" : "#94A3B8"} className="mr-3" />
                  <Text
                    className={`text-xs font-semibold ${hasDinner ? "text-white" : "text-[#94A3B8]"}`}
                  >
                    Dinner Menu (₹{profileDinner})
                  </Text>
                </View>
                <View
                  className={`w-5 h-5 rounded border-[1.5px] items-center justify-center ${
                    hasDinner ? "bg-[#14E5D4] border-[#14E5D4]" : "border-[#94A3B8]/40"
                  }`}
                >
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
            <View className="flex-row justify-center items-center mb-5">
              <Text className="text-white text-sm font-black">{monthName}</Text>
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
                    <Text
                      className={`text-xs font-bold ${
                        isFut ? "text-white/20" : isSel ? "text-white" : "text-[#94A3B8]"
                      }`}
                    >
                      {day.getDate()}
                    </Text>

                    {/* Two colored mini dots for meals (Breakfast, Dinner) */}
                    {!isFut && meals.logged && (
                      <View className="flex-row space-x-0.5 mt-1">
                        <View
                          className={`w-1 h-1 rounded-full ${meals.b ? "bg-[#22C55E]" : "bg-[#EF4444]"}`}
                        />
                        <View
                          className={`w-1 h-1 rounded-full ${meals.d ? "bg-[#22C55E]" : "bg-[#EF4444]"}`}
                        />
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

          {/* EMPTY STATE OR MONTHLY SUMMARY DETAILS */}
          {stats.totalMeals === 0 ? (
            <View className="bg-[#151E2E] border-[0.5px] border-white/5 p-6 rounded-2xl mt-6 items-center justify-center">
              <Text className="text-3xl mb-3">🍱</Text>
              <Text className="text-white text-base font-bold text-center">New Month Started</Text>
              <Text className="text-[#94A3B8] text-xs text-center mt-1 leading-relaxed">
                Start marking your meals to track this month's tiffin expenses.
              </Text>
            </View>
          ) : (
            <>
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
                  <Text className="text-[#94A3B8] text-xs font-medium">
                    Breakfasts Cost ({stats.breakfasts} × ₹{profileBreakfast})
                  </Text>
                  <Text className="text-white text-xs font-black">
                    {formatRupees(stats.breakfasts * profileBreakfast)}
                  </Text>
                </View>
                <View className="flex-row justify-between py-2 border-b border-white/5">
                  <Text className="text-[#94A3B8] text-xs font-medium">
                    Dinners Cost ({stats.dinners} × ₹{profileDinner})
                  </Text>
                  <Text className="text-white text-xs font-black">
                    {formatRupees(stats.dinners * profileDinner)}
                  </Text>
                </View>
                <View className="flex-row justify-between py-2 border-b border-white/5">
                  <Text className="text-[#94A3B8] text-xs font-medium">Total Meals</Text>
                  <Text className="text-white text-xs font-black">{stats.totalMeals} meals</Text>
                </View>
                <View className="flex-row justify-between py-2 border-b border-white/5">
                  <Text className="text-[#94A3B8] text-xs font-medium">
                    Skipped Meals Dues Saved
                  </Text>
                  <Text className="text-[#22C55E] text-xs font-black">
                    {formatRupees(stats.moneySaved)}
                  </Text>
                </View>
                <View className="flex-row justify-between py-2 border-b border-white/5">
                  <Text className="text-[#94A3B8] text-xs font-medium">Average Cost Per Day</Text>
                  <Text className="text-white text-xs font-black">
                    {formatRupees(Math.round(stats.avgCostPerDay))}
                  </Text>
                </View>
                <View className="flex-row justify-between py-2 border-b border-white/5">
                  <Text className="text-white text-sm font-bold">Total Month Bill</Text>
                  <Text className="text-[#14E5D4] text-sm font-black">
                    {formatRupees(stats.totalBill)}
                  </Text>
                </View>
                <View className="flex-row justify-between py-2">
                  <Text className="text-white text-xs font-medium">Estimated Month-End Bill</Text>
                  <Text className="text-[#14E5D4] text-xs font-black">
                    {formatRupees(Math.round(stats.estimatedBill))}
                  </Text>
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
                  <Text className="text-white text-xs font-bold">
                    {stats.attendancePct.toFixed(0)}%
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* PREVIOUS MONTHS HISTORY SECTION */}
          <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mt-8 mb-4">
            Previous Months
          </Text>

          {previousMonthsReports.length === 0 ? (
            <View className="bg-[#151E2E]/40 border-[0.5px] border-white/5 rounded-2xl p-6 items-center justify-center">
              <Text className="text-[#94A3B8] text-xs text-center">
                No previous history available
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }} className="mb-8">
              {previousMonthsReports.map((report) => (
                <TouchableOpacity
                  key={report.ym}
                  onPress={() => {
                    Theme.haptics.light();
                    setSelectedReport(report);
                  }}
                  className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-4 flex-row justify-between items-center shadow-md active:opacity-85"
                >
                  <View>
                    <Text className="text-white font-bold text-sm">{report.monthLabel}</Text>
                    <Text className="text-[#94A3B8] text-xs mt-1">
                      {report.totalMeals} Meals • {report.skippedMeals} Missed
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-[#14E5D4] font-black text-sm">
                      {formatRupees(report.totalSpent)}
                    </Text>
                    <Text className="text-[#94A3B8] text-[9px] uppercase tracking-wider mt-0.5">
                      View Report
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      </ScrollView>

      {/* MONTHLY REPORT MODAL */}
      <Modal visible={!!selectedReport} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-[#151E2E] border-t-[0.5px] border-white/10 rounded-t-3xl p-6 pb-10">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-white">Monthly Report</Text>
              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  setSelectedReport(null);
                }}
                className="w-8 h-8 justify-center items-center rounded-full bg-white/5"
              >
                <X size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {selectedReport && (
              <View style={{ gap: 16 }}>
                <View className="border-b border-white/5 pb-3">
                  <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-wider">
                    Month & Year
                  </Text>
                  <Text className="text-white text-lg font-bold mt-1">
                    {selectedReport.monthLabel}
                  </Text>
                </View>

                <View className="flex-row justify-between py-2 border-b border-white/5">
                  <View>
                    <Text className="text-[#94A3B8] text-xs">Breakfast Taken</Text>
                    <Text className="text-white text-sm font-bold mt-1">
                      {selectedReport.breakfasts}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-[#94A3B8] text-xs">Breakfast Missed</Text>
                    <Text className="text-[#EF4444] text-sm font-bold mt-1">
                      {selectedReport.breakfastMissed}
                    </Text>
                  </View>
                </View>

                <View className="flex-row justify-between py-2 border-b border-white/5">
                  <View>
                    <Text className="text-[#94A3B8] text-xs">Dinner Taken</Text>
                    <Text className="text-white text-sm font-bold mt-1">
                      {selectedReport.dinners}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-[#94A3B8] text-xs">Dinner Missed</Text>
                    <Text className="text-[#EF4444] text-sm font-bold mt-1">
                      {selectedReport.dinnerMissed}
                    </Text>
                  </View>
                </View>

                <View className="flex-row justify-between py-2 border-b border-white/5">
                  <Text className="text-[#94A3B8] text-xs">Total Meals</Text>
                  <Text className="text-white text-xs font-bold">
                    {selectedReport.totalMeals} meals
                  </Text>
                </View>

                <View className="flex-row justify-between py-2 border-b border-white/5">
                  <Text className="text-[#94A3B8] text-xs">Attendance Percentage</Text>
                  <Text className="text-white text-xs font-bold">
                    {selectedReport.attendancePct.toFixed(0)}%
                  </Text>
                </View>

                <View className="flex-row justify-between py-2 border-b border-white/5">
                  <Text className="text-[#94A3B8] text-xs">Meal Prices</Text>
                  <Text className="text-white text-xs font-bold">
                    B: ₹{selectedReport.breakfastRate} | D: ₹{selectedReport.dinnerRate}
                  </Text>
                </View>

                <View className="flex-row justify-between py-2">
                  <Text className="text-white text-sm font-bold">Total Spent</Text>
                  <Text className="text-[#14E5D4] text-sm font-black">
                    {formatRupees(selectedReport.totalSpent)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

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
                    <Text className="text-[#94A3B8] text-[9px] mb-1 font-bold">
                      Breakfast Price (₹)
                    </Text>
                    <TextInput
                      className="text-white font-bold text-sm"
                      keyboardType="numeric"
                      value={breakfastInput}
                      onChangeText={setBreakfastInput}
                    />
                  </View>
                  <View className="flex-1 bg-white/5 border-[0.5px] border-white/10 rounded-xl p-3">
                    <Text className="text-[#94A3B8] text-[9px] mb-1 font-bold">
                      Dinner Price (₹)
                    </Text>
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
