import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Image,
  Share,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../../store/authStore";
import { supabase } from "../../../services/supabase";
import { useToastStore } from "../../../store/toastStore";
import { SafeAreaView } from "react-native-safe-area-context";
import { Theme } from "../../../constants/Theme";
import { Colors } from "../../../constants/Colors";
import * as Clipboard from "expo-clipboard";
import { triggerWittyNotification } from "../../../services/wittyNotifications";
import {
  Users,
  Plus,
  Hash,
  X,
  ChevronRight,
  Home,
  Landmark,
  Users2,
  Compass,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  Share2,
  Copy,
  PartyPopper,
  Check,
} from "lucide-react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

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

const GROUP_TYPES = [
  { value: "hostel", label: "Hostel", icon: Home },
  { value: "flatmates", label: "Flat", icon: Users2 },
  { value: "trip", label: "Trip", icon: Compass },
  { value: "couple", label: "Friends", icon: Users },
  { value: "family", label: "Family", icon: Landmark },
  { value: "other", label: "Custom", icon: Plus },
];

export default function Groups() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [createdGroup, setCreatedGroup] = useState<{ name: string; invite_code: string } | null>(
    null
  );

  // Ellipsis menu states
  const [selectedGroupForMenu, setSelectedGroupForMenu] = useState<any | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Fetch groups where active user is a registered member
  const {
    data: groups,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["groups", user?.id],
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
        .select(
          `
          *,
          group_members(profile_id, role),
          expenses(description, amount, expense_date, is_settlement, payer:profiles(username, display_name))
        `
        )
        .in("id", groupIds);

      if (groupsErr) throw groupsErr;
      return groupsData || [];
    },
    enabled: !!user?.id,
  });

  // Fetch peer balances to calculate global balances
  const { data: allPeerBalances, isLoading: isBalancesLoading } = useQuery({
    queryKey: ["global-peer-balances", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peer_balances")
        .select("*")
        .or(`user_a_id.eq.${user?.id},user_b_id.eq.${user?.id}`);
      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!user?.id,
  });

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateGroupSchema>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "other",
      currency: "INR",
    },
  });

  const activeType = watch("type");

  // Mutation to create a group
  const createMutation = useMutation({
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

      // Parse the RPC response to get the group
      const parsed = typeof newGroup === "string" ? JSON.parse(newGroup) : newGroup;
      return parsed;
    },
    onSuccess: (data: any) => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
      triggerWittyNotification("group_created", "Group Created");
      setIsCreateOpen(false);
      reset();
      // Show success bottom sheet with invite code
      if (data?.invite_code) {
        setCreatedGroup({ name: data.name, invite_code: data.invite_code });
      }
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to create group", "error");
    },
  });

  // Mutation to delete a group
  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from("groups").delete().eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["global-peer-balances", user?.id] });
      showToast("Group deleted successfully", "success");
      setIsDeleteConfirmOpen(false);
      setSelectedGroupForMenu(null);
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to delete group", "error");
    },
  });

  const handleJoinGroup = async () => {
    if (!joinCode.trim()) return;
    Theme.haptics.light();
    setIsJoining(true);

    try {
      const { data, error } = await supabase.rpc("join_group_by_invite_code", {
        p_invite_code: joinCode.trim().toUpperCase(),
        p_user_id: user?.id,
      });

      if (error) {
        Theme.haptics.error();
        const msg = error.message || "";
        if (msg.includes("not found")) {
          showToast("Invite code not found.", "error");
        } else if (msg.includes("already")) {
          showToast("You're already in this group.", "info");
        } else {
          showToast(msg || "Failed to join group", "error");
        }
        return;
      }

      Theme.haptics.success();
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      showToast(`Welcome to ${parsed?.group_name || "the group"}!`, "success");
      triggerWittyNotification("member_joined", "New Group Member");
      queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["global-peer-balances", user?.id] });
      setIsJoinOpen(false);
      setJoinCode("");
    } catch (e: any) {
      Theme.haptics.error();
      showToast(e.message || "Failed to join group", "error");
    } finally {
      setIsJoining(false);
    }
  };

  const handleShareInvite = async (group: any) => {
    Theme.haptics.light();
    const code = group.invite_code || group.id;
    try {
      await Share.share({
        message: `Join my hiSaab group!\n\nGroup: ${group.name}\nInvite Code: ${code}\n\nOpen hiSaab → Groups → Join Group and enter this code.\n\nKeep the hisaab clear. 🤝`,
      });
    } catch (e: any) {
      showToast("Could not open share menu", "error");
    }
  };

  const getGroupBalance = (groupId: string) => {
    if (!allPeerBalances) return 0;
    let net = 0;
    allPeerBalances.forEach((pb: any) => {
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

  const getGroupLastActivity = (item: any) => {
    if (!item.expenses || item.expenses.length === 0) {
      return "No activity yet";
    }
    const sorted = [...item.expenses].sort(
      (a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime()
    );
    const latest = sorted[0];
    if (latest.is_settlement) {
      return `Settled ₹${Number(latest.amount).toFixed(0)}`;
    }
    const payerName = latest.payer?.username
      ? `@${latest.payer.username}`
      : latest.payer?.display_name || "Someone";
    return `${payerName} added "${latest.description}"`;
  };

  const getGroupAvatarStyles = (name: string) => {
    const firstLetter = (name || "G").charAt(0).toUpperCase();
    const colors = [
      { bgClass: "bg-red-500/10 border-red-500/20", textClass: "text-red-400" },
      { bgClass: "bg-emerald-500/10 border-emerald-500/20", textClass: "text-emerald-400" },
      { bgClass: "bg-blue-500/10 border-blue-500/20", textClass: "text-blue-400" },
      { bgClass: "bg-purple-500/10 border-purple-500/20", textClass: "text-purple-400" },
      { bgClass: "bg-yellow-500/10 border-yellow-500/20", textClass: "text-yellow-400" },
      { bgClass: "bg-pink-500/10 border-pink-500/20", textClass: "text-pink-400" },
      { bgClass: "bg-cyan-500/10 border-cyan-500/20", textClass: "text-cyan-400" },
      { bgClass: "bg-orange-500/10 border-orange-500/20", textClass: "text-orange-400" },
    ];
    const index = (name || "").charCodeAt(0) % colors.length;
    return { ...colors[index], letter: firstLetter };
  };

  // Filter groups search
  const filteredGroups = (groups || []).filter((g: any) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      g.name.toLowerCase().includes(query) ||
      (g.description || "").toLowerCase().includes(query) ||
      g.type.toLowerCase().includes(query)
    );
  });

  const renderGroupItem = ({ item }: { item: any }) => {
    let typeConfig = GROUP_TYPES.find((gt) => gt.value === item.type) || GROUP_TYPES[5];
    const groupBalance = getGroupBalance(item.id);
    const avatar = getGroupAvatarStyles(item.name);
    const lastActivity = getGroupLastActivity(item);
    const totalGroupSpending =
      item.expenses?.reduce(
        (sum: number, exp: any) => sum + (exp.is_settlement ? 0 : Number(exp.amount)),
        0
      ) || 0;
    const count = item.group_members?.length || 1;

    return (
      <TouchableOpacity
        onPress={() => {
          Theme.haptics.light();
          router.push(`/groups/${item.id}`);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Group: ${item.name}`}
        className="bg-[#151E2E] border-[0.5px] border-white/5 p-5 rounded-2xl mb-4 active:scale-[0.98] transition-all duration-200 shadow-lg flex-col justify-between"
      >
        {/* Top Row: Avatar, Name, Type badge, Ellipsis menu */}
        <View className="flex-row justify-between items-center mb-3">
          <View className="flex-row items-center flex-1 mr-2">
            <View
              className={`w-12 h-12 justify-center items-center rounded-full border-[0.5px] ${avatar.bgClass}`}
            >
              <Text className={`text-lg font-black ${avatar.textClass}`}>{avatar.letter}</Text>
            </View>
            <View className="ml-3 flex-1">
              <View className="flex-row items-center flex-wrap">
                <Text className="text-white text-base font-bold mr-2" numberOfLines={1}>
                  {item.name}
                </Text>
                <View className="bg-white/5 border border-white/10 px-2 py-0.5 rounded-full mt-0.5">
                  <Text className="text-[#94A3B8] text-[8px] font-bold uppercase tracking-wider">
                    {typeConfig.label}
                  </Text>
                </View>
              </View>
              <Text className="text-[#94A3B8] text-xs mt-0.5 font-medium" numberOfLines={1}>
                {item.description || "No description"}
              </Text>
            </View>
          </View>

          {/* Action Menu Ellipsis Button */}
          <TouchableOpacity
            onPress={() => {
              Theme.haptics.light();
              setSelectedGroupForMenu(item);
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="p-2"
          >
            <Text className="text-[#94A3B8] text-base font-bold tracking-widest">•••</Text>
          </TouchableOpacity>
        </View>

        {/* Second Row: Members Count, Total Spent, Last Activity */}
        <View className="flex-row justify-between items-center py-2.5 border-y border-white/5 mb-3 gap-2">
          <View className="flex-row items-center">
            <Users size={11} color="#94A3B8" />
            <Text className="text-[#94A3B8] text-[10px] ml-1.5 font-bold">
              {count} {count === 1 ? "member" : "members"}
            </Text>
          </View>

          <View className="flex-row items-center">
            <Text className="text-[#94A3B8] text-[10px] font-semibold">Spent: </Text>
            <Text className="text-[#14E5D4] text-[10px] font-extrabold">
              ₹{totalGroupSpending.toFixed(0)}
            </Text>
          </View>

          <Text className="text-[#94A3B8] text-[9px] font-medium max-w-[45%]" numberOfLines={1}>
            {lastActivity}
          </Text>
        </View>

        {/* Third Row: Balance status & chevron */}
        <View className="flex-row justify-between items-center">
          <View>
            {groupBalance > 0.01 ? (
              <View className="flex-row items-center">
                <ArrowDownLeft size={14} color="#22C55E" />
                <Text className="text-[#22C55E] text-xs font-black ml-1">
                  Receive ₹{groupBalance.toFixed(0)}
                </Text>
              </View>
            ) : groupBalance < -0.01 ? (
              <View className="flex-row items-center">
                <ArrowUpRight size={14} color="#EF4444" />
                <Text className="text-[#EF4444] text-xs font-black ml-1">
                  Pay ₹{Math.abs(groupBalance).toFixed(0)}
                </Text>
              </View>
            ) : (
              <Text className="text-[#94A3B8] text-xs font-bold">✓ Settled</Text>
            )}
          </View>
          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation(); // prevent opening group details
                handleShareInvite(item);
              }}
              className="flex-row items-center bg-accentCyan/10 border border-accentCyan/20 px-3 py-1.5 rounded-lg active:scale-95"
            >
              <Users2 size={12} color="#14E5D4" />
              <Text className="text-accentCyan text-[11px] font-black ml-1.5">Invite</Text>
            </TouchableOpacity>
            <ChevronRight size={16} color={Colors.accentCyan} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Aggregate global user balances
  const globalOwes = (allPeerBalances || [])
    .filter((pb: any) => {
      const bal = Number(pb.net_balance) || 0;
      if (pb.user_a_id === user?.id) return bal < -0.01;
      if (pb.user_b_id === user?.id) return bal > 0.01;
      return false;
    })
    .reduce((sum: number, pb: any) => {
      const bal = Math.abs(Number(pb.net_balance)) || 0;
      return sum + bal;
    }, 0);

  const globalReceives = (allPeerBalances || [])
    .filter((pb: any) => {
      const bal = Number(pb.net_balance) || 0;
      if (pb.user_a_id === user?.id) return bal > 0.01;
      if (pb.user_b_id === user?.id) return bal < -0.01;
      return false;
    })
    .reduce((sum: number, pb: any) => {
      const bal = Math.abs(Number(pb.net_balance)) || 0;
      return sum + bal;
    }, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 px-6 pt-4">
          {/* HEADER SECTION */}
          <View className="flex-row justify-between items-center mb-6">
            <View>
              <Text className="text-3xl font-black text-white tracking-tighter">Groups</Text>
              <Text className="text-[#94A3B8] text-xs font-medium mt-1">
                Track, split and settle together
              </Text>
            </View>
            <View className="flex-row space-x-2">
              {/* Invite button */}
              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  setIsJoinOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Join Group by Invite Code"
                className="flex-row justify-center items-center px-4 py-2.5 rounded-full bg-[#151E2E] border-[0.5px] border-white/10 active:scale-95"
              >
                <Hash size={14} color="#94A3B8" className="mr-1" />
                <Text className="text-[#94A3B8] text-xs font-bold">Invite Code</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* TWO VISUAL BALANCE CARDS */}
          <View className="flex-row justify-between gap-3 mb-6">
            {/* Card 1: To Pay */}
            <View className="flex-1 bg-[#151E2E] border-[0.5px] border-white/5 p-4 rounded-2xl shadow-xl flex-row justify-between items-center">
              <View className="flex-1 mr-2">
                <Text className="text-[#94A3B8] text-[10px] font-bold uppercase tracking-wider">
                  To Pay
                </Text>
                <Text className="text-white text-lg font-black mt-1">₹{globalOwes.toFixed(0)}</Text>
              </View>
              <ArrowUpRight size={20} color="#EF4444" />
            </View>

            {/* Card 2: To Receive */}
            <View className="flex-1 bg-[#151E2E] border-[0.5px] border-white/5 p-4 rounded-2xl shadow-xl flex-row justify-between items-center">
              <View className="flex-1 mr-2">
                <Text className="text-[#94A3B8] text-[10px] font-bold uppercase tracking-wider">
                  To Receive
                </Text>
                <Text className="text-white text-lg font-black mt-1">
                  ₹{globalReceives.toFixed(0)}
                </Text>
              </View>
              <ArrowDownLeft size={20} color="#22C55E" />
            </View>
          </View>

          {/* SEARCH BAR */}
          <View className="flex-row items-center bg-[#151E2E] border-[0.5px] border-white/5 px-4 py-3.5 rounded-xl mb-6 shadow-md">
            <Search size={16} color="#94A3B8" className="mr-3.5" />
            <TextInput
              className="flex-1 text-white text-sm py-0.5"
              placeholder="Search groups..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* GROUPS LIST */}
          {isLoading || isBalancesLoading ? (
            <View className="flex-1 justify-center items-center">
              <ActivityIndicator size="large" color={Colors.accentCyan} />
            </View>
          ) : filteredGroups.length > 0 ? (
            <FlatList
              data={filteredGroups}
              renderItem={renderGroupItem}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 100 }}
              refreshControl={
                <RefreshControl
                  refreshing={isLoading || isBalancesLoading}
                  onRefresh={() => {
                    Theme.haptics.light();
                    refetch();
                  }}
                  tintColor={Colors.accentCyan}
                />
              }
            />
          ) : (
            <View className="flex-1 justify-center items-center px-4">
              <Image
                source={require("../../../../assets/images/logo.png")}
                style={{ width: 80, height: 80, borderRadius: 20, opacity: 0.4, marginBottom: 16 }}
                resizeMode="contain"
              />
              <Text className="text-white text-lg font-bold text-center mb-2">No groups yet</Text>
              <Text className="text-accentGray text-sm text-center leading-relaxed mb-6">
                Create a group for roommates or trips, or enter an invite code to join an existing
                group.
              </Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* FLOATING ACTION BUTTON (FAB) */}
      <TouchableOpacity
        onPress={() => {
          Theme.haptics.light();
          setIsCreateOpen(true);
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
        className="flex-row bg-[#14E5D4] px-5 py-3.5 rounded-full items-center active:scale-95 z-40"
      >
        <Plus size={20} color="#0B1220" className="mr-1.5" />
        <Text className="text-[#0B1220] font-black text-sm">New Group</Text>
      </TouchableOpacity>

      {/* GROUP CONTEXT MENU ACTIONS MODAL */}
      <Modal visible={selectedGroupForMenu !== null} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-[#151E2E] border-t-[0.5px] border-white/10 rounded-t-3xl p-6 pb-10">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-white">Group Options</Text>
              <TouchableOpacity
                onPress={() => setSelectedGroupForMenu(null)}
                className="w-8 h-8 justify-center items-center rounded-full bg-white/5"
              >
                <X size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View className="space-y-2">
              <TouchableOpacity
                onPress={async () => {
                  Theme.haptics.light();
                  try {
                    const code = selectedGroupForMenu.invite_code || selectedGroupForMenu.id;
                    await Clipboard.setStringAsync(code);
                    showToast("Invite code copied to clipboard!", "success");
                  } catch (e: any) {
                    showToast("Failed to copy code", "error");
                  }
                  setSelectedGroupForMenu(null);
                }}
                className="flex-row items-center py-3.5 border-b border-white/5 px-2 active:opacity-75"
              >
                <Copy size={16} color="#94A3B8" className="mr-3" />
                <Text className="text-[#94A3B8] font-semibold text-sm">Copy Code</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  Theme.haptics.light();
                  try {
                    const code = selectedGroupForMenu.invite_code || selectedGroupForMenu.id;
                    const name = selectedGroupForMenu.name;
                    await Share.share({
                      message: `Join my hiSaab group!\n\nGroup: ${name}\nInvite Code: ${code}\n\nOpen hiSaab → Groups → Join Group and enter this code.\n\nKeep the hisaab clear. 🤝`,
                    });
                  } catch (e: any) {
                    showToast("Failed to share", "error");
                  }
                  setSelectedGroupForMenu(null);
                }}
                className="flex-row items-center py-3.5 border-b border-white/5 px-2 active:opacity-75"
              >
                <Share2 size={16} color="#94A3B8" className="mr-3" />
                <Text className="text-[#94A3B8] font-semibold text-sm">Share Invite</Text>
              </TouchableOpacity>

              {/* Delete Group (Owner only check) */}
              {(() => {
                const isUserOwner = selectedGroupForMenu?.created_by === user?.id;

                if (isUserOwner) {
                  return (
                    <TouchableOpacity
                      onPress={() => {
                        Theme.haptics.medium();
                        setIsDeleteConfirmOpen(true);
                      }}
                      className="flex-row items-center py-3.5 px-2 active:opacity-75"
                    >
                      <Trash2 size={16} color="#EF4444" className="mr-3" />
                      <Text className="text-[#EF4444] font-semibold text-sm">Delete Group</Text>
                    </TouchableOpacity>
                  );
                }
                return null;
              })()}
            </View>
          </View>
        </View>
      </Modal>

      {/* DELETE GROUP CONFIRMATION DIALOG MODAL */}
      <Modal visible={isDeleteConfirmOpen} animationType="fade" transparent>
        <View className="flex-1 justify-center items-center bg-black/75 px-6">
          <View className="bg-[#151E2E] border-[0.5px] border-white/5 w-full p-6 rounded-2xl shadow-xl items-center">
            <Text className="text-xl font-bold text-white mb-2">Delete Group?</Text>
            <Text className="text-accentGray text-xs text-center leading-relaxed mb-6">
              This action is permanent. Deleting this group will permanently delete all expenses,
              splits, peer balances, and activity history inside.
            </Text>
            <View className="flex-row space-x-3 w-full">
              <TouchableOpacity
                onPress={() => setIsDeleteConfirmOpen(false)}
                className="flex-1 bg-white/5 py-3 rounded-xl items-center border-[0.5px] border-white/10 active:opacity-75 mr-2"
              >
                <Text className="text-accentGray font-bold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => deleteGroupMutation.mutate(selectedGroupForMenu.id)}
                disabled={deleteGroupMutation.isPending}
                className="flex-1 bg-[#EF4444] py-3 rounded-xl items-center active:opacity-90"
              >
                {deleteGroupMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text className="text-white font-bold">Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* CREATE GROUP MODAL SHEET */}
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
              {/* Group Name input */}
              <View>
                <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-2">
                  Group Name
                </Text>
                <Controller
                  control={control}
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
                {errors.name && (
                  <Text className="text-accentPink text-xs mt-1">{errors.name.message}</Text>
                )}
              </View>

              {/* Group Description */}
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
                      placeholder="Room rent, grocery list, cleaning etc."
                      placeholderTextColor="#666666"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {errors.description && (
                  <Text className="text-accentPink text-xs mt-1">{errors.description.message}</Text>
                )}
              </View>

              {/* Group Type Selector horizontal row */}
              <View>
                <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mb-2">
                  Group Type
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {GROUP_TYPES.map((type) => {
                    const TypeIcon = type.icon;
                    const isActive = activeType === type.value;
                    return (
                      <TouchableOpacity
                        key={type.value}
                        onPress={() => {
                          Theme.haptics.light();
                          setValue("type", type.value as any);
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

              {/* Create submit Button */}
              <TouchableOpacity
                onPress={handleSubmit((data) => createMutation.mutate(data))}
                disabled={createMutation.isPending}
                className="bg-accentCyan py-4 rounded-xl items-center mt-6 active:opacity-90"
              >
                {createMutation.isPending ? (
                  <ActivityIndicator size="small" color="#0D0D0D" />
                ) : (
                  <Text className="text-background font-black text-base">Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* JOIN GROUP DIALOG MODAL */}
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
              Enter the invite code shared by your friend to join their group.
            </Text>
            <TextInput
              className="bg-white/5 border-[0.5px] border-white/10 text-white px-4 py-3 rounded-xl mb-4 text-base font-black tracking-widest text-center uppercase"
              placeholder="ROOM8X"
              placeholderTextColor="#444444"
              onChangeText={(t) => setJoinCode(t.toUpperCase())}
              value={joinCode}
              maxLength={8}
              autoCapitalize="characters"
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

      {/* GROUP CREATED SUCCESS BOTTOM SHEET */}
      <Modal visible={!!createdGroup} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/70">
          <View className="bg-[#0F1A2E] border-t border-white/10 rounded-t-3xl px-6 pt-8 pb-10">
            {/* Header */}
            <View className="items-center mb-6">
              <View className="w-16 h-16 rounded-full bg-accentCyan/10 border border-accentCyan/30 justify-center items-center mb-4">
                <PartyPopper size={28} color="#14E5D4" />
              </View>
              <Text className="text-white text-2xl font-black tracking-tight">Group Created!</Text>
              <Text className="text-[#94A3B8] text-sm mt-1 text-center">
                Invite your friends using this code.
              </Text>
            </View>

            {/* Invite Code Display */}
            <View className="bg-[#151E2E] border border-white/10 rounded-2xl p-5 mb-6 items-center">
              <Text className="text-[#94A3B8] text-[10px] font-bold uppercase tracking-widest mb-2">
                Invite Code
              </Text>
              <Text className="text-white text-3xl font-black tracking-[6px]">
                {createdGroup?.invite_code}
              </Text>
            </View>

            {/* Action Buttons */}
            <View className="flex-row gap-3 mb-4">
              <TouchableOpacity
                onPress={async () => {
                  Theme.haptics.light();
                  if (createdGroup?.invite_code) {
                    await Clipboard.setStringAsync(createdGroup.invite_code);
                    showToast("Invite code copied.", "success");
                  }
                }}
                className="flex-1 flex-row items-center justify-center bg-white/5 border border-white/10 py-3.5 rounded-xl active:scale-95"
              >
                <Copy size={16} color="#14E5D4" />
                <Text className="text-white text-sm font-bold ml-2">Copy Code</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  Theme.haptics.light();
                  try {
                    await Share.share({
                      message: `Join my hiSaab group!\n\nGroup: ${createdGroup?.name}\nInvite Code: ${createdGroup?.invite_code}\n\nOpen hiSaab → Groups → Join Group and enter this code.`,
                    });
                  } catch {}
                }}
                className="flex-1 flex-row items-center justify-center bg-white/5 border border-white/10 py-3.5 rounded-xl active:scale-95"
              >
                <Share2 size={16} color="#14E5D4" />
                <Text className="text-white text-sm font-bold ml-2">Share Invite</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => {
                Theme.haptics.light();
                setCreatedGroup(null);
              }}
              className="bg-accentCyan py-4 rounded-xl items-center active:opacity-90"
            >
              <Text className="text-background font-black text-base">Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
