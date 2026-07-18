import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image } from "react-native";
import { useAuthStore } from "../../../store/authStore";
import { supabase } from "../../../services/supabase";
import { useToastStore } from "../../../store/toastStore";
import { Theme } from "../../../constants/Theme";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import * as ImagePicker from "expo-image-picker";
import { Camera, LogOut, Save, User as UserIcon } from "lucide-react-native";

const profileSchema = z.object({
  displayName: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be under 50 characters"),
});

type ProfileSchema = z.infer<typeof profileSchema>;

export default function Profile() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const logout = useAuthStore((state) => state.logout);
  const showToast = useToastStore((state) => state.showToast);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ProfileSchema>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: profile?.display_name || "",
    },
  });

  const onSaveName = async (data: ProfileSchema) => {
    if (!user) return;
    Theme.haptics.light();
    setIsSaving(true);

    try {
      const { data: updatedProfile, error } = await supabase
        .from("profiles")
        .update({
          display_name: data.displayName.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .select()
        .single();

      if (error) {
        Theme.haptics.error();
        showToast(error.message, "error");
      } else {
        Theme.haptics.success();
        setProfile(updatedProfile);
        setIsEditing(false);
        showToast("Profile name updated", "success");
      }
    } catch (e) {
      showToast("Failed to update name", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePickImage = async () => {
    if (!user) return;
    Theme.haptics.light();

    // Request permissions to access system camera roll
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showToast("Permissions to access media library are required", "error");
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      // Retrieve Blob object from local URI path
      const response = await fetch(uri);
      const blob = await response.blob();

      const fileExt = uri.split(".").pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload Blob raw file to profiles bucket
      const { error: uploadError } = await supabase.storage
        .from("profiles")
        .upload(filePath, blob, {
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Extract generated public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("profiles").getPublicUrl(filePath);

      // Save public URL link into the database profiles row
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
    const { error } = await supabase.auth.signOut();
    if (error) {
      showToast(error.message, "error");
    } else {
      logout();
      showToast("Logged out successfully", "success");
    }
  };

  // Determine if the saved avatar_url is an emoji character or a URL link
  const isEmojiAvatar = profile?.avatar_url && profile.avatar_url.length <= 4;

  return (
    <View className="flex-1 bg-background px-6 pt-16">
      <Text className="text-3xl font-black text-white tracking-tighter mb-8">Profile</Text>

      {/* Avatar Display & Camera Select Trigger */}
      <View className="items-center mb-8">
        <View className="relative">
          <View className="w-28 h-28 rounded-full bg-surfaceLight border-[1px] border-border justify-center items-center overflow-hidden">
            {isUploading ? (
              <ActivityIndicator size="large" color="#00F5D4" />
            ) : profile?.avatar_url ? (
              isEmojiAvatar ? (
                <Text className="text-5xl">{profile.avatar_url}</Text>
              ) : (
                <Image source={{ uri: profile.avatar_url }} className="w-28 h-28" />
              )
            ) : (
              <UserIcon size={48} color="#A3A3A3" />
            )}
          </View>
          <TouchableOpacity
            onPress={handlePickImage}
            disabled={isUploading}
            className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-accentCyan justify-center items-center shadow-lg active:scale-95"
          >
            <Camera size={16} color="#0D0D0D" />
          </TouchableOpacity>
        </View>
        <Text className="text-accentGray text-xs mt-3">Tap camera icon to change photo</Text>
      </View>

      {/* Display name field & Edit Form Card */}
      <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 mb-6 space-y-4">
        <View className="flex-row items-center justify-between border-b-[0.5px] border-border pb-4">
          <View className="flex-1 mr-4">
            <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-1">
              Display Name
            </Text>
            {isEditing ? (
              <View>
                <Controller
                  control={control}
                  name="displayName"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className="text-white text-base bg-surfaceLight border-[0.5px] border-border px-3 py-2 rounded-lg"
                      autoFocus
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {errors.displayName && (
                  <Text className="text-accentPink text-xs mt-1 ml-1">
                    {errors.displayName.message}
                  </Text>
                )}
              </View>
            ) : (
              <Text className="text-white text-lg font-bold">
                {profile?.display_name || "Unconfigured"}
              </Text>
            )}
          </View>

          {isEditing ? (
            <TouchableOpacity
              onPress={handleSubmit(onSaveName)}
              disabled={isSaving}
              className="bg-accentCyan w-10 h-10 justify-center items-center rounded-xl"
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#0D0D0D" />
              ) : (
                <Save size={18} color="#0D0D0D" />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => {
                Theme.haptics.light();
                setValue("displayName", profile?.display_name || "");
                setIsEditing(true);
              }}
              className="bg-surfaceLight border-[0.5px] border-border px-4 py-2 rounded-xl"
            >
              <Text className="text-white text-xs font-bold">Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Email read-only Information */}
        <View className="pt-2">
          <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-1">
            Email Address
          </Text>
          <Text className="text-white text-base font-semibold">{user?.email}</Text>
        </View>
      </View>

      {/* Logout Action */}
      <TouchableOpacity
        onPress={handleSignOut}
        className="flex-row justify-center items-center bg-surfaceLight border-[0.5px] border-border py-4 rounded-xl active:opacity-80"
      >
        <LogOut size={20} color="#FF007F" />
        <Text className="text-accentPink font-bold ml-2">Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}
