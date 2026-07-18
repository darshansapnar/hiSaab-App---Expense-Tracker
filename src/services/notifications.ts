import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { supabase } from "./supabase";

// Configure how notifications are displayed when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Registers the device for Expo Push Notifications and saves the token to the user profile.
 * 
 * @param userId Active authenticated user ID
 * @returns Registered push token string, or null
 */
export async function registerForPushNotificationsAsync(userId: string): Promise<string | null> {
  let token: string | null = null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00F5D4",
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.warn("Failed to get push token for push notifications!");
      return null;
    }

    // Retrieve Expo Push Token
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: undefined, // Expo Router automatically extracts the project ID from app.json
      });
      token = tokenData.data;

      // Save token to Supabase profiles row
      if (token && userId) {
        await supabase
          .from("profiles")
          .update({ push_token: token, updated_at: new Date().toISOString() })
          .eq("id", userId);
      }
    } catch (error) {
      console.error("Error fetching push token:", error);
    }
  } else {
    console.log("Must use physical device for Push Notifications");
  }

  return token;
}

/**
 * Sends a local notification alert immediately.
 */
export async function triggerLocalNotification(title: string, body: string, data?: any) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data || {},
    },
    trigger: null, // deliver immediately
  });
}
