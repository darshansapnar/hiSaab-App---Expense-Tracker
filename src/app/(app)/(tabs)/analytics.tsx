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
import {
  AlertTriangle,
  X,
  Save,
} from "lucide-react-native";
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
  const [filter, setFilter] = useState<"today" | "week" | "month" | "last_month" | "year" | "all">("month");

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
        .select("*, payer:profiles(*), category:categories(*), splits:expense_splits(*, debtor:profiles(*))")
        .in("group_id", groupIds)
        .order("expense_date", { ascending: false });

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user?.id && groupIds.length > 0,
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

  // --- TIME RANGE CALCULATOR ---
  const isWithinRange = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (filter) {
      case "today":
        return d >= startOfToday;
      case "week": {
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfWeek.getDate() - now.getDay());
        return d >= startOfWeek;
      }
      case "month": {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return d >= startOfMonth;
      }
      case "last_month": {
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return d >= startOfLastMonth && d <= endOfLastMonth;
      }
      case "year": {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        return d >= startOfYear;
      }
      case "all":
      default:
        return true;
    }
  };

  // --- CLIENT-SIDE AGGREGATIONS ---
  const filteredPersonal = useMemo(
    () => personalExpenses?.filter((e) => isWithinRange(e.expense_date)) || [],
    [personalExpenses, filter]
  );

  const filteredGroup = useMemo(
    () => groupExpenses?.filter((e) => isWithinRange(e.expense_date)) || [],
    [groupExpenses, filter]
  );

  const stats = useMemo(() => {
    let totalExpenses = 0;
    let totalYouPaid = 0;
    let totalYouOwe = 0;
    let totalYouAreOwed = 0;
    let numTransactions = 0;
    let numSettlements = 0;

    filteredPersonal.forEach((exp) => {
      const amt = Number(exp.amount) || 0;
      totalYouPaid += amt;
      totalExpenses += amt;
      numTransactions += 1;
    });

    filteredGroup.forEach((exp) => {
      const isSettlement = exp.is_settlement;
      const amt = Number(exp.amount) || 0;
      const payerId = exp.paid_by;

      if (isSettlement) {
        numSettlements += 1;
        return;
      }

      numTransactions += 1;

      if (payerId === user?.id) {
        totalYouPaid += amt;
        const ownSplit = exp.splits?.find((s: any) => s.debtor_id === user?.id);
        if (ownSplit) {
          totalExpenses += Number(ownSplit.amount) || 0;
        }
        exp.splits?.forEach((split: any) => {
          if (split.debtor_id !== user?.id) {
            totalYouAreOwed += Number(split.amount) || 0;
          }
        });
      } else {
        const ownSplit = exp.splits?.find((s: any) => s.debtor_id === user?.id);
        if (ownSplit) {
          const splitAmt = Number(ownSplit.amount) || 0;
          totalExpenses += splitAmt;
          totalYouOwe += splitAmt;
        }
      }
    });

    return {
      totalExpenses,
      totalYouPaid,
      totalYouOwe,
      totalYouAreOwed,
      netBalance: totalYouAreOwed - totalYouOwe,
      numTransactions,
      numSettlements,
    };
  }, [filteredPersonal, filteredGroup, user?.id]);

  // Daily Spending Trend (Last 7 Days)
  const dailyTrend = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return {
        dateStr: d.toISOString().split("T")[0],
        label: d.toLocaleDateString("en-IN", { weekday: "short" }),
        amount: 0,
      };
    });

    filteredPersonal.forEach((exp) => {
      const dateKey = exp.expense_date.split("T")[0];
      const match = days.find((day) => day.dateStr === dateKey);
      if (match) {
        match.amount += Number(exp.amount) || 0;
      }
    });

    filteredGroup.forEach((exp) => {
      if (exp.is_settlement) return;
      const dateKey = exp.expense_date.split("T")[0];
      const match = days.find((day) => day.dateStr === dateKey);
      if (match) {
        const ownSplit = exp.splits?.find((s: any) => s.debtor_id === user?.id);
        if (ownSplit) {
          match.amount += Number(ownSplit.amount) || 0;
        }
      }
    });

    return days;
  }, [filteredPersonal, filteredGroup, user?.id]);

  // Category Spending breakdown
  const categorySpending = useMemo(() => {
    const cats: Record<string, { amount: number; color: string }> = {};

    filteredPersonal.forEach((exp) => {
      const name = exp.category?.name || "Other";
      const color = exp.category?.color_code || "#FFD166";
      if (!cats[name]) cats[name] = { amount: 0, color };
      cats[name].amount += Number(exp.amount) || 0;
    });

    filteredGroup.forEach((exp) => {
      if (exp.is_settlement) return;
      const name = exp.category?.name || "Other";
      const color = exp.category?.color_code || "#FFD166";
      const ownSplit = exp.splits?.find((s: any) => s.debtor_id === user?.id);
      if (ownSplit) {
        if (!cats[name]) cats[name] = { amount: 0, color };
        cats[name].amount += Number(ownSplit.amount) || 0;
      }
    });

    return Object.entries(cats)
      .map(([name, val]) => ({ name, amount: val.amount, color: val.color }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredPersonal, filteredGroup, user?.id]);

  // Group Spending breakdown
  const groupSpending = useMemo(() => {
    const groups: Record<string, number> = {};

    filteredGroup.forEach((exp) => {
      if (exp.is_settlement) return;
      const groupName = memberships?.find((m) => m.group_id === grp_id)?.group?.name || "Unknown Group";
      const grp_id = exp.group_id;
      const ownSplit = exp.splits?.find((s: any) => s.debtor_id === user?.id);
      if (ownSplit) {
        groups[groupName] = (groups[groupName] || 0) + (Number(ownSplit.amount) || 0);
      }
    });

    return Object.entries(groups)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredGroup, memberships, user?.id]);

  // Weekly spending trend (Last 4 Weeks)
  const weeklyTrend = useMemo(() => {
    const weeks = Array.from({ length: 4 }, (_, i) => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (3 - i) * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return {
        start,
        end,
        label: `Wk ${i + 1}`,
        amount: 0,
      };
    });

    filteredPersonal.forEach((exp) => {
      const expDate = new Date(exp.expense_date);
      const match = weeks.find((w) => expDate >= w.start && expDate <= w.end);
      if (match) {
        match.amount += Number(exp.amount) || 0;
      }
    });

    filteredGroup.forEach((exp) => {
      if (exp.is_settlement) return;
      const expDate = new Date(exp.expense_date);
      const match = weeks.find((w) => expDate >= w.start && expDate <= w.end);
      if (match) {
        const ownSplit = exp.splits?.find((s: any) => s.debtor_id === user?.id);
        if (ownSplit) {
          match.amount += Number(ownSplit.amount) || 0;
        }
      }
    });

    return weeks;
  }, [filteredPersonal, filteredGroup, user?.id]);

  // Monthly spending trend (Last 6 Months)
  const monthlyTrend = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return {
        year: d.getFullYear(),
        month: d.getMonth(),
        label: d.toLocaleDateString("en-IN", { month: "short" }),
        amount: 0,
      };
    });

    personalExpenses?.forEach((exp) => {
      const expDate = new Date(exp.expense_date);
      const match = months.find((m) => m.year === expDate.getFullYear() && m.month === expDate.getMonth());
      if (match) {
        match.amount += Number(exp.amount) || 0;
      }
    });

    groupExpenses?.forEach((exp) => {
      if (exp.is_settlement) return;
      const expDate = new Date(exp.expense_date);
      const match = months.find((m) => m.year === expDate.getFullYear() && m.month === expDate.getMonth());
      if (match) {
        const ownSplit = exp.splits?.find((s: any) => s.debtor_id === user?.id);
        if (ownSplit) {
          match.amount += Number(ownSplit.amount) || 0;
        }
      }
    });

    return months;
  }, [personalExpenses, groupExpenses, user?.id]);

  // Insights Metrics
  const insights = useMemo(() => {
    let maxVal = 0;
    filteredPersonal.forEach((e) => {
      maxVal = Math.max(maxVal, Number(e.amount) || 0);
    });
    filteredGroup.forEach((e) => {
      if (e.is_settlement) return;
      const ownSplit = e.splits?.find((s: any) => s.debtor_id === user?.id);
      if (ownSplit) {
        maxVal = Math.max(maxVal, Number(ownSplit.amount) || 0);
      }
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const personalCount = personalExpenses?.filter((e) => new Date(e.expense_date) >= startOfMonth).length || 0;
    const groupCount = groupExpenses?.filter((e) => !e.is_settlement && new Date(e.expense_date) >= startOfMonth).length || 0;

    const groupCounts: Record<string, number> = {};
    filteredGroup.forEach((exp) => {
      if (exp.is_settlement) return;
      const groupName = memberships?.find((m) => m.group_id === exp.group_id)?.group?.name || "Unknown Group";
      groupCounts[groupName] = (groupCounts[groupName] || 0) + 1;
    });
    const mostActiveGroupName = Object.entries(groupCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

    return {
      highestCategory: categorySpending[0]?.name || "N/A",
      highestGroup: groupSpending[0]?.name || "N/A",
      averageExpense: stats.numTransactions > 0 ? stats.totalExpenses / stats.numTransactions : 0,
      biggestSingleExpense: maxVal,
      numExpensesThisMonth: personalCount + groupCount,
      mostActiveGroup: mostActiveGroupName,
    };
  }, [filteredPersonal, filteredGroup, personalExpenses, groupExpenses, categorySpending, groupSpending, stats, memberships]);

  // Budget configuration warning analysis
  const budgetLimit = budget?.monthly_limit ? Number(budget.monthly_limit) : 0;
  const now = new Date();
  const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const curMonthPersonalTotal = personalExpenses?.filter((e) => new Date(e.expense_date) >= curMonthStart).reduce((sum, e) => sum + Number(e.amount), 0) || 0;
  const curMonthGroupTotal = groupExpenses?.filter((e) => !e.is_settlement && new Date(e.expense_date) >= curMonthStart).reduce((sum, e) => {
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

  if (isBudgetLoading || isPersonalLoading || isMembershipsLoading || isGroupLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }}>
        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 50 }}>
          {/* Top Header */}
          <View className="flex-row justify-between items-center mb-6 mt-4">
            <Text className="text-2xl font-black text-white tracking-tighter">Analytics</Text>
            <TouchableOpacity disabled className="bg-[#151E2E] border-[0.5px] border-white/10 px-4 py-2.5 rounded-xl opacity-50">
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

  // Helper to draw clean polar coordinates path for Pie charts
  const getSlicePath = (startPercent: number, endPercent: number, radius: number) => {
    const startAngle = startPercent * 2 * Math.PI - Math.PI / 2;
    const endAngle = endPercent * 2 * Math.PI - Math.PI / 2;

    const x1 = radius + radius * Math.cos(startAngle);
    const y1 = radius + radius * Math.sin(startAngle);
    const x2 = radius + radius * Math.cos(endAngle);
    const y2 = radius + radius * Math.sin(endAngle);

    const largeArcFlag = endPercent - startPercent > 0.5 ? 1 : 0;

    return `M ${radius} ${radius} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  };

  const personalTotal = filteredPersonal.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const groupTotal = filteredGroup.reduce((sum, e) => {
    if (e.is_settlement) return sum;
    const ownSplit = e.splits?.find((s: any) => s.debtor_id === user?.id);
    return sum + (ownSplit ? Number(ownSplit.amount) || 0 : 0);
  }, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }}>
      {/* Scrollable Container */}
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 50 }}>
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
          <View className="flex-row bg-[#151E2E] border-[0.5px] border-white/5 rounded-xl p-1 shadow-md">
            {([
              { id: "today", label: "Today" },
              { id: "week", label: "This Week" },
              { id: "month", label: "This Month" },
              { id: "last_month", label: "Last Month" },
              { id: "year", label: "This Year" },
              { id: "all", label: "All Time" },
            ] as const).map((opt) => (
              <TouchableOpacity
                key={opt.id}
                onPress={() => {
                  Theme.haptics.light();
                  setFilter(opt.id);
                }}
                className={`px-3.5 py-2 rounded-lg items-center justify-center mr-1 ${
                  filter === opt.id ? "bg-white/5 border border-white/10" : ""
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    filter === opt.id ? "text-[#14E5D4]" : "text-[#94A3B8]"
                  }`}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Warning Banner */}
        {showWarning && (
          <View className={`flex-row items-center border-[0.5px] p-4 rounded-2xl mb-6 shadow-md ${warnBg}`}>
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
                <Text className="text-white text-xl font-black mt-1">₹ {totalSpentCurMonth.toFixed(0)}</Text>
              </View>
              <View className="items-end">
                <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-widest">
                  Budget Limit
                </Text>
                <Text className="text-[#14E5D4] text-xl font-black mt-1">₹ {budgetLimit.toFixed(0)}</Text>
              </View>
            </View>
            <View className="h-2 bg-white/5 rounded-full overflow-hidden mb-2 border-[0.5px] border-white/5">
              <View
                className={`h-full rounded-full ${
                  isExceeded ? "bg-[#EF4444]" : usagePercentage >= 85 ? "bg-[#F59E0B]" : "bg-[#14E5D4]"
                }`}
                style={{ width: `${Math.min(100, usagePercentage)}%` }}
              />
            </View>
            <View className="flex-row justify-between">
              <Text className="text-[#94A3B8] text-[8px] font-bold uppercase">
                {usagePercentage.toFixed(0)}% Utilized
              </Text>
              <Text className={`text-[8px] font-bold uppercase ${isExceeded ? "text-[#EF4444]" : "text-[#14E5D4]"}`}>
                {isExceeded ? "Exceeded Limit" : `₹ ${remainingBudget.toFixed(0)} Remaining`}
              </Text>
            </View>
          </View>
        )}

        {/* Global Empty State validation */}
        {stats.totalExpenses === 0 ? (
          <View className="py-16 items-center justify-center px-6 bg-[#151E2E] rounded-3xl border-[0.5px] border-white/5 shadow-lg mb-6">
            <Text className="text-3xl mb-4">📊</Text>
            <Text className="text-white text-lg font-black text-center mb-2">
              No Analytics Data Found
            </Text>
            <Text className="text-[#94A3B8] text-xs text-center leading-relaxed mb-6">
              There is no recorded spending in this time range. Try choosing a different filter, create a new group, or add your first expense split!
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
          <>
            {/* Overview Stats Cards Grid */}
            <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-widest mb-3">
              Overview Summary
            </Text>
            <View className="flex-row flex-wrap justify-between mb-6">
              {[
                { label: "Total Spent", val: `₹${stats.totalExpenses.toFixed(0)}`, color: "text-white" },
                { label: "You Paid", val: `₹${stats.totalYouPaid.toFixed(0)}`, color: "text-[#14E5D4]" },
                { label: "You Owe", val: `₹${stats.totalYouOwe.toFixed(0)}`, color: "text-[#EF4444]" },
                { label: "You Owed", val: `₹${stats.totalYouAreOwed.toFixed(0)}`, color: "text-[#22C55E]" },
                {
                  label: "Net Balance",
                  val: `${stats.netBalance >= 0 ? "+" : "-"}₹${Math.abs(stats.netBalance).toFixed(0)}`,
                  color: stats.netBalance >= 0.01 ? "text-[#22C55E]" : stats.netBalance < -0.01 ? "text-[#EF4444]" : "text-white",
                },
                { label: "Transactions", val: stats.numTransactions.toString(), color: "text-white" },
                { label: "Settlements", val: stats.numSettlements.toString(), color: "text-white" },
                { label: "Active Groups", val: groupIds.length.toString(), color: "text-white" },
              ].map((c) => (
                <View
                  key={c.label}
                  style={{ width: "48%" }}
                  className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-4 mb-3 shadow-md"
                >
                  <Text className="text-[#94A3B8] text-[8px] font-bold uppercase tracking-wider mb-1">
                    {c.label}
                  </Text>
                  <Text className={`text-base font-black ${c.color}`}>{c.val}</Text>
                </View>
              ))}
            </View>

            {/* Daily Trend Line Area Chart */}
            <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-widest mb-3">
              Daily Spending Trend (Last 7 Days)
            </Text>
            <View className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-5 mb-6 shadow-md items-center">
              {(() => {
                const chartHeight = 110;
                const chartWidth = 280;
                const maxVal = Math.max(...dailyTrend.map((d) => d.amount), 1);

                // Compute SVG coordinates
                const points = dailyTrend.map((d, i) => {
                  const x = (i / 6) * chartWidth;
                  const y = chartHeight - (d.amount / maxVal) * (chartHeight - 30) - 15;
                  return { x, y };
                });

                const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
                const fillPath = `${linePath} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`;

                return (
                  <View style={{ width: "100%" }}>
                    <Svg height={chartHeight + 25} width={chartWidth + 20} className="self-center">
                      <Defs>
                        <LinearGradient id="glowingArea" x1="0" y1="0" x2="0" y2="1">
                          <Stop offset="0%" stopColor="#14E5D4" stopOpacity={0.25} />
                          <Stop offset="100%" stopColor="#14E5D4" stopOpacity={0} />
                        </LinearGradient>
                      </Defs>
                      {/* Grid Horizontal Guide Lines */}
                      {[0.25, 0.5, 0.75, 1].map((p, idx) => (
                        <Path
                          key={idx}
                          d={`M 0 ${chartHeight * p} L ${chartWidth} ${chartHeight * p}`}
                          stroke="rgba(255, 255, 255, 0.03)"
                          strokeWidth={1}
                        />
                      ))}
                      {/* Gradient Fill */}
                      <Path d={fillPath} fill="url(#glowingArea)" />
                      {/* Trend Line */}
                      <Path d={linePath} fill="none" stroke="#14E5D4" strokeWidth={2.5} />
                      {/* Interactive Point Indicators */}
                      {points.map((p, i) => (
                        <Circle key={i} cx={p.x} cy={p.y} r={3} fill="#14E5D4" stroke="#0B1220" strokeWidth={1} />
                      ))}
                    </Svg>
                    {/* Bottom Label Names */}
                    <View className="flex-row justify-between mt-1 px-1">
                      {dailyTrend.map((d, i) => (
                        <Text key={i} className="text-[#94A3B8] text-[8px] font-bold uppercase w-10 text-center">
                          {d.label}
                        </Text>
                      ))}
                    </View>
                  </View>
                );
              })()}
            </View>

            {/* Category Pie & Group Horizontal Stack */}
            <View className="flex-row justify-between mb-6">
              {/* Category Donut/Pie Chart */}
              <View style={{ width: "48%" }} className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-4 shadow-md items-center justify-between">
                <Text className="text-[#94A3B8] text-[8px] font-bold uppercase tracking-wider mb-3 self-start">
                  Category Breakdown
                </Text>
                {categorySpending.length > 0 ? (
                  <View className="items-center w-full">
                    <Svg height={100} width={100}>
                      {(() => {
                        let cumulativePercent = 0;
                        return categorySpending.map((cat, idx) => {
                          const percent = cat.amount / stats.totalExpenses;
                          const path = getSlicePath(cumulativePercent, cumulativePercent + percent, 50);
                          cumulativePercent += percent;
                          return <Path key={idx} d={path} fill={cat.color} />;
                        });
                      })()}
                    </Svg>
                    <View className="mt-3 w-full space-y-1">
                      {categorySpending.slice(0, 3).map((cat) => (
                        <View key={cat.name} className="flex-row items-center">
                          <View style={{ backgroundColor: cat.color }} className="w-2 h-2 rounded-full mr-1.5" />
                          <Text className="text-white text-[8px] font-semibold flex-1" numberOfLines={1}>
                            {cat.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : (
                  <Text className="text-[#94A3B8] text-[8px] italic py-8">No category data</Text>
                )}
              </View>

              {/* Group-wise Spending */}
              <View style={{ width: "48%" }} className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-4 shadow-md">
                <Text className="text-[#94A3B8] text-[8px] font-bold uppercase tracking-wider mb-3">
                  Group Spending
                </Text>
                {groupSpending.length > 0 ? (
                  <ScrollView style={{ maxHeight: 130 }} showsVerticalScrollIndicator={false} className="space-y-3">
                    {groupSpending.map((grp) => {
                      const grpPercent = stats.totalExpenses > 0 ? (grp.amount / stats.totalExpenses) * 100 : 0;
                      return (
                        <View key={grp.name} className="mb-2">
                          <View className="flex-row justify-between items-center mb-0.5">
                            <Text className="text-white text-[8px] font-bold flex-1" numberOfLines={1}>
                              {grp.name}
                            </Text>
                            <Text className="text-[#14E5D4] text-[8px] font-black">
                              ₹{grp.amount.toFixed(0)}
                            </Text>
                          </View>
                          <View className="h-1 bg-white/5 rounded-full overflow-hidden">
                            <View style={{ width: `${grpPercent}%` }} className="h-full bg-[#14E5D4] rounded-full" />
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <View className="flex-1 justify-center items-center py-8">
                    <Text className="text-[#94A3B8] text-[8px] italic">No group splits spending</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Personal vs Group & Weekly breakdown */}
            <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-widest mb-3">
              Personal vs Group & Weekly breakdown
            </Text>
            <View className="flex-row justify-between mb-6">
              {/* Personal vs Group Split Donut */}
              <View style={{ width: "48%" }} className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-4 shadow-md items-center justify-between">
                <Text className="text-[#94A3B8] text-[8px] font-bold uppercase tracking-wider mb-2 self-start">
                  Personal vs Group
                </Text>
                {personalTotal + groupTotal > 0 ? (
                  <View className="items-center">
                    <Svg height={90} width={90}>
                      {(() => {
                        const total = personalTotal + groupTotal;
                        const persPercent = personalTotal / total;

                        const pathPers = getSlicePath(0, persPercent, 45);
                        const pathGrp = getSlicePath(persPercent, 1.0, 45);

                        return (
                          <>
                            <Path d={pathPers} fill="#14E5D4" />
                            <Path d={pathGrp} fill="#FF9F1C" />
                            {/* Inner circle for donut styling */}
                            <Circle cx={45} cy={45} r={22} fill="#151E2E" />
                          </>
                        );
                      })()}
                    </Svg>
                    <View className="flex-row space-x-2 mt-2 justify-center w-full">
                      <View className="flex-row items-center">
                        <View className="w-1.5 h-1.5 bg-[#14E5D4] rounded-full mr-1" />
                        <Text className="text-white text-[7px]">Pers</Text>
                      </View>
                      <View className="flex-row items-center">
                        <View className="w-1.5 h-1.5 bg-[#FF9F1C] rounded-full mr-1" />
                        <Text className="text-white text-[7px]">Group</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <Text className="text-[#94A3B8] text-[8px] italic py-8">No data found</Text>
                )}
              </View>

              {/* Weekly bar columns list */}
              <View style={{ width: "48%" }} className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-4 shadow-md justify-between">
                <Text className="text-[#94A3B8] text-[8px] font-bold uppercase tracking-wider mb-2">
                  Weekly Spending
                </Text>
                <View className="flex-row justify-around items-end h-24 pt-2">
                  {(() => {
                    const maxWk = Math.max(...weeklyTrend.map((w) => w.amount), 1);
                    return weeklyTrend.map((wk, idx) => {
                      const barHt = (wk.amount / maxWk) * 60; // Max 60px height
                      return (
                        <View key={idx} className="items-center">
                          <Text className="text-white text-[7px] font-bold mb-1">
                            ₹{wk.amount.toFixed(0)}
                          </Text>
                          <View
                            style={{ height: Math.max(4, barHt) }}
                            className="w-4 bg-[#14E5D4] rounded-t-sm"
                          />
                          <Text className="text-[#94A3B8] text-[7px] font-bold mt-1.5">
                            {wk.label}
                          </Text>
                        </View>
                      );
                    });
                  })()}
                </View>
              </View>
            </View>

            {/* Monthly Trend Comparative columns */}
            <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-widest mb-3">
              Monthly Trend (Last 6 Months)
            </Text>
            <View className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-5 mb-6 shadow-md">
              <View className="flex-row justify-around items-end h-28 pt-2">
                {(() => {
                  const maxMth = Math.max(...monthlyTrend.map((m) => m.amount), 1);
                  return monthlyTrend.map((mth, idx) => {
                    const barHt = (mth.amount / maxMth) * 65; // Max 65px height
                    return (
                      <View key={idx} className="items-center">
                        <Text className="text-white text-[8px] font-bold mb-1">
                          ₹{mth.amount.toFixed(0)}
                        </Text>
                        <View
                          style={{ height: Math.max(4, barHt) }}
                          className="w-5 bg-[#14E5D4] rounded-t-sm"
                        />
                        <Text className="text-[#94A3B8] text-[8px] font-bold mt-1.5">
                          {mth.label}
                        </Text>
                      </View>
                    );
                  });
                })()}
              </View>
            </View>

            {/* Insights highlights section */}
            <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-widest mb-3">
              Key Spending Insights
            </Text>
            <View className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-5 mb-6 shadow-md space-y-3">
              {[
                { title: "Highest Category", desc: insights.highestCategory, icon: "🏷️" },
                { title: "Highest Spending Group", desc: insights.highestGroup, icon: "👥" },
                { title: "Most Active Group", desc: insights.mostActiveGroup, icon: "🔥" },
                { title: "Average Expense Amount", desc: `₹ ${insights.averageExpense.toFixed(0)}`, icon: "📈" },
                { title: "Biggest Single Expense", desc: `₹ ${insights.biggestSingleExpense.toFixed(0)}`, icon: "💎" },
                { title: "Expenses This Month", desc: `${insights.numExpensesThisMonth} transactions`, icon: "📅" },
              ].map((inst) => (
                <View key={inst.title} className="flex-row items-center py-1.5 border-b-[0.5px] border-white/5">
                  <Text className="text-sm mr-2.5">{inst.icon}</Text>
                  <Text className="text-[#94A3B8] text-xs flex-1">{inst.title}</Text>
                  <Text className="text-white text-xs font-bold">{inst.desc}</Text>
                </View>
              ))}
            </View>
          </>
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
                      <Text className="text-[#0B1220] font-black text-base ml-2">Save Budget Limit</Text>
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
