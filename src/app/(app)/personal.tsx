import React, { useState } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../store/authStore";
import { supabase } from "../../services/supabase";
import { useToastStore } from "../../store/toastStore";
import { Theme } from "../../constants/Theme";
import {
  ChevronLeft,
  Plus,
  Search,
  X,
  Trash2,
  Edit,
  Save,
  Filter,
  ArrowRight,
} from "lucide-react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const personalExpenseSchema = z.object({
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  description: z
    .string()
    .min(3, "Description must be at least 3 characters")
    .max(100, "Description must be under 100 characters"),
  categoryId: z.string().uuid("Please select a category"),
});

type PersonalExpenseSchema = z.infer<typeof personalExpenseSchema>;

export default function PersonalExpenses() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any | null>(null);

  // 1. Fetch personal expenses listing
  const { data: expenses, isLoading: isExpensesLoading } = useQuery({
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

  // Handle open modal for creation
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

  // Handle open modal for edit
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

  // Mutation to create/update personal expense
  const saveMutation = useMutation({
    mutationFn: async (data: PersonalExpenseSchema) => {
      const payload = {
        profile_id: user?.id,
        amount: Number(data.amount),
        description: data.description.trim(),
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
      showToast(
        editingExpense ? "Expense updated successfully" : "Expense added successfully",
        "success"
      );
      setIsOpen(false);
      reset();
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to save expense", "error");
    },
  });

  // Mutation to delete personal expense
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("personal_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["personal-expenses", user?.id] });
      showToast("Expense deleted successfully", "success");
      setIsOpen(false);
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to delete expense", "error");
    },
  });

  // --- MATH CALCULATION FOR MONTHLY SUMMARY ---
  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);

  const monthlyExpenses = expenses?.filter(
    (exp) => new Date(exp.expense_date) >= currentMonthStart
  );

  const monthlyTotal =
    monthlyExpenses?.reduce((sum, exp) => sum + Number(exp.amount), 0) || 0;

  // Category breakdown for current month
  const categoryBreakdown: Record<string, { amount: number; name: string }> = {};
  monthlyExpenses?.forEach((exp) => {
    const catName = exp.category?.name || "Other";
    if (!categoryBreakdown[catName]) {
      categoryBreakdown[catName] = { amount: 0, name: catName };
    }
    categoryBreakdown[catName].amount += Number(exp.amount);
  });

  // Filter list by search query and category filters
  const filteredExpenses = expenses?.filter((exp) => {
    const matchesSearch = exp.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategoryFilter
      ? exp.category_id === selectedCategoryFilter
      : true;
    return matchesSearch && matchesCategory;
  });

  if (isExpensesLoading || isCategoriesLoading) {
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
        <Text className="text-white text-lg font-bold">Personal Ledger</Text>
        <TouchableOpacity
          onPress={handleOpenAdd}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="p-1 rounded-full bg-accentCyan active:scale-95"
        >
          <Plus size={20} color="#0D0D0D" />
        </TouchableOpacity>
      </View>

      {/* MONTHLY SUMMARY CARD */}
      <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 mb-6">
        <Text className="text-accentGray text-[10px] font-bold uppercase tracking-widest mb-1">
          Spent This Month
        </Text>
        <Text className="text-white text-3xl font-black mb-4">₹ {monthlyTotal.toFixed(2)}</Text>

        <Text className="text-accentGray text-[9px] font-bold uppercase tracking-widest mb-2">
          Category Summary
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {Object.values(categoryBreakdown).map((item) => (
            <View key={item.name} className="bg-surfaceLight px-2.5 py-1.5 rounded-lg">
              <Text className="text-white text-[10px] font-bold">
                {item.name}: ₹{item.amount.toFixed(0)}
              </Text>
            </View>
          ))}
          {Object.keys(categoryBreakdown).length === 0 && (
            <Text className="text-accentGray text-[10px]">No expenses logged this month.</Text>
          )}
        </View>
      </View>

      {/* SEARCH AND FILTERS */}
      <View className="mb-6 space-y-3">
        {/* Search bar */}
        <View className="flex-row items-center bg-surface border-[0.5px] border-border rounded-xl px-3 py-2">
          <Search size={18} color="#666666" className="mr-2" />
          <TextInput
            className="flex-1 text-white text-sm"
            placeholder="Search description..."
            placeholderTextColor="#666666"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Category Pills horizontal filters list */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          <TouchableOpacity
            onPress={() => {
              Theme.haptics.light();
              setSelectedCategoryFilter(null);
            }}
            className={`px-3.5 py-2 rounded-xl mr-2 border-[0.5px] ${
              selectedCategoryFilter === null
                ? "bg-accentCyan/10 border-accentCyan"
                : "bg-surface border-border"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                selectedCategoryFilter === null ? "text-accentCyan" : "text-accentGray"
              }`}
            >
              All
            </Text>
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
                  isSelected ? "bg-accentCyan/10 border-accentCyan" : "bg-surface border-border"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    isSelected ? "text-accentCyan" : "text-accentGray"
                  }`}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* DAILY LEDGER LIST */}
      <FlatList
        data={filteredExpenses}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => handleOpenEdit(item)}
            className="flex-row items-center bg-surface border-[0.5px] border-border p-4 rounded-xl mb-3 active:scale-[0.99]"
          >
            <View className="w-10 h-10 justify-center items-center rounded-xl bg-surfaceLight mr-3">
              <Text className="text-base">
                {item.category?.icon_name === "shopping-cart"
                  ? "🛒"
                  : item.category?.icon_name === "utensils"
                  ? "🍕"
                  : item.category?.icon_name === "home"
                  ? "🏠"
                  : "💸"}
              </Text>
            </View>
            <View className="flex-1 mr-2">
              <Text className="text-white text-sm font-bold" numberOfLines={1}>
                {item.description}
              </Text>
              <Text className="text-accentGray text-[10px] mt-0.5" numberOfLines={1}>
                {item.category?.name || "Other"}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-white font-bold text-sm">₹ {item.amount}</Text>
              <Text className="text-accentGray text-[9px] mt-0.5">
                {new Date(item.expense_date).toLocaleDateString()}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View className="py-10 items-center">
            <Text className="text-accentGray text-sm">No personal expenses found.</Text>
          </View>
        }
      />

      {/* ADD/EDIT MODAL SHEET */}
      <Modal visible={isOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-surface border-t-[0.5px] border-border rounded-t-3xl p-6 pb-10">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-white">
                {editingExpense ? "Edit Expense" : "Add Personal Expense"}
              </Text>
              <TouchableOpacity
                onPress={() => setIsOpen(false)}
                className="w-8 h-8 justify-center items-center rounded-full bg-surfaceLight"
              >
                <X size={16} color="#A3A3A3" />
              </TouchableOpacity>
            </View>

            <View className="space-y-4">
              {/* Amount input */}
              <View>
                <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
                  Amount
                </Text>
                <View className="flex-row items-center bg-surfaceLight border-[0.5px] border-border rounded-xl px-4 py-3">
                  <Text className="text-accentCyan font-bold text-lg mr-2">₹</Text>
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
                  <Text className="text-accentPink text-xs mt-1">{errors.amount.message}</Text>
                )}
              </View>

              {/* Description input */}
              <View>
                <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
                  Description
                </Text>
                <Controller
                  control={control}
                  name="description"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className="bg-surfaceLight border-[0.5px] border-border text-white px-4 py-3 rounded-xl"
                      placeholder="e.g. Milk & Bread"
                      placeholderTextColor="#666666"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {errors.description && (
                  <Text className="text-accentPink text-xs mt-1">
                    {errors.description.message}
                  </Text>
                )}
              </View>

              {/* Category selector */}
              <View>
                <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
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
                                  ? "bg-accentCyan/10 border-accentCyan"
                                  : "bg-surface border-border"
                              }`}
                            >
                              <Text
                                className={`text-xs font-bold ${
                                  isSelected ? "text-accentCyan" : "text-accentGray"
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
                  <Text className="text-accentPink text-xs mt-1">{errors.categoryId.message}</Text>
                )}
              </View>

              {/* Submit / Action Buttons */}
              <View className="pt-4 space-y-2">
                <TouchableOpacity
                  onPress={handleSubmit((data) => saveMutation.mutate(data))}
                  disabled={saveMutation.isPending}
                  className="flex-row bg-accentCyan py-4 rounded-xl justify-center items-center active:opacity-90 shadow-lg"
                >
                  {saveMutation.isPending ? (
                    <ActivityIndicator size="small" color="#0D0D0D" />
                  ) : (
                    <>
                      <Save size={18} color="#0D0D0D" />
                      <Text className="text-background font-black text-base ml-2">
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
                    className="flex-row border-[0.5px] border-accentPink py-4 rounded-xl justify-center items-center active:opacity-85"
                  >
                    {deleteMutation.isPending ? (
                      <ActivityIndicator size="small" color="#FF007F" />
                    ) : (
                      <>
                        <Trash2 size={18} color="#FF007F" />
                        <Text className="text-accentPink font-bold text-base ml-2">
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
