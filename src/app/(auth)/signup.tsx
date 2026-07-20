import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../services/supabase";
import { useToastStore } from "../../store/toastStore";
import { useAuthStore } from "../../store/authStore";
import { useNotificationsStore } from "../../store/notificationsStore";
import { Theme } from "../../constants/Theme";
import { Colors } from "../../constants/Colors";
import {
  Mail,
  Lock,
  UserPlus,
  User as UserIcon,
  Camera,
  CheckCircle,
  XCircle,
  Loader,
} from "lucide-react-native";

const signupSchema = z
  .object({
    username: z
      .string()
      .min(1, "Username is required")
      .min(3, "Username must be at least 3 characters")
      .max(20, "Username must be under 20 characters")
      .regex(/^[a-zA-Z0-9_.]+$/, "Only letters, numbers, underscore (_) and period (.) allowed"),
    email: z.string().min(1, "Email is required").email("Please enter a valid email address"),
    password: z
      .string()
      .min(1, "Password is required")
      .min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignupSchema = z.infer<typeof signupSchema>;

export default function Signup() {
  const router = useRouter();
  const showToast = useToastStore((state) => state.showToast);
  const setProfile = useAuthStore((state) => state.setProfile);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [selectedEmoji, setSelectedEmoji] = useState("👋");

  // Focus states
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Username uniqueness check state
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);
  const [usernameMessage, setUsernameMessage] = useState("");

  const {
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isValid },
  } = useForm<SignupSchema>({
    resolver: zodResolver(signupSchema),
    mode: "onChange",
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const usernameValue = watch("username");

  // Debounced username check
  useEffect(() => {
    if (!usernameValue || usernameValue.length < 3) {
      setIsUsernameAvailable(null);
      setUsernameMessage("");
      return;
    }

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
          setUsernameMessage("Could not verify username availability");
        } else if (data) {
          setIsUsernameAvailable(false);
          setUsernameMessage("This username is already taken");
        } else {
          setIsUsernameAvailable(true);
          setUsernameMessage("Username is available!");
        }
      } catch {
        setIsUsernameAvailable(null);
        setUsernameMessage("Network error checking availability");
      } finally {
        setIsCheckingUsername(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [usernameValue]);

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

  const uploadAvatar = async (userId: string): Promise<string> => {
    if (!avatarUri) return selectedEmoji || "👋";

    setIsUploading(true);
    try {
      const response = await fetch(avatarUri);
      const arrayBuffer = await response.arrayBuffer();

      const fileExt = avatarUri.split(".").pop() || "jpg";
      const mimeType = fileExt === "png" ? "image/png" : "image/jpeg";
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("profiles")
        .upload(filePath, arrayBuffer, { contentType: mimeType, upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("profiles").getPublicUrl(filePath);

      return publicUrl;
    } catch (e) {
      return selectedEmoji || "👋";
    } finally {
      setIsUploading(false);
    }
  };

  const onSubmit = async (data: SignupSchema) => {
    if (isSubmitting) return;
    if (!isUsernameAvailable) {
      showToast("Please choose an available username", "error");
      return;
    }

    Keyboard.dismiss();
    Theme.haptics.light();
    setIsSubmitting(true);

    try {
      // 1. Auth Sign Up
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
      });

      if (signUpError) {
        Theme.haptics.error();
        if (
          signUpError.message.toLowerCase().includes("already registered") ||
          signUpError.message.toLowerCase().includes("email already in use")
        ) {
          setError("email", { type: "manual", message: "Email is already registered" });
        } else {
          showToast(signUpError.message, "error");
        }
        setIsSubmitting(false);
        return;
      }

      const user = signUpData.user;
      if (!user) {
        Theme.haptics.error();
        showToast("SignUp failed. Please try again.", "error");
        setIsSubmitting(false);
        return;
      }

      // 2. Upload Avatar (if any)
      const avatarUrl = await uploadAvatar(user.id);
      const finalUsername = data.username.toLowerCase();

      // 3. Upsert Profile Row
      const profileRow = {
        id: user.id,
        email: user.email!,
        username: finalUsername,
        display_name: data.username,
        avatar_url: avatarUrl,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      };

      const { data: updatedProfile, error: profileError } = await supabase
        .from("profiles")
        .upsert(profileRow)
        .select()
        .single();

      if (profileError) {
        Theme.haptics.error();
        if (profileError.message.includes("unique") || profileError.message.includes("duplicate")) {
          setError("username", { type: "manual", message: "Username already taken" });
        } else {
          showToast(profileError.message, "error");
        }
      } else {
        Theme.haptics.success();
        setProfile(updatedProfile);
        showToast("Account created successfully! 🎉", "success");

        useNotificationsStore.getState().addNotification({
          type: "welcome",
          title: "Welcome Message 🎉",
          description: "Welcome to hiSaab! Let's keep the hisaab clear and your finances clean. 🤝",
        });

        // Redirect directly to the main dashboard
        router.replace("/");
      }
    } catch (e) {
      showToast("An unexpected error occurred", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const EMOJI_OPTIONS = ["👋", "😎", "🚀", "🍕", "💡", "🎮", "🎒", "🥑"];
  const isButtonEnabled =
    isValid && isUsernameAvailable === true && !isCheckingUsername && !isSubmitting;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: Colors.background }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 justify-center px-6 pt-12">
          {/* Logo Section */}
          <View className="items-center mb-6">
            <Image
              source={require("../../../assets/images/logo.png")}
              style={{ width: 70, height: 70, borderRadius: 20, marginBottom: 8 }}
              resizeMode="contain"
            />
            <Text className="text-4xl font-black text-white tracking-tighter">hiSaab</Text>
          </View>

          {/* Form Card */}
          <View
            style={{
              backgroundColor: Colors.surface,
              borderColor: Colors.border,
              borderWidth: 0.5,
              borderRadius: 24,
              padding: 20,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
              elevation: 5,
            }}
          >
            <Text className="text-xl font-bold text-white mb-5">Create Account</Text>

            {/* Profile Photo Selection */}
            <View className="items-center mb-6">
              <TouchableOpacity onPress={handlePickImage} className="active:scale-95 mb-3">
                <View
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 38,
                    backgroundColor: Colors.surfaceLight,
                    borderWidth: 2,
                    borderColor: avatarUri ? Colors.accentCyan : "rgba(255,255,255,0.1)",
                    justifyContent: "center",
                    alignItems: "center",
                    overflow: "hidden",
                  }}
                >
                  {isUploading ? (
                    <ActivityIndicator size="small" color={Colors.accentCyan} />
                  ) : avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={{ width: 76, height: 76 }} />
                  ) : selectedEmoji ? (
                    <Text style={{ fontSize: 32 }}>{selectedEmoji}</Text>
                  ) : (
                    <UserIcon size={28} color="#94A3B8" />
                  )}
                </View>
                <View
                  style={{
                    position: "absolute",
                    bottom: -2,
                    right: -2,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: Colors.accentCyan,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Camera size={12} color={Colors.background} />
                </View>
              </TouchableOpacity>

              {/* Emoji quick selectors */}
              {!avatarUri && (
                <View className="flex-row justify-center gap-1.5 flex-wrap px-2">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      onPress={() => {
                        Theme.haptics.light();
                        setSelectedEmoji(emoji);
                      }}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        backgroundColor:
                          selectedEmoji === emoji
                            ? "rgba(20, 229, 212, 0.15)"
                            : "rgba(255,255,255,0.03)",
                        borderWidth: 1,
                        borderColor: selectedEmoji === emoji ? Colors.accentCyan : "transparent",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>{emoji}</Text>
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
                  className="mt-1"
                >
                  <Text className="text-accentGray text-xs font-semibold">Remove Image</Text>
                </TouchableOpacity>
              )}
            </View>

            <View className="space-y-3.5">
              {/* Username Field */}
              <View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: Colors.surfaceLight,
                    borderWidth: 1,
                    borderColor:
                      focusedField === "username"
                        ? Colors.accentCyan
                        : errors.username
                          ? Colors.accentPink
                          : Colors.border,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    height: 52,
                  }}
                >
                  <UserIcon
                    size={18}
                    color={focusedField === "username" ? Colors.accentCyan : Colors.accentGray}
                    style={{ marginRight: 10 }}
                  />
                  <Controller
                    control={control}
                    name="username"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        placeholder="Username"
                        placeholderTextColor="#64748B"
                        className="flex-1 text-white text-base py-1"
                        autoCapitalize="none"
                        onBlur={() => {
                          onBlur();
                          setFocusedField(null);
                        }}
                        onFocus={() => setFocusedField("username")}
                        onChangeText={onChange}
                        value={value}
                        editable={!isSubmitting}
                      />
                    )}
                  />
                  {isCheckingUsername && (
                    <ActivityIndicator size="small" color={Colors.accentCyan} />
                  )}
                  {!isCheckingUsername && isUsernameAvailable === true && (
                    <CheckCircle size={18} color={Colors.accentGreen} />
                  )}
                  {!isCheckingUsername && isUsernameAvailable === false && (
                    <XCircle size={18} color={Colors.accentPink} />
                  )}
                </View>
                {errors.username ? (
                  <Text className="text-accentPink text-xs mt-1 ml-1 font-medium">
                    {errors.username.message}
                  </Text>
                ) : usernameMessage ? (
                  <Text
                    style={{
                      color: isUsernameAvailable ? Colors.accentGreen : Colors.accentPink,
                    }}
                    className="text-xs mt-1 ml-1 font-medium"
                  >
                    {usernameMessage}
                  </Text>
                ) : null}
              </View>

              {/* Email Field */}
              <View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: Colors.surfaceLight,
                    borderWidth: 1,
                    borderColor:
                      focusedField === "email"
                        ? Colors.accentCyan
                        : errors.email
                          ? Colors.accentPink
                          : Colors.border,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    height: 52,
                  }}
                >
                  <Mail
                    size={18}
                    color={focusedField === "email" ? Colors.accentCyan : Colors.accentGray}
                    style={{ marginRight: 10 }}
                  />
                  <Controller
                    control={control}
                    name="email"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        placeholder="Email Address"
                        placeholderTextColor="#64748B"
                        className="flex-1 text-white text-base py-1"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        onBlur={() => {
                          onBlur();
                          setFocusedField(null);
                        }}
                        onFocus={() => setFocusedField("email")}
                        onChangeText={onChange}
                        value={value}
                        editable={!isSubmitting}
                      />
                    )}
                  />
                </View>
                {errors.email && (
                  <Text className="text-accentPink text-xs mt-1 ml-1 font-medium">
                    {errors.email.message}
                  </Text>
                )}
              </View>

              {/* Password Field */}
              <View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: Colors.surfaceLight,
                    borderWidth: 1,
                    borderColor:
                      focusedField === "password"
                        ? Colors.accentCyan
                        : errors.password
                          ? Colors.accentPink
                          : Colors.border,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    height: 52,
                  }}
                >
                  <Lock
                    size={18}
                    color={focusedField === "password" ? Colors.accentCyan : Colors.accentGray}
                    style={{ marginRight: 10 }}
                  />
                  <Controller
                    control={control}
                    name="password"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        placeholder="Password"
                        placeholderTextColor="#64748B"
                        className="flex-1 text-white text-base py-1"
                        secureTextEntry
                        autoCapitalize="none"
                        onBlur={() => {
                          onBlur();
                          setFocusedField(null);
                        }}
                        onFocus={() => setFocusedField("password")}
                        onChangeText={onChange}
                        value={value}
                        editable={!isSubmitting}
                      />
                    )}
                  />
                </View>
                {errors.password && (
                  <Text className="text-accentPink text-xs mt-1 ml-1 font-medium">
                    {errors.password.message}
                  </Text>
                )}
              </View>

              {/* Confirm Password Field */}
              <View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: Colors.surfaceLight,
                    borderWidth: 1,
                    borderColor:
                      focusedField === "confirmPassword"
                        ? Colors.accentCyan
                        : errors.confirmPassword
                          ? Colors.accentPink
                          : Colors.border,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    height: 52,
                  }}
                >
                  <Lock
                    size={18}
                    color={
                      focusedField === "confirmPassword" ? Colors.accentCyan : Colors.accentGray
                    }
                    style={{ marginRight: 10 }}
                  />
                  <Controller
                    control={control}
                    name="confirmPassword"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        placeholder="Confirm Password"
                        placeholderTextColor="#64748B"
                        className="flex-1 text-white text-base py-1"
                        secureTextEntry
                        autoCapitalize="none"
                        onBlur={() => {
                          onBlur();
                          setFocusedField(null);
                        }}
                        onFocus={() => setFocusedField("confirmPassword")}
                        onChangeText={onChange}
                        value={value}
                        editable={!isSubmitting}
                      />
                    )}
                  />
                </View>
                {errors.confirmPassword && (
                  <Text className="text-accentPink text-xs mt-1 ml-1 font-medium">
                    {errors.confirmPassword.message}
                  </Text>
                )}
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                onPress={handleSubmit(onSubmit)}
                disabled={!isButtonEnabled}
                style={{
                  backgroundColor: isButtonEnabled ? Colors.accentCyan : "#1E293B",
                  opacity: isButtonEnabled ? 1 : 0.6,
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  height: 52,
                  borderRadius: 16,
                  marginTop: 10,
                }}
                className="active:opacity-90 shadow-lg"
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#0B1220" />
                ) : (
                  <>
                    <UserPlus size={18} color="#0B1220" style={{ marginRight: 8 }} />
                    <Text className="text-background font-bold text-base">Create Account</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Link to Login */}
          <View className="flex-row justify-center items-center mt-6">
            <Text className="text-accentGray text-sm">Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity disabled={isSubmitting}>
                <Text className="text-accentCyan text-sm font-bold">Sign In</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
