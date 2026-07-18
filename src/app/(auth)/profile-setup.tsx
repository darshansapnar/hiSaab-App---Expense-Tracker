import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "../../services/supabase";
import { useAuthStore } from "../../store/authStore";
import { useToastStore } from "../../store/toastStore";
import { Theme } from "../../constants/Theme";
import { UserCheck } from "lucide-react-native";

const profileSetupSchema = z.object({
  displayName: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be under 50 characters"),
});

type ProfileSetupSchema = z.infer<typeof profileSetupSchema>;

const AVATAR_OPTIONS = ["👋", "😎", "🚀", "🍕", "💡", "🎮", "🎒", "🥑"];

export default function ProfileSetup() {
  const router = useRouter();
  const showToast = useToastStore((state) => state.showToast);
  const user = useAuthStore((state) => state.user);
  const setProfile = useAuthStore((state) => state.setProfile);
  const [selectedAvatar, setSelectedAvatar] = useState("👋");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileSetupSchema>({
    resolver: zodResolver(profileSetupSchema),
    defaultValues: {
      displayName: "",
    },
  });

  const onSubmit = async (data: ProfileSetupSchema) => {
    if (!user) return;
    Theme.haptics.light();
    setIsSubmitting(true);

    try {
      // Upsert profile record in the database
      const profileRow = {
        id: user.id,
        email: user.email!,
        display_name: data.displayName.trim(),
        avatar_url: selectedAvatar,
        updated_at: new Date().toISOString(),
      };

      const { data: updatedProfile, error } = await supabase
        .from("profiles")
        .upsert(profileRow)
        .select()
        .single();

      if (error) {
        Theme.haptics.error();
        showToast(error.message, "error");
      } else {
        Theme.haptics.success();
        setProfile(updatedProfile);
        showToast("Profile set up successfully!", "success");
        // Root index.tsx will detect session + display_name and redirect to (app)/(tabs)
      }
    } catch (e) {
      showToast("An unexpected error occurred", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="flex-1 justify-center bg-background px-6">
      <View className="items-center mb-10">
        <Text className="text-3xl font-black text-white tracking-tighter">Tell us your name</Text>
        <Text className="text-accentGray text-sm mt-2 text-center">
          This is how your roommates and friends will identify you in shared ledgers.
        </Text>
      </View>

      <View className="space-y-6">
        {/* Avatar Picker */}
        <View className="items-center mb-4">
          <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-3">
            Choose an Avatar Emoji
          </Text>
          <View className="flex-row flex-wrap justify-center gap-3">
            {AVATAR_OPTIONS.map((avatar) => (
              <TouchableOpacity
                key={avatar}
                onPress={() => {
                  Theme.haptics.light();
                  setSelectedAvatar(avatar);
                }}
                className={`w-12 h-12 justify-center items-center rounded-full bg-surfaceLight border-[1.5px] ${
                  selectedAvatar === avatar ? "border-accentCyan scale-110" : "border-transparent"
                }`}
              >
                <Text className="text-2xl">{avatar}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Display Name Input */}
        <View>
          <View className="flex-row items-center bg-surface border-[0.5px] border-border rounded-xl px-4 py-3">
            <Controller
              control={control}
              name="displayName"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  placeholder="Your Full Name"
                  placeholderTextColor="#666666"
                  className="flex-1 text-white text-base py-1"
                  autoCapitalize="words"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
          </View>
          {errors.displayName && (
            <Text className="text-accentPink text-xs mt-1 ml-1">{errors.displayName.message}</Text>
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
              <UserCheck size={20} color="#0D0D0D" />
              <Text className="text-background font-black text-base ml-2">Enter Hisab</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
