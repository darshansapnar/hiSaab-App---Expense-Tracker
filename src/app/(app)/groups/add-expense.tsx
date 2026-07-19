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
import { Colors } from "../../../constants/Colors";
import { distributeShares, safeAdd, roundToTwoDecimals } from "../../../utils/math";
import { ChevronLeft, Info, Percent, DollarSign, Scale, Users, Save, Calendar, FileText, Image } from "lucide-react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { SafeAreaView } from "react-native-safe-area-context";
import { triggerWittyNotification } from "../../../services/wittyNotifications";

const expenseFormSchema = z.object({
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  description: z
    .string()
    .max(100, "Description must be under 100 characters")
    .optional()
    .or(z.literal("")),
  categoryId: z.string().uuid("Please select a category"),
  paidBy: z.string().uuid("Please select who paid").optional().or(z.literal("")),
  notes: z.string().max(300, "Notes must be under 300 characters").optional(),
  expenseDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Please enter a valid date (YYYY-MM-DD)",
  }),
  receiptUrl: z.string().url("Please enter a valid URL").or(z.literal("")).optional(),
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

  // Multiple Payers state
  const [isMultiplePayers, setIsMultiplePayers] = useState(false);
  const [payerPayments, setPayerPayments] = useState<Record<string, string>>({});

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
      notes: "",
      expenseDate: new Date().toISOString().split("T")[0],
      receiptUrl: "",
    },
  });

  const amountStr = watch("amount");
  const totalAmount = Number(amountStr) || 0;

  // Initialize multiple payments dictionary when members load
  useEffect(() => {
    if (members && members.length > 0) {
      const initPayments: Record<string, string> = {};
      members.forEach((m: any) => {
        initPayments[m.profile.id] = "";
      });
      setPayerPayments(initPayments);
    }
  }, [members]);

  // Initialize form default values on edit mode load
  useEffect(() => {
    if (isEditMode && currentExpense) {
      setValue("amount", currentExpense.amount.toString());
      setValue("description", currentExpense.description);
      setValue("categoryId", currentExpense.category_id);
      setValue("paidBy", currentExpense.paid_by);
      setValue("notes", currentExpense.notes || "");
      setValue("expenseDate", new Date(currentExpense.expense_date).toISOString().split("T")[0]);
      setValue("receiptUrl", currentExpense.receipt_url || "");

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

      const expenseDateObj = new Date(data.expenseDate);
      const isoDate = expenseDateObj.toISOString();

      const categoryName = categories?.find((c: any) => c.id === data.categoryId)?.name || "Expense";
      const descVal = data.description?.trim() || categoryName;

      if (isMultiplePayers) {
        // --- MULTIPLE PAYERS CREATION FLOW ---
        const activePayments = Object.entries(payerPayments)
          .map(([id, val]) => ({
            id,
            amount: Number(val) || 0,
          }))
          .filter((p) => p.amount > 0);

        const totalPaymentsSum = activePayments.reduce((sum, p) => sum + p.amount, 0);
        if (Math.round(totalPaymentsSum * 100) !== Math.round(expenseAmount * 100)) {
          showToast(`Sum of payments (₹${totalPaymentsSum.toFixed(2)}) must equal total amount (₹${expenseAmount.toFixed(2)})`, "error");
          setIsSaving(false);
          return;
        }

        const targetDebtors = computedSplits.map((s: any) => s.debtorId);
        const targetWeights = computedSplits.map((s: any) => s.amount);

        // Loop through each payer and insert a sub-expense
        for (let i = 0; i < activePayments.length; i++) {
          const activePayer = activePayments[i];
          const payerProfile = members?.find((m: any) => m.profile.id === activePayer.id)?.profile;
          const payerName = payerProfile?.username ? `@${payerProfile.username}` : payerProfile?.display_name || "Someone";

          const subExpenseAmount = activePayer.amount;
          const subDescription = `${descVal} (${payerName}'s part)`;

          const { data: newSubExpense, error: expenseError } = await supabase
            .from("expenses")
            .insert({
              group_id: groupId,
              amount: subExpenseAmount,
              description: subDescription,
              category_id: data.categoryId,
              paid_by: activePayer.id,
              notes: data.notes?.trim() || null,
              expense_date: isoDate,
              receipt_url: data.receiptUrl?.trim() || null,
            })
            .select()
            .single();

          if (expenseError) throw expenseError;

          const subSplitAmounts = distributeShares(subExpenseAmount, targetWeights);

          const splitsPayload = targetDebtors.map((debtorId: string, index: number) => ({
            expense_id: newSubExpense.id,
            debtor_id: debtorId,
            amount: subSplitAmounts[index],
            share_ratio: computedSplits[index].shareRatio,
          }));

          const { error: splitsError } = await supabase.from("expense_splits").insert(splitsPayload);
          if (splitsError) throw splitsError;
        }

        triggerWittyNotification("expense_added", "Group Expense Logged");
      } else {
        // --- SINGLE PAYER CREATION/EDIT FLOW ---
        const paidById = data.paidBy || user?.id;

        if (isEditMode) {
          const { error: expenseError } = await supabase
            .from("expenses")
            .update({
              amount: expenseAmount,
              description: descVal,
              category_id: data.categoryId,
              paid_by: paidById,
              notes: data.notes?.trim() || null,
              expense_date: isoDate,
              receipt_url: data.receiptUrl?.trim() || null,
            })
            .eq("id", expenseId);

          if (expenseError) throw expenseError;

          const { error: deleteSplitsError } = await supabase
            .from("expense_splits")
            .delete()
            .eq("expense_id", expenseId);

          if (deleteSplitsError) throw deleteSplitsError;

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

          triggerWittyNotification("expense_updated", "Group Expense Updated");
        } else {
          const { data: newExpense, error: expenseError } = await supabase
            .from("expenses")
            .insert({
              group_id: groupId,
              amount: expenseAmount,
              description: descVal,
              category_id: data.categoryId,
              paid_by: paidById,
              notes: data.notes?.trim() || null,
              expense_date: isoDate,
              receipt_url: data.receiptUrl?.trim() || null,
            })
            .select()
            .single();

          if (expenseError) throw expenseError;

          const splitsPayload = computedSplits.map((split: any) => ({
            expense_id: newExpense.id,
            debtor_id: split.debtorId,
            amount: split.amount,
            share_ratio: split.shareRatio,
          }));

          const { error: splitsError } = await supabase.from("expense_splits").insert(splitsPayload);
          if (splitsError) throw splitsError;

          triggerWittyNotification("expense_added", "Group Expense Added");
        }
      }

      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["group-expenses", groupId] });
      queryClient.invalidateQueries({ queryKey: ["peer-balances", groupId] });
      queryClient.invalidateQueries({ queryKey: ["global-peer-balances", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
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
      const equalRatios = memberIds.map(() => 1);
      const splitAmounts = distributeShares(total, equalRatios);
      return memberIds.map((id: string, index: number) => ({
        debtorId: id,
        amount: splitAmounts[index],
        shareRatio: 1,
      }));
    }

    if (splitMode === "shares") {
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
      const pctValues = memberIds.map((id: string) => Number(percentages[id]) || 0);
      const sumPct = pctValues.reduce((sum: number, p: number) => sum + p, 0);

      if (Math.round(sumPct * 100) !== 10000) {
        showToast(`Percentages must sum to exactly 100% (Current: ${sumPct}%)`, "error");
        return null;
      }

      const splitAmounts = memberIds.map((id: string, index: number) =>
        roundToTwoDecimals((total * pctValues[index]) / 100)
      );

      const currentSum = splitAmounts.reduce((sum: number, a: number) => safeAdd(sum, a), 0);
      let difference = roundToTwoDecimals(total - currentSum);

      if (difference !== 0) {
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
      <View style={{ flex: 1, backgroundColor: "#0B1220" }} className="justify-center items-center">
        <ActivityIndicator size="large" color="#14E5D4" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }}>
      {/* Header */}
      <View className="flex-row justify-between items-center px-6 pb-4 border-b-[0.5px] border-border mb-6">
        <TouchableOpacity
          onPress={() => {
            Theme.haptics.light();
            router.back();
          }}
          className="p-1 rounded-full bg-surfaceLight border-[0.5px] border-border"
        >
          <ChevronLeft size={20} color={Colors.accentCyan} />
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
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-accentGray text-xs font-bold uppercase tracking-widest">
                Paid By
              </Text>
              {!isEditMode && (
                <TouchableOpacity
                  onPress={() => {
                    Theme.haptics.light();
                    setIsMultiplePayers(!isMultiplePayers);
                  }}
                  className={`px-2.5 py-1 rounded-lg border ${
                    isMultiplePayers ? "bg-[#14E5D4]/10 border-[#14E5D4]" : "bg-surface border-border"
                  }`}
                >
                  <Text className={`text-[10px] font-bold ${isMultiplePayers ? "text-[#14E5D4]" : "text-accentGray"}`}>
                    {isMultiplePayers ? "Multiple Payers" : "Single Payer"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {isMultiplePayers && !isEditMode ? (
              <View className="bg-surface border-[0.5px] border-border rounded-2xl p-4 space-y-3">
                <Text className="text-accentGray text-[10px] mb-2 leading-relaxed">
                  Enter payments. Sum of payments must equal total amount.
                </Text>
                {members?.map((m: any) => (
                  <View key={m.profile.id} className="flex-row items-center justify-between mb-2">
                    <Text className="text-white text-xs font-semibold">
                      {m.profile.username ? `@${m.profile.username}` : m.profile.display_name}
                    </Text>
                    <View className="flex-row items-center bg-surfaceLight border-[0.5px] border-border rounded-lg px-2 py-1 w-24">
                      <Text className="text-accentCyan text-xs mr-1">₹</Text>
                      <TextInput
                        className="text-white text-xs text-center flex-1 py-1"
                        keyboardType="numeric"
                        placeholder="0.00"
                        value={payerPayments[m.profile.id] || ""}
                        onChangeText={(val) => {
                          const newPayments = { ...payerPayments, [m.profile.id]: val };
                          setPayerPayments(newPayments);
                        }}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
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
                        {m.profile.username ? `@${m.profile.username}` : m.profile.display_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Date Picker (Custom input) */}
          <View>
            <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
              Expense Date (YYYY-MM-DD)
            </Text>
            <View className="flex-row items-center bg-surface border-[0.5px] border-border rounded-xl px-4 py-3">
              <Calendar size={16} color="#94A3B8" className="mr-2" />
              <Controller
                control={control}
                name="expenseDate"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    className="flex-1 text-white text-sm py-1"
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#666666"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
            </View>
            {errors.expenseDate && (
              <Text className="text-accentPink text-xs mt-1">{errors.expenseDate.message}</Text>
            )}
          </View>

          {/* Notes */}
          <View>
            <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
              Notes (Optional)
            </Text>
            <View className="flex-row bg-surface border-[0.5px] border-border rounded-xl px-4 py-3">
              <FileText size={16} color="#94A3B8" className="mr-2 mt-1" />
              <Controller
                control={control}
                name="notes"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    className="flex-1 text-white text-sm py-1"
                    placeholder="e.g. Paid via UPI, hostel dinner bill"
                    placeholderTextColor="#666666"
                    multiline
                    numberOfLines={3}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
            </View>
            {errors.notes && (
              <Text className="text-accentPink text-xs mt-1">{errors.notes.message}</Text>
            )}
          </View>

          {/* Receipt URL / Link */}
          <View>
            <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
              Receipt Link / Image URL (Optional)
            </Text>
            <View className="flex-row items-center bg-surface border-[0.5px] border-border rounded-xl px-4 py-3">
              <Image size={16} color="#94A3B8" className="mr-2" />
              <Controller
                control={control}
                name="receiptUrl"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    className="flex-1 text-white text-sm py-1"
                    placeholder="e.g. https://receipt-url.com/img.jpg"
                    placeholderTextColor="#666666"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
            </View>
            {errors.receiptUrl && (
              <Text className="text-accentPink text-xs mt-1">{errors.receiptUrl.message}</Text>
            )}
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
                <Users size={14} color={splitMode === "equal" ? Colors.accentCyan : "#A3A3A3"} />
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
                <Scale size={14} color={splitMode === "shares" ? Colors.accentCyan : "#A3A3A3"} />
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
                <Percent size={14} color={splitMode === "percent" ? Colors.accentCyan : "#A3A3A3"} />
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
                <DollarSign size={14} color={splitMode === "exact" ? Colors.accentCyan : "#A3A3A3"} />
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
                        <Text className="text-white text-sm">
                          {m.profile.username ? `@${m.profile.username}` : m.profile.display_name}
                        </Text>
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
                    <Text className="text-white text-sm font-semibold">
                      {m.profile.username ? `@${m.profile.username}` : m.profile.display_name}
                    </Text>
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
                    <Text className="text-white text-sm font-semibold">
                      {m.profile.username ? `@${m.profile.username}` : m.profile.display_name}
                    </Text>
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
                    <Text className="text-white text-sm font-semibold">
                      {m.profile.username ? `@${m.profile.username}` : m.profile.display_name}
                    </Text>
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
    </SafeAreaView>
  );
}
