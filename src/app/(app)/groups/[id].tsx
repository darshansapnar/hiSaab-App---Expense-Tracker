import React, { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { simplifyDebts } from "../../../utils/math";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter, Link } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../../store/authStore";
import { supabase } from "../../../services/supabase";
import { useToastStore } from "../../../store/toastStore";
import { Theme } from "../../../constants/Theme";
import * as Clipboard from "expo-clipboard";
import {
  ChevronLeft,
  Copy,
  Users,
  Settings,
  X,
  Trash2,
  LogOut,
  Save,
  CheckCircle,
  Home,
  Compass,
  Users2,
  Landmark,
  Plus,
  Droplet,
  ChevronRight,
} from "lucide-react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const editGroupSchema = z.object({
  name: z
    .string()
    .min(3, "Group name must be at least 3 characters")
    .max(50, "Group name must be under 50 characters"),
  description: z.string().max(200, "Description must be under 200 characters").optional(),
});

type EditGroupSchema = z.infer<typeof editGroupSchema>;

export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"ledger" | "balances" | "members">("ledger");

  // 1. Fetch group details
  const { data: group, isLoading: isGroupLoading } = useQuery({
    queryKey: ["group", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("groups").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // 2. Fetch group members listing
  const { data: members, isLoading: isMembersLoading } = useQuery({
    queryKey: ["group-members", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_members")
        .select("role, profile:profiles(*)")
        .eq("group_id", id);

      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!id,
  });

  // 2.5. Fetch group expenses listing
  const { data: expenses, isLoading: isExpensesLoading, refetch: refetchExpenses } = useQuery({
    queryKey: ["group-expenses", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*, payer:profiles(*), category:categories(*), splits:expense_splits(debtor_id, debtor:profiles(*))")
        .eq("group_id", id)
        .order("expense_date", { ascending: false });

      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!id,
  });

  // 2.7. Fetch peer balances listing
  const { data: peerBalances, isLoading: isBalancesLoading } = useQuery({
    queryKey: ["peer-balances", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peer_balances")
        .select("*")
        .eq("group_id", id);

      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!id,
  });

  // Mutation to record a settlement payment
  const settleMutation = useMutation({
    mutationFn: async (settlement: { from: string; to: string; amount: number }) => {
      // Fetch default category 'Other'
      const { data: cat } = await supabase
        .from("categories")
        .select("id")
        .eq("name", "Other")
        .single();

      // Insert settlement expense row (starts as unconfirmed/pending)
      const { data: newExpense, error: expError } = await supabase
        .from("expenses")
        .insert({
          group_id: id,
          paid_by: settlement.from,
          amount: settlement.amount,
          description: "Settlement Payment",
          category_id: cat?.id,
          is_settlement: true,
          is_confirmed: false,
        })
        .select()
        .single();

      if (expError) throw expError;

      // Insert matching split row for recipient
      const { error: splitError } = await supabase
        .from("expense_splits")
        .insert({
          expense_id: newExpense.id,
          debtor_id: settlement.to,
          amount: settlement.amount,
        });

      if (splitError) throw splitError;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["group-expenses", id] });
      queryClient.invalidateQueries({ queryKey: ["peer-balances", id] });
      showToast("Settlement payment recorded. Pending recipient confirmation.", "success", 5000);
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to record settlement", "error");
    },
  });

  // Mutation to confirm a settlement payment (Mark as Paid)
  const confirmSettlementMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      const { error } = await supabase
        .from("expenses")
        .update({ is_confirmed: true })
        .eq("id", expenseId);
      if (error) throw error;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["group-expenses", id] });
      queryClient.invalidateQueries({ queryKey: ["peer-balances", id] });
      showToast("Settlement confirmed and balances updated", "success");
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to confirm settlement", "error");
    },
  });

  // Mutation to delete a specific expense
  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
      if (error) throw error;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["group-expenses", id] });
      queryClient.invalidateQueries({ queryKey: ["peer-balances", id] });
      showToast("Expense deleted successfully", "success");
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to delete expense", "error");
    },
  });

  // 3. Determine active user's role in the group
  const userMemberInfo = members?.find((m: any) => m.profile?.id === user?.id);
  const isAdmin = userMemberInfo?.role === "admin";

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<EditGroupSchema>({
    resolver: zodResolver(editGroupSchema),
    values: {
      name: group?.name || "",
      description: group?.description || "",
    },
  });

  // Mutation to update group name/details
  const updateMutation = useMutation({
    mutationFn: async (data: EditGroupSchema) => {
      const { data: updatedGroup, error } = await supabase
        .from("groups")
        .update({
          name: data.name.trim(),
          description: data.description?.trim() || null,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return updatedGroup;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["group", id] });
      queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
      showToast("Group settings saved", "success");
      setIsSettingsOpen(false);
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to update settings", "error");
    },
  });

  const handleCopyInvite = async () => {
    if (!id) return;
    Theme.haptics.light();
    await Clipboard.setStringAsync(id);
    showToast("Invite code copied to clipboard!", "success");
  };

  const handleLeaveGroup = async () => {
    if (!id || !user) return;
    Theme.haptics.medium();
    setIsLeaving(true);

    try {
      const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", id)
        .eq("profile_id", user.id);

      if (error) throw error;

      Theme.haptics.success();
      showToast("Left group successfully", "success");
      queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
      setIsSettingsOpen(false);
      router.replace("/(app)/(tabs)/groups");
    } catch (e: any) {
      Theme.haptics.error();
      showToast(e.message || "Failed to leave group", "error");
    } finally {
      setIsLeaving(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!id) return;
    Theme.haptics.heavy();
    setIsDeleting(true);

    try {
      const { error } = await supabase.from("groups").delete().eq("id", id);
      if (error) throw error;

      Theme.haptics.success();
      showToast("Group deleted successfully", "success");
      queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
      setIsSettingsOpen(false);
      router.replace("/(app)/(tabs)/groups");
    } catch (e: any) {
      Theme.haptics.error();
      showToast(e.message || "Failed to delete group", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isGroupLoading || isMembersLoading || isExpensesLoading || isBalancesLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#00F5D4" />
      </View>
    );
  }

  if (!group) {
    return (
      <View className="flex-1 justify-center items-center bg-background px-6">
        <Text className="text-white text-lg font-bold mb-4">Group not found</Text>
        <Link href="/(app)/(tabs)/groups" replace asChild>
          <TouchableOpacity className="bg-accentCyan px-6 py-3 rounded-xl">
            <Text className="text-background font-bold">Go Back</Text>
          </TouchableOpacity>
        </Link>
      </View>
    );
  }

  // Calculate net balances for each group member
  const netBalances: Record<string, number> = {};
  if (members) {
    members.forEach((m: any) => {
      netBalances[m.profile.id] = 0;
    });
  }

  if (peerBalances) {
    peerBalances.forEach((row: any) => {
      netBalances[row.user_a_id] = (netBalances[row.user_a_id] || 0) + Number(row.net_balance);
      netBalances[row.user_b_id] = (netBalances[row.user_b_id] || 0) - Number(row.net_balance);
    });
  }

  const simplifiedDebts = simplifyDebts(netBalances);

  let HeaderIcon = Users;
  if (group.type === "hostel") HeaderIcon = Home;
  else if (group.type === "flatmates") HeaderIcon = Users2;
  else if (group.type === "trip") HeaderIcon = Compass;
  else if (group.type === "family") HeaderIcon = Landmark;

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Top Header Navigation */}
      <View className="flex-row justify-between items-center px-6 pb-4 border-b-[0.5px] border-border">
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
        <Text className="text-white text-lg font-bold flex-1 text-center ml-2 mr-2" numberOfLines={1}>
          {group.name}
        </Text>
        <TouchableOpacity
          onPress={() => {
            Theme.haptics.light();
            setIsSettingsOpen(true);
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="p-1 rounded-full bg-surfaceLight border-[0.5px] border-border"
        >
          <Settings size={20} color="#A3A3A3" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={activeTab === "ledger" ? expenses : activeTab === "members" ? members : simplifiedDebts}
        keyExtractor={(item) => item.id || item.profile?.id || `${item.from}-${item.to}`}
        contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
        ListHeaderComponent={
          <>
            {/* Banner Category Card */}
            <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 mb-6 items-center">
              <View className="w-16 h-16 justify-center items-center rounded-2xl bg-surfaceLight mb-3">
                <HeaderIcon size={32} color="#00F5D4" />
              </View>
              <Text className="text-white text-xl font-black">{group.name}</Text>
              <Text className="text-accentGray text-xs mt-1 text-center leading-relaxed">
                {group.description || `Currency: ${group.currency} • Type: ${group.type}`}
              </Text>
            </View>

            {/* Invite Link Card widget */}
            <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 mb-6">
              <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
                Invite Code
              </Text>
              <View className="flex-row items-center bg-surfaceLight border-[0.5px] border-border rounded-xl p-3">
                <Text className="text-white font-mono text-xs flex-1 select-all mr-2" numberOfLines={1}>
                  {group.id}
                </Text>
                <TouchableOpacity
                  onPress={handleCopyInvite}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  className="bg-accentCyan w-8 h-8 justify-center items-center rounded-lg"
                >
                  <Copy size={14} color="#0D0D0D" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Roommate Trackers widget section */}
            <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 mb-6">
              <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-3">
                Roommate Trackers
              </Text>
              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  router.push({
                    pathname: "/groups/water",
                    params: { groupId: id },
                  });
                }}
                className="flex-row items-center bg-surfaceLight border-[0.5px] border-border p-4 rounded-xl active:scale-[0.99]"
              >
                <View className="w-10 h-10 rounded-xl bg-surface justify-center items-center mr-3">
                  <Droplet size={18} color="#00F5D4" />
                </View>
                <View className="flex-1 mr-2">
                  <Text className="text-white text-sm font-bold">Water Jar Tracker</Text>
                  <Text className="text-accentGray text-[10px] mt-0.5" numberOfLines={1}>
                    Log deliveries, track monthly counts and estimated bills.
                  </Text>
                </View>
                <ChevronRight size={18} color="#A3A3A3" />
              </TouchableOpacity>
            </View>

            {/* Ledger & Balances & Members Navigation Tabs */}
            <View className="flex-row bg-surface border-[0.5px] border-border rounded-xl p-1 justify-between mb-4">
              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  setActiveTab("ledger");
                }}
                className={`flex-1 py-2.5 rounded-lg items-center ${
                  activeTab === "ledger" ? "bg-surfaceLight" : ""
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    activeTab === "ledger" ? "text-accentCyan" : "text-accentGray"
                  }`}
                >
                  Ledger
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  setActiveTab("balances");
                }}
                className={`flex-1 py-2.5 rounded-lg items-center ${
                  activeTab === "balances" ? "bg-surfaceLight" : ""
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    activeTab === "balances" ? "text-accentCyan" : "text-accentGray"
                  }`}
                >
                  Balances
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  setActiveTab("members");
                }}
                className={`flex-1 py-2.5 rounded-lg items-center ${
                  activeTab === "members" ? "bg-surfaceLight" : ""
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    activeTab === "members" ? "text-accentCyan" : "text-accentGray"
                  }`}
                >
                  Members
                </Text>
              </TouchableOpacity>
            </View>

            {/* Inline Net Balances Grid shown in Balances Tab */}
            {activeTab === "balances" && (
              <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 mb-6">
                <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-3">
                  Net Balances
                </Text>
                {members?.map((m: any) => {
                  const balVal = netBalances[m.profile.id] || 0;
                  const isCred = balVal > 0.01;
                  const isDeb = balVal < -0.01;
                  return (
                    <View
                      key={m.profile.id}
                      className="flex-row items-center justify-between py-2.5 border-b-[0.5px] border-border"
                    >
                      <View className="flex-row items-center">
                        <Text className="text-base mr-2">{m.profile.avatar_url || "👋"}</Text>
                        <Text className="text-white text-sm font-semibold">
                          {m.profile.display_name}
                        </Text>
                      </View>
                      <Text
                        className={`text-sm font-bold ${
                          isCred ? "text-accentCyan" : isDeb ? "text-accentPink" : "text-accentGray"
                        }`}
                      >
                        {isCred ? `+ ₹${balVal}` : isDeb ? `- ₹${Math.abs(balVal)}` : "Settled"}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {activeTab === "balances" && (
              <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-4">
                Suggested Payments
              </Text>
            )}
          </>
        }
        renderItem={({ item }) => {
          if (activeTab === "ledger") {
            const isPayer = item.paid_by === user?.id;

            if (item.is_settlement) {
              const recipient = item.splits?.[0]?.debtor;
              const isRecipient = recipient?.id === user?.id;
              const isConfirmed = item.is_confirmed;

              return (
                <View className="bg-surface border-[0.5px] border-border p-4 rounded-xl mb-3">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center flex-1 mr-2">
                      <View className="w-8 h-8 justify-center items-center rounded-lg bg-surfaceLight mr-2.5">
                        <Text className="text-base">🤝</Text>
                      </View>
                      <View className="flex-1 mr-1">
                        <Text className="text-white text-sm font-bold" numberOfLines={1}>
                          {isPayer
                            ? `You sent payment`
                            : isRecipient
                            ? `${item.payer?.display_name || "Someone"} sent payment`
                            : `${item.payer?.display_name || "Someone"} paid ${recipient?.display_name || "Someone"}`}
                        </Text>
                        <Text className="text-accentGray text-[10px] mt-0.5">
                          {isConfirmed ? "Settled" : "Pending confirmation"}
                        </Text>
                      </View>
                    </View>
                    <View className="items-end">
                      <Text className="text-accentCyan font-bold text-sm">₹ {item.amount}</Text>
                      <Text className="text-accentGray text-[9px] mt-0.5">
                        {new Date(item.expense_date).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>

                  {/* Render inline confirmation action for recipient */}
                  {!isConfirmed && isRecipient && (
                    <TouchableOpacity
                      onPress={() => {
                        Theme.haptics.medium();
                        confirmSettlementMutation.mutate(item.id);
                      }}
                      disabled={confirmSettlementMutation.isPending}
                      className="bg-accentCyan py-2 rounded-lg items-center mt-2 active:opacity-90"
                    >
                      <Text className="text-background text-xs font-black">
                        {confirmSettlementMutation.isPending ? "Confirming..." : "Confirm Received"}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Render pending text for sender */}
                  {!isConfirmed && isPayer && (
                    <View className="bg-surfaceLight/50 border-[0.5px] border-border/50 py-2 rounded-lg items-center mt-2 mb-1">
                      <Text className="text-accentGray text-[10px] font-bold">Waiting for recipient confirmation...</Text>
                    </View>
                  )}
                  
                  {/* Allow deleting unconfirmed settlements (Payer only) */}
                  {!isConfirmed && isPayer && (
                    <TouchableOpacity
                      onPress={() => {
                        Theme.haptics.medium();
                        deleteExpenseMutation.mutate(item.id);
                      }}
                      className="border-[0.5px] border-accentPink/30 py-2 rounded-lg items-center mt-1 active:opacity-85"
                    >
                      <Text className="text-accentPink text-[10px] font-bold">Cancel Settlement Request</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }

            return (
              <View className="flex-row items-center bg-surface border-[0.5px] border-border p-4 rounded-xl mb-3">
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
                    Paid by {item.payer?.display_name || "Deleted User"}
                  </Text>
                </View>
                <View className="items-end mr-3">
                  <Text className="text-white font-bold text-sm">₹ {item.amount}</Text>
                  <Text className="text-accentGray text-[9px] mt-0.5">
                    {new Date(item.expense_date).toLocaleDateString()}
                  </Text>
                </View>
                {isPayer && (
                  <View className="flex-row space-x-1">
                    <TouchableOpacity
                      onPress={() => {
                        Theme.haptics.light();
                        router.push({
                          pathname: "/groups/add-expense",
                          params: { groupId: id, expenseId: item.id },
                        });
                      }}
                      className="p-2 rounded-lg bg-surfaceLight mr-1 active:opacity-80"
                    >
                      <Text className="text-accentCyan text-[9px] font-bold">Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        Theme.haptics.medium();
                        deleteExpenseMutation.mutate(item.id);
                      }}
                      className="p-2 rounded-lg bg-surfaceLight active:opacity-80"
                    >
                      <Text className="text-accentPink text-[9px] font-bold">Del</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          } else if (activeTab === "balances") {
            const fromMember = members?.find((m: any) => m.profile.id === item.from)?.profile;
            const toMember = members?.find((m: any) => m.profile.id === item.to)?.profile;
            const canSettle = item.from === user?.id || item.to === user?.id;

            return (
              <View className="flex-row items-center justify-between bg-surface border-[0.5px] border-border p-4 rounded-xl mb-3">
                <View className="flex-1 mr-3">
                  <Text className="text-white text-sm font-semibold">
                    {fromMember?.display_name || "Someone"} owes {toMember?.display_name || "Someone"}
                  </Text>
                  <Text className="text-accentGray text-xs mt-1">₹ {item.amount}</Text>
                </View>
                {canSettle && (
                  <TouchableOpacity
                    onPress={() => {
                      Theme.haptics.medium();
                      settleMutation.mutate(item);
                    }}
                    disabled={settleMutation.isPending}
                    className="bg-accentCyan px-3 py-2 rounded-xl active:opacity-90"
                  >
                    <Text className="text-background text-xs font-black">
                      {settleMutation.isPending ? "..." : "Settle"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          } else {
            return (
              <View className="flex-row items-center bg-surface border-[0.5px] border-border p-4 rounded-xl mb-3">
                <View className="w-10 h-10 justify-center items-center rounded-full bg-surfaceLight mr-3">
                  <Text className="text-base">{item.profile.avatar_url || "👋"}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-white text-sm font-bold">{item.profile.display_name}</Text>
                  <Text className="text-accentGray text-[10px] mt-0.5">{item.profile.email}</Text>
                </View>
                {item.role === "admin" && (
                  <View className="bg-accentCyan/10 border-[0.5px] border-accentCyan px-2 py-1 rounded">
                    <Text className="text-accentCyan text-[9px] font-bold">Admin</Text>
                  </View>
                )}
              </View>
            );
          }
        }}
        ListEmptyComponent={
          <View className="py-12 items-center justify-center px-4 bg-surface rounded-2xl border-[0.5px] border-border">
            <Text className="text-white text-base font-bold text-center mb-1">
              {activeTab === "ledger"
                ? "No Expenses Logged"
                : activeTab === "balances"
                ? "Ledger Fully Settled"
                : "No Roommates Yet"}
            </Text>
            <Text className="text-accentGray text-xs text-center leading-relaxed">
              {activeTab === "ledger"
                ? "Tap the '+' button below to split your first bill with the roommates!"
                : activeTab === "balances"
                ? "Everyone is completely squared up. No outstanding balances found."
                : "Share the invite code above to get your roommates added to this group."}
            </Text>
          </View>
        }
      />

      {/* Floating Action Button (FAB) to Add Expense */}
      <TouchableOpacity
        onPress={() => {
          Theme.haptics.light();
          router.push({
            pathname: "/groups/add-expense",
            params: { groupId: id },
          });
        }}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-accentCyan justify-center items-center shadow-lg active:scale-95 z-40"
      >
        <Plus size={24} color="#0D0D0D" />
      </TouchableOpacity>

      {/* GROUP SETTINGS / LEAVE SHEET */}
      <Modal visible={isSettingsOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-surface border-t-[0.5px] border-border rounded-t-3xl p-6 pb-10">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-white">Group Settings</Text>
              <TouchableOpacity
                onPress={() => setIsSettingsOpen(false)}
                className="w-8 h-8 justify-center items-center rounded-full bg-surfaceLight"
              >
                <X size={16} color="#A3A3A3" />
              </TouchableOpacity>
            </View>

            {isAdmin ? (
              // Edit Details View (Admin Only)
              <View className="space-y-4">
                <View>
                  <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
                    Rename Group
                  </Text>
                  <Controller
                    control={control}
                    name="name"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        className="bg-surfaceLight border-[0.5px] border-border text-white px-4 py-3 rounded-xl"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                      />
                    )}
                  />
                  {errors.name && (
                    <Text className="text-accentPink text-xs mt-1">{errors.name.message}</Text>
                  )}
                </View>

                <View>
                  <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
                    Edit Description
                  </Text>
                  <Controller
                    control={control}
                    name="description"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        className="bg-surfaceLight border-[0.5px] border-border text-white px-4 py-3 rounded-xl"
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

                {/* Save Edit Button */}
                <TouchableOpacity
                  onPress={handleSubmit((data) => updateMutation.mutate(data))}
                  disabled={updateMutation.isPending}
                  className="flex-row bg-accentCyan py-4 rounded-xl justify-center items-center active:opacity-90 mt-4"
                >
                  {updateMutation.isPending ? (
                    <ActivityIndicator size="small" color="#0D0D0D" />
                  ) : (
                    <>
                      <Save size={18} color="#0D0D0D" />
                      <Text className="text-background font-black text-base ml-2">
                        Save Settings
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Delete Group Button (Admin only) */}
                <TouchableOpacity
                  onPress={handleDeleteGroup}
                  disabled={isDeleting}
                  className="flex-row border-[0.5px] border-accentPink py-4 rounded-xl justify-center items-center active:opacity-85 mt-2"
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color="#FF007F" />
                  ) : (
                    <>
                      <Trash2 size={18} color="#FF007F" />
                      <Text className="text-accentPink font-bold text-base ml-2">Delete Group</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              // Non-Admin Leave View
              <View className="space-y-4">
                <Text className="text-accentGray text-sm leading-relaxed mb-6">
                  You are a member of this group. You can leave the group below. Note that this will remove you from all ledger splits.
                </Text>
                <TouchableOpacity
                  onPress={handleLeaveGroup}
                  disabled={isLeaving}
                  className="flex-row border-[0.5px] border-accentPink py-4 rounded-xl justify-center items-center active:opacity-85"
                >
                  {isLeaving ? (
                    <ActivityIndicator size="small" color="#FF007F" />
                  ) : (
                    <>
                      <LogOut size={18} color="#FF007F" />
                      <Text className="text-accentPink font-bold text-base ml-2">Leave Group</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
