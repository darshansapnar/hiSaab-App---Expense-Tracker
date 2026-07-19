import React, { useState, useEffect } from "react";
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
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  X,
  Check,
  Save,
  Activity,
  Layers,
} from "lucide-react-native";
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
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);

  const [isEditOpen, setIsEditOpen] = useState(false);

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

  // 2. Fetch personal expenses (past 60 days to calculate month-over-month trends)
  const { data: personalExpenses, isLoading: isPersonalLoading } = useQuery({
    queryKey: ["personal-expenses-60d", user?.id],
    queryFn: async () => {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const { data, error } = await supabase
        .from("personal_expenses")
        .select("*, category:categories(*)")
        .eq("profile_id", user?.id)
        .gte("expense_date", sixtyDaysAgo.toISOString());

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user?.id,
  });

  // 3. Fetch group splits (past 60 days to calculate group shares and trends)
  const { data: groupSplits, isLoading: isSplitsLoading } = useQuery({
    queryKey: ["group-splits-60d", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_splits")
        .select("amount, expense:expenses(description, expense_date, group_id, group:groups(name), category:categories(*))")
        .eq("debtor_id", user?.id);

      if (error) throw error;

      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      return (data || []).filter((item: any) => {
        return item.expense && new Date(item.expense.expense_date) >= sixtyDaysAgo;
      }) as any[];
    },
    enabled: !!user?.id,
  });

  const {
    control,
    handleSubmit,
    setValue,
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

  if (isBudgetLoading || isPersonalLoading || isSplitsLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#00F5D4" />
      </View>
    );
  }

  // --- TIME RANGE CALCULATIONS ---
  const now = new Date();
  
  // Current month bounds
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Previous month bounds
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  // --- FILTER & SUM SPENDING ---
  // Personal current month
  const curPersonal = personalExpenses?.filter((e) => new Date(e.expense_date) >= currentMonthStart) || [];
  const curPersonalTotal = curPersonal.reduce((sum, e) => sum + Number(e.amount), 0);

  // Personal previous month
  const prevPersonal = personalExpenses?.filter((e) => {
    const d = new Date(e.expense_date);
    return d >= prevMonthStart && d <= prevMonthEnd;
  }) || [];
  const prevPersonalTotal = prevPersonal.reduce((sum, e) => sum + Number(e.amount), 0);

  // Group splits current month
  const curSplits = groupSplits?.filter((s) => new Date(s.expense.expense_date) >= currentMonthStart) || [];
  const curSplitsTotal = curSplits.reduce((sum, s) => sum + Number(s.amount), 0);

  // Group splits previous month
  const prevSplits = groupSplits?.filter((s) => {
    const d = new Date(s.expense.expense_date);
    return d >= prevMonthStart && d <= prevMonthEnd;
  }) || [];
  const prevSplitsTotal = prevSplits.reduce((sum, s) => sum + Number(s.amount), 0);

  // Aggregated totals
  const totalSpentCurMonth = curPersonalTotal + curSplitsTotal;
  const totalSpentPrevMonth = prevPersonalTotal + prevSplitsTotal;

  // Monthly trends metrics
  const spendingDifference = totalSpentCurMonth - totalSpentPrevMonth;
  const trendPercentage = totalSpentPrevMonth > 0 ? (spendingDifference / totalSpentPrevMonth) * 100 : 0;
  const isSpendingUp = spendingDifference > 0;

  // --- BUDGET ANALYSIS ---
  const budgetLimit = budget?.monthly_limit ? Number(budget.monthly_limit) : 0;
  const remainingBudget = Math.max(0, budgetLimit - totalSpentCurMonth);
  const isExceeded = totalSpentCurMonth > budgetLimit;
  const usagePercentage = budgetLimit > 0 ? (totalSpentCurMonth / budgetLimit) * 100 : 0;

  // Daily Allowance calculations
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const remainingDays = Math.max(1, daysInMonth - currentDay);
  
  const dailyAverageSpent = currentDay > 0 ? totalSpentCurMonth / currentDay : 0;
  const targetDailyLimit = budgetLimit > 0 ? budgetLimit / daysInMonth : 0;
  const recommendedDailySpent = remainingBudget / remainingDays;

  // Trigger monthly summary wrap once per month
  useEffect(() => {
    const checkMonthlySummary = async () => {
      try {
        const curMonthStr = new Date().toISOString().substring(0, 7); // "YYYY-MM"
        const lastSummaryMonth = await AsyncStorage.getItem("last_monthly_summary_month");
        
        if (lastSummaryMonth !== curMonthStr) {
          await triggerWittyNotification("monthly_summary", "Monthly Wrap");
          await AsyncStorage.setItem("last_monthly_summary_month", curMonthStr);
        }
      } catch (e) {
        // Ignore
      }
    };
    checkMonthlySummary();
  }, []);

  // Trigger budget warning if limit is exceeded
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
      } catch (e) {
        // Ignore
      }
    };
    checkBudgetWarning();
  }, [totalSpentCurMonth, budgetLimit]);

  // --- GROUP SPENDING BREAKDOWN ---
  const groupSpendingBreakdown: Record<string, number> = {};
  curSplits.forEach((s) => {
    const groupName = s.expense?.group?.name || "Other Group";
    groupSpendingBreakdown[groupName] = (groupSpendingBreakdown[groupName] || 0) + Number(s.amount);
  });

  // --- CATEGORY SPENDING BREAKDOWN ---
  const categorySpending: Record<string, { amount: number; color: string }> = {};

  curPersonal.forEach((exp) => {
    const catName = exp.category?.name || "Other";
    if (!categorySpending[catName]) {
      categorySpending[catName] = { amount: 0, color: exp.category?.color_code || "#00F5D4" };
    }
    categorySpending[catName].amount += Number(exp.amount);
  });

  curSplits.forEach((split) => {
    const catName = split.expense?.category?.name || "Other";
    if (!categorySpending[catName]) {
      categorySpending[catName] = { amount: 0, color: split.expense?.category?.color_code || "#00F5D4" };
    }
    categorySpending[catName].amount += Number(split.amount);
  });

  const sortedCategories = Object.entries(categorySpending)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount);

  // Warning metrics configurations
  const showWarning = usagePercentage >= 80 && budgetLimit > 0;
  let warnColor = "text-accentCyan";
  let warnIconColor = "#00F5D4";
  let warnBg = "bg-accentCyan/10 border-accentCyan/20";
  let warnText = `You have used ${usagePercentage.toFixed(0)}% of your monthly budget limit.`;

  if (isExceeded) {
    warnColor = "text-accentPink";
    warnIconColor = "#FF007F";
    warnBg = "bg-accentPink/10 border-accentPink/20";
    warnText = `Warning: Monthly budget limit exceeded by ₹${(totalSpentCurMonth - budgetLimit).toFixed(2)}!`;
  } else if (usagePercentage >= 90) {
    warnColor = "text-amber-500";
    warnIconColor = "#F59E0B";
    warnBg = "bg-amber-500/10 border-amber-500/20";
    warnText = `Caution: Budget usage is currently at ${usagePercentage.toFixed(0)}%!`;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0D0D0D" }}>
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 50 }}>
        {/* Header */}
      <View className="flex-row justify-between items-center mb-8">
        <Text className="text-3xl font-black text-white tracking-tighter">Analytics</Text>
        <TouchableOpacity
          onPress={() => {
            Theme.haptics.light();
            setIsEditOpen(true);
          }}
          className="bg-surfaceLight border-[0.5px] border-border px-4 py-2 rounded-xl"
        >
          <Text className="text-white text-xs font-bold">Set Budget</Text>
        </TouchableOpacity>
      </View>

      {/* WARNING BANNER CONTAINER */}
      {showWarning && (
        <View className={`flex-row items-center border-[0.5px] p-4 rounded-xl mb-6 ${warnBg}`}>
          <AlertTriangle size={18} color={warnIconColor} />
          <Text className={`text-xs font-semibold ml-2.5 flex-1 leading-relaxed ${warnColor}`}>
            {warnText}
          </Text>
        </View>
      )}

      {/* MONTHLY BUDGET ANALYSIS SUMMARY */}
      <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 mb-6">
        <View className="flex-row justify-between mb-4">
          <View>
            <Text className="text-accentGray text-[10px] font-bold uppercase tracking-widest">
              Spent Total (Current Month)
            </Text>
            <Text className="text-white text-2xl font-black mt-1">₹ {totalSpentCurMonth.toFixed(2)}</Text>
          </View>
          <View className="items-end">
            <Text className="text-accentGray text-[10px] font-bold uppercase tracking-widest">
              Limit Goal
            </Text>
            <Text className="text-accentCyan text-2xl font-black mt-1">
              ₹ {budgetLimit.toFixed(0)}
            </Text>
          </View>
        </View>

        {/* Progress Bar meter */}
        <View className="h-2.5 bg-surfaceLight rounded-full overflow-hidden mb-3">
          <View
            className={`h-full rounded-full ${
              isExceeded ? "bg-accentPink" : usagePercentage >= 85 ? "bg-amber-500" : "bg-accentCyan"
            }`}
            style={{ width: `${Math.min(100, usagePercentage)}%` }}
          />
        </View>

        <View className="flex-row justify-between mt-2">
          <Text className="text-accentGray text-[10px]">
            {usagePercentage.toFixed(0)}% Utilized
          </Text>
          <Text className={`text-[10px] font-bold ${isExceeded ? "text-accentPink" : "text-accentCyan"}`}>
            {isExceeded ? "Exceeded" : `₹ ${remainingBudget.toFixed(2)} Remaining`}
          </Text>
        </View>
      </View>

      {/* MONTHLY TRENDS COMPARSION CARD */}
      <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 mb-6">
        <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-3">
          Monthly Trends
        </Text>
        <View className="flex-row justify-between items-center mb-4">
          <View>
            <Text className="text-accentGray text-[9px] uppercase">Last Month</Text>
            <Text className="text-white text-lg font-bold">₹ {totalSpentPrevMonth.toFixed(2)}</Text>
          </View>
          <View className="items-center">
            {isSpendingUp ? (
              <View className="flex-row items-center bg-accentPink/10 border-[0.5px] border-accentPink/20 px-3 py-1 rounded-lg">
                <TrendingUp size={14} color="#FF007F" />
                <Text className="text-accentPink text-xs font-bold ml-1">
                  +{trendPercentage.toFixed(0)}% Up
                </Text>
              </View>
            ) : (
              <View className="flex-row items-center bg-accentCyan/10 border-[0.5px] border-accentCyan/20 px-3 py-1 rounded-lg">
                <TrendingDown size={14} color="#00F5D4" />
                <Text className="text-accentCyan text-xs font-bold ml-1">
                  {trendPercentage.toFixed(0)}% Down
                </Text>
              </View>
            )}
          </View>
        </View>
        <Text className="text-accentGray text-[10px] leading-relaxed">
          {isSpendingUp
            ? `Your spending is up by ₹${spendingDifference.toFixed(0)} compared to last month. Consider cutting down on non-essential categories.`
            : `Great job! Your spending decreased by ₹${Math.abs(spendingDifference).toFixed(0)} compared to last month. Keep it up.`}
        </Text>
      </View>

      {/* BIGGEST CATEGORY HIGHLIGHT CARD */}
      {sortedCategories.length > 0 && (
        <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 mb-6">
          <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-3">
            Biggest Category
          </Text>
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-white text-base font-black">{sortedCategories[0].name}</Text>
              <Text className="text-accentGray text-[10px] mt-1">Where most of your rupees went</Text>
            </View>
            <Text className="text-accentPink text-lg font-black">
              ₹ {sortedCategories[0].amount.toFixed(0)}
            </Text>
          </View>
        </View>
      )}

      {/* CATEGORY CHARTS BREAKDOWN */}
      <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-4">
        Category Spending
      </Text>
      <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 space-y-4 mb-6">
        {sortedCategories.map((item) => {
          const catPercentage = totalSpentCurMonth > 0 ? (item.amount / totalSpentCurMonth) * 100 : 0;
          return (
            <View key={item.name} className="space-y-1.5 pb-2 border-b-[0.5px] border-neutral-900">
              <View className="flex-row justify-between items-center">
                <View className="flex-row items-center">
                  <Text className="text-xs font-semibold text-white">{item.name}</Text>
                  <Text className="text-accentGray text-[10px] ml-2">
                    ({catPercentage.toFixed(0)}%)
                  </Text>
                </View>
                <Text className="text-white text-xs font-bold">₹ {item.amount.toFixed(2)}</Text>
              </View>
              <View className="h-1 bg-surfaceLight rounded-full overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{ width: `${catPercentage}%`, backgroundColor: item.color }}
                />
              </View>
            </View>
          );
        })}
        {sortedCategories.length === 0 && (
          <Text className="text-accentGray text-xs text-center py-4">No spending recorded.</Text>
        )}
      </View>

      {/* BUDGET CONFIG MODAL */}
      <Modal visible={isEditOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-surface border-t-[0.5px] border-border rounded-t-3xl p-6 pb-10">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-white">Monthly Budget Goal</Text>
              <TouchableOpacity
                onPress={() => setIsEditOpen(false)}
                className="w-8 h-8 justify-center items-center rounded-full bg-surfaceLight"
              >
                <X size={16} color="#A3A3A3" />
              </TouchableOpacity>
            </View>

            <View className="space-y-4">
              <View>
                <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
                  Budget Limit Amount
                </Text>
                <View className="flex-row items-center bg-surfaceLight border-[0.5px] border-border rounded-xl px-4 py-3">
                  <Text className="text-accentCyan font-bold text-lg mr-2">₹</Text>
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
                  <Text className="text-accentPink text-xs mt-1">{errors.limit.message}</Text>
                )}
              </View>

              <TouchableOpacity
                onPress={handleSubmit((data) => budgetMutation.mutate(data))}
                disabled={budgetMutation.isPending}
                className="flex-row bg-accentCyan py-4 rounded-xl justify-center items-center active:opacity-90 mt-4"
              >
                {budgetMutation.isPending ? (
                  <ActivityIndicator size="small" color="#0D0D0D" />
                ) : (
                  <>
                    <Save size={18} color="#0D0D0D" />
                    <Text className="text-background font-black text-base ml-2">Save Budget Limit</Text>
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
