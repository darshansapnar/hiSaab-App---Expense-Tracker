import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Linking,
  Platform,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Bug,
  Lightbulb,
  Star,
  Mail,
  HelpCircle,
  Code,
  Briefcase,
} from "lucide-react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useToastStore } from "../../../store/toastStore";
import { Theme } from "../../../constants/Theme";
import { Colors } from "../../../constants/Colors";

const FAQS = [
  {
    question: "How do I create a group?",
    answer: "Tap on the 'Groups' tab, press the 'Create Group' button at the top, enter a name and description, select a category, and save it! You can invite members by copying and sharing the unique invite code.",
  },
  {
    question: "How does expense splitting work?",
    answer: "When adding an expense, you specify who paid and split the amount among group members. The system automatically calculates individual shares and updates the net balances.",
  },
  {
    question: "How does settlement work?",
    answer: "Under the 'Balances' tab of any group, you see outstanding balances (who owes who). Tap 'Settle Up' to record a settlement transaction. This squares away the balance.",
  },
  {
    question: "How do I edit or delete an expense?",
    answer: "Find the expense inside the group ledger, tap it to open the details modal, and press edit or delete. Only the group administrator or the expense creator can perform these actions.",
  },
  {
    question: "How do I delete a group?",
    answer: "Go to Group Details, click the Settings (gear) icon in the top header, and scroll to the bottom. Click 'Delete Group'. Please note that only the group creator can delete it.",
  },
  {
    question: "How does the Tiffin Tracker work?",
    answer: "The Tiffin Tracker helps you log your daily breakfast and dinner. In Settings, you configure per-meal rates, and hiSaab calculates your total estimated mess bill, attendance, and money saved automatically.",
  },
];

