import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface AppNotification {
  id: string;
  type: "expense_added" | "group_joined" | "settlement_completed" | "tiffin_reminder" | "monthly_summary" | "welcome";
  title: string;
  description: string;
  timestamp: string;
  isRead: boolean;
}

interface NotificationsState {
  notifications: AppNotification[];
  addNotification: (notification: Omit<AppNotification, "id" | "timestamp" | "isRead">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set) => ({
      notifications: [],
      addNotification: (n) => set((state) => {
        const newNotif: AppNotification = {
          ...n,
          id: Math.random().toString(36).substring(7) + Date.now(),
          timestamp: new Date().toISOString(),
          isRead: false,
        };
        // Cap total local notifications count at 100 entries to prevent memory limits
        return {
          notifications: [newNotif, ...state.notifications].slice(0, 100),
        };
      }),
      markAsRead: (id) => set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, isRead: true } : n
        ),
      })),
      markAllAsRead: () => set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      })),
      deleteNotification: (id) => set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      })),
      clearAll: () => set({ notifications: [] }),
    }),
    {
      name: "hisab-notifications-store",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
