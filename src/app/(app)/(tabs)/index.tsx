import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  RefreshControl,
  Image,
  Platform,
} from "react-native";
import { useAuthStore } from "../../../store/authStore";
import { supabase } from "../../../services/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, Link } from "expo-router";
import { Theme } from "../../../constants/Theme";
import { Colors } from "../../../constants/Colors";
import { useToastStore } from "../../../store/toastStore";
import { SafeAreaView } from "react-native-safe-area-context";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Wallet,
  Users,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  Clock,
  Coffee,
  Hash,
  Home as HomeIcon,
  Users2,
  Compass,
  Landmark,
  Trash2,
  Edit3,
  X,
  TrendingUp,
  Award,
  Bell,
} from "lucide-react-native";

// Form schemas for Create Group, Join Group, and Edit Expense
const createGroupSchema = z.object({
  name: z
    .string()
    .min(3, "Group name must be at least 3 characters")
    .max(50, "Group name must be under 50 characters"),
  description: z.string().max(200, "Description must be under 200 characters").optional(),
  type: z.enum(["hostel", "flatmates", "trip", "couple", "family", "other"]),
  currency: z.string().min(1).max(3),
});

type CreateGroupSchema = z.infer<typeof createGroupSchema>;

const editExpenseSchema = z.object({
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Please enter a valid amount greater than 0",
  }),
  description: z.string().min(1, "Name is required").max(100, "Name must be under 100 characters"),
  categoryId: z.string().min(1, "Category is required"),
});

type EditExpenseSchema = z.infer<typeof editExpenseSchema>;

const GROUP_TYPES = [
  { value: "hostel", label: "Hostel", icon: HomeIcon },
  { value: "flatmates", label: "Flat", icon: Users2 },
  { value: "trip", label: "Trip", icon: Compass },
  { value: "couple", label: "Friends", icon: Users },
  { value: "family", label: "Family", icon: Landmark },
  { value: "other", label: "Custom", icon: Plus },
];

const TAGLINES = [
  "Ready to track today's kharcha?",
  "Every rupee has a story.",
  "Let's keep the hisaab clear.",
  "Small expenses become big memories.",
];

