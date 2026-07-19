import React, { useState, useEffect, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../store/authStore";
import { supabase } from "../../services/supabase";
import { useToastStore } from "../../store/toastStore";
import { Theme } from "../../constants/Theme";
import { triggerWittyNotification } from "../../services/wittyNotifications";
import {
  ChevronLeft,
  Plus,
  Search,
  X,
  Trash2,
  Edit,
  Save,
  Info,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  Copy
} from "lucide-react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const taglines = [
  "Paisa gaya, record toh karo 😅",
  "Chai peene se pehle expense add kar 😄",
  "Future wala tum thank you bolega.",
  "Kharcha likh, tension nahi.",
  "Salary nahi hai, hisaab toh hai.",
  "Bro... ₹20 bhi count hota hai.",
  "Control your spending before your spending controls you.",
  "Kharcha kam, savings zyada."
];

// Cleaned up local successMessages in favor of centralized witty notifications

const getCategoryEmoji = (catName: string) => {
  const name = catName.toLowerCase();
  if (name.includes("food") || name.includes("eat") || name.includes("restaurant") || name.includes("utensil")) return "🍕";
  if (name.includes("rent") || name.includes("home") || name.includes("flat") || name.includes("room")) return "🏠";
  if (name.includes("travel") || name.includes("cab") || name.includes("ride") || name.includes("auto") || name.includes("fuel")) return "🚗";
  if (name.includes("tiffin")) return "🍱";
  if (name.includes("shopping") || name.includes("clothes") || name.includes("grocer")) return "🛒";
  if (name.includes("bill") || name.includes("recharge") || name.includes("electricity")) return "⚡";
  return "💸";
};

const personalExpenseSchema = z.object({
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  description: z
    .string()
    .max(100, "Description must be under 100 characters")
    .optional()
    .or(z.literal("")),
  categoryId: z.string().uuid("Please select a category"),
});

type PersonalExpenseSchema = z.infer<typeof personalExpenseSchema>;

