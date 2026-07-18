import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Keyboard,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../../store/authStore";
import { supabase } from "../../../services/supabase";
import { useToastStore } from "../../../store/toastStore";
import { Theme } from "../../../constants/Theme";
import { distributeShares, safeAdd, roundToTwoDecimals } from "../../../utils/math";
import { ChevronLeft, Info, Percent, DollarSign, Scale, Users, Save } from "lucide-react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const expenseFormSchema = z.object({
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  description: z
    .string()
    .min(3, "Description must be at least 3 characters")
    .max(100, "Description must be under 100 characters"),
  categoryId: z.string().uuid("Please select a category"),
  paidBy: z.string().uuid("Please select who paid"),
});

type ExpenseFormSchema = z.infer<typeof expenseFormSchema>;

type SplitMode = "equal" | "exact" | "percent" | "shares";

export default function AddExpense() {
  const { groupId, expenseId } = useLocalSearchParams<{ groupId: string; expenseId?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);

  const isEditMode = !!expenseId;
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [isSaving, setIsSaving] = useState(false);

  // Split value states mapped to member ID
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [shares, setShares] = useState<Record<string, string>>({});

  // 1. Fetch group members listing
  const { data: members, isLoading: isMembersLoading } = useQuery({
    queryKey: ["group-members", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_members")
        .select("role, profile:profiles(*)")
        .eq("group_id", groupId);
      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!groupId,
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

  // 3. Fetch current expense details (if Edit Mode)
  const { data: currentExpense, isLoading: isExpenseLoading } = useQuery({
    queryKey: ["expense", expenseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*, splits:expense_splits(*)")
        .eq("id", expenseId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: isEditMode,
  });

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ExpenseFormSchema>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      amount: "",
      description: "",
      categoryId: "",
      paidBy: user?.id || "",
    },
  });

  const amountStr = watch("amount");
  const totalAmount = Number(amountStr) || 0;

  // Initialize form default values on edit mode load
  useEffect(() => {
    if (isEditMode && currentExpense) {
      setValue("amount", currentExpense.amount.toString());
      setValue("description", currentExpense.description);
      setValue("categoryId", currentExpense.category_id);
      setValue("paidBy", currentExpense.paid_by);

      // Prepopulate splits inputs
      const exAm: Record<string, string> = {};
      const pct: Record<string, string> = {};
      const sh: Record<string, string> = {};

      currentExpense.splits.forEach((split: any) => {
        exAm[split.debtor_id] = split.amount.toString();
        if (split.share_ratio) {
          sh[split.debtor_id] = split.share_ratio.toString();
        }
      });

      setExactAmounts(exAm);
      setShares(sh);
    } else if (members && members.length > 0) {
      // Setup initial equal ratios for creation
      const initShares: Record<string, string> = {};
      members.forEach((m: any) => {
        initShares[m.profile.id] = "1";
      });
      setShares(initShares);
    }
  }, [isEditMode, currentExpense, members]);

  // Handle saving the expense (either insert or transaction update)
  const onSubmit = async (data: ExpenseFormSchema) => {
    Keyboard.dismiss();
    Theme.haptics.light();
    setIsSaving(true);

    try {
      const expenseAmount = Number(data.amount);
      const computedSplits = calculateSplits(expenseAmount);

      if (!computedSplits) {
        setIsSaving(false);
        return;
      }

      if (isEditMode) {
        // --- TRANSACTIONS UPDATE FLOW ---
        // 1. Update expense metadata
        const { error: expenseError } = await supabase
          .from("expenses")
          .update({
            amount: expenseAmount,
            description: data.description.trim(),
            category_id: data.categoryId,
            paid_by: data.paidBy,
          })
          .eq("id", expenseId);

        if (expenseError) throw expenseError;

        // 2. Clear old split entries
        const { error: deleteSplitsError } = await supabase
          .from("expense_splits")
          .delete()
          .eq("expense_id", expenseId);

        if (deleteSplitsError) throw deleteSplitsError;

        // 3. Batch insert new splits (Supabase REST batch runs inside a single PG transaction)
        const splitsPayload = computedSplits.map((split: any) => ({
          expense_id: expenseId,
          debtor_id: split.debtorId,
          amount: split.amount,
          share_ratio: split.shareRatio,
        }));

        const { error: insertSplitsError } = await supabase
          .from("expense_splits")
          .insert(splitsPayload);

        if (insertSplitsError) throw insertSplitsError;

        showToast("Expense updated successfully", "success");
      } else {
        // --- CREATION FLOW ---
        // 1. Insert expense row
        const { data: newExpense, error: expenseError } = await supabase
          .from("expenses")
          .insert({
            group_id: groupId,
            amount: expenseAmount,
            description: data.description.trim(),
            category_id: data.categoryId,
            paid_by: data.paidBy,
          })
          .select()
          .single();

        if (expenseError) throw expenseError;

        // 2. Insert splits linked to the new expense
        const splitsPayload = computedSplits.map((split: any) => ({
          expense_id: newExpense.id,
          debtor_id: split.debtorId,
          amount: split.amount,
          share_ratio: split.shareRatio,
        }));

        const { error: splitsError } = await supabase.from("expense_splits").insert(splitsPayload);
        if (splitsError) throw splitsError;

        showToast("Expense added successfully", "success");
      }

      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["group-expenses", groupId] });
      queryClient.invalidateQueries({ queryKey: ["peer-balances", groupId] });
      router.back();
    } catch (e: any) {
      Theme.haptics.error();
      showToast(e.message || "Failed to save expense", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Split calculation engines
  const calculateSplits = (total: number) => {
    if (!members || members.length === 0) return null;

    const memberIds = members.map((m: any) => m.profile.id);

    if (splitMode === "equal") {
      // 1. EQUAL SPLIT
      const equalRatios = memberIds.map(() => 1);
      const splitAmounts = distributeShares(total, equalRatios);
      return memberIds.map((id: string, index: number) => ({
        debtorId: id,
        amount: splitAmounts[index],
        shareRatio: 1,
      }));
    }

    if (splitMode === "shares") {
      // 2. PORTIONAL RATIO SHARES
      const memberShares = memberIds.map((id: string) => Number(shares[id]) || 0);
      const totalShares = memberShares.reduce((sum: number, s: number) => sum + s, 0);

      if (totalShares <= 0) {
        showToast("Total shares weight must be greater than zero", "error");
        return null;
      }

      const splitAmounts = distributeShares(total, memberShares);
      return memberIds.map((id: string, index: number) => ({
        debtorId: id,
        amount: splitAmounts[index],
        shareRatio: memberShares[index],
      }));
    }

    if (splitMode === "percent") {
      // 3. PERCENTAGE SPLIT
      const pctValues = memberIds.map((id: string) => Number(percentages[id]) || 0);
      const sumPct = pctValues.reduce((sum: number, p: number) => sum + p, 0);

      if (Math.round(sumPct * 100) !== 10000) {
        showToast(`Percentages must sum to exactly 100% (Current: ${sumPct}%)`, "error");
        return null;
      }

      const splitAmounts = memberIds.map((id: string, index: number) =>
        roundToTwoDecimals((total * pctValues[index]) / 100)
      );

      // Verify penny sums
      const currentSum = splitAmounts.reduce((sum: number, a: number) => safeAdd(sum, a), 0);
      let difference = roundToTwoDecimals(total - currentSum);

      if (difference !== 0) {
        // Adjust the penny remainder to the first participant with > 0%
        const adjustIndex = pctValues.findIndex((v: number) => v > 0);
        if (adjustIndex !== -1) {
          splitAmounts[adjustIndex] = safeAdd(splitAmounts[adjustIndex], difference);
        }
      }

      return memberIds.map((id: string, index: number) => ({
        debtorId: id,
        amount: splitAmounts[index],
        shareRatio: pctValues[index],
      }));
    }

    if (splitMode === "exact") {
      // 4. EXACT AMOUNT SPLIT
      const amtValues = memberIds.map((id: string) => Number(exactAmounts[id]) || 0);
      const sumAmt = amtValues.reduce((sum: number, a: number) => safeAdd(sum, a), 0);

      if (roundToTwoDecimals(sumAmt) !== roundToTwoDecimals(total)) {
        showToast(`Sum of splits (${sumAmt}) must equal total amount (${total})`, "error");
        return null;
      }

      return memberIds.map((id: string, index: number) => ({
        debtorId: id,
        amount: amtValues[index],
        shareRatio: null,
      }));
    }

    return null;
  };

  if (isMembersLoading || isCategoriesLoading || isExpenseLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#00F5D4" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background pt-14">
      {/* Header */}
      <View className="flex-row justify-between items-center px-6 pb-4 border-b-[0.5px] border-border mb-6">
        <TouchableOpacity
          onPress={() => {
            Theme.haptics.light();
            router.back();
          }}
          className="p-1 rounded-full bg-surfaceLight border-[0.5px] border-border"
        >
          <ChevronLeft size={20} color="#00F5D4" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-bold">
          {isEditMode ? "Edit Expense" : "Add Expense"}
        </Text>
        <View className="w-8" />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 50 }}>
        <View className="space-y-5">
          {/* Amount input */}
          <View>
            <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
              Amount
            </Text>
            <View className="flex-row items-center bg-surface border-[0.5px] border-border rounded-xl px-4 py-3">
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

          {/* Description */}
          <View>
            <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
              Description
            </Text>
            <View className="bg-surface border-[0.5px] border-border rounded-xl px-4 py-3">
              <Controller
                control={control}
                name="description"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    className="text-white text-base py-1"
                    placeholder="e.g. Tomato & Onion"
                    placeholderTextColor="#666666"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
            </View>
            {errors.description && (
              <Text className="text-accentPink text-xs mt-1">{errors.description.message}</Text>
            )}
          </View>

          {/* Category Selector */}
          <View>
            <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
              Category
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {categories?.map((cat: any) => {
                const isSelected = watch("categoryId") === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => {
                      Theme.haptics.light();
                      setValue("categoryId", cat.id);
                    }}
                    className={`px-4 py-2 rounded-xl border-[0.5px] ${
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
              })}
            </View>
            {errors.categoryId && (
              <Text className="text-accentPink text-xs mt-1">{errors.categoryId.message}</Text>
            )}
          </View>

          {/* Paid By Selector */}
          <View>
            <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
              Paid By
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {members?.map((m: any) => {
                const isSelected = watch("paidBy") === m.profile.id;
                return (
                  <TouchableOpacity
                    key={m.profile.id}
                    onPress={() => {
                      Theme.haptics.light();
                      setValue("paidBy", m.profile.id);
                    }}
                    className={`px-3 py-2 rounded-xl border-[0.5px] ${
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
                      {m.profile.display_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* SPLIT TYPE TABS */}
          <View className="mt-4 border-t-[0.5px] border-border pt-4">
            <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-3">
              Split Mode
            </Text>
            <View className="flex-row bg-surface border-[0.5px] border-border rounded-xl p-1 justify-between mb-4">
              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  setSplitMode("equal");
                }}
                className={`flex-1 flex-row justify-center items-center py-2.5 rounded-lg ${
                  splitMode === "equal" ? "bg-surfaceLight" : ""
                }`}
              >
                <Users size={14} color={splitMode === "equal" ? "#00F5D4" : "#A3A3A3"} />
                <Text
                  className={`text-xs font-bold ml-1 ${
                    splitMode === "equal" ? "text-accentCyan" : "text-accentGray"
                  }`}
                >
                  Equal
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  setSplitMode("shares");
                }}
                className={`flex-1 flex-row justify-center items-center py-2.5 rounded-lg ${
                  splitMode === "shares" ? "bg-surfaceLight" : ""
                }`}
              >
                <Scale size={14} color={splitMode === "shares" ? "#00F5D4" : "#A3A3A3"} />
                <Text
                  className={`text-xs font-bold ml-1 ${
                    splitMode === "shares" ? "text-accentCyan" : "text-accentGray"
                  }`}
                >
                  Shares
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  setSplitMode("percent");
                }}
                className={`flex-1 flex-row justify-center items-center py-2.5 rounded-lg ${
                  splitMode === "percent" ? "bg-surfaceLight" : ""
                }`}
              >
                <Percent size={14} color={splitMode === "percent" ? "#00F5D4" : "#A3A3A3"} />
                <Text
                  className={`text-xs font-bold ml-1 ${
                    splitMode === "percent" ? "text-accentCyan" : "text-accentGray"
                  }`}
                >
                  %
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  setSplitMode("exact");
                }}
                className={`flex-1 flex-row justify-center items-center py-2.5 rounded-lg ${
                  splitMode === "exact" ? "bg-surfaceLight" : ""
                }`}
              >
                <DollarSign size={14} color={splitMode === "exact" ? "#00F5D4" : "#A3A3A3"} />
                <Text
                  className={`text-xs font-bold ml-1 ${
                    splitMode === "exact" ? "text-accentCyan" : "text-accentGray"
                  }`}
                >
                  Exact
                </Text>
              </TouchableOpacity>
            </View>

            {/* Render input lists based on Split Mode */}
            {splitMode === "equal" && (
              <View className="bg-surface border-[0.5px] border-border rounded-2xl p-4">
                <Text className="text-white text-xs font-bold leading-relaxed">
                  Split equally between all {members?.length || 0} members:
                </Text>
                <View className="mt-3 space-y-2">
                  {members?.map((m: any) => {
                    const eqShare = totalAmount > 0 ? roundToTwoDecimals(totalAmount / members.length) : 0;
                    return (
                      <View key={m.profile.id} className="flex-row justify-between py-2 border-b-[0.5px] border-neutral-900">
                        <Text className="text-white text-sm">{m.profile.display_name}</Text>
                        <Text className="text-accentCyan font-bold text-sm">₹ {eqShare}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {splitMode === "shares" && (
              <View className="bg-surface border-[0.5px] border-border rounded-2xl p-4">
                <Text className="text-accentGray text-[10px] leading-relaxed mb-4">
                  Enter integer weight ratios (e.g. if A has share 2, B has 1, B pays half of A's share).
                </Text>
                {members?.map((m: any) => (
                  <View key={m.profile.id} className="flex-row items-center justify-between mb-3">
                    <Text className="text-white text-sm font-semibold">{m.profile.display_name}</Text>
                    <TextInput
                      className="bg-surfaceLight border-[0.5px] border-border text-white text-sm text-center px-3 py-1.5 rounded-lg w-16"
                      keyboardType="numeric"
                      value={shares[m.profile.id] || "0"}
                      onChangeText={(val) => {
                        const newShares = { ...shares, [m.profile.id]: val };
                        setShares(newShares);
                      }}
                    />
                  </View>
                ))}
              </View>
            )}

            {splitMode === "percent" && (
              <View className="bg-surface border-[0.5px] border-border rounded-2xl p-4">
                <Text className="text-accentGray text-[10px] leading-relaxed mb-4">
                  Enter custom percentages. The sum of all fields must equal exactly 100%.
                </Text>
                {members?.map((m: any) => (
                  <View key={m.profile.id} className="flex-row items-center justify-between mb-3">
                    <Text className="text-white text-sm font-semibold">{m.profile.display_name}</Text>
                    <View className="flex-row items-center bg-surfaceLight border-[0.5px] border-border rounded-lg px-2 py-1.5 w-20">
                      <TextInput
                        className="text-white text-sm text-center flex-1"
                        keyboardType="numeric"
                        placeholder="0"
                        value={percentages[m.profile.id] || ""}
                        onChangeText={(val) => {
                          const newPct = { ...percentages, [m.profile.id]: val };
                          setPercentages(newPct);
                        }}
                      />
                      <Text className="text-accentGray text-xs ml-1">%</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {splitMode === "exact" && (
              <View className="bg-surface border-[0.5px] border-border rounded-2xl p-4">
                <Text className="text-accentGray text-[10px] leading-relaxed mb-4">
                  Specify the exact split amounts. The sum of splits must match the total amount.
                </Text>
                {members?.map((m: any) => (
                  <View key={m.profile.id} className="flex-row items-center justify-between mb-3">
                    <Text className="text-white text-sm font-semibold">{m.profile.display_name}</Text>
                    <View className="flex-row items-center bg-surfaceLight border-[0.5px] border-border rounded-lg px-2 py-1.5 w-24">
                      <Text className="text-accentCyan text-xs mr-1">₹</Text>
                      <TextInput
                        className="text-white text-sm text-center flex-1"
                        keyboardType="numeric"
                        placeholder="0.00"
                        value={exactAmounts[m.profile.id] || ""}
                        onChangeText={(val) => {
                          const newAmts = { ...exactAmounts, [m.profile.id]: val };
                          setExactAmounts(newAmts);
                        }}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Submit Save Button */}
          <TouchableOpacity
            onPress={handleSubmit(onSubmit)}
            disabled={isSaving}
            className="flex-row bg-accentCyan py-4 rounded-xl justify-center items-center active:opacity-90 mt-6 shadow-lg"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#0D0D0D" />
            ) : (
              <>
                <Save size={20} color="#0D0D0D" />
                <Text className="text-background font-black text-base ml-2">
                  {isEditMode ? "Update Expense" : "Save Expense"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
