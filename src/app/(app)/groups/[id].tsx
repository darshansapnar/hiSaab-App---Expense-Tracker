import React, { useState, useMemo, useEffect } from "react";
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
  ScrollView,
  RefreshControl,
  Share,
} from "react-native";
import { useLocalSearchParams, useRouter, Link } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../../store/authStore";
import { supabase } from "../../../services/supabase";
import { useToastStore } from "../../../store/toastStore";
import { Theme } from "../../../constants/Theme";
import { Colors } from "../../../constants/Colors";
import * as Clipboard from "expo-clipboard";
import { triggerWittyNotification } from "../../../services/wittyNotifications";
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
  ChevronRight,
  UserMinus,
  AlertCircle,
  Share2,
  RefreshCw,
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
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "expenses" | "balances" | "members" | "activity" | "analytics" | "settlements"
  >((tab as any) || "overview");
  const [simplifyDebtsEnabled, setSimplifyDebtsEnabled] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Settle Modal fields
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [settlementFrom, setSettlementFrom] = useState("");
  const [settlementTo, setSettlementTo] = useState("");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementOutstanding, setSettlementOutstanding] = useState(0);
  const [settlementNotes, setSettlementNotes] = useState("");
  const [settlementDate, setSettlementDate] = useState("");

  useEffect(() => {
    if (tab) {
      setActiveTab(tab as any);
    }
  }, [tab]);

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
        .select("role, joined_at, profile:profiles(*)")
        .eq("group_id", id);

      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!id,
  });

  // 2.5. Fetch group expenses listing
  const { data: expenses, isLoading: isExpensesLoading } = useQuery({
    queryKey: ["group-expenses", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select(
          "*, payer:profiles(*), category:categories(*), splits:expense_splits(debtor_id, debtor:profiles(*))"
        )
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
      const { data, error } = await supabase.from("peer_balances").select("*").eq("group_id", id);

      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!id,
  });

  // Mutation to record a settlement payment
  const settleMutation = useMutation({
    mutationFn: async (settlement: {
      from: string;
      to: string;
      amount: number;
      notes?: string;
      date?: string;
    }) => {
      const { data: cat } = await supabase
        .from("categories")
        .select("id")
        .eq("name", "Other")
        .single();

      const isoDate = settlement.date
        ? new Date(settlement.date).toISOString()
        : new Date().toISOString();

      const { data: newExpense, error: expError } = await supabase
        .from("expenses")
        .insert({
          group_id: id,
          paid_by: settlement.from,
          amount: settlement.amount,
          description: "Settlement Payment",
          category_id: cat?.id,
          is_settlement: true,
          is_confirmed: true,
          notes: settlement.notes || null,
          expense_date: isoDate,
        })
        .select()
        .single();

      if (expError) throw expError;

      const { error: splitError } = await supabase.from("expense_splits").insert({
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
      queryClient.invalidateQueries({ queryKey: ["dashboard-peer-balances"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-personal-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["global-peer-balances", user?.id] });
      triggerWittyNotification("settlement_completed", "Settlement Done");
      setIsSettleModalOpen(false);
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to record settlement", "error");
    },
  });

  const transferOwnershipMutation = useMutation({
    mutationFn: async (newOwnerId: string) => {
      const { error } = await supabase
        .from("groups")
        .update({ created_by: newOwnerId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["group", id] });
      showToast("Group ownership transferred successfully", "success");
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to transfer ownership", "error");
    },
  });

  // Mutation to confirm a settlement payment
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
      queryClient.invalidateQueries({ queryKey: ["global-peer-balances", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
      triggerWittyNotification("settlement_completed", "Settlement Confirmed");
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
      queryClient.invalidateQueries({ queryKey: ["global-peer-balances", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
      triggerWittyNotification("expense_deleted", "Expense Deleted");
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to delete expense", "error");
    },
  });

  // Mutation to remove a member (Admin only)
  const removeMemberMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", id)
        .eq("profile_id", profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["group-members", id] });
      queryClient.invalidateQueries({ queryKey: ["peer-balances", id] });
      showToast("Member removed from group", "success");
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to remove member", "error");
    },
  });

  // Determine active user's role in the group
  const userMemberInfo = members?.find((m: any) => m.profile?.id === user?.id);
  const isAdmin = userMemberInfo?.role === "admin";

  const {
    control,
    handleSubmit,
    formState: { errors },
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

  // Calculate net balances for each group member
  const netBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    if (members) {
      members.forEach((m: any) => {
        balances[m.profile.id] = 0;
      });
    }

    if (peerBalances && peerBalances.length > 0) {
      peerBalances.forEach((row: any) => {
        balances[row.user_a_id] = (balances[row.user_a_id] || 0) + Number(row.net_balance);
        balances[row.user_b_id] = (balances[row.user_b_id] || 0) - Number(row.net_balance);
      });
    } else if (expenses) {
      expenses.forEach((exp: any) => {
        if (exp.is_settlement && !exp.is_confirmed) return;
        const payerId = exp.paid_by;
        const totalAmount = Number(exp.amount) || 0;
        if (balances[payerId] !== undefined) balances[payerId] += totalAmount;
        if (exp.splits) {
          exp.splits.forEach((split: any) => {
            const debtorId = split.debtor_id;
            const splitAmount = Number(split.amount) || 0;
            if (balances[debtorId] !== undefined) balances[debtorId] -= splitAmount;
          });
        }
      });
    }
    return balances;
  }, [members, peerBalances, expenses]);

  // Calculate raw peer-to-peer debts
  const rawDebts = useMemo(() => {
    const list: any[] = [];
    peerBalances?.forEach((pb: any) => {
      const bal = Number(pb.net_balance);
      if (bal > 0.01) {
        list.push({ from: pb.user_b_id, to: pb.user_a_id, amount: bal });
      } else if (bal < -0.01) {
        list.push({ from: pb.user_a_id, to: pb.user_b_id, amount: Math.abs(bal) });
      }
    });
    return list;
  }, [peerBalances]);

  // Derived activity logs list
  const activityList = useMemo(() => {
    const list: any[] = [];
    if (members) {
      members.forEach((m: any) => {
        list.push({
          id: `joined-${m.profile.id}`,
          type: "joined",
          date: new Date(m.joined_at || group?.created_at || Date.now()),
          title: `${m.profile.username ? `@${m.profile.username}` : m.profile.display_name} joined`,
          subtitle: `Joined as a ${m.role}`,
          icon: "👤",
        });
      });
    }
    if (expenses) {
      expenses.forEach((exp: any) => {
        if (exp.is_settlement) {
          const recipient = exp.splits?.[0]?.debtor;
          list.push({
            id: `settle-${exp.id}`,
            type: "settle",
            date: new Date(exp.expense_date),
            title: `${exp.payer?.username ? `@${exp.payer.username}` : exp.payer?.display_name || "Someone"} paid ${recipient?.username ? `@${recipient.username}` : recipient?.display_name || "Someone"} ₹${Number(exp.amount).toFixed(0)}`,
            subtitle: exp.notes ? `"${exp.notes}"` : "Settlement payment",
            icon: "🤝",
          });
        } else {
          list.push({
            id: `expense-${exp.id}`,
            type: "expense",
            date: new Date(exp.expense_date),
            title: `${exp.payer?.username ? `@${exp.payer.username}` : exp.payer?.display_name || "Someone"} added "${exp.description}"`,
            subtitle: `₹${exp.amount} • ${exp.category?.name || "Other"}`,
            icon:
              exp.category?.icon_name === "shopping-cart"
                ? "🛒"
                : exp.category?.icon_name === "utensils"
                  ? "🍕"
                  : exp.category?.icon_name === "home"
                    ? "🏠"
                    : "💸",
          });
        }
      });
    }
    return list.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [members, expenses, group]);

  // Dynamic spending analytics
  const analyticsData = useMemo(() => {
    if (!expenses) return null;
    const nonSettlements = expenses.filter((e: any) => !e.is_settlement);
    const totalSpent = nonSettlements.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
    const averageExpense = nonSettlements.length > 0 ? totalSpent / nonSettlements.length : 0;
    const largestExpense =
      nonSettlements.length > 0 ? Math.max(...nonSettlements.map((e: any) => Number(e.amount))) : 0;

    // Spending by category
    const catMap: Record<string, { amount: number; color: string; icon: string }> = {};
    nonSettlements.forEach((e: any) => {
      const name = e.category?.name || "Other";
      const color = e.category?.color_code || Colors.accentGray;
      const icon = e.category?.icon_name || "file-text";
      if (!catMap[name]) {
        catMap[name] = { amount: 0, color, icon };
      }
      catMap[name].amount += Number(e.amount);
    });

    const categoryList = Object.keys(catMap)
      .map((name) => ({
        name,
        amount: catMap[name].amount,
        color: catMap[name].color,
        icon: catMap[name].icon,
        percentage: totalSpent > 0 ? (catMap[name].amount / totalSpent) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Spending by member
    const memMap: Record<string, { amount: number; name: string; avatar: string }> = {};
    nonSettlements.forEach((e: any) => {
      const payerId = e.paid_by;
      const name = e.payer?.username ? `@${e.payer.username}` : e.payer?.display_name || "Unknown";
      const avatar = e.payer?.avatar_url || "👋";
      if (!memMap[payerId]) {
        memMap[payerId] = { amount: 0, name, avatar };
      }
      memMap[payerId].amount += Number(e.amount);
    });

    const memberList = Object.keys(memMap)
      .map((id) => ({
        id,
        name: memMap[id].name,
        avatar: memMap[id].avatar,
        amount: memMap[id].amount,
        percentage: totalSpent > 0 ? (memMap[id].amount / totalSpent) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      totalSpent,
      averageExpense,
      largestExpense,
      categories: categoryList,
      members: memberList,
    };
  }, [expenses]);

  const getGroupAvatarStyles = (name: string) => {
    const firstLetter = (name || "G").charAt(0).toUpperCase();
    const colors = [
      { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400" },
      { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400" },
      { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400" },
      { bg: "bg-purple-500/10 border-purple-500/20", text: "text-purple-400" },
      { bg: "bg-yellow-500/10 border-yellow-500/20", text: "text-yellow-400" },
      { bg: "bg-pink-500/10 border-pink-500/20", text: "text-pink-400" },
      { bg: "bg-cyan-500/10 border-cyan-500/20", text: "text-cyan-400" },
      { bg: "bg-orange-500/10 border-orange-500/20", text: "text-orange-400" },
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) {
      sum += name.charCodeAt(i);
    }
    const color = colors[sum % colors.length];
    return {
      letter: firstLetter,
      bgClass: color.bg,
      textClass: color.text,
    };
  };

  const simplifiedDebts = simplifyDebts(netBalances);
  const userOutstandingDebts = useMemo(() => {
    return simplifiedDebts.filter((d) => d.from === user?.id || d.to === user?.id);
  }, [simplifiedDebts, user?.id]);
  const avatar = getGroupAvatarStyles(group?.name || "G");

  if (isGroupLoading || isMembersLoading || isExpensesLoading || isBalancesLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-[#0B1220]">
        <ActivityIndicator size="large" color={Colors.accentCyan} />
      </View>
    );
  }

  if (!group) {
    return (
      <View className="flex-1 justify-center items-center bg-[#0B1220] px-6">
        <Text className="text-white text-lg font-bold mb-4">Group not found</Text>
        <Link href="/(app)/(tabs)/groups" replace asChild>
          <TouchableOpacity className="bg-accentCyan px-6 py-3 rounded-xl">
            <Text className="text-background font-bold">Go Back</Text>
          </TouchableOpacity>
        </Link>
      </View>
    );
  }

  // Active list dataset
  const listData =
    activeTab === "overview"
      ? expenses?.filter((e: any) => !e.is_settlement).slice(0, 3) || []
      : activeTab === "expenses"
        ? expenses?.filter((e: any) => !e.is_settlement)
        : activeTab === "balances"
          ? simplifyDebtsEnabled
            ? simplifiedDebts
            : rawDebts
          : activeTab === "members"
            ? members
            : activeTab === "activity"
              ? activityList
              : [];

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
          <ChevronLeft size={20} color={Colors.accentCyan} />
        </TouchableOpacity>
        <Text
          className="text-white text-lg font-bold flex-1 text-center ml-2 mr-2"
          numberOfLines={1}
        >
          {group.name}
        </Text>
        <TouchableOpacity
          onPress={() => {
            Theme.haptics.light();
            setIsSettingsOpen(true);
          }}
          className="p-1 rounded-full bg-[#151E2E] border-[0.5px] border-white/10"
        >
          <Settings size={20} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1, position: "relative" }}>
        <FlatList
          data={listData}
          keyExtractor={(item, index) =>
            item.id || item.profile?.id || `${item.from}-${item.to}-${index}`
          }
          contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={isExpensesLoading || isBalancesLoading || isMembersLoading}
              onRefresh={() => {
                Theme.haptics.light();
                queryClient.invalidateQueries({ queryKey: ["group", id] });
                queryClient.invalidateQueries({ queryKey: ["group-members", id] });
                queryClient.invalidateQueries({ queryKey: ["group-expenses", id] });
                queryClient.invalidateQueries({ queryKey: ["peer-balances", id] });
              }}
              tintColor={Colors.accentCyan}
            />
          }
          ListHeaderComponent={
            <>
              {/* Banner Category Card */}
              <View className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-5 mb-6 flex-row justify-between items-center shadow-lg">
                <View className="flex-row items-center flex-1 mr-4">
                  <View
                    className={`w-12 h-12 justify-center items-center rounded-full border-[0.5px] mr-3 ${avatar.bgClass}`}
                  >
                    <Text className={`text-lg font-black ${avatar.textClass}`}>
                      {avatar.letter}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-white text-lg font-black">{group.name}</Text>
                    <Text className="text-[#94A3B8] text-[10px] mt-0.5" numberOfLines={1}>
                      {group.description || `Type: ${group.type}`}
                    </Text>
                  </View>
                </View>

                {/* Always Visible Invite Code Widget */}
                <View className="items-end bg-white/5 border border-white/10 rounded-xl p-2.5">
                  <Text className="text-[#94A3B8] text-[8px] font-bold uppercase tracking-wider mb-0.5">
                    Invite Code
                  </Text>
                  <Text className="text-white text-sm font-black tracking-widest mb-1.5">
                    {group.invite_code || "—"}
                  </Text>
                  <View className="flex-row space-x-1">
                    <TouchableOpacity
                      onPress={async () => {
                        Theme.haptics.light();
                        const code = group.invite_code || group.id;
                        await Clipboard.setStringAsync(code);
                        showToast("Invite code copied.", "success");
                      }}
                      className="p-1.5 bg-white/5 border border-white/10 rounded-lg active:scale-95 mr-1"
                    >
                      <Copy size={12} color="#14E5D4" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        Theme.haptics.light();
                        const code = group.invite_code || group.id;
                        try {
                          await Share.share({
                            message: `Join my hiSaab group!\n\nGroup: ${group.name}\nInvite Code: ${code}\n\nOpen hiSaab → Groups → Join Group and enter this code.\n\nKeep the hisaab clear. 🤝`,
                          });
                        } catch {}
                      }}
                      className="p-1.5 bg-white/5 border border-white/10 rounded-lg active:scale-95 mr-1"
                    >
                      <Share2 size={12} color="#14E5D4" />
                    </TouchableOpacity>

                    {/* Regenerate (admin only) */}
                    {group.created_by === user?.id && (
                      <TouchableOpacity
                        onPress={async () => {
                          Theme.haptics.light();
                          setIsRegenerating(true);
                          try {
                            const { data, error } = await supabase.rpc("regenerate_invite_code", {
                              p_group_id: id,
                              p_user_id: user?.id,
                            });
                            if (error) throw error;
                            queryClient.invalidateQueries({ queryKey: ["group", id] });
                            showToast("Invite code regenerated.", "success");
                          } catch (e: any) {
                            showToast(e.message || "Failed to regenerate code", "error");
                          } finally {
                            setIsRegenerating(false);
                          }
                        }}
                        disabled={isRegenerating}
                        className="p-1.5 bg-white/5 border border-white/10 rounded-lg active:scale-95"
                      >
                        {isRegenerating ? (
                          <ActivityIndicator size="small" color="#14E5D4" />
                        ) : (
                          <RefreshCw size={12} color="#F59E0B" />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>

              {/* Always-visible Settle Up button right below category banner */}
              {userOutstandingDebts.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    Theme.haptics.medium();
                    if (userOutstandingDebts.length === 1) {
                      const debt = userOutstandingDebts[0];
                      setSettlementFrom(debt.from);
                      setSettlementTo(debt.to);
                      setSettlementAmount(debt.amount.toFixed(0));
                      setSettlementOutstanding(debt.amount);
                      setSettlementNotes("");
                      setSettlementDate(new Date().toISOString().split("T")[0]);
                      setIsSettleModalOpen(true);
                    } else {
                      // If multiple debts exist, switch to balances tab and guide them
                      setActiveTab("balances");
                      showToast("Please tap 'Settle' next to the balance you want to settle.", "info");
                    }
                  }}
                  className="bg-[#14E5D4] rounded-2xl py-3.5 mb-6 items-center justify-center active:scale-95 shadow-md shadow-[#14E5D4]/20"
                >
                  <Text className="text-[#0B1220] font-black text-sm">🤝 Settle Up</Text>
                </TouchableOpacity>
              )}

              {/* Quick Stats Header widget */}
              {activeTab === "overview" &&
                expenses &&
                expenses.filter((e: any) => !e.is_settlement).length > 0 && (
                  <View className="bg-[#151E2E]/60 border-[0.5px] border-white/5 rounded-2xl p-4 mb-6 flex-row justify-between shadow-md">
                    <View className="flex-grow flex-shrink">
                      <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-wider mb-1">
                        Group Spent
                      </Text>
                      <Text className="text-white text-base font-black">
                        ₹{analyticsData?.totalSpent.toFixed(0)}
                      </Text>
                    </View>
                    <View className="flex-grow flex-shrink items-center border-x border-white/5 px-2">
                      <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-wider mb-1">
                        Average
                      </Text>
                      <Text className="text-white text-base font-black">
                        ₹{analyticsData?.averageExpense.toFixed(0)}
                      </Text>
                    </View>
                    <View className="flex-grow flex-shrink items-end pl-2">
                      <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-wider mb-1">
                        {(netBalances[user?.id || ""] || 0) > 0.01
                          ? "To Receive"
                          : (netBalances[user?.id || ""] || 0) < -0.01
                            ? "To Pay"
                            : "Net Balance"}
                      </Text>
                      <Text
                        className={`text-base font-black ${
                          (netBalances[user?.id || ""] || 0) > 0.01
                            ? "text-[#22C55E]"
                            : (netBalances[user?.id || ""] || 0) < -0.01
                              ? "text-[#EF4444]"
                              : "text-white"
                        }`}
                      >
                        {(netBalances[user?.id || ""] || 0) > 0.01 ? "+" : ""}₹
                        {(netBalances[user?.id || ""] || 0).toFixed(0)}
                      </Text>
                    </View>
                  </View>
                )}

              {/* Recent Activity widget */}
              {activeTab === "overview" && activityList.length > 0 && (
                <View className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-4 mb-6 shadow-md">
                  <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-wider mb-2">
                    Recent Activity
                  </Text>
                  <View className="flex-row items-center">
                    <View className="w-8 h-8 rounded-xl bg-white/5 justify-center items-center mr-2.5 border border-white/10">
                      <Text className="text-sm">{activityList[0].icon}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-white text-xs font-semibold" numberOfLines={1}>
                        {activityList[0].title}
                      </Text>
                      <Text className="text-[#94A3B8] text-[9px] mt-0.5">
                        {activityList[0].subtitle}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Custom Tab Switcher */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
                <View className="flex-row bg-[#151E2E] border-[0.5px] border-white/5 rounded-xl p-1 shadow-md">
                  {(["overview", "expenses", "balances", "members", "activity"] as const).map(
                    (tab) => (
                      <TouchableOpacity
                        key={tab}
                        onPress={() => {
                          Theme.haptics.light();
                          setActiveTab(tab);
                        }}
                        className={`px-4 py-2 rounded-lg items-center justify-center mr-1 ${
                          activeTab === tab ? "bg-white/5 border border-white/10" : ""
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold capitalize ${
                            activeTab === tab ? "text-[#14E5D4]" : "text-[#94A3B8]"
                          }`}
                        >
                          {tab}
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>
              </ScrollView>

              {activeTab === "overview" && listData.length > 0 && (
                <Text className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-wider mb-3">
                  Recent Group Expenses
                </Text>
              )}

              {/* Inline Net Balances Grid shown in Balances Tab */}
              {activeTab === "balances" && (
                <View className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl p-5 mb-6 shadow-lg">
                  <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-3">
                    Net Balances
                  </Text>
                  {members?.map((m: any) => {
                    const balVal = netBalances[m.profile.id] || 0;
                    const isCred = balVal > 0.01;
                    const isDeb = balVal < -0.01;
                    const mAvatar = getGroupAvatarStyles(
                      m.profile.username ? `@${m.profile.username}` : m.profile.display_name
                    );

                    return (
                      <View
                        key={m.profile.id}
                        className="flex-row items-center justify-between py-2.5 border-b-[0.5px] border-white/5"
                      >
                        <View className="flex-row items-center">
                          <View
                            className={`w-8 h-8 rounded-full border-[0.5px] justify-center items-center mr-2.5 ${mAvatar.bgClass}`}
                          >
                            <Text className={`text-xs font-bold ${mAvatar.textClass}`}>
                              {mAvatar.letter}
                            </Text>
                          </View>
                          <Text className="text-white text-sm font-semibold">
                            {m.profile.username ? `@${m.profile.username}` : m.profile.display_name}
                          </Text>
                        </View>
                        <Text
                          className={`text-sm font-bold ${
                            isCred ? "text-[#22C55E]" : isDeb ? "text-[#EF4444]" : "text-[#94A3B8]"
                          }`}
                        >
                          {isCred
                            ? `+ ₹${balVal.toFixed(0)}`
                            : isDeb
                              ? `- ₹${Math.abs(balVal).toFixed(0)}`
                              : "Settled"}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Balances Subheading */}
              {activeTab === "balances" && (
                <View className="flex-row justify-between items-center mb-4">
                  <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest">
                    Suggested Payments
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      Theme.haptics.light();
                      setSimplifyDebtsEnabled(!simplifyDebtsEnabled);
                    }}
                    className="bg-[#151E2E] border-[0.5px] border-white/5 px-2.5 py-1 rounded-lg"
                  >
                    <Text className="text-[10px] text-accentCyan font-bold">
                      {simplifyDebtsEnabled ? "Debts Simplified" : "Raw Debts"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}



              {/* Analytics Tab layout */}
              {activeTab === "analytics" && analyticsData && (
                <View className="space-y-6">
                  {/* Visual Overview */}
                  <View className="bg-[#151E2E] border-[0.5px] border-white/5 p-5 rounded-2xl shadow-lg">
                    <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-4">
                      Redistribution Stats
                    </Text>
                    <View className="space-y-4">
                      <View className="flex-row justify-between py-1 border-b border-white/5">
                        <Text className="text-[#94A3B8] text-xs font-medium">Total Spent</Text>
                        <Text className="text-white text-sm font-black">
                          ₹{analyticsData.totalSpent.toFixed(0)}
                        </Text>
                      </View>
                      <View className="flex-row justify-between py-1 border-b border-white/5 mt-2">
                        <Text className="text-[#94A3B8] text-xs font-medium">Average Expense</Text>
                        <Text className="text-white text-sm font-black">
                          ₹{analyticsData.averageExpense.toFixed(0)}
                        </Text>
                      </View>
                      <View className="flex-row justify-between py-1 mt-2">
                        <Text className="text-[#94A3B8] text-xs font-medium">Largest Expense</Text>
                        <Text className="text-white text-sm font-black">
                          ₹{analyticsData.largestExpense.toFixed(0)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Spending by Category progress bars */}
                  <View className="bg-[#151E2E] border-[0.5px] border-white/5 p-5 rounded-2xl mt-4 shadow-lg">
                    <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-4">
                      By Category
                    </Text>
                    {analyticsData.categories.length > 0 ? (
                      analyticsData.categories.map((c, idx) => (
                        <View key={c.name} className={`${idx > 0 ? "mt-4" : ""}`}>
                          <View className="flex-row justify-between items-center mb-1">
                            <Text className="text-white text-xs font-semibold">{c.name}</Text>
                            <Text className="text-[#94A3B8] text-xs font-bold">
                              ₹{c.amount.toFixed(0)} ({c.percentage.toFixed(0)}%)
                            </Text>
                          </View>
                          <View className="h-2 bg-[#0B1220] rounded-full overflow-hidden">
                            <View
                              style={{ width: `${c.percentage}%`, backgroundColor: c.color }}
                              className="h-full rounded-full"
                            />
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text className="text-[#94A3B8] text-xs italic">No expenses logged yet.</Text>
                    )}
                  </View>

                  {/* Spending by Member contribution progress bars */}
                  <View className="bg-[#151E2E] border-[0.5px] border-white/5 p-5 rounded-2xl mt-4 shadow-lg">
                    <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-4">
                      Payer Contribution
                    </Text>
                    {analyticsData.members.length > 0 ? (
                      analyticsData.members.map((m, idx) => (
                        <View key={m.id} className={`${idx > 0 ? "mt-4" : ""}`}>
                          <View className="flex-row justify-between items-center mb-1">
                            <View className="flex-row items-center">
                              <Text className="text-xs mr-1">{m.avatar}</Text>
                              <Text className="text-white text-xs font-semibold">{m.name}</Text>
                            </View>
                            <Text className="text-[#94A3B8] text-xs font-bold">
                              ₹{m.amount.toFixed(0)} ({m.percentage.toFixed(0)}%)
                            </Text>
                          </View>
                          <View className="h-2 bg-[#0B1220] rounded-full overflow-hidden">
                            <View
                              style={{ width: `${m.percentage}%` }}
                              className="h-full bg-accentCyan rounded-full"
                            />
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text className="text-[#94A3B8] text-xs italic">
                        No contributions logged.
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </>
          }
          renderItem={({ item }) => {
            if (activeTab === "expenses" || activeTab === "overview") {
              const isPayer = item.paid_by === user?.id;

              return (
                <View className="bg-[#151E2E] border-[0.5px] border-white/5 p-4 rounded-2xl mb-3 shadow-md">
                  <View className="flex-row items-center">
                    <View className="w-10 h-10 justify-center items-center rounded-xl bg-white/5 mr-3">
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
                      <Text className="text-[#94A3B8] text-[10px] mt-0.5" numberOfLines={1}>
                        Paid by{" "}
                        {item.payer?.username
                          ? `@${item.payer.username}`
                          : item.payer?.display_name || "Deleted User"}
                      </Text>
                    </View>
                    <View className="items-end mr-3">
                      <Text className="text-white font-bold text-sm">₹ {item.amount}</Text>
                      <Text className="text-[#94A3B8] text-[9px] mt-0.5">
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
                          className="p-2 rounded-lg bg-white/5 mr-1 active:opacity-80 border-[0.5px] border-white/10"
                        >
                          <Text className="text-[#14E5D4] text-[9px] font-bold">Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            Theme.haptics.medium();
                            deleteExpenseMutation.mutate(item.id);
                          }}
                          className="p-2 rounded-lg bg-white/5 active:opacity-80 border-[0.5px] border-white/10"
                        >
                          <Text className="text-[#EF4444] text-[9px] font-bold">Del</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            } else if (activeTab === "settlements") {
              const recipient = item.splits?.[0]?.debtor;
              const settlementsList = expenses?.filter((e: any) => e.is_settlement) || [];
              const isLatest = settlementsList.length > 0 && settlementsList[0].id === item.id;

              return (
                <View className="bg-[#151E2E] border-[0.5px] border-white/5 p-4 rounded-2xl mb-3 shadow-md">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1 mr-2">
                      <View className="w-8 h-8 justify-center items-center rounded-lg bg-[#22C55E]/10 mr-2.5">
                        <Text className="text-base">🤝</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-white text-sm font-bold" numberOfLines={1}>
                          {item.payer?.username
                            ? `@${item.payer.username}`
                            : item.payer?.display_name || "Someone"}{" "}
                          paid{" "}
                          {recipient?.username
                            ? `@${recipient.username}`
                            : recipient?.display_name || "Someone"}
                        </Text>
                        {item.notes ? (
                          <Text className="text-[#94A3B8] text-[10px] mt-0.5 italic">
                            "{item.notes}"
                          </Text>
                        ) : null}
                        <Text className="text-[#94A3B8] text-[9px] mt-1">
                          {new Date(item.expense_date).toLocaleDateString()} •{" "}
                          {new Date(item.expense_date).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                    </View>
                    <View className="items-end justify-center">
                      <Text className="text-[#22C55E] font-extrabold text-sm">₹ {item.amount}</Text>
                      {isLatest && (
                        <TouchableOpacity
                          onPress={() => {
                            Theme.haptics.medium();
                            deleteExpenseMutation.mutate(item.id);
                          }}
                          style={{
                            marginTop: 6,
                            backgroundColor: "rgba(239, 68, 68, 0.1)",
                            borderColor: "rgba(239, 68, 68, 0.2)",
                            borderWidth: 0.5,
                            borderRadius: 8,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                          }}
                          className="active:opacity-85"
                        >
                          <Text style={{ color: "#EF4444", fontSize: 9, fontWeight: "800" }}>
                            Delete
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            } else if (activeTab === "balances") {
              const fromMember = members?.find((m: any) => m.profile.id === item.from)?.profile;
              const toMember = members?.find((m: any) => m.profile.id === item.to)?.profile;
              const canSettle = item.from === user?.id || item.to === user?.id;

              return (
                <View className="flex-row items-center justify-between bg-[#151E2E] border-[0.5px] border-white/5 p-4 rounded-2xl mb-3 shadow-md">
                  <View className="flex-1 mr-3">
                    <Text className="text-white text-sm font-semibold">
                      {fromMember?.id === user?.id
                        ? `To Pay: ${toMember?.username ? `@${toMember.username}` : toMember?.display_name || "Someone"}`
                        : toMember?.id === user?.id
                          ? `${fromMember?.username ? `@${fromMember.username}` : fromMember?.display_name || "Someone"} to pay you`
                          : `${fromMember?.username ? `@${fromMember.username}` : fromMember?.display_name || "Someone"} owes ${toMember?.username ? `@${toMember.username}` : toMember?.display_name || "Someone"}`}
                    </Text>
                    <Text
                      className={`text-xs mt-1 font-bold ${
                        fromMember?.id === user?.id
                          ? "text-[#EF4444]"
                          : toMember?.id === user?.id
                            ? "text-[#22C55E]"
                            : "text-[#94A3B8]"
                      }`}
                    >
                      ₹ {item.amount.toFixed(0)}
                    </Text>
                  </View>
                  {canSettle && (
                    <TouchableOpacity
                      onPress={() => {
                        Theme.haptics.medium();
                        setSettlementFrom(item.from);
                        setSettlementTo(item.to);
                        setSettlementAmount(item.amount.toFixed(0));
                        setSettlementOutstanding(item.amount);
                        setSettlementNotes("");
                        setSettlementDate(new Date().toISOString().split("T")[0]);
                        setIsSettleModalOpen(true);
                      }}
                      className="bg-[#14E5D4] px-4 py-2.5 rounded-xl active:opacity-90 shadow-md shadow-[#14E5D4]/20"
                    >
                      <Text className="text-[#0B1220] text-xs font-black">Settle</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            } else if (activeTab === "members") {
              const isSelf = item.profile.id === user?.id;
              const mAvatar = getGroupAvatarStyles(
                item.profile.username ? `@${item.profile.username}` : item.profile.display_name
              );

              return (
                <View className="bg-[#151E2E] border-[0.5px] border-white/5 p-4 rounded-2xl mb-3 shadow-md">
                  <View className="flex-row items-center mb-3">
                    <View
                      className={`w-10 h-10 border-[0.5px] justify-center items-center rounded-full mr-3 ${mAvatar.bgClass}`}
                    >
                      <Text className={`text-sm font-bold ${mAvatar.textClass}`}>
                        {mAvatar.letter}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-white text-sm font-bold">
                        {item.profile.username
                          ? `@${item.profile.username}`
                          : item.profile.display_name}
                      </Text>
                      {item.profile.username && (
                        <Text className="text-[#94A3B8] text-[10px] mt-0.5">
                          {item.profile.display_name}
                        </Text>
                      )}
                      <Text className="text-[#94A3B8] text-[9px] mt-0.5">
                        Joined:{" "}
                        {new Date(item.joined_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-center justify-end space-x-2">
                    {group.created_by === item.profile.id && (
                      <View className="bg-[#22C55E]/10 border-[0.5px] border-[#22C55E] px-2.5 py-1 rounded mr-1">
                        <Text className="text-[#22C55E] text-[9px] font-bold">Owner</Text>
                      </View>
                    )}
                    {item.role === "admin" && group.created_by !== item.profile.id && (
                      <View className="bg-[#14E5D4]/10 border-[0.5px] border-[#14E5D4] px-2.5 py-1 rounded mr-1">
                        <Text className="text-[#14E5D4] text-[9px] font-bold">Admin</Text>
                      </View>
                    )}

                    {group.created_by === user?.id && !isSelf && (
                      <TouchableOpacity
                        onPress={() => {
                          Theme.haptics.medium();
                          transferOwnershipMutation.mutate(item.profile.id);
                        }}
                        className="p-2 bg-[#14E5D4]/10 rounded-xl border border-[#14E5D4]/20 active:scale-95 mr-1"
                      >
                        <Text className="text-[#14E5D4] text-[9px] font-bold">Make Owner</Text>
                      </TouchableOpacity>
                    )}

                    {isAdmin && !isSelf && (
                      <TouchableOpacity
                        onPress={() => {
                          Theme.haptics.medium();
                          removeMemberMutation.mutate(item.profile.id);
                        }}
                        className="p-2 bg-white/5 rounded-xl border border-white/10 active:scale-95"
                      >
                        <UserMinus size={14} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            } else if (activeTab === "activity") {
              return (
                <View className="flex-row bg-[#151E2E] border-[0.5px] border-white/5 p-4 rounded-2xl mb-3 items-center shadow-md">
                  <View className="w-9 h-9 rounded-xl bg-white/5 justify-center items-center mr-3 border border-white/10">
                    <Text className="text-base">{item.icon}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-white text-xs font-semibold">{item.title}</Text>
                    <Text className="text-[#94A3B8] text-[9px] mt-0.5">{item.subtitle}</Text>
                  </View>
                  <Text className="text-[#94A3B8] text-[9px] font-medium">
                    {item.date.toLocaleDateString()}
                  </Text>
                </View>
              );
            }
            return null;
          }}
          ListEmptyComponent={
            activeTab !== "analytics" ? (
              <View className="py-12 items-center justify-center px-4 bg-[#151E2E] rounded-2xl border-[0.5px] border-white/5 shadow-md">
                <AlertCircle size={28} color="#94A3B8" className="mb-2" />
                <Text className="text-white text-base font-bold text-center mb-1">
                  {activeTab === "expenses"
                    ? "No expenses yet"
                    : activeTab === "balances"
                      ? "All settled up!"
                      : activeTab === "activity"
                        ? "No activity logs"
                        : "No members"}
                </Text>
                <Text className="text-[#94A3B8] text-xs text-center leading-relaxed">
                  {activeTab === "expenses"
                    ? "Tap the '+' button below to log your first shared expense."
                    : activeTab === "balances"
                      ? "Excellent work! Everyone in the group is squared away."
                      : activeTab === "activity"
                        ? "Your transaction actions timeline will populate here."
                        : "Invite friends using the invite code above to split expenses."}
                </Text>
              </View>
            ) : null
          }
        />

        {/* Floating Action Button (Always easy to find!) */}
        {true && (
          <TouchableOpacity
            onPress={() => {
              Theme.haptics.light();
              router.push({
                pathname: "/groups/add-expense",
                params: { groupId: id },
              });
            }}
            style={{
              position: "absolute",
              bottom: 24,
              right: 24,
              shadowColor: "#14E5D4",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 10,
              elevation: 8,
            }}
            className="w-14 h-14 bg-[#14E5D4] rounded-full justify-center items-center active:scale-95 z-40"
          >
            <Plus size={28} color="#0B1220" />
          </TouchableOpacity>
        )}
      </View>

      {/* Settings Modal */}
      <Modal visible={isSettingsOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-[#151E2E] border-t-[0.5px] border-white/10 rounded-t-3xl p-6 pb-10">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-white">Group Settings</Text>
              <TouchableOpacity
                onPress={() => setIsSettingsOpen(false)}
                className="w-8 h-8 justify-center items-center rounded-full bg-white/5"
              >
                <X size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View className="space-y-4">
              <View>
                <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-2">
                  Group Name
                </Text>
                <Controller
                  control={control}
                  name="name"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className="bg-white/5 border-[0.5px] border-white/10 text-white px-4 py-3 rounded-xl text-sm"
                      placeholder="Group Name"
                      placeholderTextColor="#94A3B8"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {errors.name && (
                  <Text className="text-[#EF4444] text-xs mt-1">{errors.name.message}</Text>
                )}
              </View>

              <View className="mt-4">
                <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-2">
                  Description (Optional)
                </Text>
                <Controller
                  control={control}
                  name="description"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className="bg-white/5 border-[0.5px] border-white/10 text-white px-4 py-3 rounded-xl text-sm"
                      placeholder="Description"
                      placeholderTextColor="#94A3B8"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
              </View>

              <TouchableOpacity
                onPress={handleSubmit((data) => updateMutation.mutate(data))}
                disabled={updateMutation.isPending}
                className="bg-[#14E5D4] py-3 rounded-xl items-center mt-6 active:opacity-90 shadow-md shadow-[#14E5D4]/20"
              >
                <Text className="text-[#0B1220] font-black text-sm">Save Changes</Text>
              </TouchableOpacity>

              <View className="flex-row space-x-2 mt-4">
                <TouchableOpacity
                  onPress={handleLeaveGroup}
                  disabled={isLeaving}
                  className="flex-1 flex-row bg-white/5 border-[0.5px] border-white/10 py-3 rounded-xl items-center justify-center active:opacity-85 mr-2"
                >
                  <LogOut size={16} color="#EF4444" className="mr-2" />
                  <Text className="text-[#EF4444] font-bold text-xs">Leave Group</Text>
                </TouchableOpacity>

                {group.created_by === user?.id && (
                  <TouchableOpacity
                    onPress={handleDeleteGroup}
                    disabled={isDeleting}
                    className="flex-1 flex-row bg-[#EF4444]/10 border-[0.5px] border-[#EF4444]/30 py-3 rounded-xl items-center justify-center active:opacity-85"
                  >
                    <Trash2 size={16} color="#EF4444" className="mr-2" />
                    <Text className="text-[#EF4444] font-bold text-xs">Delete Group</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>
      {/* SETTLE UP MODAL */}
      <Modal visible={isSettleModalOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-[#151E2E] border-t-[0.5px] border-white/10 rounded-t-3xl p-6 pb-10">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-white">Record Settlement</Text>
              <TouchableOpacity
                onPress={() => setIsSettleModalOpen(false)}
                className="w-8 h-8 justify-center items-center rounded-full bg-white/5"
              >
                <X size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View className="space-y-4">
              {/* From / To summary */}
              {(() => {
                const fromProfile = members?.find(
                  (m: any) => m.profile.id === settlementFrom
                )?.profile;
                const toProfile = members?.find((m: any) => m.profile.id === settlementTo)?.profile;
                return (
                  <View className="bg-white/5 border border-white/10 rounded-xl p-3.5 space-y-2">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-[#94A3B8] text-xs">Payer (From):</Text>
                      <Text className="text-white text-xs font-bold">
                        {fromProfile?.username
                          ? `@${fromProfile.username}`
                          : fromProfile?.display_name || "Someone"}
                      </Text>
                    </View>
                    <View className="flex-row justify-between items-center pt-2 border-t border-white/5">
                      <Text className="text-[#94A3B8] text-xs">Receiver (To):</Text>
                      <Text className="text-white text-xs font-bold">
                        {toProfile?.username
                          ? `@${toProfile.username}`
                          : toProfile?.display_name || "Someone"}
                      </Text>
                    </View>
                    <View className="flex-row justify-between items-center pt-2 border-t border-white/5">
                      <Text className="text-[#94A3B8] text-xs">Outstanding balance:</Text>
                      <Text className="text-[#14E5D4] text-xs font-black">
                        ₹ {settlementOutstanding.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                );
              })()}
              {/* Amount */}
              <View>
                <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-2">
                  Settlement Amount (₹)
                </Text>
                <View className="flex-row items-center bg-white/5 border-[0.5px] border-white/10 rounded-xl px-4 py-3">
                  <Text className="text-[#14E5D4] font-black text-lg mr-2">₹</Text>
                  <TextInput
                    className="flex-1 text-white text-lg font-bold py-1"
                    placeholder="0.00"
                    placeholderTextColor="#666666"
                    keyboardType="numeric"
                    value={settlementAmount}
                    onChangeText={setSettlementAmount}
                  />
                </View>
              </View>

              {/* Date */}
              <View className="mt-4">
                <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-2">
                  Payment Date (YYYY-MM-DD)
                </Text>
                <TextInput
                  className="bg-white/5 border-[0.5px] border-white/10 text-white px-4 py-3 rounded-xl text-sm"
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94A3B8"
                  value={settlementDate}
                  onChangeText={setSettlementDate}
                />
              </View>

              {/* Notes */}
              <View className="mt-4">
                <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-2">
                  Notes (Optional)
                </Text>
                <TextInput
                  className="bg-white/5 border-[0.5px] border-white/10 text-white px-4 py-3 rounded-xl text-sm"
                  placeholder="e.g. Paid via GPay, Cash"
                  placeholderTextColor="#94A3B8"
                  value={settlementNotes}
                  onChangeText={setSettlementNotes}
                />
              </View>

              <TouchableOpacity
                onPress={() => {
                  const amt = Number(settlementAmount);
                  if (isNaN(amt) || amt <= 0) {
                    showToast("Please enter a valid positive amount", "error");
                    return;
                  }
                  if (amt > settlementOutstanding + 0.01) {
                    showToast(
                      `Amount cannot exceed the outstanding balance of ₹${settlementOutstanding.toFixed(0)}`,
                      "error"
                    );
                    return;
                  }
                  settleMutation.mutate({
                    from: settlementFrom,
                    to: settlementTo,
                    amount: amt,
                    notes: settlementNotes.trim(),
                    date: settlementDate,
                  });
                }}
                disabled={settleMutation.isPending}
                className="bg-[#14E5D4] py-4 rounded-xl items-center mt-6 active:opacity-90 shadow-md shadow-[#14E5D4]/20"
              >
                {settleMutation.isPending ? (
                  <ActivityIndicator size="small" color="#0B1220" />
                ) : (
                  <Text className="text-[#0B1220] font-black text-base">Confirm Settlement</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
