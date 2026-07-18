import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useToastStore } from "../../store/toastStore";
import { X, CheckCircle2, AlertTriangle, Info } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);
  const hideToast = useToastStore((state) => state.hideToast);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View
      style={{ top: insets.top + 10 }}
      className="absolute left-4 right-4 z-50 space-y-2"
    >
      {toasts.map((toast) => {
        let bgColor = "bg-surfaceLight";
        let borderColor = "border-border";
        let IconComponent = Info;
        let iconColor = "#A3A3A3"; // Muted gray

        if (toast.type === "success") {
          bgColor = "bg-surface";
          borderColor = "border-accentGreen";
          IconComponent = CheckCircle2;
          iconColor = "#39FF14"; // Neon green
        } else if (toast.type === "error") {
          bgColor = "bg-surface";
          borderColor = "border-accentPink";
          IconComponent = AlertTriangle;
          iconColor = "#FF007F"; // Neon pink
        }

        return (
          <View
            key={toast.id}
            className={`flex-row items-center border-[0.5px] p-4 rounded-xl shadow-lg ${bgColor} ${borderColor}`}
          >
            <View className="mr-3">
              <IconComponent size={20} color={iconColor} />
            </View>
            <Text className="flex-1 text-sm font-medium text-white mr-2">
              {toast.message}
            </Text>
            <TouchableOpacity onPress={() => hideToast(toast.id)} className="p-1">
              <X size={16} color="#A3A3A3" />
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}
