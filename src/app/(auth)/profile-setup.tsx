import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../services/supabase";
import { useAuthStore } from "../../store/authStore";
import { useToastStore } from "../../store/toastStore";
import { Theme } from "../../constants/Theme";
import { Colors } from "../../constants/Colors";
import {
  Camera,
  CheckCircle,
  XCircle,
  ArrowRight,
  User as UserIcon,
  Loader,
} from "lucide-react-native";

const usernameSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be under 20 characters")
    .regex(
      /^[a-zA-Z0-9_.]+$/,
      "Only letters, numbers, underscore (_) and period (.) allowed"
    ),
});

type UsernameSchema = z.infer<typeof usernameSchema>;

export default function ProfileSetup() {
  const router = useRouter();
  const showToast = useToastStore((state) => state.showToast);
  const user = useAuthStore((state) => state.user);
  const setProfile = useAuthStore((state) => state.setProfile);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [selectedEmoji, setSelectedEmoji] = useState("👋");

  // Username uniqueness state
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);
  const [usernameMessage, setUsernameMessage] = useState("");

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isValid },
  } = useForm<UsernameSchema>({
    resolver: zodResolver(usernameSchema),
    defaultValues: { username: "" },
    mode: "onChange",
  });

  const usernameValue = watch("username");

  // Debounced username uniqueness check
  useEffect(() => {
    if (!usernameValue || usernameValue.length < 3) {
      setIsUsernameAvailable(null);
      setUsernameMessage("");
      return;
    }

    // Quick regex validation before querying
    if (!/^[a-zA-Z0-9_.]+$/.test(usernameValue)) {
      setIsUsernameAvailable(null);
      setUsernameMessage("");
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingUsername(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", usernameValue.toLowerCase())
          .maybeSingle();

        if (error) {
          setIsUsernameAvailable(null);
          setUsernameMessage("Could not check availability");
        } else if (data && data.id !== user?.id) {
          setIsUsernameAvailable(false);
          setUsernameMessage("This username is already taken");
        } else {
          setIsUsernameAvailable(true);
          setUsernameMessage("Username is available!");
        }
      } catch {
        setIsUsernameAvailable(null);
        setUsernameMessage("Network error");
      } finally {
        setIsCheckingUsername(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [usernameValue, user?.id]);

  const handlePickImage = async () => {
    Theme.haptics.light();
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showToast("Permission to access media library is required", "error");
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });

      if (!result.canceled && result.assets && result.assets[0].uri) {
        setAvatarUri(result.assets[0].uri);
        setSelectedEmoji("");
      }
    } catch {
      showToast("Error picking image", "error");
    }
  };

  const uploadAvatar = async (): Promise<string> => {
    if (!user || !avatarUri) return selectedEmoji || "👋";

    setIsUploading(true);
    try {
      const response = await fetch(avatarUri);
      const arrayBuffer = await response.arrayBuffer();

      const fileExt = avatarUri.split(".").pop() || "jpg";
      const mimeType = fileExt === "png" ? "image/png" : "image/jpeg";
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("profiles")
        .upload(filePath, arrayBuffer, { contentType: mimeType, upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("profiles").getPublicUrl(filePath);

      return publicUrl;
    } catch (e: any) {
      showToast("Photo upload failed, using emoji instead", "info");
      return selectedEmoji || "👋";
    } finally {
      setIsUploading(false);
    }
  };

  const onSubmit = async (data: UsernameSchema) => {
    if (!user) return;
    if (!isUsernameAvailable) {
      showToast("Please choose an available username", "error");
      return;
    }

    Keyboard.dismiss();
    Theme.haptics.light();
    setIsSubmitting(true);

    try {
      const avatarUrl = await uploadAvatar();
      const finalUsername = data.username.toLowerCase();

      const profileRow = {
        id: user.id,
        email: user.email!,
        username: finalUsername,
        display_name: data.username,
        avatar_url: avatarUrl,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      };

      const { data: updatedProfile, error } = await supabase
        .from("profiles")
        .upsert(profileRow)
        .select()
        .single();

      if (error) {
        if (error.message.includes("unique") || error.message.includes("duplicate")) {
          Theme.haptics.error();
          showToast("Username already taken, try another one", "error");
        } else {
          Theme.haptics.error();
          showToast(error.message, "error");
        }
      } else {
        Theme.haptics.success();
        setProfile(updatedProfile);
        showToast(`Welcome, @${finalUsername}! 🎉`, "success");
        // Auth gate in index.tsx will detect onboarding_completed and redirect to app
      }
    } catch (e) {
      showToast("An unexpected error occurred", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const EMOJI_OPTIONS = ["👋", "😎", "🚀", "🍕", "💡", "🎮", "🎒", "🥑"];

  const canSubmit = isValid && isUsernameAvailable === true && !isCheckingUsername && !isSubmitting;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress indicator */}
        <View className="px-6 pt-4 mb-2">
          <Text
            style={{
              color: "#475569",
              fontSize: 10,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 1.5,
            }}
          >
            Step 1 of 1
          </Text>
          <View
            style={{
              height: 3,
              backgroundColor: "rgba(255,255,255,0.05)",
              borderRadius: 2,
              marginTop: 8,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: 3,
                width: "100%",
                backgroundColor: Colors.accentCyan,
                borderRadius: 2,
              }}
            />
          </View>
        </View>

        {/* Header with gradient */}
        <View
          style={{
            paddingTop: 32,
            paddingBottom: 40,
            alignItems: "center",
            backgroundColor: "#1A2744",
            ...Platform.select({
              web: {
                backgroundImage: "linear-gradient(to bottom, #1A2744, #0F1A2E, #0B1220)",
              } as any,
            }),
          }}
        >
          <Text style={{ fontSize: 56, marginBottom: 16 }}>👋</Text>
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 28,
              fontWeight: "900",
              letterSpacing: -1,
              textAlign: "center",
            }}
          >
            Welcome to Hisab!
          </Text>
          <Text
            style={{
              color: "#94A3B8",
              fontSize: 14,
              fontWeight: "500",
              textAlign: "center",
              marginTop: 8,
              paddingHorizontal: 40,
              lineHeight: 20,
            }}
          >
            Let's make your profile yours.{"\n"}Choose a username to get started.
          </Text>
        </View>

        <View className="px-6 -mt-4">
          {/* Avatar Section */}
          <View
            style={{
              backgroundColor: Colors.surface,
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.05)",
              borderRadius: 20,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                color: "#94A3B8",
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 1.5,
                marginBottom: 12,
              }}
            >
              Profile Photo (Optional)
            </Text>

            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <TouchableOpacity onPress={handlePickImage} className="active:scale-95">
                <View
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    backgroundColor: Colors.surfaceLight,
                    borderWidth: 2,
                    borderColor: avatarUri
                      ? Colors.accentCyan
                      : "rgba(255,255,255,0.1)",
                    justifyContent: "center",
                    alignItems: "center",
                    overflow: "hidden",
                  }}
                >
                  {isUploading ? (
                    <ActivityIndicator size="small" color={Colors.accentCyan} />
                  ) : avatarUri ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={{ width: 80, height: 80 }}
                    />
                  ) : selectedEmoji ? (
                    <Text style={{ fontSize: 36 }}>{selectedEmoji}</Text>
                  ) : (
                    <UserIcon size={32} color="#94A3B8" />
                  )}
                </View>
                <View
                  style={{
                    position: "absolute",
                    bottom: -2,
                    right: -2,
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: Colors.accentCyan,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Camera size={12} color={Colors.background} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Emoji picker (fallback if no photo) */}
            {!avatarUri && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                {EMOJI_OPTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    onPress={() => {
                      Theme.haptics.light();
                      setSelectedEmoji(emoji);
                    }}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 21,
                      backgroundColor:
                        selectedEmoji === emoji
                          ? "rgba(20, 229, 212, 0.15)"
                          : "rgba(255,255,255,0.03)",
                      borderWidth: 1.5,
                      borderColor:
                        selectedEmoji === emoji
                          ? Colors.accentCyan
                          : "transparent",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 20 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {avatarUri && (
              <TouchableOpacity
                onPress={() => {
                  Theme.haptics.light();
                  setAvatarUri(null);
                  setSelectedEmoji("👋");
                }}
                style={{ alignItems: "center", marginTop: 4 }}
              >
                <Text
                  style={{
                    color: "#94A3B8",
                    fontSize: 11,
                    fontWeight: "600",
                  }}
                >
                  Remove photo & use emoji instead
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Username Input Section */}
          <View
            style={{
              backgroundColor: Colors.surface,
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.05)",
              borderRadius: 20,
              padding: 20,
              marginBottom: 24,
            }}
          >
            <Text
              style={{
                color: "#94A3B8",
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 1.5,
                marginBottom: 10,
              }}
            >
              Choose a Username
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
              <Text
                style={{
                  color: "#94A3B8",
                  fontSize: 16,
                  fontWeight: "700",
                  marginRight: 2,
                }}
              >
                @
              </Text>
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
                    onChangeText={(text) => {
                      // Strip spaces in real-time
                      onChange(text.replace(/\s/g, ""));
                    }}
                    value={value}
                    maxLength={20}
                  />
                )}
              />

              {/* Status indicator */}
              <View style={{ marginLeft: 8 }}>
                {isCheckingUsername ? (
                  <ActivityIndicator size="small" color="#94A3B8" />
                ) : isUsernameAvailable === true ? (
                  <CheckCircle size={18} color={Colors.accentGreen} />
                ) : isUsernameAvailable === false ? (
                  <XCircle size={18} color="#EF4444" />
                ) : null}
              </View>
            </View>

            {/* Validation message */}
            {errors.username ? (
              <Text
                style={{
                  color: "#EF4444",
                  fontSize: 11,
                  fontWeight: "500",
                  marginTop: 6,
                  marginLeft: 4,
                }}
              >
                {errors.username.message}
              </Text>
            ) : usernameMessage ? (
              <Text
                style={{
                  color:
                    isUsernameAvailable === true
                      ? Colors.accentGreen
                      : isUsernameAvailable === false
                      ? "#EF4444"
                      : "#94A3B8",
                  fontSize: 11,
                  fontWeight: "500",
                  marginTop: 6,
                  marginLeft: 4,
                }}
              >
                {usernameMessage}
              </Text>
            ) : usernameValue.length > 0 && usernameValue.length < 3 ? (
              <Text
                style={{
                  color: "#94A3B8",
                  fontSize: 11,
                  fontWeight: "500",
                  marginTop: 6,
                  marginLeft: 4,
                }}
              >
                Keep going... {3 - usernameValue.length} more character
                {3 - usernameValue.length !== 1 ? "s" : ""} needed
              </Text>
            ) : null}

            {/* Rules hint */}
            <Text
              style={{
                color: "#475569",
                fontSize: 10,
                fontWeight: "500",
                marginTop: 10,
                marginLeft: 4,
                lineHeight: 16,
              }}
            >
              3–20 characters • Letters, numbers, underscore, period
            </Text>
          </View>

          {/* Continue Button */}
          <TouchableOpacity
            onPress={handleSubmit(onSubmit)}
            disabled={!canSubmit}
            className="active:scale-[0.98]"
            style={{
              flexDirection: "row",
              backgroundColor: canSubmit ? Colors.accentCyan : "rgba(20, 229, 212, 0.2)",
              paddingVertical: 18,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: canSubmit ? Colors.accentCyan : "transparent",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: canSubmit ? 0.3 : 0,
              shadowRadius: 12,
              elevation: canSubmit ? 6 : 0,
            }}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={Colors.background} />
            ) : (
              <>
                <Text
                  style={{
                    color: canSubmit ? Colors.background : "rgba(11, 18, 32, 0.5)",
                    fontSize: 16,
                    fontWeight: "900",
                    marginRight: 8,
                  }}
                >
                  Continue
                </Text>
                <ArrowRight
                  size={18}
                  color={canSubmit ? Colors.background : "rgba(11, 18, 32, 0.5)"}
                />
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
