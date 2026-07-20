import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "../../services/supabase";
import { useToastStore } from "../../store/toastStore";
import { Theme } from "../../constants/Theme";
import { Colors } from "../../constants/Colors";
import { Mail, Lock, LogIn } from "lucide-react-native";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Please enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be at least 6 characters"),
});

type LoginSchema = z.infer<typeof loginSchema>;

export default function Login() {
  const router = useRouter();
  const showToast = useToastStore((state) => state.showToast);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    mode: "onChange",
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginSchema) => {
    if (isSubmitting) return;

    Theme.haptics.light();
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email.trim(),
        password: data.password,
      });

      if (error) {
        Theme.haptics.error();
        showToast(error.message, "error");
      } else {
        Theme.haptics.success();
        showToast("Welcome back to hiSaab!", "success");
        router.replace("/");
      }
    } catch (e) {
      showToast("An unexpected error occurred", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: Colors.background }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 justify-center px-6 py-12">
          {/* Logo Section */}
          <View className="items-center mb-10">
            <Image
              source={require("../../../assets/images/logo.png")}
              style={{
                width: 90,
                height: 90,
                borderRadius: 24,
                marginBottom: 16,
              }}
              resizeMode="contain"
            />
            <Text className="text-5xl font-black text-white tracking-tighter">hiSaab</Text>
            <Text className="text-accentGray text-sm font-medium tracking-wide mt-2 text-center">
              Track every rupee. Split every expense.
            </Text>
          </View>

          {/* Form Card */}
          <View
            style={{
              backgroundColor: Colors.surface,
              borderColor: Colors.border,
              borderWidth: 0.5,
              borderRadius: 24,
              padding: 24,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
              elevation: 5,
            }}
          >
            <Text className="text-2xl font-bold text-white mb-6">Sign In</Text>

            <View className="space-y-4">
              {/* Email Field */}
              <View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: Colors.surfaceLight,
                    borderWidth: 1,
                    borderColor: isEmailFocused ? Colors.accentCyan : Colors.border,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    height: 56,
                  }}
                >
                  <Mail
                    size={20}
                    color={isEmailFocused ? Colors.accentCyan : Colors.accentGray}
                    style={{ marginRight: 12 }}
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
                          setIsEmailFocused(false);
                        }}
                        onFocus={() => setIsEmailFocused(true)}
                        onChangeText={onChange}
                        value={value}
                        editable={!isSubmitting}
                      />
                    )}
                  />
                </View>
                {errors.email && (
                  <Text className="text-accentPink text-xs mt-1.5 ml-1 font-medium">
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
                    borderColor: isPasswordFocused ? Colors.accentCyan : Colors.border,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    height: 56,
                  }}
                >
                  <Lock
                    size={20}
                    color={isPasswordFocused ? Colors.accentCyan : Colors.accentGray}
                    style={{ marginRight: 12 }}
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
                          setIsPasswordFocused(false);
                        }}
                        onFocus={() => setIsPasswordFocused(true)}
                        onChangeText={onChange}
                        value={value}
                        editable={!isSubmitting}
                      />
                    )}
                  />
                </View>
                {errors.password && (
                  <Text className="text-accentPink text-xs mt-1.5 ml-1 font-medium">
                    {errors.password.message}
                  </Text>
                )}
              </View>

              {/* Forgot Password Link */}
              <View className="items-end mt-2">
                <Link href="/(auth)/forgot-password" asChild>
                  <TouchableOpacity disabled={isSubmitting} className="active:opacity-75">
                    <Text className="text-accentCyan text-sm font-semibold">Forgot Password?</Text>
                  </TouchableOpacity>
                </Link>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                onPress={handleSubmit(onSubmit)}
                disabled={!isValid || isSubmitting}
                style={{
                  backgroundColor: isValid && !isSubmitting ? Colors.accentCyan : "#1E293B",
                  opacity: isValid && !isSubmitting ? 1 : 0.6,
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  height: 56,
                  borderRadius: 16,
                  marginTop: 8,
                }}
                className="active:opacity-90 shadow-lg"
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#0B1220" />
                ) : (
                  <>
                    <LogIn size={20} color="#0B1220" style={{ marginRight: 8 }} />
                    <Text className="text-background font-bold text-base">Sign In</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Link to Signup */}
          <View className="flex-row justify-center items-center mt-8">
            <Text className="text-accentGray text-sm">Don't have an account? </Text>
            <Link href="/(auth)/signup" asChild>
              <TouchableOpacity disabled={isSubmitting}>
                <Text className="text-accentCyan text-sm font-bold">Create Account</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
