import React, { useState, useMemo, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { triggerWittyNotification } from "../../../services/wittyNotifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../../store/authStore";
import { supabase } from "../../../services/supabase";
import { useToastStore } from "../../../store/toastStore";
import { Theme } from "../../../constants/Theme";
import { Colors } from "../../../constants/Colors";
import { AlertTriangle, X, Save } from "lucide-react-native";
import { Skeleton, SkeletonCard, SkeletonChart } from "../../../components/ui/Skeleton";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Svg, { Path, Circle, Rect, G, Defs, LinearGradient, Stop } from "react-native-svg";

const budgetSchema = z.object({
  limit: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
    message: "Budget limit must be a positive number",
  }),
});

type BudgetSchema = z.infer<typeof budgetSchema>;

export default function Analytics() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [filter, setFilter] = useState<"this_month" | "last_month" | "this_year" | "all">(
    "this_month"
  );

  // 1. Fetch budget settings
  const { data: budget, isLoading: isBudgetLoading } = useQuery({
    queryKey: ["budget", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("profile_id", user?.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // 2. Fetch all-time personal expenses for client filtering
  const { data: personalExpenses, isLoading: isPersonalLoading } = useQuery({
    queryKey: ["personal-expenses", "analytics", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_expenses")
        .select("*, category:categories(*)")
        .eq("profile_id", user?.id)
        .order("expense_date", { ascending: false });

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user?.id,
  });

  // 3. Fetch group memberships
  const { data: memberships, isLoading: isMembershipsLoading } = useQuery({
    queryKey: ["groups", "memberships", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_members")
        .select("group_id, role, group:groups(*)")
        .eq("profile_id", user?.id);

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user?.id,
  });

  const groupIds = useMemo(() => memberships?.map((m) => m.group_id) || [], [memberships]);

  // 4. Fetch all-time group expenses for client filtering
  const { data: groupExpenses, isLoading: isGroupLoading } = useQuery({
    queryKey: ["group-expenses", "analytics", user?.id, groupIds],
    queryFn: async () => {
      if (!groupIds || groupIds.length === 0) return [];
      const { data, error } = await supabase
        .from("expenses")
        .select(
          "*, payer:profiles(*), category:categories(*), splits:expense_splits(*, debtor:profiles(*))"
        )
        .in("group_id", groupIds)
        .order("expense_date", { ascending: false });

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user?.id && groupIds.length > 0,
  });

  // 5. Fetch all-time tiffin logs for tiffin summary
  const { data: tiffinLogs, isLoading: isTiffinLoading } = useQuery({
    queryKey: ["dashboard-tiffin-logs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tiffin_logs")
        .select("*")
        .eq("profile_id", user?.id);

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user?.id,
  });

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<BudgetSchema>({
    resolver: zodResolver(budgetSchema),
    values: {
      limit: budget?.monthly_limit ? budget.monthly_limit.toString() : "0",
    },
  });

  // Mutation to update budget limit
  const budgetMutation = useMutation({
    mutationFn: async (data: BudgetSchema) => {
      const payload = {
        profile_id: user?.id,
        monthly_limit: Number(data.limit),
        updated_at: new Date().toISOString(),
      };

      if (budget) {
        const { error } = await supabase.from("budgets").update(payload).eq("id", budget.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("budgets").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["budget", user?.id] });
      showToast("Monthly budget updated", "success");
      setIsEditOpen(false);
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to update budget", "error");
    },
  });

  // --- UNIFIED DATA PROCESSOR FOR SUMMARY, TIFFIN, INSIGHTS & CHARTS ---
  const summaryData = useMemo(() => {
    const now = new Date();
    let startDate = new Date(0);
    let endDate = new Date();

    if (filter === "this_month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (filter === "last_month") {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else if (filter === "this_year") {
      startDate = new Date(now.getFullYear(), 0, 1);
    }

    const startMs = startDate.getTime();
    const endMs = endDate.getTime();

    const isInRange = (dateStr: string) => {
      const ms = new Date(dateStr).getTime();
      return ms >= startMs && ms <= endMs;
    };

    const filteredPersonal = (personalExpenses || []).filter((e) => isInRange(e.expense_date));
    const filteredGroupExpenses = (groupExpenses || []).filter((e) => isInRange(e.expense_date));
    const filteredTiffin = (tiffinLogs || []).filter((log) => isInRange(log.log_date));

    const personalCount = filteredPersonal.length;
    const personalSpent = filteredPersonal.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    let groupSpentAsDebtor = 0;
    let groupPaidAsPayer = 0;
    let youOwe = 0;
    let youReceive = 0;
    let settlementsMade = 0;
    let settlementsCount = 0;
    const activeGroupIds = new Set<string>();

    const nonSettlementGroupExpenses = filteredGroupExpenses.filter((e) => !e.is_settlement);
    const settlementGroupExpenses = filteredGroupExpenses.filter((e) => e.is_settlement);

    nonSettlementGroupExpenses.forEach((e) => {
      activeGroupIds.add(e.group_id);
      const userSplit = e.splits?.find((s: any) => s.debtor_id === user?.id);
      const userShare = userSplit ? Number(userSplit.amount) || 0 : 0;

      groupSpentAsDebtor += userShare;

      if (e.paid_by === user?.id) {
        groupPaidAsPayer += Number(e.amount) || 0;
        youReceive += (Number(e.amount) || 0) - userShare;
      } else {
        youOwe += userShare;
      }
    });

    settlementGroupExpenses.forEach((e) => {
      activeGroupIds.add(e.group_id);
      const involvesUser =
        e.paid_by === user?.id || e.splits?.some((s: any) => s.debtor_id === user?.id);
      if (involvesUser) {
        settlementsMade += Number(e.amount) || 0;
        settlementsCount++;
      }
    });

    const totalSpent = personalSpent + groupSpentAsDebtor;
    const totalPaidByYou = personalSpent + groupPaidAsPayer;
    const netBalance = youReceive - youOwe;
    const totalExpensesCount =
      personalCount + nonSettlementGroupExpenses.filter((e) => e.paid_by === user?.id).length;

    let breakfasts = 0;
    let dinners = 0;
    const loggedDays = filteredTiffin.length;

    filteredTiffin.forEach((log) => {
      if (log.has_breakfast) breakfasts++;
      if (log.has_dinner) dinners++;
    });

    const tiffinMealsTaken = breakfasts + dinners;
    const breakfastRate = 30;
    const dinnerRate = 30;
    const tiffinSpent = breakfasts * breakfastRate + dinners * dinnerRate;
    const tiffinMissed = loggedDays * 2 - tiffinMealsTaken;
    const tiffinAvg = tiffinMealsTaken > 0 ? tiffinSpent / tiffinMealsTaken : 0;

    const categoryTotals: Record<string, number> = {};
    const groupTotals: Record<string, number> = {};
    let biggestExpenseAmount = 0;
    let biggestExpenseDescription = "None";
    const groupCounts: Record<string, number> = {};

    filteredPersonal.forEach((e) => {
      const cat = e.category?.name || "Other";
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (Number(e.amount) || 0);
      if ((Number(e.amount) || 0) > biggestExpenseAmount) {
        biggestExpenseAmount = Number(e.amount) || 0;
        biggestExpenseDescription = e.description || cat;
      }
    });

    nonSettlementGroupExpenses.forEach((e) => {
      const cat = e.category?.name || "Other";
      const userSplit = e.splits?.find((s: any) => s.debtor_id === user?.id);
      const userShare = userSplit ? Number(userSplit.amount) || 0 : 0;
      categoryTotals[cat] = (categoryTotals[cat] || 0) + userShare;

      const groupName = memberships?.find((m) => m.group_id === e.group_id)?.group?.name || "Group";
      groupTotals[groupName] = (groupTotals[groupName] || 0) + userShare;
      groupCounts[groupName] = (groupCounts[groupName] || 0) + 1;

      if (userShare > biggestExpenseAmount) {
        biggestExpenseAmount = userShare;
        biggestExpenseDescription = e.description || cat;
      }
    });

    let highestCategoryName = "None";
    let maxCategorySpent = 0;
    Object.entries(categoryTotals).forEach(([cat, amt]) => {
      if (amt > maxCategorySpent) {
        maxCategorySpent = amt;
        highestCategoryName = cat;
      }
    });

    let highestGroupName = "None";
    let maxGroupSpent = 0;
    Object.entries(groupTotals).forEach(([grp, amt]) => {
      if (grp === "Group") return;
      if (amt > maxGroupSpent) {
        maxGroupSpent = amt;
        highestGroupName = grp;
      }
    });

    let mostActiveGroupName = "None";
    let maxGroupCount = 0;
    Object.entries(groupCounts).forEach(([grp, count]) => {
      if (count > maxGroupCount) {
        maxGroupCount = count;
        mostActiveGroupName = grp;
      }
    });

    const averageExpense = totalExpensesCount > 0 ? totalSpent / totalExpensesCount : 0;

    const groupChartData = Object.entries(groupTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const categoryChartData = Object.entries(categoryTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const trendChartData: { monthName: string; amount: number }[] = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = d.toLocaleString("en-US", { month: "short" });
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();

      const pSum = (personalExpenses || [])
        .filter((e) => {
          const t = new Date(e.expense_date).getTime();
          return t >= mStart && t <= mEnd;
        })
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      const gSum = (groupExpenses || [])
        .filter((e) => {
          const t = new Date(e.expense_date).getTime();
          return !e.is_settlement && t >= mStart && t <= mEnd;
        })
        .reduce((sum, e) => {
          const userSplit = e.splits?.find((s: any) => s.debtor_id === user?.id);
          return sum + (userSplit ? Number(userSplit.amount) || 0 : 0);
        }, 0);

      trendChartData.push({ monthName: monthLabel, amount: pSum + gSum });
    }

    return {
      personalCount,
      personalSpent,
      totalSpent,
      totalPaidByYou,
      youOwe,
      youReceive,
      settlementsMade,
      settlementsCount,
      activeGroupsCount: activeGroupIds.size,
      netBalance,
      totalExpensesCount,
      tiffinMealsTaken,
      tiffinMissed,
      tiffinSpent,
      tiffinAvg,
      highestCategoryName,
      maxCategorySpent,
      highestGroupName,
      maxGroupSpent,
      biggestExpenseAmount,
      biggestExpenseDescription,
      mostActiveGroupName,
      averageExpense,
      groupChartData,
      categoryChartData,
      trendChartData,
      hasAnyData:
        personalCount > 0 || nonSettlementGroupExpenses.length > 0 || filteredTiffin.length > 0,
    };
  }, [filter, personalExpenses, groupExpenses, tiffinLogs, user?.id, memberships]);

  // Budget configuration warning analysis
  const budgetLimit = budget?.monthly_limit ? Number(budget.monthly_limit) : 0;
  const now = new Date();
  const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const curMonthPersonalTotal =
    personalExpenses
      ?.filter((e) => new Date(e.expense_date) >= curMonthStart)
      .reduce((sum, e) => sum + Number(e.amount), 0) || 0;
  const curMonthGroupTotal =
    groupExpenses
      ?.filter((e) => !e.is_settlement && new Date(e.expense_date) >= curMonthStart)
      .reduce((sum, e) => {
        const ownSplit = e.splits?.find((s: any) => s.debtor_id === user?.id);
        return sum + (ownSplit ? Number(ownSplit.amount) || 0 : 0);
      }, 0) || 0;

  const totalSpentCurMonth = curMonthPersonalTotal + curMonthGroupTotal;
  const remainingBudget = Math.max(0, budgetLimit - totalSpentCurMonth);
  const isExceeded = totalSpentCurMonth > budgetLimit;
  const usagePercentage = budgetLimit > 0 ? (totalSpentCurMonth / budgetLimit) * 100 : 0;

  useEffect(() => {
    const checkMonthlySummary = async () => {
      try {
        const curMonthStr = new Date().toISOString().substring(0, 7);
        const lastSummaryMonth = await AsyncStorage.getItem("last_monthly_summary_month");
        if (lastSummaryMonth !== curMonthStr) {
          await triggerWittyNotification("monthly_summary", "Monthly Wrap");
          await AsyncStorage.setItem("last_monthly_summary_month", curMonthStr);
        }
      } catch {}
    };
    checkMonthlySummary();
  }, []);

  useEffect(() => {
    const checkBudgetWarning = async () => {
      try {
        if (budgetLimit > 0 && totalSpentCurMonth > budgetLimit) {
          const todayStr = new Date().toISOString().split("T")[0];
          const lastWarningDate = await AsyncStorage.getItem("last_budget_warning_date");
          if (lastWarningDate !== todayStr) {
            await triggerWittyNotification("budget_warning", "Budget Exceeded Alert");
            await AsyncStorage.setItem("last_budget_warning_date", todayStr);
          }
        }
      } catch {}
    };
    checkBudgetWarning();
  }, [totalSpentCurMonth, budgetLimit]);

  if (
    isBudgetLoading ||
    isPersonalLoading ||
    isMembershipsLoading ||
    isGroupLoading ||
    isTiffinLoading
  ) {
    return (
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={{ flex: 1, backgroundColor: "#0B1220" }}
      >
        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 110 }}>
          {/* Top Header */}
          <View className="flex-row justify-between items-center mb-6 mt-4">
            <Text className="text-2xl font-black text-white tracking-tighter">Analytics</Text>
            <TouchableOpacity
              disabled
              className="bg-[#151E2E] border-[0.5px] border-white/10 px-4 py-2.5 rounded-xl opacity-50"
            >
              <Text className="text-white text-xs font-bold">Set Budget</Text>
            </TouchableOpacity>
          </View>

          {/* Filters Select row skeleton */}
          <View className="flex-row bg-[#151E2E] border-[0.5px] border-white/5 rounded-xl p-1 mb-6 shadow-md h-10 w-full justify-between items-center px-4">
            <Skeleton width="14%" height="80%" borderRadius={6} />
            <Skeleton width="18%" height="80%" borderRadius={6} />
            <Skeleton width="18%" height="80%" borderRadius={6} />
            <Skeleton width="18%" height="80%" borderRadius={6} />
            <Skeleton width="18%" height="80%" borderRadius={6} />
          </View>

          {/* Overview Cards (grid of 4 cards) */}
          <View className="flex-row flex-wrap gap-3 mb-6">
            <SkeletonCard height={94} style={{ width: "48%" }} />
            <SkeletonCard height={94} style={{ width: "48%" }} />
            <SkeletonCard height={94} style={{ width: "48%" }} />
            <SkeletonCard height={94} style={{ width: "48%" }} />
          </View>

          {/* Budget Limit Card */}
          <View className="bg-[#151E2E]/60 border-[0.5px] border-white/5 rounded-2xl p-5 mb-6">
            <Skeleton width="40%" height={12} borderRadius={4} className="mb-3" />
            <Skeleton width="90%" height={8} borderRadius={4} className="mb-2" />
            <Skeleton width="60%" height={10} borderRadius={4} />
          </View>

          {/* Chart Skeletons */}
          <View className="space-y-6">
            <SkeletonChart />
            <SkeletonChart />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Warning metrics setups
  const showWarning = usagePercentage >= 80 && budgetLimit > 0;
  let warnColor = "text-accentCyan";
  let warnIconColor = "#14E5D4";
  let warnBg = "bg-accentCyan/10 border-accentCyan/20";
  let warnText = `You have used ${usagePercentage.toFixed(0)}% of your monthly budget limit.`;

  if (isExceeded) {
    warnColor = "text-[#EF4444]";
    warnIconColor = "#EF4444";
    warnBg = "bg-[#EF4444]/10 border-[#EF4444]/20";
    warnText = `Warning: Monthly budget limit exceeded by ₹${(totalSpentCurMonth - budgetLimit).toFixed(0)}!`;
  } else if (usagePercentage >= 90) {
    warnColor = "text-amber-500";
    warnIconColor = "#F59E0B";
    warnBg = "bg-amber-500/10 border-amber-500/20";
    warnText = `Caution: Budget usage is currently at ${usagePercentage.toFixed(0)}%!`;
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: "#0B1220" }}>
      {/* Scrollable Container */}
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Top Header */}
        <View className="flex-row justify-between items-center mb-6 mt-4">
          <Text className="text-2xl font-black text-white tracking-tighter">Analytics</Text>
          <TouchableOpacity
            onPress={() => {
              Theme.haptics.light();
              setIsEditOpen(true);
            }}
            className="bg-[#151E2E] border-[0.5px] border-white/10 px-4 py-2.5 rounded-xl"
          >
            <Text className="text-white text-xs font-bold">Set Budget</Text>
          </TouchableOpacity>
        </View>

        {/* Filters Select row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-6"
          contentContainerStyle={{ gap: 8 }}
        >
          {[
            { id: "this_month", label: "This Month" },
            { id: "last_month", label: "Last Month" },
            { id: "this_year", label: "This Year" },
            { id: "all", label: "All Time" },
          ].map((opt) => {
            const active = filter === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() => {
                  Theme.haptics.light();
                  setFilter(opt.id as any);
                }}
                style={{
                  backgroundColor: active ? "rgba(20, 229, 212, 0.1)" : "rgba(21, 30, 46, 0.4)",
                  borderColor: active ? "rgba(20, 229, 212, 0.4)" : "rgba(255, 255, 255, 0.05)",
                  borderWidth: 1,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 9999,
                  marginRight: 6,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: active ? "#14E5D4" : "#94A3B8",
                  }}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Warning Banner */}
        {showWarning && (
          <View
            className={`flex-row items-center border-[0.5px] p-4 rounded-2xl mb-6 shadow-md ${warnBg}`}
          >
            <AlertTriangle size={18} color={warnIconColor} />
            <Text className={`text-xs font-semibold ml-2.5 flex-1 leading-relaxed ${warnColor}`}>
              {warnText}
            </Text>
          </View>
        )}

        {/* Budget Limit Card */}
        {budgetLimit > 0 && (
          <View className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-5 mb-6 shadow-lg">
            <View className="flex-row justify-between mb-4">
              <View>
                <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-widest">
                  Spent (This Month)
                </Text>
                <Text className="text-white text-xl font-black mt-1">
                  ₹ {totalSpentCurMonth.toFixed(0)}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-widest">
                  Budget Limit
                </Text>
                <Text className="text-[#14E5D4] text-xl font-black mt-1">
                  ₹ {budgetLimit.toFixed(0)}
                </Text>
              </View>
            </View>
            <View className="h-2 bg-white/5 rounded-full overflow-hidden mb-2 border-[0.5px] border-white/5">
              <View
                className={`h-full rounded-full ${
                  isExceeded
                    ? "bg-[#EF4444]"
                    : usagePercentage >= 85
                      ? "bg-[#F59E0B]"
                      : "bg-[#14E5D4]"
                }`}
                style={{ width: `${Math.min(100, usagePercentage)}%` }}
              />
            </View>
            <View className="flex-row justify-between">
              <Text className="text-[#94A3B8] text-[8px] font-bold uppercase">
                {usagePercentage.toFixed(0)}% Utilized
              </Text>
              <Text
                className={`text-[8px] font-bold uppercase ${isExceeded ? "text-[#EF4444]" : "text-[#14E5D4]"}`}
              >
                {isExceeded ? "Exceeded Limit" : `₹ ${remainingBudget.toFixed(0)} Remaining`}
              </Text>
            </View>
          </View>
        )}

        {/* Global Empty State validation */}
        {!summaryData.hasAnyData ? (
          <View className="py-16 items-center justify-center px-6 bg-[#151E2E] rounded-3xl border-[0.5px] border-white/5 shadow-lg mb-6">
            <Text className="text-3xl mb-4">📊</Text>
            <Text className="text-white text-lg font-black text-center mb-2">
              No Analytics Data Found
            </Text>
            <Text className="text-[#94A3B8] text-xs text-center leading-relaxed mb-6">
              There is no recorded spending in this time range. Try choosing a different filter,
              create a new group, or add your first expense split!
            </Text>
            <TouchableOpacity
              onPress={() => {
                Theme.haptics.light();
                setFilter("all");
              }}
              className="bg-[#14E5D4] px-6 py-3 rounded-xl active:scale-95 shadow-md shadow-[#14E5D4]/20"
            >
              <Text className="text-[#0B1220] font-black text-xs">View All Time</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {/* Summary Card */}
            <View className="bg-[#151E2E]/80 border-[0.5px] border-white/5 rounded-2xl p-5 shadow-lg">
              <Text className="text-white font-bold text-sm mb-4">
                📅{" "}
                {filter === "this_month"
                  ? new Date().toLocaleString("en-US", { month: "long" })
                  : filter === "last_month"
                    ? new Date(
                        new Date().getFullYear(),
                        new Date().getMonth() - 1,
                        1
                      ).toLocaleString("en-US", { month: "long" })
                    : filter === "this_year"
                      ? "This Year"
                      : "All Time"}{" "}
                Summary
              </Text>

              <View style={{ gap: 12 }}>
                <View className="flex-row justify-between items-center">
                  <Text className="text-[#94A3B8] text-xs">💸 Total Spent</Text>
                  <Text className="text-white font-bold text-xs">
                    ₹{summaryData.totalSpent.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-[#94A3B8] text-xs">💳 You Paid</Text>
                  <Text className="text-white font-bold text-xs">
                    ₹
                    {summaryData.totalPaidByYou.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-[#94A3B8] text-xs">📥 You Receive</Text>
                  <Text className="text-[#22C55E] font-bold text-xs">
                    ₹{summaryData.youReceive.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-[#94A3B8] text-xs">📤 You Owe</Text>
                  <Text className="text-[#EF4444] font-bold text-xs">
                    ₹{summaryData.youOwe.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-[#94A3B8] text-xs">🤝 Settlements</Text>
                  <Text className="text-white font-bold text-xs">
                    ₹
                    {summaryData.settlementsMade.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-[#94A3B8] text-xs">📋 Expenses</Text>
                  <Text className="text-white font-bold text-xs">
                    {summaryData.totalExpensesCount}
                  </Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-[#94A3B8] text-xs">👥 Groups</Text>
                  <Text className="text-white font-bold text-xs">
                    {summaryData.activeGroupsCount}
                  </Text>
                </View>

                {/* Net Balance Divider */}
                <View className="border-t border-white/5 pt-3 mt-1 flex-row justify-between items-center">
                  <Text className="text-white font-bold text-xs">Net Balance</Text>
                  <Text
                    className={`text-sm font-black ${summaryData.netBalance >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}
                  >
                    {summaryData.netBalance >= 0 ? "🟢 +" : "🔴 -"}₹
                    {Math.abs(summaryData.netBalance).toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </Text>
                </View>
              </View>
            </View>

            {/* Tiffin Summary Card */}
            {tiffinLogs && tiffinLogs.length > 0 && (
              <View className="bg-[#151E2E]/80 border-[0.5px] border-white/5 rounded-2xl p-5 shadow-lg">
                <Text className="text-white font-bold text-sm mb-4">🍱 Tiffin Summary</Text>
                <View style={{ gap: 12 }}>
                  <View className="flex-row justify-between items-center">
                    <Text className="text-[#94A3B8] text-xs">Meals Taken</Text>
                    <Text className="text-white font-bold text-xs">
                      {summaryData.tiffinMealsTaken}
                    </Text>
                  </View>
                  <View className="flex-row justify-between items-center">
                    <Text className="text-[#94A3B8] text-xs">Meals Missed</Text>
                    <Text className="text-white font-bold text-xs">
                      {summaryData.tiffinMissed >= 0 ? summaryData.tiffinMissed : 0}
                    </Text>
                  </View>
                  <View className="flex-row justify-between items-center">
                    <Text className="text-[#94A3B8] text-xs">Total Spent</Text>
                    <Text className="text-[#14E5D4] font-bold text-xs">
                      ₹
                      {summaryData.tiffinSpent.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </Text>
                  </View>
                  <View className="flex-row justify-between items-center">
                    <Text className="text-[#94A3B8] text-xs">Average/Meal</Text>
                    <Text className="text-white font-bold text-xs">
                      ₹{summaryData.tiffinAvg.toFixed(0)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Insights Card */}
            <View className="bg-[#151E2E]/80 border-[0.5px] border-white/5 rounded-2xl p-5 shadow-lg">
              <Text className="text-white font-bold text-sm mb-4">📈 Insights</Text>
              <View style={{ gap: 12 }}>
                <View className="flex-row items-start">
                  <Text className="text-white text-xs mr-2">•</Text>
                  <Text className="text-[#94A3B8] text-xs flex-1">
                    <Text className="text-white font-bold">{summaryData.highestCategoryName}</Text>{" "}
                    was your biggest expense (₹
                    {summaryData.maxCategorySpent.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                    )
                  </Text>
                </View>
                <View className="flex-row items-start">
                  <Text className="text-white text-xs mr-2">•</Text>
                  <Text className="text-[#94A3B8] text-xs flex-1">
                    You spent most in{" "}
                    <Text className="text-white font-bold">"{summaryData.highestGroupName}"</Text>{" "}
                    (₹
                    {summaryData.maxGroupSpent.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                    )
                  </Text>
                </View>
                <View className="flex-row items-start">
                  <Text className="text-white text-xs mr-2">•</Text>
                  <Text className="text-[#94A3B8] text-xs flex-1">
                    Largest expense:{" "}
                    <Text className="text-white font-bold">
                      {summaryData.biggestExpenseDescription}
                    </Text>{" "}
                    (₹
                    {summaryData.biggestExpenseAmount.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                    )
                  </Text>
                </View>
                <View className="flex-row items-start">
                  <Text className="text-white text-xs mr-2">•</Text>
                  <Text className="text-[#94A3B8] text-xs flex-1">
                    Average expense:{" "}
                    <Text className="text-white font-bold">
                      ₹
                      {summaryData.averageExpense.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </Text>
                  </Text>
                </View>
              </View>
            </View>

            {/* Charts Card */}
            <View
              className="bg-[#151E2E]/80 border-[0.5px] border-white/5 rounded-2xl p-5 shadow-lg"
              style={{ gap: 24 }}
            >
              {/* 1. Monthly Trend Bar */}
              <View>
                <Text className="text-white font-bold text-xs mb-3">📈 Spending Trend</Text>
                <View className="h-28 flex-row items-end justify-between px-2 pt-4">
                  {summaryData.trendChartData.map((d, index) => {
                    const maxVal = Math.max(
                      ...summaryData.trendChartData.map((m) => m.amount),
                      100
                    );
                    const pct = Math.max((d.amount / maxVal) * 100, 5);
                    return (
                      <View key={index} className="items-center flex-1">
                        <View
                          style={{ height: `${pct}%`, backgroundColor: Colors.accentCyan }}
                          className="w-4 rounded-t-sm shadow-md"
                        />
                        <Text className="text-[#94A3B8] text-[8px] font-bold mt-2">
                          {d.monthName}
                        </Text>
                        <Text className="text-white text-[8px] font-semibold mt-0.5">
                          ₹{(d.amount / 1000).toFixed(1)}k
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* 2. Category-wise Spending */}
              {summaryData.categoryChartData.length > 0 && (
                <View>
                  <Text className="text-white font-bold text-xs mb-3">🏷️ Category Spending</Text>
                  <View style={{ gap: 12 }}>
                    {summaryData.categoryChartData.map((item, index) => {
                      const maxVal = Math.max(
                        ...summaryData.categoryChartData.map((d) => d.value),
                        1
                      );
                      const percentage = (item.value / maxVal) * 100;
                      return (
                        <View key={index}>
                          <View className="flex-row justify-between items-center mb-1">
                            <Text className="text-white text-xs font-semibold">{item.name}</Text>
                            <Text className="text-[#14E5D4] text-xs font-bold">
                              ₹{item.value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </Text>
                          </View>
                          <View className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <View
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: Colors.accentCyan,
                              }}
                              className="h-full rounded-full"
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* 3. Group-wise Spending */}
              {summaryData.groupChartData.length > 0 && (
                <View>
                  <Text className="text-white font-bold text-xs mb-3">👥 Group Spending</Text>
                  <View style={{ gap: 12 }}>
                    {summaryData.groupChartData.map((item, index) => {
                      const maxVal = Math.max(...summaryData.groupChartData.map((d) => d.value), 1);
                      const percentage = (item.value / maxVal) * 100;
                      return (
                        <View key={index}>
                          <View className="flex-row justify-between items-center mb-1">
                            <Text className="text-white text-xs font-semibold">{item.name}</Text>
                            <Text className="text-[#14E5D4] text-xs font-bold">
                              ₹{item.value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </Text>
                          </View>
                          <View className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <View
                              style={{ width: `${percentage}%`, backgroundColor: "#9333EA" }}
                              className="h-full rounded-full"
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* BUDGET CONFIG MODAL */}
        <Modal visible={isEditOpen} animationType="slide" transparent>
          <View className="flex-1 justify-end bg-black/60">
            <View className="bg-[#151E2E] border-t-[0.5px] border-white/10 rounded-t-3xl p-6 pb-10">
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-xl font-bold text-white">Monthly Budget Goal</Text>
                <TouchableOpacity
                  onPress={() => setIsEditOpen(false)}
                  className="w-8 h-8 justify-center items-center rounded-full bg-white/5"
                >
                  <X size={16} color="#A3A3A3" />
                </TouchableOpacity>
              </View>

              <View className="space-y-4">
                <View>
                  <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-2">
                    Budget Limit Amount
                  </Text>
                  <View className="flex-row items-center bg-white/5 border-[0.5px] border-white/10 rounded-xl px-4 py-3">
                    <Text className="text-[#14E5D4] font-bold text-lg mr-2">₹</Text>
                    <Controller
                      control={control}
                      name="limit"
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                          className="flex-1 text-white text-lg font-bold py-1"
                          placeholder="0"
                          placeholderTextColor="#666666"
                          keyboardType="numeric"
                          onBlur={onBlur}
                          onChangeText={onChange}
                          value={value}
                        />
                      )}
                    />
                  </View>
                  {errors.limit && (
                    <Text className="text-[#EF4444] text-xs mt-1">{errors.limit.message}</Text>
                  )}
                </View>

                <TouchableOpacity
                  onPress={handleSubmit((data) => budgetMutation.mutate(data))}
                  disabled={budgetMutation.isPending}
                  className="flex-row bg-[#14E5D4] py-4 rounded-xl justify-center items-center active:opacity-90 mt-4 shadow-md shadow-[#14E5D4]/20"
                >
                  {budgetMutation.isPending ? (
                    <ActivityIndicator size="small" color="#0B1220" />
                  ) : (
                    <>
                      <Save size={18} color="#0B1220" />
                      <Text className="text-[#0B1220] font-black text-base ml-2">
                        Save Budget Limit
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}
