import AsyncStorage from "@react-native-async-storage/async-storage";
import { useToastStore } from "../store/toastStore";
import { useNotificationsStore } from "../store/notificationsStore";
import { triggerLocalNotification } from "./notifications";
import { WITTY_MESSAGES, WittyEventType } from "../constants/messages";

const LAST_MESSAGE_KEY_PREFIX = "last_witty_msg_";

/**
 * Triggers a witty toast and native local notification for specific events,
 * ensuring messages are never repeated twice in a row for the same event type.
 */
export async function triggerWittyNotification(
  eventType: WittyEventType,
  fallbackTitle: string
) {
  const list = WITTY_MESSAGES[eventType];
  if (!list || list.length === 0) return;

  const storageKey = `${LAST_MESSAGE_KEY_PREFIX}${eventType}`;
  let lastMsg = "";
  try {
    lastMsg = (await AsyncStorage.getItem(storageKey)) || "";
  } catch {
    // Fallback to empty string if storage fails
  }

  // Filter out the last shown message to prevent consecutive duplicates
  const eligible = list.filter((msg) => msg !== lastMsg);
  const chosen = eligible[Math.floor(Math.random() * eligible.length)] || list[0];

  try {
    await AsyncStorage.setItem(storageKey, chosen);
  } catch {
    // Ignore storage save failures
  }

  // 1. Show Toast in-app
  useToastStore.getState().showToast(chosen, "success");

  // 2. Trigger native OS level local notification
  await triggerLocalNotification(fallbackTitle, chosen);

  // 3. Log notification inside the local persistent notifications center
  let notifType: "expense_added" | "group_joined" | "settlement_completed" | "tiffin_reminder" | "monthly_summary" | "welcome" | null = null;
  let notifTitle = fallbackTitle;

  if (eventType === "expense_added") {
    notifType = "expense_added";
    notifTitle = "Expense Added 💸";
  } else if (eventType === "group_created" || eventType === "member_joined") {
    notifType = "group_joined";
    notifTitle = "Group Update 👥";
  } else if (eventType === "settlement_completed") {
    notifType = "settlement_completed";
    notifTitle = "Settlement Completed 🤝";
  } else if (eventType === "tiffin_logged" || eventType === "daily_reminder") {
    notifType = "tiffin_reminder";
    notifTitle = "Tiffin Reminder 🍱";
  } else if (eventType === "monthly_summary") {
    notifType = "monthly_summary";
    notifTitle = "Monthly Summary 📊";
  }

  if (notifType) {
    useNotificationsStore.getState().addNotification({
      type: notifType,
      title: notifTitle,
      description: chosen,
    });
  }
}