export default function Dashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);

  const [tagline, setTagline] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  // Edit Expense modal state
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [isEditExpenseOpen, setIsEditExpenseOpen] = useState(false);

  // Initialize random tagline
  useEffect(() => {
    const randomTag = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];
    setTagline(randomTag);
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  // 1. Fetch user's active groups (latest 3)
  const { data: groups, isLoading: isGroupsLoading } = useQuery({
    queryKey: ["dashboard-groups-latest", user?.id],
    queryFn: async () => {
      const { data: memberRows, error: memberErr } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("profile_id", user?.id);

      if (memberErr) throw memberErr;
      const groupIds = (memberRows || []).map((mr) => mr.group_id);
      if (groupIds.length === 0) return [];

      const { data: groupsData, error: groupsErr } = await supabase
        .from("groups")
        .select(`
          *,
          group_members(profile_id, role)
        `)
        .in("id", groupIds)
        .order("created_at", { ascending: false })
        .limit(3);

      if (groupsErr) throw groupsErr;
      return groupsData || [];
    },
    enabled: !!user?.id,
  });

  // 2. Fetch monthly personal expenses (latest 5 for list, all for stats)
  const { data: personalExpenses, isLoading: isExpensesLoading } = useQuery({
    queryKey: ["dashboard-personal-expenses", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_expenses")
        .select("*, category:categories(*)")
        .eq("profile_id", user?.id)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user?.id,
  });

  // 3. Fetch categories for edit form
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  // 4. Fetch peer balances to calculate To Pay & To Receive metrics
  const { data: peerBalances } = useQuery({
    queryKey: ["dashboard-peer-balances", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peer_balances")
        .select("*")
        .or(`user_a_id.eq.${user?.id},user_b_id.eq.${user?.id}`);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user?.id,
  });

  // Re-fetch handler
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dashboard-groups-latest", user?.id] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-personal-expenses", user?.id] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-peer-balances", user?.id] }),
    ]);
    setIsRefreshing(false);
  }, [queryClient, user?.id]);

  // Form setups
  const createForm = useForm<CreateGroupSchema>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "other",
      currency: "INR",
    },
  });

  const editExpenseForm = useForm<EditExpenseSchema>({
    resolver: zodResolver(editExpenseSchema),
    defaultValues: {
      amount: "",
      description: "",
      categoryId: "",
    },
  });

  const createGroupType = createForm.watch("type");

  // Mutation to create a group
  const createGroupMutation = useMutation({
    mutationFn: async (data: CreateGroupSchema) => {
      const { data: newGroup, error } = await supabase.rpc("create_group_with_admin", {
        p_name: data.name.trim(),
        p_description: data.description?.trim() || null,
        p_type: data.type,
        p_currency: data.currency,
        p_created_by: user?.id,
      });

      if (error) {
        if (error.message.includes("unique_violation") || error.message.includes("already part")) {
          throw new Error("This member is already part of the group.");
        }
        throw new Error("Couldn't create the group. Please try again.");
      }

      return newGroup;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["dashboard-groups-latest", user?.id] });
      showToast("Group created successfully", "success");
      setIsCreateOpen(false);
      createForm.reset();
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to create group", "error");
    },
  });

  // Mutation to edit an expense
  const editExpenseMutation = useMutation({
    mutationFn: async (data: EditExpenseSchema) => {
      const { error } = await supabase
        .from("personal_expenses")
        .update({
          amount: Number(data.amount),
          description: data.description.trim(),
          category_id: data.categoryId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingExpense.id);

      if (error) throw error;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["dashboard-personal-expenses", user?.id] });
      showToast("Expense updated successfully", "success");
      setIsEditExpenseOpen(false);
      setEditingExpense(null);
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to update expense", "error");
    },
  });

  // Mutation to delete an expense
  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      const { error } = await supabase.from("personal_expenses").delete().eq("id", expenseId);
      if (error) throw error;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["dashboard-personal-expenses", user?.id] });
      showToast("Expense deleted successfully", "success");
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to delete expense", "error");
    },
  });

  const handleJoinGroup = async () => {
    if (!joinCode.trim()) return;
    Theme.haptics.light();
    setIsJoining(true);

    try {
      const cleanCode = joinCode.trim();

      const { data: group, error: groupError } = await supabase
        .from("groups")
        .select("*")
        .eq("id", cleanCode)
        .single();

      if (groupError || !group) {
        Theme.haptics.error();
        showToast("Invalid invite code. Group not found.", "error");
        setIsJoining(false);
        return;
      }

      const { error: joinError } = await supabase.from("group_members").insert({
        group_id: cleanCode,
        profile_id: user?.id,
        role: "member",
      });

      if (joinError) {
        if (joinError.code === "23505") {
          showToast("You are already a member of this group", "info");
        } else {
          throw joinError;
        }
      } else {
        Theme.haptics.success();
        showToast(`Successfully joined ${group.name}`, "success");
        queryClient.invalidateQueries({ queryKey: ["dashboard-groups-latest", user?.id] });
      }

      setIsJoinOpen(false);
      setJoinCode("");
    } catch (e: any) {
      Theme.haptics.error();
      showToast(e.message || "Failed to join group", "error");
    } finally {
      setIsJoining(false);
    }
  };

  const getGroupBalance = (groupId: string) => {
    if (!peerBalances) return 0;
    let net = 0;
    peerBalances.forEach((pb: any) => {
      if (pb.group_id === groupId) {
        const bal = Number(pb.net_balance) || 0;
        if (pb.user_a_id === user?.id) {
          net += bal;
        } else if (pb.user_b_id === user?.id) {
          net -= bal;
        }
      }
    });
    return net;
  };

  // Compute calculated metrics
  const stats = useMemo(() => {
    if (!personalExpenses) {
      return { totalSpent: 0, biggestExpense: 0, topCategoryName: "None", count: 0 };
    }

    const now = new Date();
    const currentMonthExpenses = personalExpenses.filter((e) => {
      const expDate = new Date(e.expense_date);
      return expDate.getFullYear() === now.getFullYear() && expDate.getMonth() === now.getMonth();
    });

    const totalSpent = currentMonthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const biggestExpense = currentMonthExpenses.length
      ? Math.max(...currentMonthExpenses.map((e) => Number(e.amount)))
      : 0;

    // Most spent category calculations
    const catTotals: Record<string, number> = {};
    currentMonthExpenses.forEach((e) => {
      const catName = e.category?.name || "Other";
      catTotals[catName] = (catTotals[catName] || 0) + Number(e.amount);
    });

    let topCategoryName = "None";
    let maxSpent = 0;
    Object.keys(catTotals).forEach((c) => {
      if (catTotals[c] > maxSpent) {
        maxSpent = catTotals[c];
        topCategoryName = c;
      }
    });

    return {
      totalSpent,
      biggestExpense,
      topCategoryName,
      count: currentMonthExpenses.length,
    };
  }, [personalExpenses]);

  // Aggregate To Pay and To Receive sums
  const balanceSums = useMemo(() => {
    if (!peerBalances) return { toPay: 0, toReceive: 0 };
    let toPay = 0;
    let toReceive = 0;

    peerBalances.forEach((pb: any) => {
      const bal = Number(pb.net_balance) || 0;
      if (pb.user_a_id === user?.id) {
        if (bal > 0) toReceive += bal;
        else if (bal < 0) toPay += Math.abs(bal);
      } else if (pb.user_b_id === user?.id) {
        if (bal < 0) toReceive += Math.abs(bal);
        else if (bal > 0) toPay += bal;
      }
    });

    return { toPay, toReceive };
  }, [peerBalances, user?.id]);

  const latestExpenses = useMemo(() => {
    return (personalExpenses || []).slice(0, 5);
  }, [personalExpenses]);

  const getInitials = () => {
    const name = profile?.display_name || "";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase() || "?";
  };

  const getGroupAvatarLetter = (name: string) => {
    return (name || "G").charAt(0).toUpperCase();
  };

  // Render Swipe Actions
  const renderRightActions = (expense: any) => {
    return (
      <View style={{ flexDirection: "row", width: 140, height: "100%", paddingBottom: 12 }}>
        <TouchableOpacity
          onPress={() => {
            Theme.haptics.light();
            setEditingExpense(expense);
            editExpenseForm.reset({
              amount: expense.amount.toString(),
              description: expense.description,
              categoryId: expense.category_id,
            });
            setIsEditExpenseOpen(true);
          }}
          style={{
            flex: 1,
            backgroundColor: "#202D42",
            justifyContent: "center",
            alignItems: "center",
            borderTopLeftRadius: 16,
            borderBottomLeftRadius: 16,
            borderWidth: 0.5,
            borderColor: "rgba(255,255,255,0.05)",
          }}
        >
          <Edit3 size={16} color={Colors.accentCyan} />
          <Text style={{ color: Colors.accentCyan, fontSize: 9, fontWeight: "700", marginTop: 4 }}>
            Edit
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            Theme.haptics.medium();
            deleteExpenseMutation.mutate(expense.id);
          }}
          style={{
            flex: 1,
            backgroundColor: "rgba(239,68,68,0.12)",
            justifyContent: "center",
            alignItems: "center",
            borderTopRightRadius: 16,
            borderBottomRightRadius: 16,
            borderWidth: 0.5,
            borderColor: "rgba(239,68,68,0.2)",
          }}
        >
          <Trash2 size={16} color="#EF4444" />
          <Text style={{ color: "#EF4444", fontSize: 9, fontWeight: "700", marginTop: 4 }}>
            Delete
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const getCategoryIcon = (categoryName: string) => {
    const name = categoryName.toLowerCase();
    if (name.includes("food") || name.includes("eat") || name.includes("restaurant") || name.includes("cafe")) return "🍕";
    if (name.includes("shopping") || name.includes("cloth") || name.includes("grocer")) return "🛒";
    if (name.includes("rent") || name.includes("bill") || name.includes("flat") || name.includes("home")) return "🏠";
    if (name.includes("travel") || name.includes("cab") || name.includes("fuel") || name.includes("bus") || name.includes("auto")) return "🚗";
    if (name.includes("drink") || name.includes("party") || name.includes("club") || name.includes("fun")) return "🍺";
    return "💸";
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    } catch {
      return "";
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accentCyan}
          />
        }
      >
        {/* ── HEADER ── */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 24,
            paddingTop: Platform.OS === "ios" ? 12 : 20,
            paddingBottom: 20,
            backgroundColor: "#111827",
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
            borderBottomWidth: 0.5,
            borderBottomColor: "rgba(255,255,255,0.06)",
            ...Platform.select({
              web: {
                backgroundImage: "linear-gradient(to bottom, #111827, #0B1220)",
              } as any,
            }),
          }}
          className="mb-6 shadow-lg"
        >
          <View className="flex-1 mr-4">
            <Text
              style={{
                color: "#94A3B8",
                fontSize: 10,
                fontWeight: "800",
                textTransform: "uppercase",
                letterSpacing: 1.5,
              }}
            >
              {getGreeting()}
            </Text>
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 22,
                fontWeight: "900",
                letterSpacing: -0.5,
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              Hi, {profile?.username ? `@${profile.username}` : profile?.display_name || "Hisab User"} 👋
            </Text>
            <Text
              style={{
                color: Colors.accentCyan,
                fontSize: 11,
                fontWeight: "600",
                marginTop: 4,
              }}
              numberOfLines={1}
            >
              {tagline}
            </Text>
          </View>

          {/* Right Side Actions: Notification Bell + Profile Avatar */}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity
              onPress={() => {
                Theme.haptics.light();
                showToast("No new notifications", "info");
              }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "rgba(255,255,255,0.03)",
                borderWidth: 0.5,
                borderColor: "rgba(255,255,255,0.08)",
                justifyContent: "center",
                alignItems: "center",
                marginRight: 10,
              }}
              className="active:scale-95"
            >
              <Bell size={16} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                Theme.haptics.light();
                router.push("/profile");
              }}
              className="active:scale-95"
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: Colors.surface,
                  borderWidth: 1.5,
                  borderColor: "rgba(20, 229, 212, 0.25)",
                  justifyContent: "center",
                  alignItems: "center",
                  overflow: "hidden",
                }}
              >
                {profile?.avatar_url ? (
                  profile.avatar_url.length <= 4 ? (
                    <Text style={{ fontSize: 20 }}>{profile.avatar_url}</Text>
                  ) : (
                    <Image source={{ uri: profile.avatar_url }} style={{ width: 38, height: 38 }} />
                  )
                ) : (
                  <Text style={{ fontSize: 13, fontWeight: "900", color: Colors.accentCyan }}>
                    {getInitials()}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── SUMMARY SECTION ── */}
        <View className="px-6 mb-6">
          <View className="flex-row flex-wrap gap-3">
            {/* Card 1: Monthly Spent */}
            <View
              style={{
                backgroundColor: Colors.surface,
                borderWidth: 0.5,
                borderColor: "rgba(255,255,255,0.05)",
                borderRadius: 16,
                padding: 12,
                width: "48%",
                flexGrow: 1,
              }}
            >
              <View className="w-8 h-8 rounded-lg bg-accentCyan/10 justify-center items-center mb-2.5">
                <Wallet size={16} color={Colors.accentCyan} />
              </View>
              <Text style={{ color: "#94A3B8", fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>
                This Month
              </Text>
              <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "900", marginTop: 2 }}>
                ₹{stats.totalSpent.toFixed(0)}
              </Text>
            </View>

            {/* Card 2: To Pay */}
            <View
              style={{
                backgroundColor: Colors.surface,
                borderWidth: 0.5,
                borderColor: "rgba(255,255,255,0.05)",
                borderRadius: 16,
                padding: 12,
                width: "48%",
                flexGrow: 1,
              }}
            >
              <View className="w-8 h-8 rounded-lg bg-[#EF4444]/10 justify-center items-center mb-2.5">
                <ArrowUpRight size={16} color="#EF4444" />
              </View>
              <Text style={{ color: "#94A3B8", fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>
                To Pay
              </Text>
              <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "900", marginTop: 2 }}>
                ₹{balanceSums.toPay.toFixed(0)}
              </Text>
            </View>

            {/* Card 3: To Receive */}
            <View
              style={{
                backgroundColor: Colors.surface,
                borderWidth: 0.5,
                borderColor: "rgba(255,255,255,0.05)",
                borderRadius: 16,
                padding: 12,
                width: "48%",
                flexGrow: 1,
              }}
            >
              <View className="w-8 h-8 rounded-lg bg-[#22C55E]/10 justify-center items-center mb-2.5">
                <ArrowDownLeft size={16} color="#22C55E" />
              </View>
              <Text style={{ color: "#94A3B8", fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>
                To Receive
              </Text>
              <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "900", marginTop: 2 }}>
                ₹{balanceSums.toReceive.toFixed(0)}
              </Text>
            </View>

            {/* Card 4: Transactions count */}
            <View
              style={{
                backgroundColor: Colors.surface,
                borderWidth: 0.5,
                borderColor: "rgba(255,255,255,0.05)",
                borderRadius: 16,
                padding: 12,
                width: "48%",
                flexGrow: 1,
              }}
            >
              <View className="w-8 h-8 rounded-lg bg-[#818CF8]/10 justify-center items-center mb-2.5">
                <Clock size={16} color="#818CF8" />
              </View>
              <Text style={{ color: "#94A3B8", fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>
                Transactions
              </Text>
              <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "900", marginTop: 2 }}>
                {stats.count}
              </Text>
            </View>
          </View>
        </View>

        {/* ── QUICK ACTIONS ── */}
        <View className="px-6 mb-6">
          <Text className="text-[#94A3B8] text-[10px] font-bold uppercase tracking-widest mb-3">
            Quick Actions
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            {/* Action 1: Add Expense (Primary) */}
            <TouchableOpacity
              onPress={() => {
                Theme.haptics.light();
                router.push("/personal");
              }}
              style={{
                flex: 1,
                backgroundColor: Colors.surface,
                borderWidth: 1,
                borderColor: "rgba(20, 229, 212, 0.22)",
                borderRadius: 16,
                paddingVertical: 14,
                paddingHorizontal: 6,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 94,
                overflow: "hidden",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 6,
                elevation: 3,
              }}
              className="active:scale-[0.96]"
            >
              {/* Elegant top accent bar */}
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 20,
                  right: 20,
                  height: 3,
                  backgroundColor: Colors.accentCyan,
                  borderBottomLeftRadius: 3,
                  borderBottomRightRadius: 3,
                }}
              />

              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  backgroundColor: "rgba(20, 229, 212, 0.12)",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Plus size={20} color={Colors.accentCyan} />
              </View>
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 10,
                  fontWeight: "900",
                  textAlign: "center",
                  marginTop: 6,
                }}
              >
                Add Expense
              </Text>
            </TouchableOpacity>

            {/* Action 2: Create Group */}
            <TouchableOpacity
              onPress={() => {
                Theme.haptics.light();
                createForm.reset();
                setIsCreateOpen(true);
              }}
              style={{
                flex: 1,
                backgroundColor: Colors.surface,
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.05)",
                borderRadius: 16,
                paddingVertical: 14,
                paddingHorizontal: 4,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 94,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 6,
                elevation: 3,
              }}
              className="active:scale-[0.96]"
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: "rgba(129, 140, 248, 0.1)",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Users size={20} color="#818CF8" />
              </View>
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 10,
                  fontWeight: "800",
                  textAlign: "center",
                  marginTop: 6,
                }}
              >
                Create Group
              </Text>
            </TouchableOpacity>

            {/* Action 3: Join Group */}
            <TouchableOpacity
              onPress={() => {
                Theme.haptics.light();
                setJoinCode("");
                setIsJoinOpen(true);
              }}
              style={{
                flex: 1,
                backgroundColor: Colors.surface,
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.05)",
                borderRadius: 16,
                paddingVertical: 14,
                paddingHorizontal: 4,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 94,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 6,
                elevation: 3,
              }}
              className="active:scale-[0.96]"
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: "rgba(251, 191, 36, 0.1)",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Hash size={20} color="#FBBF24" />
              </View>
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 10,
                  fontWeight: "800",
                  textAlign: "center",
                  marginTop: 6,
                }}
              >
                Join Group
              </Text>
            </TouchableOpacity>

            {/* Action 4: Tiffin Tracker */}
            <TouchableOpacity
              onPress={() => {
                Theme.haptics.light();
                router.push("/tiffin");
              }}
              style={{
                flex: 1,
                backgroundColor: Colors.surface,
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.05)",
                borderRadius: 16,
                paddingVertical: 14,
                paddingHorizontal: 4,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 94,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 6,
                elevation: 3,
              }}
              className="active:scale-[0.96]"
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: "rgba(249, 115, 22, 0.1)",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Coffee size={20} color="#F97316" />
              </View>
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 10,
                  fontWeight: "800",
                  textAlign: "center",
                  marginTop: 6,
                }}
              >
                Tiffin Tracker
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── MY GROUPS ── */}
        <View className="px-6 mb-6">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-[#94A3B8] text-[10px] font-bold uppercase tracking-widest">
              My Groups
            </Text>
            {groups && groups.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  router.push("/groups");
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={{ color: Colors.accentCyan, fontSize: 11, fontWeight: "800" }}>
                  View All
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View
            style={{
              backgroundColor: Colors.surface,
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.05)",
              borderRadius: 20,
              padding: 16,
            }}
          >
            {isGroupsLoading ? (
              <ActivityIndicator size="small" color={Colors.accentCyan} className="py-4" />
            ) : groups && groups.length > 0 ? (
              <View className="space-y-3">
                {groups.map((g, index) => {
                  const bal = getGroupBalance(g.id);
                  const count = g.group_members?.length || 1;
                  const firstLetter = getGroupAvatarLetter(g.name);
                  const isLast = index === groups.length - 1;

                  return (
                    <TouchableOpacity
                      key={g.id}
                      onPress={() => {
                        Theme.haptics.light();
                        router.push(`/groups/${g.id}`);
                      }}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        paddingBottom: isLast ? 0 : 12,
                        borderBottomWidth: isLast ? 0 : 0.5,
                        borderBottomColor: "rgba(255,255,255,0.05)",
                      }}
                      className="active:opacity-80"
                    >
                      <View className="flex-row items-center flex-1 mr-2">
                        <View
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 19,
                            backgroundColor: "rgba(20, 229, 212, 0.08)",
                            borderWidth: 0.5,
                            borderColor: "rgba(20, 229, 212, 0.2)",
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <Text style={{ color: Colors.accentCyan, fontWeight: "900", fontSize: 15 }}>
                            {firstLetter}
                          </Text>
                        </View>
                        <View className="ml-3 flex-1">
                          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }} numberOfLines={1}>
                            {g.name}
                          </Text>
                          <Text style={{ color: "#94A3B8", fontSize: 9, fontWeight: "600", marginTop: 1 }}>
                            {count} {count === 1 ? "member" : "members"}
                          </Text>
                        </View>
                      </View>

                      <View className="items-end">
                        {bal > 0.01 ? (
                          <Text style={{ color: "#22C55E", fontSize: 11, fontWeight: "800" }}>
                            Receive ₹{bal.toFixed(0)}
                          </Text>
                        ) : bal < -0.01 ? (
                          <Text style={{ color: "#EF4444", fontSize: 11, fontWeight: "800" }}>
                            Pay ₹{Math.abs(bal).toFixed(0)}
                          </Text>
                        ) : (
                          <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700" }}>
                            ✓ Settled
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View className="items-center py-6">
                <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "600", textAlign: "center" }}>
                  No groups yet
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    Theme.haptics.light();
                    createForm.reset();
                    setIsCreateOpen(true);
                  }}
                  className="mt-3 bg-accentCyan px-4 py-2 rounded-xl"
                >
                  <Text style={{ color: Colors.background, fontSize: 11, fontWeight: "800" }}>
                    Create Group
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* ── RECENT EXPENSES ── */}
        <View className="px-6 mb-6">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-[#94A3B8] text-[10px] font-bold uppercase tracking-widest">
              Recent Expenses
            </Text>
            {personalExpenses && personalExpenses.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  router.push("/personal");
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={{ color: Colors.accentCyan, fontSize: 11, fontWeight: "800" }}>
                  View All
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {isExpensesLoading ? (
            <ActivityIndicator size="small" color={Colors.accentCyan} className="py-4" />
          ) : latestExpenses.length > 0 ? (
            <View className="space-y-2">
              {latestExpenses.map((item) => (
                <View
                  key={item.id}
                  style={{
                    backgroundColor: Colors.surface,
                    borderRadius: 16,
                    overflow: "hidden",
                    borderWidth: 0.5,
                    borderColor: "rgba(255,255,255,0.05)",
                  }}
                >
                  <Swipeable
                    renderRightActions={() => renderRightActions(item)}
                    friction={2}
                    rightThreshold={40}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: 14,
                        backgroundColor: Colors.surface,
                      }}
                    >
                      <View className="flex-row items-center flex-1 mr-2">
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 12,
                            backgroundColor: "rgba(255,255,255,0.03)",
                            borderWidth: 0.5,
                            borderColor: "rgba(255,255,255,0.05)",
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <Text style={{ fontSize: 16 }}>
                            {getCategoryIcon(item.category?.name || "")}
                          </Text>
                        </View>
                        <View className="ml-3 flex-1">
                          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }} numberOfLines={1}>
                            {item.description}
                          </Text>
                          <Text style={{ color: "#94A3B8", fontSize: 9, fontWeight: "600", marginTop: 1 }}>
                            {item.category?.name || "Other"} • Personal
                          </Text>
                        </View>
                      </View>

                      <View className="items-end">
                        <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800" }}>
                          ₹{Number(item.amount).toFixed(0)}
                        </Text>
                        <Text style={{ color: "#94A3B8", fontSize: 8, fontWeight: "600", marginTop: 2 }}>
                          {formatTime(item.expense_date)}
                        </Text>
                      </View>
                    </View>
                  </Swipeable>
                </View>
              ))}
            </View>
          ) : (
            <View
              style={{
                backgroundColor: Colors.surface,
                borderWidth: 0.5,
                borderColor: "rgba(255,255,255,0.05)",
                borderRadius: 20,
                padding: 24,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "600", textAlign: "center" }}>
                No expenses yet
              </Text>
              <Text style={{ color: "#475569", fontSize: 10, fontWeight: "500", textAlign: "center", marginTop: 4 }}>
                Start tracking your daily spending.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  router.push("/personal");
                }}
                className="mt-4 bg-accentCyan px-5 py-2.5 rounded-xl"
              >
                <Text style={{ color: Colors.background, fontSize: 11, fontWeight: "800" }}>
                  Add Expense
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── MONTHLY INSIGHTS ── */}
        <View className="px-6">
          <Text className="text-[#94A3B8] text-[10px] font-bold uppercase tracking-widest mb-3">
            Monthly Insights
          </Text>
          <View
            style={{
              backgroundColor: Colors.surface,
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.05)",
              borderRadius: 20,
              padding: 16,
            }}
          >
            <View className="space-y-3">
              {/* Stat 1: Total Spent */}
              <View className="flex-row justify-between items-center">
                <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "600" }}>
                  Total Spent
                </Text>
                <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800" }}>
                  ₹{stats.totalSpent.toFixed(0)}
                </Text>
              </View>

              {/* Stat 2: Biggest Expense */}
              <View className="flex-row justify-between items-center py-2 border-y border-white/5">
                <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "600" }}>
                  Biggest Expense
                </Text>
                <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800" }}>
                  ₹{stats.biggestExpense.toFixed(0)}
                </Text>
              </View>

              {/* Stat 3: Top Category */}
              <View className="flex-row justify-between items-center">
                <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "600" }}>
                  Most Spent Category
                </Text>
                <View className="flex-row items-center">
                  <Text style={{ fontSize: 12, marginRight: 4 }}>
                    {getCategoryIcon(stats.topCategoryName)}
                  </Text>
                  <Text style={{ color: Colors.accentCyan, fontSize: 12, fontWeight: "800" }}>
                    {stats.topCategoryName}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── CREATE GROUP MODAL SHEET ── */}
      <Modal visible={isCreateOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-[#151E2E] border-t-[0.5px] border-white/10 rounded-t-3xl p-6 pb-10">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-white">Create Group</Text>
              <TouchableOpacity
                onPress={() => setIsCreateOpen(false)}
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
                  control={createForm.control}
                  name="name"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className="bg-white/5 border-[0.5px] border-white/10 text-white px-4 py-3 rounded-xl"
                      placeholder="e.g. Hostel Flat 302"
                      placeholderTextColor="#666666"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {createForm.formState.errors.name && (
                  <Text className="text-accentPink text-xs mt-1">
                    {createForm.formState.errors.name.message}
                  </Text>
                )}
              </View>

              <View>
                <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-2">
                  Description (Optional)
                </Text>
                <Controller
                  control={createForm.control}
                  name="description"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className="bg-white/5 border-[0.5px] border-white/10 text-white px-4 py-3 rounded-xl"
                      placeholder="Room rent, cleaning, groceries..."
                      placeholderTextColor="#666666"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
              </View>

              <View>
                <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-2">
                  Group Type
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {GROUP_TYPES.map((type) => {
                    const TypeIcon = type.icon;
                    const isActive = createGroupType === type.value;
                    return (
                      <TouchableOpacity
                        key={type.value}
                        onPress={() => {
                          Theme.haptics.light();
                          createForm.setValue("type", type.value as any);
                        }}
                        className={`flex-row items-center border-[0.5px] px-3 py-2 rounded-lg ${
                          isActive
                            ? "bg-accentCyan/10 border-accentCyan"
                            : "bg-white/5 border-white/10"
                        }`}
                      >
                        <TypeIcon size={14} color={isActive ? "#14E5D4" : "#94A3B8"} />
                        <Text
                          className={`text-xs ml-1 font-bold ${
                            isActive ? "text-accentCyan" : "text-[#94A3B8]"
                          }`}
                        >
                          {type.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <TouchableOpacity
                onPress={createForm.handleSubmit((data) => createGroupMutation.mutate(data))}
                disabled={createGroupMutation.isPending}
                className="bg-accentCyan py-4 rounded-xl items-center mt-6 active:opacity-90"
              >
                {createGroupMutation.isPending ? (
                  <ActivityIndicator size="small" color="#0D0D0D" />
                ) : (
                  <Text className="text-background font-black text-base">Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── JOIN GROUP DIALOG MODAL ── */}
      <Modal visible={isJoinOpen} animationType="fade" transparent>
        <View className="flex-1 justify-center items-center bg-black/70 px-6">
          <View className="bg-[#151E2E] border-[0.5px] border-white/5 w-full p-6 rounded-2xl shadow-xl">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-white">Join Group</Text>
              <TouchableOpacity onPress={() => setIsJoinOpen(false)} className="p-1">
                <X size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            <Text className="text-accentGray text-xs leading-relaxed mb-4">
              Paste the invite code (group ID) shared by your friend to join their shared ledger.
            </Text>
            <TextInput
              className="bg-white/5 border-[0.5px] border-white/10 text-white px-4 py-3 rounded-xl mb-4 text-sm font-semibold"
              placeholder="Paste invite code..."
              placeholderTextColor="#666666"
              onChangeText={setJoinCode}
              value={joinCode}
            />
            <TouchableOpacity
              onPress={handleJoinGroup}
              disabled={isJoining || !joinCode.trim()}
              className="bg-accentCyan py-3 rounded-xl items-center active:opacity-90"
            >
              {isJoining ? (
                <ActivityIndicator size="small" color="#0D0D0D" />
              ) : (
                <Text className="text-background font-bold">Join Group</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── EDIT EXPENSE MODAL ── */}
      <Modal visible={isEditExpenseOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-[#151E2E] border-t-[0.5px] border-white/10 rounded-t-3xl p-6 pb-10">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-white">Edit Expense</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsEditExpenseOpen(false);
                  setEditingExpense(null);
                }}
                className="w-8 h-8 justify-center items-center rounded-full bg-white/5"
              >
                <X size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View className="space-y-4">
              {/* Amount */}
              <View>
                <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-2">
                  Amount
                </Text>
                <Controller
                  control={editExpenseForm.control}
                  name="amount"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className="bg-white/5 border-[0.5px] border-white/10 text-white px-4 py-3 rounded-xl text-lg font-bold"
                      keyboardType="numeric"
                      placeholder="0.00"
                      placeholderTextColor="#666666"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {editExpenseForm.formState.errors.amount && (
                  <Text className="text-accentPink text-xs mt-1">
                    {editExpenseForm.formState.errors.amount.message}
                  </Text>
                )}
              </View>

              {/* Description */}
              <View>
                <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-2">
                  Name / Title
                </Text>
                <Controller
                  control={editExpenseForm.control}
                  name="description"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className="bg-white/5 border-[0.5px] border-white/10 text-white px-4 py-3 rounded-xl"
                      placeholder="e.g. Starbucks, Milk"
                      placeholderTextColor="#666666"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {editExpenseForm.formState.errors.description && (
                  <Text className="text-accentPink text-xs mt-1">
                    {editExpenseForm.formState.errors.description.message}
                  </Text>
                )}
              </View>

              {/* Category */}
              <View>
                <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-2">
                  Category
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {categories?.map((cat: any) => {
                    const isSelected = editExpenseForm.watch("categoryId") === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        onPress={() => {
                          Theme.haptics.light();
                          editExpenseForm.setValue("categoryId", cat.id);
                        }}
                        className={`flex-row items-center border-[0.5px] px-3 py-2 rounded-lg ${
                          isSelected
                            ? "bg-accentCyan/10 border-accentCyan"
                            : "bg-white/5 border-white/10"
                        }`}
                      >
                        <Text style={{ fontSize: 13, marginRight: 4 }}>
                          {getCategoryIcon(cat.name)}
                        </Text>
                        <Text
                          className={`text-xs font-bold ${
                            isSelected ? "text-accentCyan" : "text-[#94A3B8]"
                          }`}
                        >
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <TouchableOpacity
                onPress={editExpenseForm.handleSubmit((data) => editExpenseMutation.mutate(data))}
                disabled={editExpenseMutation.isPending}
                className="bg-accentCyan py-4 rounded-xl items-center mt-6 active:opacity-90"
              >
                {editExpenseMutation.isPending ? (
                  <ActivityIndicator size="small" color="#0D0D0D" />
                ) : (
                  <Text className="text-background font-black text-base">Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
