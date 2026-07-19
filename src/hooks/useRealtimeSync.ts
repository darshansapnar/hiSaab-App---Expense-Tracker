import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { useAuthStore } from "../store/authStore";
import { useToastStore } from "../store/toastStore";
import { triggerLocalNotification, registerForPushNotificationsAsync } from "../services/notifications";

/**
 * Registers active listeners for database updates, triggering real-time UI updates
 * and device notification alerts for group mutations.
 */
export function useRealtimeSync(groupId?: string) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    if (!user?.id) return;

    // Register push tokens on login
    registerForPushNotificationsAsync(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    // Listen to changes on 'expenses', 'group_members', and 'groups' tables
    const groupSyncChannel = supabase
      .channel("realtime-group-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses" },
        async (payload) => {
          // 1. Instantly refresh active list queries across all caches
          queryClient.invalidateQueries({ queryKey: ["group-expenses"] });
          queryClient.invalidateQueries({ queryKey: ["peer-balances"] });
          queryClient.invalidateQueries({ queryKey: ["global-peer-balances"] });
          queryClient.invalidateQueries({ queryKey: ["groups"] });

          // 2. Filter alerts: Only show notification reminders if someone else triggered the mutation
          if (payload.eventType === "INSERT") {
            const newRow = payload.new;
            if (newRow.paid_by !== user.id) {
              // Retrieve Payer profile details
              const { data: payerProfile } = await supabase
                .from("profiles")
                .select("display_name")
                .eq("id", newRow.paid_by)
                .single();

              const payerName = payerProfile?.display_name || "Someone";

              if (newRow.is_settlement) {
                // Determine recipient of the settlement splits
                const { data: splits } = await supabase
                  .from("expense_splits")
                  .select("debtor_id")
                  .eq("expense_id", newRow.id);

                const isRecipient = splits?.some((s) => s.debtor_id === user.id);

                if (isRecipient) {
                  // Settlement Reminder
                  showToast(`${payerName} sent you ₹${newRow.amount} settlement`, "info");
                  triggerLocalNotification(
                    "Settlement Payment Received",
                    `${payerName} sent you ₹${newRow.amount}. Tap to confirm receipt.`,
                    { groupId: newRow.group_id }
                  );
                }
              } else {
                // New Expense Reminder
                showToast(`${payerName} added "${newRow.description}" of ₹${newRow.amount}`, "info");
                triggerLocalNotification(
                  "New Shared Expense",
                  `${payerName} added "${newRow.description}" of ₹${newRow.amount}.`,
                  { groupId: newRow.group_id }
                );
              }
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_members" },
        async (payload) => {
          queryClient.invalidateQueries({ queryKey: ["group-members"] });
          queryClient.invalidateQueries({ queryKey: ["groups"] });
          queryClient.invalidateQueries({ queryKey: ["peer-balances"] });
          queryClient.invalidateQueries({ queryKey: ["global-peer-balances"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "groups" },
        async (payload) => {
          queryClient.invalidateQueries({ queryKey: ["group"] });
          queryClient.invalidateQueries({ queryKey: ["groups"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(groupSyncChannel);
    };
  }, [user?.id, groupId, queryClient, showToast]);
}
