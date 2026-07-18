import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter, Link } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "../../services/supabase";
import { useToastStore } from "../../store/toastStore";
import { Theme } from "../../constants/Theme";
import { Mail, Lock, LogIn } from "lucide-react-native";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginSchema = z.infer<typeof loginSchema>;

export default function Login() {
  const router = useRouter();
  const showToast = useToastStore((state) => state.showToast);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginSchema) => {
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
        showToast("Welcome to Hisab", "success");
        // useAuth listener will automatically handle routing redirect to (app)
      }
    } catch (e) {
      showToast("An unexpected error occurred", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    Theme.haptics.medium();
    setIsGoogleSubmitting(true);
    // Simulate OAuth redirect or native loading
    setTimeout(() => {
      setIsGoogleSubmitting(false);
      showToast("Google Sign-In requires configuring client credentials in production.", "info");
    }, 1500);
  };

  return (
    <View className="flex-1 justify-center bg-background px-6">
      <View className="items-center mb-10">
        <Text className="text-5xl font-black text-white tracking-tighter">Hisab</Text>
        <Text className="text-accentCyan text-xs font-bold uppercase tracking-widest mt-2">
          No more "Bhai, kitna dena hai?"
        </Text>
      </View>

      <Text className="text-xl font-bold text-white mb-6">Log In</Text>

      <View className="space-y-4">
        {/* Email Field */}
        <View>
          <View className="flex-row items-center bg-surface border-[0.5px] border-border rounded-xl px-4 py-3">
            <Mail size={20} color="#A3A3A3" className="mr-3" />
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  placeholder="Email Address"
                  placeholderTextColor="#666666"
                  className="flex-1 text-white text-base py-1"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
          </View>
          {errors.email && (
            <Text className="text-accentPink text-xs mt-1 ml-1">{errors.email.message}</Text>
          )}
        </View>

        {/* Password Field */}
        <View>
          <View className="flex-row items-center bg-surface border-[0.5px] border-border rounded-xl px-4 py-3">
            <Lock size={20} color="#A3A3A3" className="mr-3" />
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  placeholder="Password"
                  placeholderTextColor="#666666"
                  className="flex-1 text-white text-base py-1"
                  secureTextEntry
                  autoCapitalize="none"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
          </View>
          {errors.password && (
            <Text className="text-accentPink text-xs mt-1 ml-1">{errors.password.message}</Text>
          )}
        </View>

        {/* Forgot Password Link */}
        <View className="align-end items-end">
          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity>
              <Text className="text-accentCyan text-sm font-semibold">Forgot Password?</Text>
            </TouchableOpacity>
          </Link>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting}
          className="flex-row justify-center items-center bg-accentCyan py-4 rounded-xl shadow-lg active:opacity-90"
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#0D0D0D" />
          ) : (
            <>
              <LogIn size={20} color="#0D0D0D" />
              <Text className="text-background font-black text-base ml-2">Log In</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Google Sign In Button */}
        <TouchableOpacity
          onPress={handleGoogleSignIn}
          disabled={isGoogleSubmitting}
          className="flex-row justify-center items-center bg-surface border-[0.5px] border-border py-4 rounded-xl active:opacity-90 mt-2"
        >
          {isGoogleSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="text-white font-bold text-base">Continue with Google</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Link to Signup */}
      <View className="flex-row justify-center items-center mt-8">
        <Text className="text-accentGray text-sm">New to Hisab? </Text>
        <Link href="/(auth)/signup" asChild>
          <TouchableOpacity>
            <Text className="text-accentCyan text-sm font-bold">Sign Up</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </View>
  );
}
