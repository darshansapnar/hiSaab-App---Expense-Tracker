import React from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useAuthStore } from "../../../store/authStore";
import { supabase } from "../../../services/supabase";
import { useQuery } from "@tanstack/react-query";
import { useRouter, Link } from "expo-router";
import { Theme } from "../../../constants/Theme";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Wallet,
  Users,
  Plus,
  ArrowUpRight,
  TrendingUp,
  Droplet,
  Coffee,
  ChevronRight,
  Clock,
} from "lucide-react-native";

export default function Dashboard() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const user = useAuthStore((state) => state.user);

  // 1. Fetch user's active groups (mock structure for display)
  const { data: groups, isLoading: isGroupsLoading } = useQuery({
    queryKey: ["dashboard-groups", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_members")
        .select("*, group:groups(*)")
        .eq("profile_id", user?.id)
        .limit(3);

      if (error) throw error;
      return (data || []).map((m) => m.group) as any[];
    },
    enabled: !!user?.id,
  });

  // 2. Fetch monthly personal expenses
  const { data: personalExpenses } = useQuery({
    queryKey: ["dashboard-personal-expenses", user?.id],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("personal_expenses")
        .select("*, category:categories(*)")
        .eq("profile_id", user?.id)
        .gte("expense_date", startOfMonth.toISOString().split("T")[0])
        .order("created_at", { ascending: false })
        .limit(3);

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user?.id,
  });

  // Compute total spent (fallback placeholder if empty)
  const monthlyTotal = personalExpenses?.reduce((sum, exp) => sum + Number(exp.amount), 0) || 0;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* User Greeting */}
        <View className="flex-row justify-between items-center mt-6 mb-8">
          <View>
            <Text className="text-accentGray text-xs font-bold uppercase tracking-widest">
              Welcome Back
            </Text>
            <Text className="text-white text-2xl font-black mt-1">
              {profile?.display_name || "Hisab User"}
            </Text>
          </View>
          <View className="w-10 h-10 rounded-full bg-surfaceLight justify-center items-center border-[0.5px] border-border">
            <Text className="text-xl">{profile?.avatar_url || "👋"}</Text>
          </View>
        </View>

        {/* Monthly Spending Summary Card */}
        <View className="bg-surface border-[0.5px] border-border rounded-2xl p-5 mb-6">
          <Text className="text-accentGray text-[10px] font-bold uppercase tracking-widest mb-2">
            Monthly Spending Summary
          </Text>
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-white text-3xl font-black">₹ {monthlyTotal.toFixed(2)}</Text>
            <View className="flex-row items-center bg-accentCyan/10 border-[0.5px] border-accentCyan/20 px-2.5 py-1 rounded-lg">
              <TrendingUp size={12} color="#00F5D4" />
              <Text className="text-accentCyan text-[10px] font-bold ml-1">On Track</Text>
            </View>
          </View>
          <Text className="text-accentGray text-[10px] leading-relaxed">
            Total private expenses tracked this calendar month. Group ledger splits are detailed inside specific group channels.
          </Text>
        </View>

        {/* Quick Actions Grid */}
        <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-3">
          Quick Actions
        </Text>
        <View className="flex-row flex-wrap justify-between gap-3 mb-6">
          {/* Add Personal Expense */}
          <Link href="/personal" asChild>
            <TouchableOpacity
              onPress={() => Theme.haptics.light()}
              className="w-[48%] bg-surface border-[0.5px] border-border rounded-xl p-4 flex-row items-center"
            >
              <Wallet size={16} color="#00F5D4" className="mr-2" />
              <Text className="text-white text-xs font-bold">Add Expense</Text>
            </TouchableOpacity>
          </Link>

          {/* View Groups */}
          <Link href="/groups" asChild>
            <TouchableOpacity
              onPress={() => Theme.haptics.light()}
              className="w-[48%] bg-surface border-[0.5px] border-border rounded-xl p-4 flex-row items-center"
            >
              <Users size={16} color="#00F5D4" className="mr-2" />
              <Text className="text-white text-xs font-bold">Join Group</Text>
            </TouchableOpacity>
          </Link>

          {/* Tiffin Tracker */}
          <Link href="/tiffin" asChild>
            <TouchableOpacity
              onPress={() => Theme.haptics.light()}
              className="w-[48%] bg-surface border-[0.5px] border-border rounded-xl p-4 flex-row items-center"
            >
              <Coffee size={16} color="#00F5D4" className="mr-2" />
              <Text className="text-white text-xs font-bold">Tiffin logs</Text>
            </TouchableOpacity>
          </Link>

          {/* Water Tracker (Placeholder redirecting to groups directory) */}
          <Link href="/groups" asChild>
            <TouchableOpacity
              onPress={() => Theme.haptics.light()}
              className="w-[48%] bg-surface border-[0.5px] border-border rounded-xl p-4 flex-row items-center"
            >
              <Droplet size={16} color="#00F5D4" className="mr-2" />
              <Text className="text-white text-xs font-bold">Water logs</Text>
            </TouchableOpacity>
          </Link>
        </View>

        {/* Groups Section */}
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-accentGray text-xs font-bold uppercase tracking-widest">
            My Groups
          </Text>
          <Link href="/groups" asChild>
            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text className="text-accentCyan text-xs font-bold">View All</Text>
            </TouchableOpacity>
          </Link>
        </View>

        <View className="bg-surface border-[0.5px] border-border rounded-2xl p-4 mb-6">
          {isGroupsLoading ? (
            <ActivityIndicator size="small" color="#00F5D4" className="py-4" />
          ) : (
            <View className="space-y-3">
              {groups?.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  onPress={() => {
                    Theme.haptics.light();
                    router.push(`/groups/${g.id}`);
                  }}
                  className="flex-row justify-between items-center py-2 border-b-[0.5px] border-neutral-900 pb-3"
                >
                  <View className="flex-row items-center">
                    <View className="w-8 h-8 rounded-lg bg-surfaceLight justify-center items-center mr-3">
                      <Users size={16} color="#00F5D4" />
                    </View>
                    <View>
                      <Text className="text-white text-sm font-bold">{g.name}</Text>
                      <Text className="text-accentGray text-[10px] mt-0.5">{g.type}</Text>
                    </View>
                  </View>
                  <ChevronRight size={14} color="#A3A3A3" />
                </TouchableOpacity>
              ))}
              {(!groups || groups.length === 0) && (
                <Text className="text-accentGray text-xs text-center py-4">No active groups.</Text>
              )}
            </View>
          )}
        </View>

        {/* Recent Expenses Section */}
        <Text className="text-accentGray text-xs font-bold uppercase tracking-widest mb-3">
          Recent Expenses
        </Text>

        <View className="bg-surface border-[0.5px] border-border rounded-2xl p-4">
          <View className="space-y-3">
            {personalExpenses?.map((item) => (
              <View
                key={item.id}
                className="flex-row justify-between items-center py-2 border-b-[0.5px] border-neutral-900 pb-3"
              >
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-lg bg-surfaceLight justify-center items-center mr-3">
                    <Clock size={16} color="#00F5D4" />
                  </View>
                  <View>
                    <Text className="text-white text-sm font-bold">{item.description}</Text>
                    <Text className="text-accentGray text-[10px] mt-0.5">
                      {item.category?.name || "Other"} • Personal
                    </Text>
                  </View>
                </View>
                <Text className="text-white text-sm font-bold">₹ {Number(item.amount).toFixed(2)}</Text>
              </View>
            ))}
            {(!personalExpenses || personalExpenses.length === 0) && (
              <Text className="text-accentGray text-xs text-center py-4">No recent expenses logged.</Text>
            )}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