export default function SupportScreen() {
  const router = useRouter();
  const showToast = useToastStore((state) => state.showToast);

  // Accordion open states
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Form states
  const [bugDesc, setBugDesc] = useState("");
  const [featureDesc, setFeatureDesc] = useState("");
  const [isBugSubmitting, setIsBugSubmitting] = useState(false);
  const [isFeatureSubmitting, setIsFeatureSubmitting] = useState(false);

  const toggleFaq = (index: number) => {
    Theme.haptics.light();
    setOpenFaq(openFaq === index ? null : index);
  };

  const handleBugReport = async () => {
    if (!bugDesc.trim()) {
      showToast("Please describe the bug first", "error");
      return;
    }
    Theme.haptics.medium();
    setIsBugSubmitting(true);

    try {
      const appVer = Constants.expoConfig?.version || "1.0.0";
      const deviceModel = Device.modelName || "Unknown Device";
      const osName = Platform.OS === "ios" ? "iOS" : "Android";
      const osVer = Device.osVersion || "";

      const subject = "Bug Report - hiSaab";
      const body = `App Version: ${appVer}\nDevice: ${deviceModel}\nAndroid/iOS Version: ${osName} ${osVer}\n\nDescribe the issue:\n${bugDesc}`;
      const mailto = `mailto:itstrange@proton.me?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      await Linking.openURL(mailto);
      showToast("Email draft opened!", "success");
      setBugDesc("");
    } catch (err) {
      showToast("Could not open email client", "error");
    } finally {
      setIsBugSubmitting(false);
    }
  };

  const handleFeatureRequest = async () => {
    if (!featureDesc.trim()) {
      showToast("Please write your feedback first", "error");
      return;
    }
    Theme.haptics.medium();
    setIsFeatureSubmitting(true);

    try {
      const subject = "Feedback - hiSaab";
      const body = `Hi,\n\nI'd like to share the following feedback:\n${featureDesc}`;
      const mailto = `mailto:itstrange@proton.me?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      await Linking.openURL(mailto);
      showToast("Email draft opened!", "success");
      setFeatureDesc("");
    } catch (err) {
      showToast("Could not open email client", "error");
    } finally {
      setIsFeatureSubmitting(false);
    }
  };

  const handleContactSupport = async () => {
    Theme.haptics.medium();
    try {
      const subject = "Support - hiSaab";
      const body = "Hello,\n\nI need help with:\n";
      const mailto = `mailto:itstrange@proton.me?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      await Linking.openURL(mailto);
      showToast("Email draft opened!", "success");
    } catch (err) {
      showToast("Could not open email client", "error");
    }
  };

  const handleRateApp = () => {
    Theme.haptics.light();
    showToast("Play Store link coming soon! Thanks ⭐", "info");
  };

  const handleLink = async (url: string) => {
    Theme.haptics.light();
    try {
      await Linking.openURL(url);
    } catch {
      showToast("Could not open link", "error");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }}>
      {/* Top Navigation */}
      <View className="flex-row items-center px-6 pb-4 border-b-[0.5px] border-white/5">
        <TouchableOpacity
          onPress={() => {
            Theme.haptics.light();
            router.back();
          }}
          className="p-1 rounded-full bg-[#151E2E] border-[0.5px] border-white/10 mr-3"
        >
          <ChevronLeft size={20} color="#14E5D4" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-bold">Help & Support</Text>
      </View>

      <ScrollView className="flex-1 px-6 mt-4" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 50 }}>
        
        {/* FAQs Section */}
        <View className="mb-6">
          <View className="flex-row items-center mb-4">
            <HelpCircle size={18} color="#14E5D4" />
            <Text className="text-white text-sm font-black ml-2 uppercase tracking-widest">FAQs</Text>
          </View>

          {FAQS.map((faq, index) => {
            const isOpen = openFaq === index;
            return (
              <View key={index} className="bg-[#151E2E] border-[0.5px] border-white/5 rounded-2xl mb-2.5 overflow-hidden">
                <TouchableOpacity
                  onPress={() => toggleFaq(index)}
                  className="flex-row justify-between items-center p-4 active:bg-white/5"
                >
                  <Text className="text-white text-xs font-bold flex-1 mr-2">{faq.question}</Text>
                  {isOpen ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />}
                </TouchableOpacity>

                {isOpen && (
                  <View className="px-4 pb-4 border-t border-white/5 pt-2">
                    <Text className="text-[#94A3B8] text-[11px] leading-relaxed font-medium">{faq.answer}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Bug Report Section */}
        <View className="bg-[#151E2E] border-[0.5px] border-white/5 p-5 rounded-2xl mb-6 shadow-md">
          <View className="flex-row items-center mb-3">
            <Bug size={18} color="#EF4444" />
            <Text className="text-white text-xs font-black ml-2 uppercase tracking-widest">Report a Bug</Text>
          </View>
          <Text className="text-[#94A3B8] text-[10px] mb-3 leading-relaxed">
            Found an issue? Describe it below and we will help you resolve it. Submitting opens your mail app with app and device info.
          </Text>

          <TextInput
            multiline
            numberOfLines={3}
            placeholder="What went wrong? Write details here..."
            placeholderTextColor="#94A3B8"
            value={bugDesc}
            onChangeText={setBugDesc}
            className="bg-white/5 border border-white/10 rounded-xl p-3.5 text-white text-xs leading-relaxed mb-4"
            style={{ minHeight: 80, textAlignVertical: "top" }}
          />

          <TouchableOpacity
            onPress={handleBugReport}
            disabled={isBugSubmitting}
            className="w-full bg-[#EF4444] py-3 rounded-xl items-center active:scale-[0.98]"
          >
            <Text className="text-white text-xs font-bold">Open Email Bug Report</Text>
          </TouchableOpacity>
        </View>

        {/* Send Feedback Section */}
        <View className="bg-[#151E2E] border-[0.5px] border-white/5 p-5 rounded-2xl mb-6 shadow-md">
          <View className="flex-row items-center mb-3">
            <Lightbulb size={18} color="#FBBF24" />
            <Text className="text-white text-xs font-black ml-2 uppercase tracking-widest">Send Feedback</Text>
          </View>
          <Text className="text-[#94A3B8] text-[10px] mb-3 leading-relaxed">
            I'd like to share the following feedback:
          </Text>

          <TextInput
            multiline
            numberOfLines={3}
            placeholder="Share your thoughts or ideas..."
            placeholderTextColor="#94A3B8"
            value={featureDesc}
            onChangeText={setFeatureDesc}
            className="bg-white/5 border border-white/10 rounded-xl p-3.5 text-white text-xs leading-relaxed mb-4"
            style={{ minHeight: 80, textAlignVertical: "top" }}
          />

          <TouchableOpacity
            onPress={handleFeatureRequest}
            disabled={isFeatureSubmitting}
            className="w-full bg-[#14E5D4] py-3 rounded-xl items-center active:scale-[0.98]"
          >
            <Text className="text-[#0B1220] text-xs font-bold">Open Email Feedback</Text>
          </TouchableOpacity>
        </View>

        {/* Contact Support Section */}
        <View className="bg-[#151E2E] border-[0.5px] border-white/5 p-5 rounded-2xl mb-6 shadow-md">
          <View className="flex-row items-center mb-3">
            <Mail size={18} color="#14E5D4" />
            <Text className="text-white text-xs font-black ml-2 uppercase tracking-widest">Contact Support</Text>
          </View>
          <Text className="text-[#94A3B8] text-[10px] mb-3 leading-relaxed">
            Need help with anything? Get in touch with our support desk directly via email.
          </Text>
          <TouchableOpacity
            onPress={handleContactSupport}
            className="w-full bg-[#14E5D4] py-3 rounded-xl items-center active:scale-[0.98]"
          >
            <Text className="text-[#0B1220] text-xs font-bold">Email Support</Text>
          </TouchableOpacity>
        </View>

        {/* Rate App Card */}
        <TouchableOpacity
          onPress={handleRateApp}
          className="bg-[#151E2E] border-[0.5px] border-white/5 p-5 rounded-2xl mb-6 flex-row justify-between items-center active:scale-[0.98]"
        >
          <View className="flex-row items-center">
            <Star size={18} color="#FBBF24" />
            <View className="ml-3">
              <Text className="text-white text-xs font-bold uppercase tracking-wider">Rate hiSaab</Text>
              <Text className="text-[#94A3B8] text-[9px] mt-0.5">Show support on the store</Text>
            </View>
          </View>
          <Text className="text-[#14E5D4] text-[10px] font-black uppercase">Vote</Text>
        </TouchableOpacity>

        {/* Contact Developer Card */}
        <View className="bg-[#151E2E] border-[0.5px] border-white/5 p-5 rounded-2xl mb-6">
          <Text className="text-[#94A3B8] text-[10px] font-bold uppercase tracking-widest mb-3">Contact Developer</Text>
          
          <View className="mb-4">
            <Text className="text-white text-sm font-black">Darshan Sapnar</Text>
            <Text className="text-[#94A3B8] text-[10px] mt-0.5">App Creator & Lead Engineer</Text>
          </View>

          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => handleLink("mailto:itstrange@proton.me")}
              className="flex-1 flex-row items-center justify-center bg-white/5 border border-white/10 py-3 rounded-xl active:scale-95"
            >
              <Mail size={14} color="#14E5D4" />
              <Text className="text-white text-xs font-bold ml-1.5">Email</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleLink("https://github.com/darshansapnar")}
              className="flex-1 flex-row items-center justify-center bg-white/5 border border-white/10 py-3 rounded-xl active:scale-95"
            >
              <Code size={14} color="#14E5D4" />
              <Text className="text-white text-xs font-bold ml-1.5">GitHub</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleLink("https://linkedin.com/in/darshansapnar")}
              className="flex-1 flex-row items-center justify-center bg-white/5 border border-white/10 py-3 rounded-xl active:scale-95"
            >
              <Briefcase size={14} color="#14E5D4" />
              <Text className="text-white text-xs font-bold ml-1.5">LinkedIn</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* About App Section */}
        <View className="items-center mt-4">
          <Image
            source={require("../../../../assets/images/logo.png")}
            style={{ width: 60, height: 60, borderRadius: 16, marginBottom: 12 }}
            resizeMode="contain"
          />
          <Text className="text-white text-sm font-black tracking-tight">hiSaab v1.0</Text>
          <Text className="text-[#94A3B8] text-[10px] mt-1">"Keep the hisaab clear."</Text>
          <Text className="text-[#94A3B8] text-[9px] mt-3">Built with ❤️ by Darshan</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
