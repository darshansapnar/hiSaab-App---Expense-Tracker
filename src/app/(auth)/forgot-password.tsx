import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image } from "react-native";
import { useRouter, Link } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "../../services/supabase";
import { useToastStore } from "../../store/toastStore";
import { Theme } from "../../constants/Theme";
import { Mail, KeyRound, ChevronLeft } from "lucide-react-native";

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPassword() {
  const router = useRouter();
  const showToast = useToastStore((state) => state.showToast);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordSchema>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: ForgotPasswordSchema) => {
    Theme.haptics.light();
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email.trim(), {
        redirectTo: "hisab://reset-password", // Deep link configuration
      });

      if (error) {
        Theme.haptics.error();
        showToast(error.message, "error");
      } else {
        Theme.haptics.success();
        showToast("Password reset link sent to your email", "success");
        router.replace("/(auth)/login");
      }
    } catch (e) {
      showToast("An unexpected error occurred", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="flex-1 justify-center bg-background px-6">
      {/* Back button */}
      <View className="absolute top-12 left-4">
        <Link href="/(auth)/login" asChild>
          <TouchableOpacity className="flex-row items-center p-2">
            <ChevronLeft size={24} color="#00F5D4" />
            <Text className="text-accentCyan font-bold ml-1">Back</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <View className="items-center mb-8">
        <Image
          source={require("../../../assets/images/logo.png")}
          style={{ width: 100, height: 100, borderRadius: 24, marginBottom: 16 }}
          resizeMode="contain"
        />
        <Text className="text-5xl font-black text-white tracking-tighter">hiSaab</Text>
        <Text className="text-accentCyan text-xs font-bold uppercase tracking-widest mt-2">
          Keep the hisaab clear.
        </Text>
      </View>

      <Text className="text-xl font-bold text-white mb-2">Reset Password</Text>
      <Text className="text-accentGray text-sm mb-6 leading-relaxed">
        Enter your email address and we will send you a secure link to reset your account password.
      </Text>

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

        {/* Submit Button */}
        <TouchableOpacity
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting}
          className="flex-row justify-center items-center bg-accentCyan py-4 rounded-xl shadow-lg active:opacity-90 mt-4"
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#0D0D0D" />
          ) : (
            <>
              <KeyRound size={20} color="#0D0D0D" />
              <Text className="text-background font-black text-base ml-2">Send Reset Link</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