export default function PersonalExpenses() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);

  const [tagline, setTagline] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");

  const [isOpen, setIsOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [longPressedExpense, setLongPressedExpense] = useState<any | null>(null);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

  useEffect(() => {
    const randomTag = taglines[Math.floor(Math.random() * taglines.length)];
    setTagline(randomTag);
  }, []);

  // 1. Fetch personal expenses listing
  const { data: expenses, isLoading: isExpensesLoading, refetch, isRefetching } = useQuery({
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
  });

  // 2. Fetch categories
  const { data: categories, isLoading: isCategoriesLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  // 3. Fetch budget
  const { data: budget } = useQuery({
    queryKey: ["budget", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("profile_id", user?.id)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data || null;
    },
    enabled: !!user?.id,
  });

  const {
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<PersonalExpenseSchema>({
    resolver: zodResolver(personalExpenseSchema),
    defaultValues: {
      amount: "",
      description: "",
      categoryId: "",
    },
  });

  const handleOpenAdd = () => {
    Theme.haptics.light();
    setEditingExpense(null);
    reset({
      amount: "",
      description: "",
      categoryId: categories?.[0]?.id || "",
    });
    setIsOpen(true);
  };

  const handleOpenEdit = (expense: any) => {
    Theme.haptics.light();
    setEditingExpense(expense);
    reset({
      amount: expense.amount.toString(),
      description: expense.description,
      categoryId: expense.category_id,
    });
    setIsOpen(true);
  };

  const handleQuickAdd = (type: "tea" | "biscuit") => {
    Theme.haptics.light();
    const foodCategory = categories?.find(
      (cat: any) => cat.name.toLowerCase().includes("food") || cat.name.toLowerCase().includes("eat")
    );
    const catId = foodCategory ? foodCategory.id : (categories?.[0]?.id || "");
    
    setEditingExpense(null);
    reset({
      amount: type === "tea" ? "10" : "5",
      description: type === "tea" ? "Tea" : "Biscuit",
      categoryId: catId,
    });
    setIsOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: PersonalExpenseSchema) => {
      const categoryName = categories?.find((c: any) => c.id === data.categoryId)?.name || "Expense";
      const payload = {
        profile_id: user?.id,
        amount: Number(data.amount),
        description: data.description?.trim() || categoryName,
        category_id: data.categoryId,
      };

      if (editingExpense) {
        const { error } = await supabase
          .from("personal_expenses")
          .update(payload)
          .eq("id", editingExpense.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("personal_expenses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["personal-expenses", user?.id] });
      triggerWittyNotification(editingExpense ? "expense_updated" : "expense_added", editingExpense ? "Expense Updated" : "Expense Added");
      setIsOpen(false);
      reset();
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to save expense", "error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("personal_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["personal-expenses", user?.id] });
      triggerWittyNotification("expense_deleted", "Expense Deleted");
      setIsOpen(false);
      setIsActionMenuOpen(false);
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to delete expense", "error");
    },
  });

  const handleDuplicate = async (expense: any) => {
    Theme.haptics.medium();
    const payload = {
      profile_id: user?.id,
      amount: expense.amount,
      description: `${expense.description} (Copy)`,
      category_id: expense.category_id,
    };
    const { error } = await supabase.from("personal_expenses").insert(payload);
    if (error) {
      showToast("Failed to duplicate expense", "error");
    } else {
      queryClient.invalidateQueries({ queryKey: ["personal-expenses", user?.id] });
      triggerWittyNotification("expense_added", "Expense Duplicated");
    }
    setIsActionMenuOpen(false);
  };

  // --- STATS CALCULATIONS ---
  const dashboardStats = useMemo(() => {
    let monthlyTotal = 0;
    let todayTotal = 0;
    let weeklyTotal = 0;
    let totalTransactions = expenses?.length || 0;
    let biggestExpense = 0;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    expenses?.forEach((exp) => {
      const amt = Number(exp.amount) || 0;
      const date = new Date(exp.expense_date);

      // Monthly Spent
      if (date >= startOfMonth) {
        monthlyTotal += amt;
      }

      // Today Spent
      const expDay = new Date(exp.expense_date);
      expDay.setHours(0, 0, 0, 0);
      if (expDay.getTime() === today.getTime()) {
        todayTotal += amt;
      }

      // Weekly Spent
      if (date >= oneWeekAgo) {
        weeklyTotal += amt;
      }

      // Biggest Expense
      if (amt > biggestExpense) {
        biggestExpense = amt;
      }
    });

    const currentDay = new Date().getDate();
    const dailyAverage = currentDay > 0 ? monthlyTotal / currentDay : 0;
    const moneyLeft = budget ? Number(budget.amount) - monthlyTotal : null;

    return {
      monthlyTotal,
      todayTotal,
      weeklyTotal,
      totalTransactions,
      biggestExpense,
      dailyAverage,
      moneyLeft,
    };
  }, [expenses, budget]);

  // MONTHLY DYNAMIC INSIGHTS ENGINE
  const insights = useMemo(() => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyExpenses = expenses?.filter((exp) => new Date(exp.expense_date) >= startOfMonth) || [];

    if (monthlyExpenses.length === 0) {
      return null;
    }

    let totalSpent = 0;
    let biggestExpense = 0;
    
    // Unique days count
    const uniqueDays = new Set<string>();
    
    // Category mapping
    const catMap: Record<string, number> = {};

    monthlyExpenses.forEach((exp) => {
      const amt = Number(exp.amount) || 0;
      totalSpent += amt;

      // Biggest single cost
      if (amt > biggestExpense) {
        biggestExpense = amt;
      }

      // Track unique days (date part only)
      if (exp.expense_date) {
        const dayStr = exp.expense_date.split("T")[0];
        uniqueDays.add(dayStr);
      }

      // Track category totals
      const catName = exp.category?.name || "Other";
      catMap[catName] = (catMap[catName] || 0) + amt;
    });

    const daysCount = uniqueDays.size;
    const avgDailySpending = daysCount > 0 ? totalSpent / daysCount : 0;

    // Most spent category
    let topCategory = "";
    let maxCatAmt = 0;
    Object.entries(catMap).forEach(([name, amt]) => {
      if (amt > maxCatAmt) {
        maxCatAmt = amt;
        topCategory = name;
      }
    });

    return {
      totalSpent,
      avgDailySpending,
      topCategory: topCategory ? `${topCategory} ${getCategoryEmoji(topCategory)}` : "Other 💸",
      biggestExpense,
    };
  }, [expenses]);

  // FILTERED LEDGER LIST
  const filteredExpenses = useMemo(() => {
    return expenses?.filter((exp) => {
      const matchesSearch = exp.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategoryFilter
        ? exp.category_id === selectedCategoryFilter
        : true;

      const date = new Date(exp.expense_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let matchesDate = true;
      if (dateFilter === "today") {
        const expDay = new Date(exp.expense_date);
        expDay.setHours(0, 0, 0, 0);
        matchesDate = expDay.getTime() === today.getTime();
      } else if (dateFilter === "week") {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        matchesDate = date >= oneWeekAgo;
      } else if (dateFilter === "month") {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        matchesDate = date >= startOfMonth;
      }

      return matchesSearch && matchesCategory && matchesDate;
    });
  }, [expenses, searchQuery, selectedCategoryFilter, dateFilter]);



  const formatRupees = (amount: number) => {
    return `₹${amount.toLocaleString("en-IN")}`;
  };

  if (isExpensesLoading || isCategoriesLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0B1220" }} className="justify-center items-center">
        <ActivityIndicator size="large" color="#14E5D4" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }}>
      {/* Scrollable Container with Pull-to-Refresh */}
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#14E5D4" />
        }
      >
        {/* Navigation & Header */}
        <View className="flex-row justify-between items-center mt-2 mb-6">
          <TouchableOpacity
            onPress={() => {
              Theme.haptics.light();
              router.back();
            }}
            className="p-1 rounded-full bg-[#151E2E] border-[0.5px] border-white/10"
          >
            <ChevronLeft size={20} color="#14E5D4" />
          </TouchableOpacity>
          <View className="items-center">
            <Text className="text-white text-lg font-bold">My Expenses</Text>
            <Text className="text-[#94A3B8] text-[10px] mt-0.5">{tagline || "Every rupee has a story 💸"}</Text>
          </View>
          <View className="w-8" />
        </View>

        {/* Monthly Spending Banner */}
        <View className="bg-[#151E2E] border-[0.5px] border-white/5 p-6 rounded-2xl mb-6 shadow-xl">
          <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest">Monthly Spending</Text>
          <Text className="text-[#14E5D4] text-3xl font-black mt-2">
            {formatRupees(dashboardStats.monthlyTotal)}
          </Text>
          <View className="flex-row justify-between mt-4 pt-4 border-t border-white/5">
            <View>
              <Text className="text-[#94A3B8] text-[9px] uppercase tracking-wider">Spent Today</Text>
              <Text className="text-white text-sm font-bold mt-1">{formatRupees(dashboardStats.todayTotal)}</Text>
            </View>
            <View className="items-center">
              <Text className="text-[#94A3B8] text-[9px] uppercase tracking-wider">Weekly Spent</Text>
              <Text className="text-white text-sm font-bold mt-1">{formatRupees(dashboardStats.weeklyTotal)}</Text>
            </View>
            <View className="items-end">
              <Text className="text-[#94A3B8] text-[9px] uppercase tracking-wider">Transactions</Text>
              <Text className="text-white text-sm font-bold mt-1">{dashboardStats.totalTransactions}</Text>
            </View>
          </View>
        </View>

        {/* SEARCH BAR */}
        <View className="flex-row items-center bg-[#151E2E] border-[0.5px] border-white/5 rounded-xl px-3.5 py-2.5 mb-4 shadow-sm">
          <Search size={16} color="#94A3B8" className="mr-2" />
          <TextInput
            className="flex-1 text-white text-sm py-1"
            placeholder="Search your expenses..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery !== "" && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <X size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* CHIP FILTERS FOR TIME AND CATEGORY */}
        <View className="mb-6 space-y-3">
          {/* Time range filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row pb-1">
            {[
              { id: "all", label: "All Time" },
              { id: "today", label: "Today" },
              { id: "week", label: "This Week" },
              { id: "month", label: "This Month" }
            ].map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  Theme.haptics.light();
                  setDateFilter(item.id as any);
                }}
                className={`px-3 py-1.5 rounded-lg mr-2 border-[0.5px] ${
                  dateFilter === item.id ? "bg-[#14E5D4]/10 border-[#14E5D4]" : "bg-[#151E2E] border-white/10"
                }`}
              >
                <Text className={`text-[10px] font-bold uppercase tracking-wider ${
                  dateFilter === item.id ? "text-[#14E5D4]" : "text-[#94A3B8]"
                }`}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Category filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
            <TouchableOpacity
              onPress={() => {
                Theme.haptics.light();
                setSelectedCategoryFilter(null);
              }}
              className={`px-3.5 py-2 rounded-xl mr-2 border-[0.5px] ${
                selectedCategoryFilter === null ? "bg-[#14E5D4]/10 border-[#14E5D4]" : "bg-[#151E2E] border-white/5"
              }`}
            >
              <Text className={`text-xs font-bold ${
                selectedCategoryFilter === null ? "text-[#14E5D4]" : "text-[#94A3B8]"
              }`}>All Categories</Text>
            </TouchableOpacity>
            {categories?.map((cat: any) => {
              const isSelected = selectedCategoryFilter === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => {
                    Theme.haptics.light();
                    setSelectedCategoryFilter(cat.id);
                  }}
                  className={`px-3.5 py-2 rounded-xl mr-2 border-[0.5px] ${
                    isSelected ? "bg-[#14E5D4]/10 border-[#14E5D4]" : "bg-[#151E2E] border-white/5"
                  }`}
                >
                  <Text className={`text-xs font-bold ${
                    isSelected ? "text-[#14E5D4]" : "text-[#94A3B8]"
                  }`}>{cat.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* MONTHLY INSIGHTS CARD */}
        <View className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-5 mb-6 shadow-md">
          <View className="flex-row items-center mb-3.5">
            <Info size={16} color="#14E5D4" />
            <Text className="text-white text-xs font-black ml-2 uppercase tracking-widest">Monthly Insights</Text>
          </View>
          
          {insights ? (
            <View className="space-y-3 mt-1">
              <View className="flex-row justify-between items-center py-1.5 border-b border-white/5">
                <Text className="text-[#94A3B8] text-[10px] font-medium">💰 Total Spent This Month</Text>
                <Text className="text-white text-xs font-black">{formatRupees(insights.totalSpent)}</Text>
              </View>
              <View className="flex-row justify-between items-center py-1.5 border-b border-white/5">
                <Text className="text-[#94A3B8] text-[10px] font-medium">📊 Average Daily Spending</Text>
                <Text className="text-white text-xs font-black">{formatRupees(Math.round(insights.avgDailySpending))}</Text>
              </View>
              <View className="flex-row justify-between items-center py-1.5 border-b border-white/5">
                <Text className="text-[#94A3B8] text-[10px] font-medium">🍕 Most Spent Category</Text>
                <Text className="text-white text-xs font-black">{insights.topCategory}</Text>
              </View>
              <View className="flex-row justify-between items-center py-1.5">
                <Text className="text-[#94A3B8] text-[10px] font-medium">💸 Biggest Expense</Text>
                <Text className="text-white text-xs font-black">{formatRupees(insights.biggestExpense)}</Text>
              </View>
            </View>
          ) : (
            <View className="py-3 items-center">
              <Text className="text-white text-xs font-bold text-center">No expenses this month yet.</Text>
              <Text className="text-[#94A3B8] text-[10px] mt-1 text-center">Start adding expenses to see your insights.</Text>
            </View>
          )}
        </View>

        {/* DAILY LEDGER TRANSACTIONS LIST */}
        <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-4">
          Ledger
        </Text>

        <View className="space-y-3">
          {filteredExpenses?.map((item) => {
            const expDate = new Date(item.expense_date);
            const timeStr = expDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => handleOpenEdit(item)}
                onLongPress={() => {
                  Theme.haptics.medium();
                  setLongPressedExpense(item);
                  setIsActionMenuOpen(true);
                }}
                className="flex-row items-center bg-[#151E2E] border-[0.5px] border-white/5 p-4 rounded-2xl active:scale-[0.99] shadow-sm"
              >
                <View className="w-10 h-10 justify-center items-center rounded-xl bg-white/5 border border-white/10 mr-3">
                  <Text className="text-lg">
                    {getCategoryEmoji(item.category?.name || "")}
                  </Text>
                </View>
                <View className="flex-1 mr-2">
                  <Text className="text-white text-sm font-bold" numberOfLines={1}>
                    {item.description}
                  </Text>
                  <Text className="text-[#94A3B8] text-[9px] mt-0.5" numberOfLines={1}>
                    {item.category?.name || "Other"}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-white font-black text-sm">{formatRupees(item.amount)}</Text>
                  <Text className="text-[#94A3B8] text-[8px] mt-0.5">
                    {expDate.toLocaleDateString()} at {timeStr}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {filteredExpenses?.length === 0 && (
            <View className="py-12 items-center bg-[#151E2E] border border-white/5 rounded-2xl">
              <Text className="text-4xl mb-3">👛</Text>
              <Text className="text-white text-sm font-black">No expenses yet</Text>
              <Text className="text-[#94A3B8] text-[10px] mt-1 text-center px-6">
                Your wallet is happy today 😂
              </Text>
              <TouchableOpacity
                onPress={handleOpenAdd}
                className="mt-5 bg-[#14E5D4]/10 border border-[#14E5D4]/20 px-4 py-2.5 rounded-xl active:opacity-85"
              >
                <Text className="text-[#14E5D4] text-xs font-bold">Add First Expense</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* FLOATING ACTION ADD BUTTON */}
      <TouchableOpacity
        onPress={handleOpenAdd}
        className="absolute bottom-6 right-6 bg-[#14E5D4] px-5 py-4 rounded-full flex-row items-center shadow-lg active:scale-95"
      >
        <Plus size={18} color="#0B1220" strokeWidth={3} />
        <Text className="text-[#0B1220] font-black text-sm ml-2">Add Expense</Text>
      </TouchableOpacity>

      {/* LONG PRESS ACTION MENU BOTTOM SHEET */}
      <Modal visible={isActionMenuOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          {longPressedExpense && (
            <View className="bg-[#151E2E] border-t-[0.5px] border-white/10 rounded-t-3xl p-6 pb-10">
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-lg font-bold text-white">Expense Options</Text>
                <TouchableOpacity
                  onPress={() => setIsActionMenuOpen(false)}
                  className="w-8 h-8 justify-center items-center rounded-full bg-white/5"
                >
                  <X size={16} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <View className="space-y-3">
                <TouchableOpacity
                  onPress={() => {
                    setIsActionMenuOpen(false);
                    handleOpenEdit(longPressedExpense);
                  }}
                  className="flex-row items-center p-4 rounded-xl bg-white/5 border border-white/10 active:opacity-80"
                >
                  <Edit size={16} color="#14E5D4" />
                  <Text className="text-white font-bold text-sm ml-3">Edit Details</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleDuplicate(longPressedExpense)}
                  className="flex-row items-center p-4 rounded-xl bg-white/5 border border-white/10 active:opacity-80"
                >
                  <Copy size={16} color="#22C55E" />
                  <Text className="text-white font-bold text-sm ml-3">Duplicate Entry</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    Theme.haptics.medium();
                    deleteMutation.mutate(longPressedExpense.id);
                  }}
                  className="flex-row items-center p-4 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 active:opacity-80"
                >
                  <Trash2 size={16} color="#EF4444" />
                  <Text className="text-[#EF4444] font-bold text-sm ml-3">Delete Expense</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* ADD/EDIT MODAL SHEET */}
      <Modal visible={isOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-[#151E2E] border-t-[0.5px] border-white/10 rounded-t-3xl p-6 pb-10">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-white">
                {editingExpense ? "Edit Expense" : "Add Personal Expense"}
              </Text>
              <TouchableOpacity
                onPress={() => setIsOpen(false)}
                className="w-8 h-8 justify-center items-center rounded-full bg-white/5"
              >
                <X size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View className="space-y-4">
              {/* Amount input */}
              <View>
                <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-2">
                  Amount
                </Text>
                <View className="flex-row items-center bg-white/5 border-[0.5px] border-white/10 rounded-xl px-4 py-3">
                  <Text className="text-[#14E5D4] font-black text-lg mr-2">₹</Text>
                  <Controller
                    control={control}
                    name="amount"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        className="flex-1 text-white text-lg font-bold py-1"
                        placeholder="0.00"
                        placeholderTextColor="#666666"
                        keyboardType="numeric"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                      />
                    )}
                  />
                </View>
                {errors.amount && (
                  <Text className="text-[#EF4444] text-xs mt-1">{errors.amount.message}</Text>
                )}
              </View>

              {/* Description input */}
              <View>
                <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-2">
                  Description
                </Text>
                <Controller
                  control={control}
                  name="description"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className="bg-white/5 border-[0.5px] border-white/10 text-white px-4 py-3 rounded-xl"
                      placeholder="e.g. Milk & Bread"
                      placeholderTextColor="#666666"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {errors.description && (
                  <Text className="text-[#EF4444] text-xs mt-1">
                    {errors.description.message}
                  </Text>
                )}
              </View>

              {/* Category selector */}
              <View>
                <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-2">
                  Category
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
                  {categories?.map((cat: any) => {
                    return (
                      <Controller
                        key={cat.id}
                        control={control}
                        name="categoryId"
                        render={({ field: { onChange, value } }) => {
                          const isSelected = value === cat.id;
                          return (
                            <TouchableOpacity
                              onPress={() => {
                                Theme.haptics.light();
                                onChange(cat.id);
                              }}
                              className={`px-4 py-2.5 rounded-xl mr-2 border-[0.5px] ${
                                isSelected
                                  ? "bg-[#14E5D4]/10 border-[#14E5D4]"
                                  : "bg-white/5 border-white/10"
                              }`}
                            >
                              <Text
                                className={`text-xs font-bold ${
                                  isSelected ? "text-[#14E5D4]" : "text-[#94A3B8]"
                                }`}
                              >
                                {cat.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        }}
                      />
                    );
                  })}
                </ScrollView>
                {errors.categoryId && (
                  <Text className="text-[#EF4444] text-xs mt-1">{errors.categoryId.message}</Text>
                )}
              </View>

              {/* Submit / Action Buttons */}
              <View className="pt-4 space-y-2">
                <TouchableOpacity
                  onPress={handleSubmit((data) => saveMutation.mutate(data))}
                  disabled={saveMutation.isPending}
                  className="flex-row bg-[#14E5D4] py-4 rounded-xl justify-center items-center active:opacity-90 shadow-lg"
                >
                  {saveMutation.isPending ? (
                    <ActivityIndicator size="small" color="#0B1220" />
                  ) : (
                    <>
                      <Save size={18} color="#0B1220" />
                      <Text className="text-[#0B1220] font-black text-base ml-2">
                        {editingExpense ? "Save Changes" : "Save Expense"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {editingExpense && (
                  <TouchableOpacity
                    onPress={() => {
                      Theme.haptics.medium();
                      deleteMutation.mutate(editingExpense.id);
                    }}
                    disabled={deleteMutation.isPending}
                    className="flex-row border-[0.5px] border-[#EF4444] py-4 rounded-xl justify-center items-center active:opacity-85"
                  >
                    {deleteMutation.isPending ? (
                      <ActivityIndicator size="small" color="#EF4444" />
                    ) : (
                      <>
                        <Trash2 size={18} color="#EF4444" />
                        <Text className="text-[#EF4444] font-bold text-base ml-2">
                          Delete Expense
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
