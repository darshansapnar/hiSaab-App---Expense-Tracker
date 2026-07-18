import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../../store/authStore";
import { supabase } from "../../../services/supabase";
import { useToastStore } from "../../../store/toastStore";
import { Theme } from "../../../constants/Theme";
import { Users, Plus, Hash, X, ArrowRight, Home, Landmark, Users2, Compass } from "lucide-react-native";
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
  { value: "flatmates", label: "Flatmates", icon: Users2 },
  { value: "trip", label: "Trip", icon: Compass },
  { value: "couple", label: "Couple", icon: Users },
  { value: "family", label: "Family", icon: Landmark },
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

  // Fetch groups where active user is a registered member
  const {
    data: groups,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["groups", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_members")
        .select("group:groups(*)")
        .eq("profile_id", user?.id);

      if (error) throw error;
      return (data || []).map((d: any) => d.group).filter(Boolean);
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
      const { data: newGroup, error } = await supabase
        .from("groups")
        .insert({
          name: data.name.trim(),
          description: data.description?.trim() || null,
          type: data.type,
          currency: data.currency,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return newGroup;
    },
    onSuccess: () => {
      Theme.haptics.success();
      queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
      showToast("Group created successfully", "success");
      setIsCreateOpen(false);
      reset();
    },
    onError: (error: any) => {
      Theme.haptics.error();
      showToast(error.message || "Failed to create group", "error");
    },
  });

  const handleJoinGroup = async () => {
    if (!joinCode.trim()) return;
    Theme.haptics.light();
    setIsJoining(true);

    try {
      const cleanCode = joinCode.trim();

      // 1. Verify if group exists
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

      // 2. Add user to group_members
      const { error: joinError } = await supabase.from("group_members").insert({
        group_id: cleanCode,
        profile_id: user?.id,
        role: "member",
      });

      if (joinError) {
        // Handle duplicate key error
        if (joinError.code === "23505") {
          showToast("You are already a member of this group", "info");
        } else {
          throw joinError;
        }
      } else {
        Theme.haptics.success();
        showToast(`Successfully joined ${group.name}`, "success");
        queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
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

  const renderGroupItem = ({ item }: { item: any }) => {
    let TypeIcon = Users;
    if (item.type === "hostel") TypeIcon = Home;
    else if (item.type === "flatmates") TypeIcon = Users2;
    else if (item.type === "trip") TypeIcon = Compass;
    else if (item.type === "family") TypeIcon = Landmark;

    return (
      <TouchableOpacity
        onPress={() => {
          Theme.haptics.light();
          router.push(`/groups/${item.id}`);
        }}
        className="flex-row items-center bg-surface border-[0.5px] border-border p-4 rounded-xl mb-3 active:scale-[0.99]"
      >
        <View className="w-12 h-12 justify-center items-center rounded-xl bg-surfaceLight mr-4">
          <TypeIcon size={24} color="#00F5D4" />
        </View>
        <View className="flex-1">
          <Text className="text-white text-base font-bold">{item.name}</Text>
          <Text className="text-accentGray text-xs mt-1" numberOfLines={1}>
            {item.description || `Type: ${item.type}`}
          </Text>
        </View>
        <ArrowRight size={16} color="#A3A3A3" />
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 bg-background px-6 pt-16">
      <View className="flex-row justify-between items-center mb-8">
        <Text className="text-3xl font-black text-white tracking-tighter">Groups</Text>
        <View className="flex-row space-x-2">
          {/* Join Group Trigger */}
          <TouchableOpacity
            onPress={() => {
              Theme.haptics.light();
              setIsJoinOpen(true);
            }}
            className="w-10 h-10 justify-center items-center rounded-full bg-surfaceLight border-[0.5px] border-border active:scale-95 mr-2"
          >
            <Hash size={18} color="#A3A3A3" />
          </TouchableOpacity>

          {/* Create Group Trigger */}
          <TouchableOpacity
            onPress={() => {
              Theme.haptics.light();
              setIsCreateOpen(true);
            }}
            className="w-10 h-10 justify-center items-center rounded-full bg-accentCyan active:scale-95"
          >
            <Plus size={20} color="#0D0D0D" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Render list of groups */}
      {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#00F5D4" />
        </View>
      ) : groups && groups.length > 0 ? (
        <FlatList
          data={groups}
          renderItem={renderGroupItem}
          keyExtractor={(item) => item.id}
          refreshing={isLoading}
          onRefresh={refetch}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      ) : (
        <View className="flex-1 justify-center items-center px-4">
          <Text className="text-white text-lg font-bold text-center mb-2">No groups yet</Text>
          <Text className="text-accentGray text-sm text-center leading-relaxed mb-6">
            Create a group for roommates or trips, or enter an invite code to join an existing group.
          </Text>
        </View>
      )}

      {/* CREATE GROUP MODAL SHEET */}
      <Modal visible={isCreateOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-surface border-t-[0.5px] border-border rounded-t-3xl p-6 pb-10">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-white">Create Group</Text>
              <TouchableOpacity
                onPress={() => setIsCreateOpen(false)}
                className="w-8 h-8 justify-center items-center rounded-full bg-surfaceLight"
              >
                <X size={16} color="#A3A3A3" />
              </TouchableOpacity>
            </View>

            <View className="space-y-4">
              {/* Group Name input */}
              <View>
                <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
                  Group Name
                </Text>
                <Controller
                  control={control}
                  name="name"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className="bg-surfaceLight border-[0.5px] border-border text-white px-4 py-3 rounded-xl"
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
                <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
                  Description
                </Text>
                <Controller
                  control={control}
                  name="description"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className="bg-surfaceLight border-[0.5px] border-border text-white px-4 py-3 rounded-xl"
                      placeholder="Room rent, water jar, cleaning etc."
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
                <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-2">
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
                            : "bg-surfaceLight border-border"
                        }`}
                      >
                        <TypeIcon size={14} color={isActive ? "#00F5D4" : "#A3A3A3"} />
                        <Text
                          className={`text-xs ml-1 font-bold ${
                            isActive ? "text-accentCyan" : "text-accentGray"
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
          <View className="bg-surface border-[0.5px] border-border w-full p-6 rounded-2xl shadow-xl">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-white">Join Group</Text>
              <TouchableOpacity onPress={() => setIsJoinOpen(false)} className="p-1">
                <X size={16} color="#A3A3A3" />
              </TouchableOpacity>
            </View>
            <Text className="text-accentGray text-xs leading-relaxed mb-4">
              Paste the invite code (group ID) shared by your friend to join their shared ledger.
            </Text>
            <TextInput
              className="bg-surfaceLight border-[0.5px] border-border text-white px-4 py-3 rounded-xl mb-4 text-sm font-semibold"
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
    </View>
  );
}
