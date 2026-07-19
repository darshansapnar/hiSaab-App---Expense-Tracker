import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image } from "react-native";
import { useRouter, Link } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "../../services/supabase";
import { useToastStore } from "../../store/toastStore";
import { Theme } from "../../constants/Theme";
import { Mail, Lock, LogIn } from "lucide-react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import Svg, { Path } from "react-native-svg";

WebBrowser.maybeCompleteAuthSession();

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
        showToast("Welcome to hiSaab", "success");
        // Navigate back to index so the auth guard re-evaluates and redirects
        router.replace("/");
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
    try {
      const redirectUrl = Linking.createURL("google-auth");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        if (result.type === "success") {
          const { url } = result;

          // Parse access and refresh tokens from redirect URL hash/query
          const getTokensFromUrl = (targetUrl: string) => {
            const hashIndex = targetUrl.indexOf("#");
            const queryIndex = targetUrl.indexOf("?");
            const splitIndex = hashIndex !== -1 ? hashIndex : queryIndex;
            if (splitIndex === -1) return {};

            const paramsStr = targetUrl.substring(splitIndex + 1);
            const paramsArr = paramsStr.split("&");
            const params: Record<string, string> = {};
            paramsArr.forEach((param) => {
              const [key, value] = param.split("=");
              if (key && value) {
                params[decodeURIComponent(key)] = decodeURIComponent(value);
              }
            });
            return params;
          };

          const { access_token, refresh_token } = getTokensFromUrl(url);
          if (access_token && refresh_token) {
            const { error: setSessionError } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (setSessionError) throw setSessionError;
            showToast("Logged in with Google successfully!", "success");
            // useAuth listener will automatically handle store updates and index redirects
          } else {
            throw new Error("Authentication tokens not found in redirect URL");
          }
        }
      }
    } catch (e: any) {
      Theme.haptics.error();
      showToast(e.message || "Google Sign-In failed", "error");
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const renderGoogleIcon = () => (
    <Svg width={18} height={18} viewBox="0 0 24 24" style={{ marginRight: 10 }}>
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </Svg>
  );

  return (
    <View className="flex-1 justify-center bg-background px-6">
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

        {/* Divider */}
        <View className="flex-row items-center my-4">
          <View className="flex-1 h-[0.5px] bg-white/10" />
          <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mx-4">OR</Text>
          <View className="flex-1 h-[0.5px] bg-white/10" />
        </View>

        {/* Google Sign In Button */}
        <TouchableOpacity
          onPress={handleGoogleSignIn}
          disabled={isGoogleSubmitting}
          className="flex-row justify-center items-center bg-[#151E2E] border-[0.5px] border-white/10 py-4 rounded-xl active:opacity-90"
        >
          {isGoogleSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              {renderGoogleIcon()}
              <Text className="text-white font-bold text-base">Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Link to Signup */}
      <View className="flex-row justify-center items-center mt-8">
        <Text className="text-accentGray text-sm">New to hiSaab? </Text>
        <Link href="/(auth)/signup" asChild>
          <TouchableOpacity>
            <Text className="text-accentCyan text-sm font-bold">Sign Up</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </View>
  );
}
