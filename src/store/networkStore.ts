import { create } from "zustand";
import { useToastStore } from "./toastStore";

interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  setIsConnected: (isConnected: boolean, isInternetReachable?: boolean | null) => void;
  /**
   * Helper function to check if device is online before performing mutations/actions.
   * If offline, shows a friendly user warning and returns false.
   */
  requireOnline: () => boolean;
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  isConnected: true,
  isInternetReachable: true,
  setIsConnected: (isConnected, isInternetReachable = true) => {
    set({ isConnected, isInternetReachable });
  },
  requireOnline: () => {
    const { isConnected, isInternetReachable } = get();
    const online = isConnected && isInternetReachable !== false;
    if (!online) {
      useToastStore
        .getState()
        .showToast(
          "You're offline. Please connect to the internet to complete this action.",
          "info"
        );
      return false;
    }
    return true;
  },
}));

/**
 * Returns a friendly user message for network errors when offline,
 * preventing technical database/fetch errors from being displayed.
 */
export function getFriendlyErrorMessage(
  error: any,
  fallbackMessage: string = "Failed to complete action"
): string {
  const isConnected = useNetworkStore.getState().isConnected;
  const isInternetReachable = useNetworkStore.getState().isInternetReachable;
  const online = isConnected && isInternetReachable !== false;

  const msg = error?.message || String(error || "");
  const isNetworkErr =
    !online ||
    msg.includes("Network request failed") ||
    msg.includes("Failed to fetch") ||
    msg.includes("network") ||
    msg.includes("offline") ||
    msg.includes("TypeError: Fetch failed");

  if (isNetworkErr) {
    return "You're offline. Please connect to the internet to complete this action.";
  }

  return msg || fallbackMessage;
}
