import React, { useState, useMemo, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
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
import { AnimatedCounter } from "../../../components/ui/AnimatedCounter";
import { StaggeredCard } from "../../../components/ui/StaggeredCard";
import { ScreenTransition } from "../../../components/ui/ScreenTransition";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const budgetSchema = z.object({
  limit: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
    message: "Budget limit must be a positive number",
  }),
});

type BudgetSchema = z.infer<typeof budgetSchema>;

export default function Analytics() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [filter, setFilter] = useState<"this_month" | "last_3_months" | "this_year" | "all">(
    "this_month"
  );
  const [subTab, setSubTab] = useState<"personal" | "group">("personal");

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
    refetchOnMount: "always",
  });

  // 2. Fetch all-time personal expenses for client filtering
  const { data: personalExpenses, isLoading: isPersonalLoading } = useQuery({
    queryKey: ["personal-expenses", user?.id],
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
    refetchOnMount: "always",
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
    refetchOnMount: "always",
  });

  const groupIds = useMemo(() => memberships?.map((m) => m.group_id) || [], [memberships]);

  // 4. Fetch all-time group expenses for client filtering
  const { data: groupExpenses, isLoading: isGroupLoading } = useQuery({
    queryKey: ["group-expenses", user?.id, groupIds],
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
    refetchOnMount: "always",
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
    refetchOnMount: "always",
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
    } else if (filter === "last_3_months") {
      startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    } else if (filter === "this_year") {
      startDate = new Date(now.getFullYear(), 0, 1);
    }

    const formatDateStr = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const startStr = filter === "all" ? "0000-01-01" : formatDateStr(startDate);
    const endStr = filter === "all" ? "9999-12-31" : formatDateStr(endDate);

    const isInRange = (dateStr: string) => {
      if (!dateStr) return false;
      const clean = dateStr.substring(0, 10);
      return clean >= startStr && clean <= endStr;
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

    const netBalance = youReceive - youOwe;
    const groupExpensesCount = nonSettlementGroupExpenses.length;

    let breakfasts = 0;
    let dinners = 0;
    const loggedDays = filteredTiffin.length;
    let tiffinSpent = 0;

    filteredTiffin.forEach((log) => {
      if (log.has_breakfast) {
        breakfasts++;
        tiffinSpent += Number(log.breakfast_rate) || 30;
      }
      if (log.has_dinner) {
        dinners++;
        tiffinSpent += Number(log.dinner_rate) || 30;
      }
    });

    const tiffinMealsTaken = breakfasts + dinners;
    const tiffinMissed = loggedDays * 2 - tiffinMealsTaken;
    const tiffinAvg = tiffinMealsTaken > 0 ? tiffinSpent / tiffinMealsTaken : 0;

    // Personal Category totals & Insights
    const personalCategoryTotals: Record<string, number> = {};
    let personalBiggestExpenseAmount = 0;
    let personalBiggestExpenseDescription = "None";

    filteredPersonal.forEach((e) => {
      const cat = e.category?.name || "Other";
      personalCategoryTotals[cat] = (personalCategoryTotals[cat] || 0) + (Number(e.amount) || 0);
      if ((Number(e.amount) || 0) > personalBiggestExpenseAmount) {
        personalBiggestExpenseAmount = Number(e.amount) || 0;
        personalBiggestExpenseDescription = e.description || cat;
      }
    });

    let personalHighestCategoryName = "None";
    let personalMaxCategorySpent = 0;
    Object.entries(personalCategoryTotals).forEach(([cat, amt]) => {
      if (amt > personalMaxCategorySpent) {
        personalMaxCategorySpent = amt;
        personalHighestCategoryName = cat;
      }
    });

    // Group Category totals & Group Insights
    const groupCategoryTotals: Record<string, number> = {};
    const groupTotals: Record<string, number> = {};
    const groupCounts: Record<string, number> = {};
    let groupBiggestExpenseAmount = 0;
    let groupBiggestExpenseDescription = "None";

    nonSettlementGroupExpenses.forEach((e) => {
      const cat = e.category?.name || "Other";
      const userSplit = e.splits?.find((s: any) => s.debtor_id === user?.id);
      const userShare = userSplit ? Number(userSplit.amount) || 0 : 0;
      groupCategoryTotals[cat] = (groupCategoryTotals[cat] || 0) + userShare;

      const groupName = memberships?.find((m) => m.group_id === e.group_id)?.group?.name || "Group";
      groupTotals[groupName] = (groupTotals[groupName] || 0) + userShare;
      groupCounts[groupName] = (groupCounts[groupName] || 0) + 1;

      if (userShare > groupBiggestExpenseAmount) {
        groupBiggestExpenseAmount = userShare;
        groupBiggestExpenseDescription = e.description || cat;
      }
    });

    let groupHighestCategoryName = "None";
    let groupMaxCategorySpent = 0;
    Object.entries(groupCategoryTotals).forEach(([cat, amt]) => {
      if (amt > groupMaxCategorySpent) {
        groupMaxCategorySpent = amt;
        groupHighestCategoryName = cat;
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

    const personalAverageExpense = personalCount > 0 ? personalSpent / personalCount : 0;
    const groupAverageExpense =
      groupExpensesCount > 0 ? groupSpentAsDebtor / groupExpensesCount : 0;

    const groupChartData = Object.entries(groupTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const personalCategoryChartData = Object.entries(personalCategoryTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const groupCategoryChartData = Object.entries(groupCategoryTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const personalTrendChartData: { monthName: string; amount: number }[] = [];
    const groupTrendChartData: { monthName: string; amount: number }[] = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = d.toLocaleString("en-US", { month: "short" });
      const mStartStr = formatDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
      const mEndStr = formatDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));

      const pSum = (personalExpenses || [])
        .filter((e) => {
          if (!e.expense_date) return false;
          const clean = e.expense_date.substring(0, 10);
          return clean >= mStartStr && clean <= mEndStr;
        })
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      const gSum = (groupExpenses || [])
        .filter((e) => {
          if (!e.expense_date) return false;
          const clean = e.expense_date.substring(0, 10);
          return !e.is_settlement && clean >= mStartStr && clean <= mEndStr;
        })
        .reduce((sum, e) => {
          const userSplit = e.splits?.find((s: any) => s.debtor_id === user?.id);
          return sum + (userSplit ? Number(userSplit.amount) || 0 : 0);
        }, 0);

      personalTrendChartData.push({ monthName: monthLabel, amount: pSum });
      groupTrendChartData.push({ monthName: monthLabel, amount: gSum });
    }

    return {
      personalCount,
      personalSpent,
      groupExpensesCount,
      groupSpentAsDebtor,
      groupPaidAsPayer,
      youOwe,
      youReceive,
      settlementsMade,
      settlementsCount,
      activeGroupsCount: activeGroupIds.size,
      netBalance,
      tiffinMealsTaken,
      tiffinMissed,
      tiffinSpent,
      tiffinAvg,
      personalHighestCategoryName,
      personalMaxCategorySpent,
      personalBiggestExpenseAmount,
      personalBiggestExpenseDescription,
      groupHighestCategoryName,
      groupMaxCategorySpent,
      groupBiggestExpenseAmount,
      groupBiggestExpenseDescription,
      highestGroupName,
      maxGroupSpent,
      mostActiveGroupName,
      personalAverageExpense,
      groupAverageExpense,
      groupChartData,
      personalCategoryChartData,
      groupCategoryChartData,
      personalTrendChartData,
      groupTrendChartData,
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

  const isLoading =
    isBudgetLoading ||
    isPersonalLoading ||
    isMembershipsLoading ||
    isTiffinLoading ||
    (groupIds.length > 0 && isGroupLoading);

  if (isLoading) {
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
          className="mb-4"
          contentContainerStyle={{ gap: 8 }}
        >
          {(
            [
              { id: "this_month", label: "This Month" },
              { id: "last_3_months", label: "Last 3 Months" },
              { id: "this_year", label: "This Year" },
              { id: "all", label: "All Time" },
            ] as const
          ).map((opt) => {
            const active = filter === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() => {
                  Theme.haptics.selection();
                  setFilter(opt.id);
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

        {/* Sub-Tabs Selector */}
        <View className="flex-row bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-1 mb-6">
          <TouchableOpacity
            onPress={() => {
              Theme.haptics.selection();
              setSubTab("personal");
            }}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 12,
              alignItems: "center",
              backgroundColor: subTab === "personal" ? "rgba(20, 229, 212, 0.1)" : "transparent",
              borderColor: subTab === "personal" ? "rgba(20, 229, 212, 0.2)" : "transparent",
              borderWidth: 1,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: subTab === "personal" ? "#14E5D4" : "#94A3B8",
              }}
            >
              🙋‍♂️ Personal
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              Theme.haptics.selection();
              setSubTab("group");
            }}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 12,
              alignItems: "center",
              backgroundColor: subTab === "group" ? "rgba(20, 229, 212, 0.1)" : "transparent",
              borderColor: subTab === "group" ? "rgba(20, 229, 212, 0.2)" : "transparent",
              borderWidth: 1,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: subTab === "group" ? "#14E5D4" : "#94A3B8",
              }}
            >
              👥 Shared Group
            </Text>
          </TouchableOpacity>
        </View>

        {/* Warning Banner */}
        {subTab === "personal" && showWarning && (
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
        {subTab === "personal" && budgetLimit > 0 && (
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
        ) : subTab === "personal" ? (
          <View style={{ gap: 16 }}>
            {/* Personal Summary Card */}
            <View className="bg-[#151E2E]/80 border-[0.5px] border-white/5 rounded-2xl p-5 shadow-lg">
              <Text className="text-white font-bold text-sm mb-4">
                📅 Personal Spending Summary
              </Text>

              <View style={{ gap: 12 }}>
                <View className="flex-row justify-between items-center">
                  <Text className="text-[#94A3B8] text-xs">💸 Total Personal Spent</Text>
                  <AnimatedCounter
                    value={summaryData.personalSpent}
                    prefix="₹"
                    style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 12 }}
                  />
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-[#94A3B8] text-xs">📋 Personal Expenses</Text>
                  <AnimatedCounter
                    value={summaryData.personalCount}
                    style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 12 }}
                  />
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-[#94A3B8] text-xs">💳 Average Expense</Text>
                  <AnimatedCounter
                    value={summaryData.personalAverageExpense}
                    prefix="₹"
                    style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 12 }}
                  />
                </View>
              </View>
            </View>

            {/* Tiffin Summary Card */}
            {tiffinLogs && tiffinLogs.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  router.push("/tiffin");
                }}
                className="bg-[#151E2E]/80 border-[0.5px] border-white/5 rounded-2xl p-5 shadow-lg active:opacity-85"
              >
                <View className="flex-row justify-between items-center mb-4">
                  <Text className="text-white font-bold text-sm">🍱 Tiffin Summary</Text>
                  <Text className="text-[#14E5D4] text-xs font-bold">View Details →</Text>
                </View>
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
              </TouchableOpacity>
            )}

            {/* Personal Insights Card */}
            <View className="bg-[#151E2E]/80 border-[0.5px] border-white/5 rounded-2xl p-5 shadow-lg">
              <Text className="text-white font-bold text-sm mb-4">📈 Insights</Text>
              <View style={{ gap: 12 }}>
                <View className="flex-row items-start">
                  <Text className="text-white text-xs mr-2">•</Text>
                  <Text className="text-[#94A3B8] text-xs flex-1">
                    <Text className="text-white font-bold">
                      {summaryData.personalHighestCategoryName}
                    </Text>{" "}
                    was your biggest category (₹
                    {summaryData.personalMaxCategorySpent.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                    )
                  </Text>
                </View>
                <View className="flex-row items-start">
                  <Text className="text-white text-xs mr-2">•</Text>
                  <Text className="text-[#94A3B8] text-xs flex-1">
                    Largest single expense:{" "}
                    <Text className="text-white font-bold">
                      {summaryData.personalBiggestExpenseDescription}
                    </Text>{" "}
                    (₹
                    {summaryData.personalBiggestExpenseAmount.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                    )
                  </Text>
                </View>
                <View className="flex-row items-start">
                  <Text className="text-white text-xs mr-2">•</Text>
                  <Text className="text-[#94A3B8] text-xs flex-1">
                    Average expense amount:{" "}
                    <Text className="text-white font-bold">
                      ₹
                      {summaryData.personalAverageExpense.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </Text>
                  </Text>
                </View>
              </View>
            </View>

            {/* Personal Charts Card */}
            <View
              className="bg-[#151E2E]/80 border-[0.5px] border-white/5 rounded-2xl p-5 shadow-lg"
              style={{ gap: 24 }}
            >
              {/* Personal Spending Trend */}
              <View>
                <Text className="text-white font-bold text-xs mb-3">📈 Spending Trend</Text>
                <View className="h-28 flex-row items-end justify-between px-2 pt-4">
                  {summaryData.personalTrendChartData.map((d, index) => {
                    const maxVal = Math.max(
                      ...summaryData.personalTrendChartData.map((m) => m.amount),
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

              {/* Personal Category-wise Spending */}
              {summaryData.personalCategoryChartData.length > 0 && (
                <View>
                  <Text className="text-white font-bold text-xs mb-3">🏷️ Category Spending</Text>
                  <View style={{ gap: 12 }}>
                    {summaryData.personalCategoryChartData.map((item, index) => {
                      const maxVal = Math.max(
                        ...summaryData.personalCategoryChartData.map((d) => d.value),
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
            </View>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {/* Group Summary Card */}
            <View className="bg-[#151E2E]/80 border-[0.5px] border-white/5 rounded-2xl p-5 shadow-lg">
              <Text className="text-white font-bold text-sm mb-4">📅 Group Spending Summary</Text>

              <View style={{ gap: 12 }}>
                <View className="flex-row justify-between items-center">
                  <Text className="text-[#94A3B8] text-xs">💸 Your Group Share</Text>
                  <Text className="text-white font-bold text-xs">
                    ₹
                    {summaryData.groupSpentAsDebtor.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-[#94A3B8] text-xs">💳 You Paid (Total)</Text>
                  <Text className="text-white font-bold text-xs">
                    ₹
                    {summaryData.groupPaidAsPayer.toLocaleString("en-IN", {
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
                  <Text className="text-[#94A3B8] text-xs">📋 Group Expenses</Text>
                  <Text className="text-white font-bold text-xs">
                    {summaryData.groupExpensesCount}
                  </Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-[#94A3B8] text-xs">👥 Active Groups</Text>
                  <Text className="text-white font-bold text-xs">
                    {summaryData.activeGroupsCount}
                  </Text>
                </View>

                {/* Net Balance */}
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

            {/* Group Insights Card */}
            <View className="bg-[#151E2E]/80 border-[0.5px] border-white/5 rounded-2xl p-5 shadow-lg">
              <Text className="text-white font-bold text-sm mb-4">👥 Group Insights</Text>
              <View style={{ gap: 12 }}>
                <View className="flex-row items-start">
                  <Text className="text-white text-xs mr-2">•</Text>
                  <Text className="text-[#94A3B8] text-xs flex-1">
                    You spent most in group:{" "}
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
                    Most active group:{" "}
                    <Text className="text-white font-bold">
                      "{summaryData.mostActiveGroupName}"
                    </Text>
                  </Text>
                </View>
                <View className="flex-row items-start">
                  <Text className="text-white text-xs mr-2">•</Text>
                  <Text className="text-[#94A3B8] text-xs flex-1">
                    Largest group expense share:{" "}
                    <Text className="text-white font-bold">
                      {summaryData.groupBiggestExpenseDescription}
                    </Text>{" "}
                    (₹
                    {summaryData.groupBiggestExpenseAmount.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                    )
                  </Text>
                </View>
              </View>
            </View>

            {/* Group Charts Card */}
            <View
              className="bg-[#151E2E]/80 border-[0.5px] border-white/5 rounded-2xl p-5 shadow-lg"
              style={{ gap: 24 }}
            >
              {/* Group Spending Trend */}
              <View>
                <Text className="text-white font-bold text-xs mb-3">📈 Group Share Trend</Text>
                <View className="h-28 flex-row items-end justify-between px-2 pt-4">
                  {summaryData.groupTrendChartData.map((d, index) => {
                    const maxVal = Math.max(
                      ...summaryData.groupTrendChartData.map((m) => m.amount),
                      100
                    );
                    const pct = Math.max((d.amount / maxVal) * 100, 5);
                    return (
                      <View key={index} className="items-center flex-1">
                        <View
                          style={{ height: `${pct}%`, backgroundColor: "#9333EA" }}
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

              {/* Group-wise Spending Breakdown */}
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

              {/* Group Category-wise Spending */}
              {summaryData.groupCategoryChartData.length > 0 && (
                <View>
                  <Text className="text-white font-bold text-xs mb-3">
                    🏷️ Group Category Spending
                  </Text>
                  <View style={{ gap: 12 }}>
                    {summaryData.groupCategoryChartData.map((item, index) => {
                      const maxVal = Math.max(
                        ...summaryData.groupCategoryChartData.map((d) => d.value),
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
