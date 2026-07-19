import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  Modal,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { useAuthStore } from "../../../store/authStore";
import { supabase } from "../../../services/supabase";
import { useToastStore } from "../../../store/toastStore";
import { Theme } from "../../../constants/Theme";
import { Colors } from "../../../constants/Colors";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import * as ImagePicker from "expo-image-picker";
import {
  Camera,
  LogOut,
  Save,
  User as UserIcon,
  Users,
  Receipt,
  Wallet,
  Flame,
  Edit3,
  Bell,
  HelpCircle,
  ChevronRight,
  X,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { Skeleton } from "../../../components/ui/Skeleton";

const profileSchema = z.object({
  displayName: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be under 50 characters"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be under 20 characters")
    .regex(/^[a-zA-Z0-9_.]+$/, "Only letters, numbers, _ and . allowed"),
});

type ProfileSchema = z.infer<typeof profileSchema>;

export default function Profile() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const logout = useAuthStore((state) => state.logout);
  const showToast = useToastStore((state) => state.showToast);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);
  const [usernameMsg, setUsernameMsg] = useState("");

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProfileSchema>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: profile?.display_name || "",
      username: profile?.username || "",
    },
    mode: "onChange",
  });

  const watchedUsername = watch("username");

  // Debounced username uniqueness check
  React.useEffect(() => {
    if (!watchedUsername || watchedUsername.length < 3) {
      setIsUsernameAvailable(null);
      setUsernameMsg("");
      return;
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(watchedUsername)) {
      setIsUsernameAvailable(null);
      setUsernameMsg("");
      return;
    }
    // If unchanged from current profile username, skip check
    if (watchedUsername.toLowerCase() === profile?.username?.toLowerCase()) {
      setIsUsernameAvailable(true);
      setUsernameMsg("This is your current username");
      return;
    }
    const timer = setTimeout(async () => {
      setIsCheckingUsername(true);
      try {
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", watchedUsername.toLowerCase())
          .maybeSingle();
        if (existing && existing.id !== user?.id) {
          setIsUsernameAvailable(false);
          setUsernameMsg("Username already taken");
        } else {
          setIsUsernameAvailable(true);
          setUsernameMsg("Available!");
        }
      } catch {
        setIsUsernameAvailable(null);
        setUsernameMsg("Could not verify");
      } finally {
        setIsCheckingUsername(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [watchedUsername, user?.id, profile?.username]);

  // Fetch quick stats
  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ["profile-stats", user?.id],
    queryFn: async () => {
      if (!user?.id) return { groups: 0, expenses: 0, monthSpending: 0, streak: 0 };

      // Groups joined
      const { count: groupCount } = await supabase
        .from("group_members")
        .select("*", { count: "exact", head: true })
        .eq("profile_id", user.id);

      // Total personal expenses
      const { count: expenseCount } = await supabase
        .from("personal_expenses")
        .select("*", { count: "exact", head: true })
        .eq("profile_id", user.id);

      // This month's spending
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { data: monthExpenses } = await supabase
        .from("personal_expenses")
        .select("amount")
        .eq("profile_id", user.id)
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd);

      const monthSpending = (monthExpenses || []).reduce(
        (sum: number, e: any) => sum + Number(e.amount),
        0
      );

      // Current streak — count consecutive days with at least one expense
      const { data: recentExpenses } = await supabase
        .from("personal_expenses")
        .select("created_at")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(90);

      let streak = 0;
      if (recentExpenses && recentExpenses.length > 0) {
        const uniqueDates = [
          ...new Set(
            recentExpenses.map((e: any) =>
              new Date(e.created_at).toISOString().split("T")[0]
            )
          ),
        ].sort((a, b) => (b > a ? 1 : -1));

        const today = new Date().toISOString().split("T")[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

        if (uniqueDates[0] === today || uniqueDates[0] === yesterday) {
          streak = 1;
          for (let i = 1; i < uniqueDates.length; i++) {
            const prevDate = new Date(uniqueDates[i - 1]);
            const currDate = new Date(uniqueDates[i]);
            const diffDays = Math.round(
              (prevDate.getTime() - currDate.getTime()) / 86400000
            );
            if (diffDays === 1) {
              streak++;
            } else {
              break;
            }
          }
        }
      }

      return {
        groups: groupCount || 0,
        expenses: expenseCount || 0,
        monthSpending,
        streak,
      };
    },
    enabled: !!user?.id,
  });

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["profile-stats", user?.id] });
    setIsRefreshing(false);
  }, [queryClient, user?.id]);

  const onSaveProfile = async (data: ProfileSchema) => {
    if (!user) return;
    if (isUsernameAvailable === false || isCheckingUsername) {
      showToast("Please choose an available username", "error");
      return;
    }
    Theme.haptics.light();
    setIsSaving(true);

    try {
      const { data: updatedProfile, error } = await supabase
        .from("profiles")
        .update({
          display_name: data.displayName.trim(),
          username: data.username.toLowerCase(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .select()
        .single();

      if (error) {
        Theme.haptics.error();
        if (error.message.includes("unique") || error.message.includes("duplicate")) {
          showToast("Username already taken", "error");
        } else {
          showToast(error.message, "error");
        }
      } else {
        Theme.haptics.success();
        setProfile(updatedProfile);
        setIsEditing(false);
        showToast("Profile updated", "success");
      }
    } catch (e) {
      showToast("Failed to update profile", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePickImage = async () => {
    if (!user) return;
    Theme.haptics.light();

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showToast("Permissions to access media library are required", "error");
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });

      if (!result.canceled && result.assets && result.assets[0].uri) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (e) {
      showToast("Error picking image", "error");
    }
  };

  const uploadImage = async (uri: string) => {
    if (!user) return;
    setIsUploading(true);
    showToast("Uploading photo...", "info");

    try {
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      const fileExt = uri.split(".").pop() || "jpg";
      const mimeType = fileExt === "png" ? "image/png" : "image/jpeg";
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("profiles")
        .upload(filePath, arrayBuffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("profiles").getPublicUrl(filePath);

      const { data: updatedProfile, error: updateDbError } = await supabase
        .from("profiles")
        .update({
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .select()
        .single();

      if (updateDbError) throw updateDbError;

      Theme.haptics.success();
      setProfile(updatedProfile);
      showToast("Profile photo updated", "success");
    } catch (e: any) {
      Theme.haptics.error();
      showToast(e.message || "Failed to upload image", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSignOut = async () => {
    Theme.haptics.medium();
    setIsLogoutModalOpen(false);
    const { error } = await supabase.auth.signOut();
    if (error) {
      showToast(error.message, "error");
    } else {
      logout();
      showToast("Logged out successfully", "success");
      router.replace("/(auth)/login");
    }
  };

  // Determine if the saved avatar_url is an emoji character or a URL link
  const isEmojiAvatar = profile?.avatar_url && profile.avatar_url.length <= 4;

  const getInitials = () => {
    const name = profile?.display_name || "";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || "?";
  };

  const formatRupees = (amount: number) => {
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}k`;
    return `₹${amount.toFixed(0)}`;
  };

  const MENU_ITEMS = [
    {
      icon: Edit3,
      label: "Edit Profile",
      color: Colors.accentCyan,
      onPress: () => {
        Theme.haptics.light();
        setValue("displayName", profile?.display_name || "");
        setValue("username", profile?.username || "");
        setIsEditing(true);
      },
    },
    {
      icon: Bell,
      label: "Notifications",
      color: "#FBBF24",
      onPress: () => {
        Theme.haptics.light();
        router.push("/profile/notifications");
      },
    },
    {
      icon: HelpCircle,
      label: "Help & Support",
      color: "#818CF8",
      onPress: () => {
        Theme.haptics.light();
        router.push("/profile/support");
      },
    },
    {
      icon: LogOut,
      label: "Logout",
      color: "#EF4444",
      onPress: () => {
        Theme.haptics.medium();
        setIsLogoutModalOpen(true);
      },
    },
  ];

  const STAT_CARDS = [
    {
      icon: Users,
      label: "Groups Joined",
      value: stats?.groups?.toString() || "0",
      color: "#818CF8",
      bgColor: "rgba(129, 140, 248, 0.1)",
    },
    {
      icon: Receipt,
      label: "Expenses Added",
      value: stats?.expenses?.toString() || "0",
      color: Colors.accentCyan,
      bgColor: "rgba(20, 229, 212, 0.1)",
    },
    {
      icon: Wallet,
      label: "Month Spent",
      value: formatRupees(stats?.monthSpending || 0),
      color: "#FBBF24",
      bgColor: "rgba(251, 191, 36, 0.1)",
    },
  ];

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
        {/* ── GRADIENT HEADER ── */}
        <View
          style={{
            paddingTop: 16,
            paddingBottom: 32,
            backgroundColor: "#1A2744",
            ...Platform.select({
              web: {
                backgroundImage: "linear-gradient(to bottom, #1A2744, #0F1A2E, #0B1220)",
              } as any,
            }),
          }}
        >
          <View className="items-center px-6">
            {/* Avatar */}
            <View className="relative mb-4">
              <View
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 50,
                  backgroundColor: Colors.surface,
                  borderWidth: 2,
                  borderColor: "rgba(20, 229, 212, 0.3)",
                  justifyContent: "center",
                  alignItems: "center",
                  overflow: "hidden",
                }}
              >
                {isUploading ? (
                  <ActivityIndicator size="large" color={Colors.accentCyan} />
                ) : profile?.avatar_url ? (
                  isEmojiAvatar ? (
                    <Text style={{ fontSize: 42 }}>{profile.avatar_url}</Text>
                  ) : (
                    <Image
                      source={{ uri: profile.avatar_url }}
                      style={{ width: 100, height: 100 }}
                    />
                  )
                ) : (
                  <Text
                    style={{
                      fontSize: 32,
                      fontWeight: "900",
                      color: Colors.accentCyan,
                    }}
                  >
                    {getInitials()}
                  </Text>
                )}
              </View>

              {/* Camera button */}
              <TouchableOpacity
                onPress={handlePickImage}
                disabled={isUploading}
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: -4,
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: Colors.accentCyan,
                  justifyContent: "center",
                  alignItems: "center",
                  shadowColor: Colors.accentCyan,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.4,
                  shadowRadius: 6,
                  elevation: 4,
                }}
                className="active:scale-95"
              >
                <Camera size={14} color={Colors.background} />
              </TouchableOpacity>
            </View>

            {/* Username & Email */}
            <Text
              className="text-white text-xl font-black tracking-tight text-center"
              numberOfLines={1}
            >
              {profile?.username ? `@${profile.username}` : profile?.display_name || "Set Your Name"}
            </Text>
            <Text className="text-[#94A3B8] text-xs font-medium mt-1 text-center">
              {user?.email}
            </Text>

            {/* Edit Profile chip */}
            <TouchableOpacity
              onPress={() => {
                Theme.haptics.light();
                setValue("displayName", profile?.display_name || "");
                setValue("username", profile?.username || "");
                setIsEditing(true);
              }}
              className="mt-3 px-4 py-1.5 rounded-full active:scale-95"
              style={{
                backgroundColor: "rgba(20, 229, 212, 0.1)",
                borderWidth: 0.5,
                borderColor: "rgba(20, 229, 212, 0.3)",
              }}
            >
              <Text
                style={{
                  color: Colors.accentCyan,
                  fontSize: 11,
                  fontWeight: "800",
                }}
              >
                Edit Profile
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── QUICK STATS ── */}
        <View className="px-6 -mt-4">
          <View className="flex-row flex-wrap gap-3">
            {STAT_CARDS.map((stat, index) => (
              <View
                key={index}
                style={{
                  backgroundColor: Colors.surface,
                  borderWidth: 0.5,
                  borderColor: "rgba(255,255,255,0.05)",
                  borderRadius: 16,
                  padding: 10,
                  width: "30%",
                  flexGrow: 1,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                <View className="flex-row items-center mb-2.5">
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: stat.bgColor,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <stat.icon size={16} color={stat.color} />
                  </View>
                </View>
                {isStatsLoading ? (
                  <Skeleton width={52} height={20} borderRadius={6} />
                ) : (
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontSize: 18,
                      fontWeight: "900",
                      letterSpacing: -0.5,
                    }}
                  >
                    {stat.value}
                  </Text>
                )}
                <Text
                  style={{
                    color: "#94A3B8",
                    fontSize: 10,
                    fontWeight: "700",
                    marginTop: 2,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                  }}
                >
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── MENU ── */}
        <View className="px-6 mt-6">
          <View
            style={{
              backgroundColor: Colors.surface,
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.05)",
              borderRadius: 20,
              overflow: "hidden",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 8,
              elevation: 3,
            }}
          >
            {MENU_ITEMS.map((item, index) => {
              const isLast = index === MENU_ITEMS.length - 1;
              return (
                <TouchableOpacity
                  key={index}
                  onPress={item.onPress}
                  className="active:opacity-80"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 20,
                    paddingVertical: 16,
                    borderBottomWidth: isLast ? 0 : 0.5,
                    borderBottomColor: "rgba(255,255,255,0.05)",
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: `${item.color}15`,
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 14,
                    }}
                  >
                    <item.icon size={18} color={item.color} />
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      color: isLast ? "#EF4444" : "#FFFFFF",
                      fontSize: 14,
                      fontWeight: "700",
                    }}
                  >
                    {item.label}
                  </Text>
                  {!isLast && <ChevronRight size={16} color="#94A3B8" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── VERSION TAG & BRANDING ── */}
        <View style={{ alignItems: "center", marginTop: 32, marginBottom: 16 }}>
          <Image
            source={require("../../../../assets/images/logo.png")}
            style={{ width: 32, height: 32, borderRadius: 8, opacity: 0.8 }}
            resizeMode="contain"
          />
          <Text
            style={{
              color: "#475569",
              fontSize: 10,
              fontWeight: "600",
              textAlign: "center",
              marginTop: 12,
            }}
          >
            hiSaab v1.0 • Made with ❤️ by DARSHAN
          </Text>
        </View>
      </ScrollView>

      {/* ── EDIT PROFILE MODAL ── */}
      <Modal visible={isEditing} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View
            style={{
              backgroundColor: Colors.surface,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 24,
              paddingBottom: 40,
              borderTopWidth: 0.5,
              borderTopColor: "rgba(255,255,255,0.1)",
            }}
          >
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-white">Edit Profile</Text>
              <TouchableOpacity
                onPress={() => setIsEditing(false)}
                className="w-8 h-8 justify-center items-center rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
              >
                <X size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text
              style={{
                color: "#94A3B8",
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 1.5,
                marginBottom: 8,
              }}
            >
              Display Name
            </Text>
            <Controller
              control={control}
              name="displayName"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={{
                    color: "#FFFFFF",
                    fontSize: 16,
                    fontWeight: "700",
                    backgroundColor: Colors.surfaceLight,
                    borderWidth: 0.5,
                    borderColor: "rgba(255,255,255,0.1)",
                    borderRadius: 14,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                  }}
                  autoFocus
                  placeholder="Your name"
                  placeholderTextColor="#666666"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
            {errors.displayName && (
              <Text style={{ color: "#EF4444", fontSize: 11, marginTop: 4, marginLeft: 4 }}>
                {errors.displayName.message}
              </Text>
            )}

            {/* Username field */}
            <Text
              style={{
                color: "#94A3B8",
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 1.5,
                marginBottom: 8,
                marginTop: 16,
              }}
            >
              Username
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: Colors.surfaceLight,
                borderWidth: 0.5,
                borderColor: errors.username
                  ? "#EF4444"
                  : isUsernameAvailable === true
                  ? Colors.accentCyan
                  : "rgba(255,255,255,0.1)",
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 4,
              }}
            >
              <Text style={{ color: "#94A3B8", fontSize: 16, fontWeight: "700", marginRight: 2 }}>@</Text>
              <Controller
                control={control}
                name="username"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={{
                      flex: 1,
                      color: "#FFFFFF",
                      fontSize: 16,
                      fontWeight: "700",
                      paddingVertical: 12,
                    }}
                    placeholder="your_username"
                    placeholderTextColor="#475569"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onBlur={onBlur}
                    onChangeText={(text) => onChange(text.replace(/\s/g, ""))}
                    value={value}
                    maxLength={20}
                  />
                )}
              />
              <View style={{ marginLeft: 8 }}>
                {isCheckingUsername ? (
                  <ActivityIndicator size="small" color="#94A3B8" />
                ) : isUsernameAvailable === true ? (
                  <Text style={{ color: Colors.accentGreen, fontSize: 12 }}>✓</Text>
                ) : isUsernameAvailable === false ? (
                  <Text style={{ color: "#EF4444", fontSize: 12 }}>✗</Text>
                ) : null}
              </View>
            </View>
            {errors.username ? (
              <Text style={{ color: "#EF4444", fontSize: 11, marginTop: 4, marginLeft: 4 }}>
                {errors.username.message}
              </Text>
            ) : usernameMsg ? (
              <Text
                style={{
                  color: isUsernameAvailable === true ? Colors.accentGreen : isUsernameAvailable === false ? "#EF4444" : "#94A3B8",
                  fontSize: 11,
                  marginTop: 4,
                  marginLeft: 4,
                }}
              >
                {usernameMsg}
              </Text>
            ) : null}

            <TouchableOpacity
              onPress={handleSubmit(onSaveProfile)}
              disabled={isSaving}
              className="active:opacity-90"
              style={{
                flexDirection: "row",
                backgroundColor: Colors.accentCyan,
                paddingVertical: 16,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 20,
                shadowColor: Colors.accentCyan,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 10,
                elevation: 6,
              }}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={Colors.background} />
              ) : (
                <>
                  <Save size={18} color={Colors.background} />
                  <Text
                    style={{
                      color: Colors.background,
                      fontSize: 15,
                      fontWeight: "900",
                      marginLeft: 8,
                    }}
                  >
                    Save Changes
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── LOGOUT CONFIRMATION MODAL ── */}
      <Modal visible={isLogoutModalOpen} animationType="fade" transparent>
        <View
          className="flex-1 justify-center items-center"
          style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
        >
          <View
            style={{
              backgroundColor: Colors.surface,
              borderRadius: 24,
              padding: 28,
              width: "80%",
              maxWidth: 320,
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.08)",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 24,
              elevation: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 40, marginBottom: 12 }}>👋</Text>
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 20,
                fontWeight: "900",
                textAlign: "center",
                marginBottom: 6,
              }}
            >
              Logout?
            </Text>
            <Text
              style={{
                color: "#94A3B8",
                fontSize: 13,
                fontWeight: "500",
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              See you again soon!
            </Text>

            <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  setIsLogoutModalOpen(false);
                }}
                className="active:scale-95"
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 14,
                  backgroundColor: "rgba(255,255,255,0.05)",
                  borderWidth: 0.5,
                  borderColor: "rgba(255,255,255,0.1)",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#94A3B8", fontSize: 14, fontWeight: "700" }}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSignOut}
                className="active:scale-95"
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 14,
                  backgroundColor: "rgba(239, 68, 68, 0.12)",
                  borderWidth: 0.5,
                  borderColor: "rgba(239, 68, 68, 0.3)",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#EF4444", fontSize: 14, fontWeight: "800" }}>
                  Logout
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
