import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface QueuedMutation {
  id: string;
  table: "expenses" | "expense_splits" | "groups" | "tracker_logs" | "tracker_log_consumers" | "budgets";
  action: "INSERT" | "UPDATE" | "DELETE";
  payload: any;
  timestamp: number;
}

interface SyncQueueState {
  queue: QueuedMutation[];
  addToQueue: (mutation: Omit<QueuedMutation, "id" | "timestamp">) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
}

export const useSyncQueueStore = create<SyncQueueState>()(
  persist(
    (set) => ({
      queue: [],
      addToQueue: (mutation) =>
        set((state) => ({
          queue: [
            ...state.queue,
            {
              ...mutation,
              id: Math.random().toString(36).substring(2, 9),
              timestamp: Date.now(),
            },
          ],
        })),
      removeFromQueue: (id) =>
        set((state) => ({
          queue: state.queue.filter((item) => item.id !== id),
        })),
      clearQueue: () => set({ queue: [] }),
    }),
    {
      name: "hisab-sync-queue",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
